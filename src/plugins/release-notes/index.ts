import { AutoBotPlugin } from '../../types';
import { generateCompletion } from '../../services/aiService';
import { getCommitsSince, getLatestTag, getPreviousTag } from '../../services/gitService';
import { createRelease } from '../../services/githubService';

export const generateReleaseNotes = async (version: string): Promise<void> => {
  console.log(`Generating release notes for version: ${version}`);

  try {
    const latestTag = await getLatestTag();
    let commits: string[] = [];
    let startTag = latestTag;

    if (latestTag === version) {
        console.log(`Current version ${version} is already tagged.`);
        const previousTag = await getPreviousTag(version);
        if (previousTag) {
            startTag = previousTag;
            console.log(`Fetching commits since previous tag: ${startTag}`);
        } else {
            console.warn('No previous tag found. Fetching all commits.');
            startTag = '';
        }
    } else {
        console.log(`Fetching commits since last tag: ${latestTag}`);
    }

    if (startTag) {
        commits = await getCommitsSince(startTag);
    } else {
        console.log('No previous tag found. Fetching recent commits (limit 50)...');
        commits = await getCommitsSince('');
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

    if (releaseNotes) {
        console.log('Creating GitHub Release...');
        const releaseUrl = await createRelease(version, `Release ${version}`, releaseNotes);
        if (releaseUrl) {
            console.log(`✅ Release created successfully: ${releaseUrl}`);
        } else {
            console.error('❌ Failed to create GitHub Release.');
        }
    }

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
