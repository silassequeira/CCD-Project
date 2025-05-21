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

// Path to store conversation history
const HISTORY_DIR = path.join(__dirname, 'history');
const RESPONSES_DIR = path.join(__dirname, 'responses');

// Create directories if they don't exist
async function ensureDirectoriesExist() {
    try {
        await fs.mkdir(HISTORY_DIR, { recursive: true });
        await fs.mkdir(RESPONSES_DIR, { recursive: true });
        console.log('History and responses directories created or already exist');
    } catch (error) {
        console.error('Error creating directories:', error);
    }
}

// Call this function when the server starts
ensureDirectoriesExist();

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
 * Makes a request to the AI API with conversation history
 * @param {string} prompt - The prompt to send to the AI
 * @param {Array} history - Optional conversation history
 /**
 * Check OpenRouter API key status and limits
 * @returns {Promise<object>} - API key status information
 */
async function checkApiKeyStatus() {
    try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            throw new Error('API key not found. Please set OPENROUTER_API_KEY in .env file');
        }

        const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`API key check failed with status ${response.status}: ${errorData}`);
        }

        const keyData = await response.json();
        return keyData.data;
    } catch (error) {
        throw new Error(`Failed to check API key status: ${error.message}`);
    }
}

/**
 * Makes a request to the AI API with conversation history
 * @param {string} prompt - The prompt to send to the AI
 * @param {Array} history - Optional conversation history
 * @returns {Promise<object>} - The AI response
 */
async function callAIApi(prompt, history = [], retries = 3) {
    let keyStatus;

    try {
        // Check API key status before making the request
        try {
            keyStatus = await checkApiKeyStatus();
            console.log(`API Key Status: ${keyStatus.usage}/${keyStatus.limit || 'unlimited'} credits used`);
            console.log(`Rate limit: ${keyStatus.rate_limit.requests} requests per ${keyStatus.rate_limit.interval}`);

            // Warn if credits are low
            if (keyStatus.limit && (keyStatus.limit - keyStatus.usage < 1)) {
                console.warn('WARNING: You are low on credits or have a negative balance!');
            }
        } catch (statusError) {
            console.warn(`Could not check API key status: ${statusError.message}`);
        }

        // Implement retry logic
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Get API key from environment variables
                const apiKey = process.env.OPENROUTER_API_KEY;
                if (!apiKey) {
                    throw new Error('API key not found. Please set OPENROUTER_API_KEY in .env file');
                }

                const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
                const siteName = process.env.SITE_NAME || 'AI Prompt Processor';

                // Build messages array - include history if provided
                let messages = [];

                // Add history messages first
                if (history && history.length > 0) {
                    messages = [...history];
                }

                // Add the current prompt
                messages.push({
                    "role": "user",
                    "content": prompt
                });

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
                        "messages": messages
                    })
                });

                if (!response.ok) {
                    const errorData = await response.text();
                    throw new Error(`API request failed with status ${response.status}: ${errorData}`);
                }

                return await response.json();
            } catch (error) {
                console.error(`API request attempt ${attempt}/${retries} failed:`, error.message);

                // If this was our last retry, throw the error
                if (attempt === retries) {
                    throw new Error(`API request failed after ${retries} attempts: ${error.message}`);
                }

                // Wait before retrying (exponential backoff)
                const delay = 1000 * Math.pow(2, attempt - 1);
                console.log(`Waiting ${delay}ms before retrying...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    } catch (error) {
        throw new Error(`API request failed: ${error.message}`);
    }
}

/**
 * Loads conversation history from previous responses
 * @param {string} contextFiles - Array of JSON files to include as context
 * @returns {Promise<Array>} - The conversation history in the format expected by the API
 */
async function loadConversationHistory(contextFiles = []) {
    const history = [];

    for (const file of contextFiles) {
        try {
            // Ensure the file path is correct
            const filePath = path.isAbsolute(file) ? file : path.join(RESPONSES_DIR, file);

            // Check if file exists
            try {
                await fs.access(filePath);
            } catch (err) {
                console.warn(`Context file ${filePath} not found, skipping.`);
                continue;
            }

            // Read the file
            const data = await fs.readFile(filePath, 'utf8');
            const jsonData = JSON.parse(data);

            // Extract the content from the response and add to history
            if (jsonData.choices && jsonData.choices.length > 0) {
                const messageContent = jsonData.choices[0].message.content;

                // Add the assistant's response to the history
                history.push({
                    role: "assistant",
                    content: messageContent
                });

                // If response has useful context, also add it as user message to provide context
                // This is only needed if we want to simulate the original user prompt too
                if (jsonData.user_prompt) {
                    history.unshift({
                        role: "user",
                        content: jsonData.user_prompt
                    });
                }
            }
        } catch (error) {
            console.error(`Error loading history from ${file}:`, error);
            // Continue with other files even if one fails
        }
    }

    return history;
}

// Endpoint to process a prompt from a markdown file
app.post('/process-prompt', async (req, res) => {
    try {
        const { promptFile, outputFile, contextFiles } = req.body;

        if (!promptFile) {
            return res.status(400).json({ error: 'Prompt file path is required' });
        }

        // Default output file name if not provided
        const outputPath = outputFile || 'output.json';

        // Read the prompt from the markdown file
        const promptFilePath = path.resolve(promptFile);
        const prompt = await readPromptFromMarkdown(promptFilePath);

        // Load conversation history if contextFiles provided
        const history = contextFiles ? await loadConversationHistory(contextFiles) : [];

        // Call the AI API with history
        const aiResponse = await callAIApi(prompt, history);

        // Add the original prompt to the response for context
        aiResponse.user_prompt = prompt;

        // Save the response to a JSON file
        await saveResponseToJson(aiResponse, outputPath);

        // Update the conversation history
        const conversationId = path.basename(promptFile, path.extname(promptFile));
        await saveConversationHistory(conversationId, prompt, aiResponse);

        res.json({
            success: true,
            message: `Processed prompt from ${promptFile} and saved response to ${outputPath}`,
            outputPath,
            historyUpdated: true
        });
    } catch (error) {
        console.error('Error processing prompt:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Save conversation history entry
 * @param {string} conversationId - Identifier for the conversation
 * @param {string} prompt - The user's prompt
 * @param {object} response - The AI response
 */
async function saveConversationHistory(conversationId, prompt, response) {
    try {
        const historyFile = path.join(HISTORY_DIR, `${conversationId}_history.json`);

        // Check if history file exists
        let history = [];
        try {
            const existingHistory = await fs.readFile(historyFile, 'utf8');
            history = JSON.parse(existingHistory);
        } catch (error) {
            // File doesn't exist yet, start with empty history
        }

        // Extract message content from the response
        const assistantMessage = response.choices && response.choices.length > 0
            ? response.choices[0].message.content
            : '';

        // Add new exchange to history
        history.push({
            timestamp: new Date().toISOString(),
            user: prompt,
            assistant: assistantMessage
        });

        // Save updated history
        await fs.writeFile(historyFile, JSON.stringify(history, null, 2), 'utf8');
        console.log(`Conversation history updated at ${historyFile}`);

    } catch (error) {
        console.error('Error saving conversation history:', error);
        // This is non-critical, so we don't throw
    }
}

// Process a file with context from previous responses
app.post('/process-with-context', async (req, res) => {
    try {
        const { inputFile, contextFiles, outputFile } = req.body;

        if (!inputFile) {
            return res.status(400).json({ error: 'Input file path is required' });
        }

        if (!contextFiles || !Array.isArray(contextFiles) || contextFiles.length === 0) {
            return res.status(400).json({ error: 'Context files array is required' });
        }

        // Generate output file name if not provided
        const fileNameWithoutExt = path.basename(inputFile, path.extname(inputFile));
        const outputPath = outputFile || path.join(RESPONSES_DIR, `${fileNameWithoutExt}.json`);

        // Read prompt from input file
        const prompt = await readPromptFromMarkdown(inputFile);

        // Load conversation history from context files
        const history = await loadConversationHistory(contextFiles);

        // Call the AI API with history
        const aiResponse = await callAIApi(prompt, history);

        // Add the original prompt to the response for context
        aiResponse.user_prompt = prompt;

        // Save response to output file
        await saveResponseToJson(aiResponse, outputPath);

        // Update conversation history
        await saveConversationHistory(fileNameWithoutExt, prompt, aiResponse);

        res.json({
            success: true,
            message: `Processed prompt with context and saved response to ${outputPath}`,
            contextFiles,
            outputPath,
            historyUpdated: true
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Direct endpoint to process a prompt without context
app.post('/process-file', async (req, res) => {
    try {
        const { inputFile } = req.body;

        if (!inputFile) {
            return res.status(400).json({ error: 'Input file path is required' });
        }

        // Generate output file name based on input file
        const fileNameWithoutExt = path.basename(inputFile, path.extname(inputFile));
        const outputPath = path.join(RESPONSES_DIR, `${fileNameWithoutExt}.json`);

        // Read prompt from input file
        const prompt = await readPromptFromMarkdown(inputFile);

        // Call the AI API
        const aiResponse = await callAIApi(prompt);

        // Add the original prompt to the response for context
        aiResponse.user_prompt = prompt;

        // Save response to output file
        await saveResponseToJson(aiResponse, outputPath);

        // Update conversation history
        await saveConversationHistory(fileNameWithoutExt, prompt, aiResponse);

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