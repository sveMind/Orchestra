import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Ollama } from 'ollama';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const provider = process.env.AI_PROVIDER || 'openai'; // 'openai' | 'gemini' | 'ollama'
const apiKey = process.env.OPENAI_API_KEY;
const googleApiKey = process.env.GOOGLE_API_KEY;
const model = process.env.AI_MODEL || '';
const baseURL =
  process.env.OPENAI_BASE_URL ||
  process.env.AI_BASE_URL ||
  (model.startsWith('openrouter/') ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1');
const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

// Ensure AI_MODEL is set
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
        throw new Error(`${provider === 'gemini' ? 'GOOGLE_API_KEY' : 'OPENAI_API_KEY'} is missing. Please set it in .env or environment variables.`);
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
