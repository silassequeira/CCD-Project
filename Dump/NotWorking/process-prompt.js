// process-prompt.js
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

// Constants for directory paths
const HISTORY_DIR = path.join(__dirname, 'history');
const RESPONSES_DIR = path.join(__dirname, 'responses');

/**
 * Ensure required directories exist
 */
async function ensureDirectoriesExist() {
    try {
        await fs.mkdir(HISTORY_DIR, { recursive: true });
        await fs.mkdir(RESPONSES_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating directories:', error);
    }
}

/**
 * Main function to process a prompt file
 * @param {string} inputFile - Path to prompt file
 * @param {string} outputFile - Optional output file path
 * @param {Array} contextFiles - Optional array of context files
 */
async function processPromptFile(inputFile, outputFile = null, contextFiles = []) {
    try {
        // Ensure directories exist
        await ensureDirectoriesExist();

        // Read prompt from markdown file
        console.log(`Reading prompt from ${inputFile}...`);
        const prompt = await readPromptFromMarkdown(inputFile);

        // Generate output filename if not provided
        if (!outputFile) {
            const fileNameWithoutExt = path.basename(inputFile, path.extname(inputFile));
            outputFile = path.join(RESPONSES_DIR, `${fileNameWithoutExt}.json`);
        }

        // Load conversation history if context files provided
        let history = [];
        if (contextFiles && contextFiles.length > 0) {
            console.log('Loading context from previous responses...');
            history = await loadConversationHistory(contextFiles);
            console.log(`Loaded context from ${contextFiles.length} file(s).`);
        }

        // Call the AI API with history
        console.log('Sending prompt to AI API...');
        const fullResponse = await callAIApi(prompt, history);
        // Extract just the content
        const aiResponse = extractContent(fullResponse);

        // Function to extract content
        function extractContent(apiResponse) {
            if (!apiResponse?.choices?.[0]?.message?.content) {
                throw new Error('Invalid API response format');
            }

            const contentString = apiResponse.choices[0].message.content;

            try {
                // If it's valid JSON, parse it
                return JSON.parse(contentString);
            } catch (e) {
                // Otherwise return as string
                return contentString;
            }
        }
        // Add the original prompt to the response for context
        aiResponse.user_prompt = prompt;

        // Save response to JSON file
        console.log(`Saving response to ${outputFile}...`);
        await saveResponseToJson(aiResponse, outputFile);

        // Save to conversation history
        const conversationId = path.basename(inputFile, path.extname(inputFile));
        await saveConversationHistory(conversationId, prompt, aiResponse);

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
 * Saves raw API response text to a markdown file for debugging
 * @param {string} responseText - The raw response text from API
 * @param {string} outputPath - Base path for output file (will be modified to .md)
 * @returns {Promise<string>} - Path to the saved file
 */
async function saveRawResponseToMarkdown(responseText, outputPath) {
    try {
        // Ensure output path is for markdown
        const mdPath = outputPath.replace(/\.\w+$/, '') + '.md';

        // Format the content with metadata
        const content = [
            '# Raw API Response',
            `Generated on: ${new Date().toISOString()}`,
            '',
            '## Response Content',
            '```',
            responseText || 'Empty response',
            '```',
            '',
            '## Debugging Notes',
            'This file was generated because the API response could not be parsed as JSON.'
        ].join('\n');

        await fs.writeFile(mdPath, content, 'utf8');
        console.log(`Raw response saved as markdown to ${mdPath}`);
        return mdPath;
    } catch (error) {
        console.error(`Failed to save raw response: ${error.message}`);
        return null; // Non-critical operation, return null instead of throwing
    }
}

/**
 * Makes a request to the AI API with conversation history
 * @param {string} prompt - The prompt to send to the AI
 * @param {Array} history - Optional conversation history
 * @returns {Promise<object>} - The AI response
 */
async function callAIApi(prompt, history = [], retries = 3) {
    // Create an array of attempts (1 to retries)
    return await [...Array(retries).keys()]
        .map(i => i + 1) // Convert 0-based to 1-based index
        .reduce(async (previousAttempt, attemptNumber) => {
            try {
                // Wait for previous attempt to fail before trying the next one
                await previousAttempt.catch(() => { });

                // If a previous attempt succeeded, just return its result
                const prevResult = await previousAttempt.catch(() => null);
                if (prevResult) return prevResult;

                console.log(`API request attempt ${attemptNumber}/${retries}`);

                // Get API key and validate
                const apiKey = process.env.OPENROUTER_API_KEY;
                if (!apiKey) {
                    throw new Error('API key not found. Please set OPENROUTER_API_KEY in .env file');
                }

                // Prepare request configuration
                const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
                const siteName = process.env.SITE_NAME || 'AI Prompt Processor';
                const modelName = process.env.AI_MODEL || "microsoft/phi-4-reasoning-plus:free";

                // Build messages array with functional approach
                const messages = [
                    // Spread history if exists
                    ...(history?.length > 0 ? history : []),
                    // Add current prompt
                    { "role": "user", "content": prompt }
                ];

                // Make the API request
                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "HTTP-Referer": siteUrl,
                        "X-Title": siteName,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        "model": modelName,
                        "messages": messages
                    })
                });

                // Handle non-200 responses
                if (!response.ok) {
                    const errorData = await response.text();
                    throw new Error(`API request failed with status ${response.status}: ${errorData}`);
                }

                const responseText = await response.text();
                try {
                    return JSON.parse(responseText);
                } catch (jsonError) {
                    // Save the raw response as markdown for debugging
                    const debugPath = `${__dirname}/responses/debug_${Date.now()}.md`;
                    await saveRawResponseToMarkdown(responseText, debugPath);

                    throw new Error(`Invalid JSON response (saved to ${debugPath}): ${responseText.substring(0, 100)}...`);
                }

            } catch (error) {
                // On last attempt, rethrow the error
                if (attemptNumber === retries) {
                    console.error(`All ${retries} API request attempts failed`);
                    throw new Error(`API request failed: ${error.message}`);
                }

                // Otherwise, calculate backoff and wait
                const delay = 1000 * Math.pow(2, attemptNumber - 1);
                console.log(`Attempt ${attemptNumber} failed: ${error.message}`);
                console.log(`Waiting ${delay}ms before retry ${attemptNumber + 1}...`);
                await new Promise(resolve => setTimeout(resolve, delay));

                // Return a rejected promise to continue the reduce chain
                return Promise.reject(error);
            }
        }, Promise.reject(new Error("Starting retry sequence")));  // Initial rejected promise to start the chain
}
/**
 * Loads conversation history from previous responses
 * @param {Array} contextFiles - Array of JSON file paths to include as context
 * @returns {Promise<Array>} - The conversation history
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

// Check if this script is being run directly
if (require.main === module) {
    // Get command line arguments
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Please provide the path to the prompt file');
        console.log('Usage: node process-prompt.js <promptFile> [outputFile] [--context file1.json,file2.json]');
        process.exit(1);
    }

    // Parse context files if provided
    const inputFile = args[0];
    let outputFile = null;
    let contextFiles = [];

    // Check for context flag
    const contextIndex = args.findIndex(arg => arg === '--context');
    if (contextIndex !== -1 && args.length > contextIndex + 1) {
        // Get context files (comma-separated)
        contextFiles = args[contextIndex + 1].split(',');

        // Remove context arguments from the array
        args.splice(contextIndex, 2);
    }

    // If there's a second argument after removing context, it's the output file
    if (args.length > 1) {
        outputFile = args[1];
    }

    // Process the file with context
    processPromptFile(inputFile, outputFile, contextFiles);
}

module.exports = {
    processPromptFile,
    loadConversationHistory,
    saveConversationHistory,
    ensureDirectoriesExist
};