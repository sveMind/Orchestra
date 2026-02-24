import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Ollama } from 'ollama';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const provider = process.env.AI_PROVIDER || 'openai'; // 'openai' | 'gemini' | 'ollama'
const apiKey = process.env.OPENAI_API_KEY;
const googleApiKey = process.env.GOOGLE_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL || 'https://api.openai.com/v1';
const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

// Ensure AI_MODEL is set
const model = process.env.AI_MODEL || '';
if (!model) {
    console.warn('Warning: AI_MODEL is not set. AI features will fail.');
}

// Initialize Clients
let openai: OpenAI | null = null;
let genAI: GoogleGenerativeAI | null = null;
let ollama: Ollama | null = null;

if (provider === 'gemini') {
    if (googleApiKey) {
        genAI = new GoogleGenerativeAI(googleApiKey);
        console.log(`🔌 Connected to Google Gemini (Model: ${model})`);
    } else {
        console.warn('Warning: GOOGLE_API_KEY is not set. Gemini features will not work.');
    }
} else if (provider === 'ollama') {
    ollama = new Ollama({ host: ollamaHost });
    console.log(`🔌 Connected to Ollama (Host: ${ollamaHost}, Model: ${model})`);
} else {
    // Default to OpenAI
    if (apiKey) {
        openai = new OpenAI({
            apiKey: apiKey,
            baseURL: baseURL,
        });
        if (baseURL.includes('openrouter')) {
            console.log(`🔌 Connected to OpenRouter (Model: ${model})`);
        } else {
            console.log(`🔌 Connected to OpenAI (Model: ${model})`);
        }
    } else {
        console.warn('Warning: OPENAI_API_KEY is not set. AI features will not work.');
    }
}

export const generateCompletion = async (prompt: string, systemPrompt: string = 'You are a helpful assistant.'): Promise<string> => {
    // Check for missing keys based on provider
    const missingKey = (provider === 'gemini' && !googleApiKey) || (provider === 'openai' && !apiKey);

    if (missingKey) {
        console.warn(`${provider === 'gemini' ? 'GOOGLE_API_KEY' : 'OPENAI_API_KEY'} is missing. Returning MOCK response.`);
        return getMockResponse(prompt);
    }

    try {
        if (provider === 'gemini' && genAI) {
            const geminiModel = genAI.getGenerativeModel({ model: model });
            // Gemini doesn't have system prompts in the same way as GPT, but we can prepend it
            const fullPrompt = `${systemPrompt}\n\n${prompt}`;
            const result = await geminiModel.generateContent(fullPrompt);
            const response = await result.response;
            return response.text();
        } else if (provider === 'ollama' && ollama) {
            const response = await ollama.chat({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ],
            });
            return response.message.content;
        } else if (openai) {
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ],
                model: model,
            });

            if (!completion || !completion.choices || !completion.choices[0] || !completion.choices[0].message) {
                console.error('Invalid response structure from AI provider:', JSON.stringify(completion, null, 2));
                throw new Error('Invalid response from AI provider');
            }

            return completion.choices[0].message.content || '';
        } else {
            throw new Error('No AI provider initialized.');
        }
    } catch (error) {
        console.error(`Error calling ${provider}:`, error);
        throw error;
    }
};

const getMockResponse = (prompt: string): string => {
    // Mock responses for different agents/tasks
    if (prompt.includes('Return a JSON array of strings indicating the tools to run')) {
        // Auto-Pilot Plan Mock
        if (prompt.includes('REQUIREMENTS.md') || prompt.includes('TODO.md')) {
            return '["project-manager"]';
        }
        if (prompt.includes('.ts') || prompt.includes('.js')) {
            return '["test-gen", "doc-gen", "vuln-scan"]';
        }
        return '["doc-gen"]';
    }
    
    // Project Manager Mocks
    if (prompt.includes('Analyze this requirement (which might be a README or a raw string)')) {
        return 'Product Manager: Epic: Dark Mode. Acceptance Criteria: Toggle switch, persistence.';
    }
    if (prompt.includes('outline the technical architecture')) {
        return 'Architect: Use CSS Variables for theming. LocalStorage for persistence.';
    }
    if (prompt.includes('Break this project down into a list of actionable tasks')) {
        return '["Create Theme Context", "Add Toggle Component", "Implement LocalStorage logic"]';
    }
    
    if (prompt.includes('Generate unit tests')) {
        return `
import { add, subtract } from './sample'; // Assumption

describe('Generated Tests', () => {
    test('add should return sum', () => {
        expect(add(1, 2)).toBe(3);
    });
});
        `;
    }

    if (prompt.includes('Analyze the provided code for security vulnerabilities')) {
        return 'NO_ISSUES';
    }

    if (prompt.includes('improve the documentation')) {
        return '# Generated Documentation\n\nThis is a mock documentation generated by Orchestra.';
    }

    if (prompt.includes('provide the FULL refactored file content') || prompt.includes('Apply the necessary fixes')) {
        return `
\`\`\`typescript
// Fixed Code
export const fixedFunction = () => {
    console.log("This code was fixed by Orchestra!");
};
\`\`\`
        `;
    }

    if (prompt.includes('Review the following code implementation')) {
        return 'APPROVED';
    }

    // Mock for Team Huddle in Project Manager
    if (prompt.includes('Identify key implementation challenges')) {
        return 'Software Engineer: We should use React Context for state management. Potential challenge: re-renders.';
    }
    if (prompt.includes('Outline the testing strategy')) {
        return 'QA Engineer: Strategy: Unit tests for utils, E2E for critical flows using Cypress.';
    }
    if (prompt.includes('Identify potential security risks')) {
        return 'Security Engineer: Risk: XSS in user input. Mitigation: Sanitize all inputs.';
    }

    if (prompt.includes('Implement the requested feature/fix')) {
        return `
\`\`\`typescript
export const binarySearch = (arr: number[], target: number): number => {
    let left = 0;
    let right = arr.length - 1;
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (arr[mid] === target) return mid;
        if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
};
\`\`\`
        `;
    }

    return 'Mock AI Response';
};
