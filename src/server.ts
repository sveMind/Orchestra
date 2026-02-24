import express from 'express';
import bodyParser from 'body-parser';
import { setWorkingDirectory, cloneRepo } from './services/gitService';
import autoPilotPlugin from './plugins/auto-pilot';
import { runDevCycle } from './plugins/dev-cycle';
import { runAgileWorkflow } from './plugins/agile-workflow';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
    const event = req.headers['x-github-event'];
    console.log(`Received GitHub event: ${event}`);

    if (event === 'push') {
        const repoUrl = req.body.repository.clone_url;
        const branch = req.body.ref.replace('refs/heads/', '');
        const commitId = req.body.after;

        console.log(`Push detected on ${branch} (${commitId})`);
        
        // Setup temp workspace
        const workspaceDir = path.join(process.cwd(), 'temp_workspace', commitId);
        
        try {
            if (fs.existsSync(workspaceDir)) {
                fs.rmSync(workspaceDir, { recursive: true, force: true });
            }
            fs.mkdirSync(workspaceDir, { recursive: true });

            console.log(`Cloning ${repoUrl} to ${workspaceDir}...`);
            await cloneRepo(repoUrl, workspaceDir);
            
            // Set context for Orchestra
            setWorkingDirectory(workspaceDir);
            
            // Hack: Temporarily change process.cwd() so plugins find files relative to workspace
            // Real fix would be refactoring all plugins to accept a rootDir
            const originalCwd = process.cwd();
            process.chdir(workspaceDir);

            console.log('Running Auto-Pilot...');
            // Cast to any because the action type in plugin interface is generic (...args: any[]) => Promise<void>
            // but we know runAutoPilot takes no arguments.
            await (autoPilotPlugin.action as any)();

            process.chdir(originalCwd);
            
            // Cleanup (Optional: Keep for debugging or cleanup immediately)
            // fs.rmSync(workspaceDir, { recursive: true, force: true });

            res.status(200).send('Auto-Pilot executed successfully.');
        } catch (error) {
            console.error('Error processing webhook:', error);
            res.status(500).send('Error executing Auto-Pilot.');
        }
    } else if (event === 'issues' && req.body.action === 'opened') {
        const issue = req.body.issue;
        console.log(`New Issue Opened: #${issue.number} - ${issue.title}`);
        
        // Basic heuristic: Create a file based on title
        const safeTitle = issue.title.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const targetFile = path.join(process.cwd(), 'src', 'features', `${safeTitle}.ts`);
        
        // Ensure dir exists
        const dir = path.dirname(targetFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        console.log(`Targeting file: ${targetFile}`);
        
        // Run Agile Workflow
        // Note: In a real production environment, this should be offloaded to a job queue.
        try {
            // We'll use the new Agile Workflow instead of just the Dev Cycle
            await runAgileWorkflow(issue.number, issue.title, issue.body || '');
            res.status(200).send(`Agile Workflow initiated for issue #${issue.number}`);
        } catch (error) {
            console.error('Error running agile workflow:', error);
            res.status(500).send('Error running agile workflow');
        }

    } else {
        res.status(200).send('Event ignored.');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Orchestra Server listening on port ${PORT}`);
    console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
});
