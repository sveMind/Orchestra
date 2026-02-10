export const extractCodeBlock = (response: string): string => {
    // Match content between triple backticks, handling optional language identifier
    const match = response.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (match && match[1]) {
        return match[1].trim();
    }
    
    // If no code blocks, assume the whole response is code if it looks like it (fallback)
    // But safer to return original if not found to avoid writing chat text to file.
    // However, if the AI was told "Output only code", we might just return the response.
    
    // Check if the response contains code-like structure but no backticks
    if (response.includes('import ') || response.includes('function ') || response.includes('class ')) {
        return response.trim();
    }

    return '';
};
