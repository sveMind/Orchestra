import express from 'express';
import bodyParser from 'body-parser';
import { setWorkingDirectory, cloneRepo } from './services/gitService';
import autoPilotPlugin from './plugins/auto-pilot';
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
            
            // Set context for AutoBot
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
    } else {
        res.status(200).send('Event ignored.');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 AutoBot Server listening on port ${PORT}`);
    console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
});
