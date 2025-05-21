// server.js
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

/**
 * Reads content from a markdown file
 * @param {string} filePath - Path to the markdown file
 * @returns {Promise<string>} - Content of the markdown file
 */
async function readPromptFromMarkdown(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return data.trim();
    } catch (error) {
        console.error('Error reading markdown file:', error);
        throw new Error(`Failed to read prompt file: ${error.message}`);
    }
}

/**
 * Saves AI response to a JSON file
 * @param {object} data - The data to save
 * @param {string} outputPath - Path to save the JSON file
 * @returns {Promise<void>}
 */
async function saveResponseToJson(data, outputPath) {
    try {
        await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`Response saved to ${outputPath}`);
    } catch (error) {
        console.error('Error writing JSON file:', error);
        throw new Error(`Failed to save response: ${error.message}`);
    }
}

/**
 * Makes a request to the AI API
 * @param {string} prompt - The prompt to send to the AI
 * @returns {Promise<object>} - The AI response
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
        console.error('Error calling AI API:', error);
        throw new Error(`API request failed: ${error.message}`);
    }
}

// Endpoint to process a prompt from a markdown file
app.post('/process-prompt', async (req, res) => {
    try {
        const { promptFile, outputFile } = req.body;

        if (!promptFile) {
            return res.status(400).json({ error: 'Prompt file path is required' });
        }

        // Default output file name if not provided
        const outputPath = outputFile || 'output.json';

        // Read the prompt from the markdown file
        const promptFilePath = path.resolve(promptFile);
        const prompt = await readPromptFromMarkdown(promptFilePath);

        // Call the AI API
        const aiResponse = await callAIApi(prompt);

        // Save the response to a JSON file
        await saveResponseToJson(aiResponse, outputPath);

        res.json({
            success: true,
            message: `Processed prompt from ${promptFile} and saved response to ${outputPath}`,
            outputPath
        });
    } catch (error) {
        console.error('Error processing prompt:', error);
        res.status(500).json({ error: error.message });
    }
});

// Direct endpoint to process a prompt and generate output without API call
app.post('/process-file', async (req, res) => {
    try {
        const { inputFile } = req.body;

        if (!inputFile) {
            return res.status(400).json({ error: 'Input file path is required' });
        }

        // Generate output file name based on input file
        const fileNameWithoutExt = path.basename(inputFile, path.extname(inputFile));
        const outputPath = `${fileNameWithoutExt}_response.json`;

        // Read prompt from input file
        const prompt = await readPromptFromMarkdown(inputFile);

        // Call the AI API
        const aiResponse = await callAIApi(prompt);

        // Save response to output file
        await saveResponseToJson(aiResponse, outputPath);

        res.json({
            success: true,
            message: `Processed prompt from ${inputFile} and saved response to ${outputPath}`,
            outputPath
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app; // Export for testing