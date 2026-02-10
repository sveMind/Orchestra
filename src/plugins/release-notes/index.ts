import { AutoBotPlugin } from '../../types';
import { generateCompletion } from '../../services/aiService';
import { getCommitsSince, getLatestTag } from '../../services/gitService';

export const generateReleaseNotes = async (version: string): Promise<void> => {
  console.log(`Generating release notes for version: ${version}`);

  try {
    const latestTag = await getLatestTag();
    let commits: string[] = [];

    if (latestTag) {
        console.log(`Fetching commits since last tag: ${latestTag}`);
        commits = await getCommitsSince(latestTag);
    } else {
        console.log('No git tags found. Fetching recent commits (limit 50)...');
        console.warn('Tag based history not fully supported without existing tags. Using empty commit list for demo.');
    }
    
    if (commits.length === 0) {
        console.log('No new commits found.');
    } else {
        console.log(`Found ${commits.length} commits.`);
    }

    const commitLog = commits.join('\n');

    const prompt = `
      Generate release notes for version ${version} based on the following git commits:
      
      ${commitLog}

      Include sections for:
      - New Features
      - Bug Fixes
      - Improvements
      
      Make it professional and ready to use.
    `;

    const systemPrompt = 'You are a technical writer specializing in release notes.';

    console.log('Requesting AI generation...');
    const releaseNotes = await generateCompletion(prompt, systemPrompt);

    console.log('\n--- Generated Release Notes ---\n');
    console.log(releaseNotes);
    console.log('\n-------------------------------\n');

  } catch (error) {
    console.error('Error generating release notes:', error);
  }
};

const plugin: AutoBotPlugin = {
  name: 'Release Notes Generator',
  description: 'Generate release notes based on git commits since the last tag',
  command: 'release-notes',
  args: [
    { name: 'version', description: 'Version number', required: true }
  ],
  action: async (version: string) => {
    await generateReleaseNotes(version);
  }
};

export default plugin;
