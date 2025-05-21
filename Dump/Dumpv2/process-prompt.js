// process-prompt.js
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

/**
 * Main function to process a prompt file
 */
async function processPromptFile(inputFile, outputFile = null) {
    try {
        // Read prompt from markdown file
        console.log(`Reading prompt from ${inputFile}...`);
        const prompt = await readPromptFromMarkdown(inputFile);

        // Call the AI API
        console.log('Sending prompt to AI API...');
        const aiResponse = await callAIApi(prompt);

        // Generate output filename if not provided
        if (!outputFile) {
            const fileNameWithoutExt = path.basename(inputFile, path.extname(inputFile));
            outputFile = `${fileNameWithoutExt}_response.json`;
        }

        // Save response to JSON file
        console.log(`Saving response to ${outputFile}...`);
        await saveResponseToJson(aiResponse, outputFile);

        console.log('Process completed successfully!');
        return outputFile;
    } catch (error) {
        console.error('Error processing prompt:', error);
        process.exit(1);
    }
}

/**
 * Reads content from a markdown file
 */
async function readPromptFromMarkdown(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return data.trim();
    } catch (error) {
        throw new Error(`Failed to read prompt file: ${error.message}`);
    }
}

/**
 * Saves AI response to a JSON file
 */
async function saveResponseToJson(data, outputPath) {
    try {
        await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf8');
        return outputPath;
    } catch (error) {
        throw new Error(`Failed to save response: ${error.message}`);
    }
}

/**
 * Makes a request to the AI API
 */
async function callAIApi(prompt) {
    try {
        // Get API key from environment variables
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            throw new Error('API key not found. Please set OPENROUTER_API_KEY in .env file');
        }

        const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
        const siteName = process.env.SITE_NAME || 'AI Prompt Processor';

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "HTTP-Referer": siteUrl,
                "X-Title": siteName,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": process.env.AI_MODEL || "microsoft/phi-4-reasoning-plus:free",
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`API request failed with status ${response.status}: ${errorData}`);
        }

        return await response.json();
    } catch (error) {
        throw new Error(`API request failed: ${error.message}`);
    }
}

// Check if this script is being run directly
if (require.main === module) {
    // Get command line arguments
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Please provide the path to the prompt file');
        console.log('Usage: node process-prompt.js <promptFile> [outputFile]');
        process.exit(1);
    }

    const inputFile = args[0];
    const outputFile = args.length > 1 ? args[1] : null;

    // Process the file
    processPromptFile(inputFile, outputFile);
}

module.exports = { processPromptFile };