import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { setWorkingDirectory, cloneRepo } from './services/gitService';
import autoPilotPlugin from './plugins/auto-pilot';
import { runDevCycle } from './plugins/dev-cycle';
import { runAgileWorkflow } from './plugins/agile-workflow';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createAppAuth } from '@octokit/auth-app';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
    bodyParser.json({
        verify: (req: any, _res, buf) => {
            req.rawBody = buf;
        },
    })
);

const isValidGitHubSignature = (req: any): boolean => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) return true;

    const header = String(req.headers['x-hub-signature-256'] || '');
    const rawBody: Buffer | undefined = req.rawBody;
    if (!header.startsWith('sha256=') || !rawBody) return false;

    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    try {
        return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
    } catch {
        return false;
    }
};

const getGitHubInstallationToken = async (installationId: number): Promise<string> => {
    const appId = process.env.GITHUB_APP_ID;
    const rawKey = process.env.GITHUB_APP_PRIVATE_KEY;
    if (!appId || !rawKey) {
        throw new Error('Missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY.');
    }

    const privateKey = rawKey.replace(/\\n/g, '\n');
    const auth = createAppAuth({ appId, privateKey });
    const token = await auth({ type: 'installation', installationId });
    return token.token;
};

const withEnv = async (vars: Record<string, string>, fn: () => Promise<void>): Promise<void> => {
    const prev: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(vars)) {
        prev[k] = process.env[k];
        process.env[k] = v;
    }
    try {
        await fn();
    } finally {
        for (const k of Object.keys(vars)) {
            const old = prev[k];
            if (typeof old === 'string') process.env[k] = old;
            else delete process.env[k];
        }
    }
};

let processing: Promise<void> = Promise.resolve();

const handleGitHubWebhook = async (req: any, res: any) => {
    const event = req.headers['x-github-event'];
    console.log(`Received GitHub event: ${event}`);

    const repository = req.body.repository;
    const repoUrl: string | undefined = repository?.clone_url;
    const owner: string | undefined = repository?.owner?.login;
    const repo: string | undefined = repository?.name;
    const installationId: number | undefined = req.body.installation?.id;

    const run = async () => {
        if (!isValidGitHubSignature(req)) {
            res.status(401).send('Invalid signature');
            return;
        }

        if (!repoUrl || !owner || !repo) {
            res.status(400).send('Missing repository info.');
            return;
        }

        const token = installationId ? await getGitHubInstallationToken(installationId) : (process.env.GITHUB_TOKEN || '');
        if (!token) {
            res.status(500).send('Missing GitHub credentials.');
            return;
        }

        if (event === 'push') {
            const branch = String(req.body.ref || '').replace('refs/heads/', '');
            const commitId = String(req.body.after || Date.now());
            console.log(`Push detected on ${owner}/${repo} ${branch} (${commitId})`);

            const workspaceDir = path.join(process.cwd(), 'temp_workspace', safePathPart(`${owner}-${repo}`), safePathPart(commitId));
            await prepareWorkspace(workspaceDir);
            await cloneRepo(repoUrl, workspaceDir, { token });
            setWorkingDirectory(workspaceDir);
            const originalCwd = process.cwd();
            process.chdir(workspaceDir);

            try {
                await withEnv(
                    {
                        GITHUB_TOKEN: token,
                        GITHUB_OWNER: owner,
                        GITHUB_REPO: repo,
                        GITHUB_REPOSITORY: `${owner}/${repo}`,
                        VCS_PROVIDER: 'github',
                    },
                    async () => {
                        await (autoPilotPlugin.action as any)();
                    }
                );
                res.status(200).send('Auto-Pilot executed successfully.');
            } finally {
                process.chdir(originalCwd);
            }
            return;
        }

        if (event === 'issues' && req.body.action === 'opened') {
            const issue = req.body.issue;
            if (!issue?.number || !issue?.title) {
                res.status(400).send('Missing issue info.');
                return;
            }

            console.log(`New Issue Opened: ${owner}/${repo} #${issue.number} - ${issue.title}`);
            const workspaceDir = path.join(process.cwd(), 'temp_workspace', safePathPart(`${owner}-${repo}`), `issue-${issue.number}`);
            await prepareWorkspace(workspaceDir);
            await cloneRepo(repoUrl, workspaceDir, { token });
            setWorkingDirectory(workspaceDir);
            const originalCwd = process.cwd();
            process.chdir(workspaceDir);

            try {
                await withEnv(
                    {
                        GITHUB_TOKEN: token,
                        GITHUB_OWNER: owner,
                        GITHUB_REPO: repo,
                        GITHUB_REPOSITORY: `${owner}/${repo}`,
                        VCS_PROVIDER: 'github',
                    },
                    async () => {
                        await runAgileWorkflow(issue.number, issue.title, issue.body || '');
                    }
                );
                res.status(200).send(`Agile Workflow initiated for issue #${issue.number}`);
            } finally {
                process.chdir(originalCwd);
            }
            return;
        }

        res.status(200).send('Event ignored.');
    };

    processing = processing.then(run, run);
    await processing;
};

const safePathPart = (input: string): string => input.replace(/[^a-zA-Z0-9_.-]/g, '-');

const prepareWorkspace = async (workspaceDir: string): Promise<void> => {
    if (fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
    fs.mkdirSync(workspaceDir, { recursive: true });
};

app.post('/webhook', handleGitHubWebhook);
app.post('/webhooks/github', handleGitHubWebhook);

app.listen(PORT, () => {
    console.log(`🚀 Orchestra Server listening on port ${PORT}`);
    console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
});
