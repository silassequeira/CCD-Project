// Updated to better connect room data with audio generation
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

// Constants for directory paths
const RESPONSES_DIR = path.join(__dirname, 'responses');

/**
 * Simplified prompt processor for Room and Audio prompts
 * @param {string} promptType - Either "room" or "audio"
 * @returns {Promise<string>} - Path to the saved output file
 */
async function processPrompt(promptType) {
    try {
        // Ensure responses directory exists
        await fs.mkdir(RESPONSES_DIR, { recursive: true });

        // Set input and output files based on prompt type
        const inputFile = `${promptType === 'room' ? 'RoomPrompt.md' : 'AudioPrompt.md'}`;
        const outputFile = path.join(RESPONSES_DIR, `${promptType}.json`);

        // Read prompt from markdown file
        console.log(`Reading ${promptType} prompt from ${inputFile}...`);
        const prompt = await fs.readFile(inputFile, 'utf8').then(data => data.trim());

        // Special handling for audio to include room context
        let finalPrompt = prompt;

        if (promptType === 'audio') {
            try {
                // Check if room.json exists
                const roomFilePath = path.join(RESPONSES_DIR, 'room.json');
                const roomData = JSON.parse(await fs.readFile(roomFilePath, 'utf8'));

                console.log('Found room data, incorporating into audio prompt...');

                // Extract relevant info from room data
                const profession = roomData.environment?.name?.replace("'s Bedroom", "") || 'Unknown Profession';

                // Create a detailed list of objects from the room with their details
                const roomObjects = roomData.objects?.map(obj =>
                    `${obj.name} (${obj.shape}, ${obj.color})`
                ).join('\n- ') || '';

                // Include the full room JSON data as a structured reference
                const roomDataMinified = JSON.stringify(roomData);

                // Enhance the prompt with room context
                finalPrompt = `${prompt}\n\n### ROOM DATA CONTEXT ###\n\n` +
                    `Profession: ${profession}\n\n` +
                    `Available Objects:\n- ${roomObjects}\n\n` +
                    `IMPORTANT: You MUST select objects that actually exist in the list above. ` +
                    `Do not invent objects that aren't in the room. Match the exact object names from the list.\n\n` +
                    `The bedroom was generated for a ${profession}. Create an audio scene that fits this profession ` +
                    `and utilizes the actual objects present in their bedroom.\n\n` +
                    `Complete room data for reference (use only if needed):\n${roomDataMinified}`;

                console.log(`Enhanced prompt with ${profession} context and ${roomData.objects?.length || 0} objects`);

                // Save the enhanced prompt for debugging/reference
                const debugPromptPath = path.join(RESPONSES_DIR, 'audio_prompt_enhanced.txt');
                await fs.writeFile(debugPromptPath, finalPrompt, 'utf8');
                console.log(`Enhanced prompt saved to ${debugPromptPath} for reference`);
            } catch (error) {
                console.warn('Could not load room data for context:', error.message);
                console.log('Proceeding with original audio prompt without room context');
            }
        }

        // Call the AI API
        console.log(`Sending ${promptType} prompt to AI API...`);
        const apiResponse = await callAIApi(finalPrompt);

        // Extract just the AI content
        const cleanContent = extractContent(apiResponse);

        // For audio, validate that object names match room objects
        if (promptType === 'audio' && cleanContent && cleanContent.scene && cleanContent.scene.interactions) {
            try {
                const roomFilePath = path.join(RESPONSES_DIR, 'room.json');
                const roomData = JSON.parse(await fs.readFile(roomFilePath, 'utf8'));

                // Get list of actual object names from room
                const roomObjectNames = roomData.objects?.map(obj => obj.name.toLowerCase()) || [];

                // Check if audio interactions reference objects in the room
                const audioObjects = cleanContent.scene.interactions.map(interaction =>
                    interaction.object.toLowerCase()
                );

                // Find any invalid object references
                const invalidObjects = audioObjects.filter(obj => !roomObjectNames.includes(obj));

                if (invalidObjects.length > 0) {
                    console.warn(`Warning: Found ${invalidObjects.length} audio interactions referencing objects not in the room:`);
                    console.warn(invalidObjects.join(', '));
                    console.warn('Consider regenerating the audio data for better coherence with the room.');
                }
            } catch (error) {
                console.warn('Could not validate audio objects against room data:', error.message);
            }
        }

        // Save response to JSON file
        console.log(`Saving ${promptType} response to ${outputFile}...`);
        await fs.writeFile(outputFile, JSON.stringify(cleanContent, null, 2), 'utf8');

        console.log(`${promptType.charAt(0).toUpperCase() + promptType.slice(1)} processing completed successfully!`);
        return outputFile;
    } catch (error) {
        console.error(`Error processing ${promptType} prompt:`, error);
        process.exit(1);
    }
}

function extractContent(apiResponse) {
    // Save the raw response for debugging
    const debugPath = path.join(RESPONSES_DIR, `debug_raw_${Date.now()}.json`);
    fs.writeFile(debugPath, JSON.stringify(apiResponse, null, 2), 'utf8')
        .catch(err => console.error('Failed to save raw response for debugging:', err));

    // Check for response errors
    if (apiResponse?.error) {
        throw new Error(`API returned error: ${apiResponse.error.message || JSON.stringify(apiResponse.error)}`);
    }

    // Check if response has the expected structure
    if (!apiResponse?.choices?.[0]?.message?.content) {
        console.error('Unexpected API response format:', JSON.stringify(apiResponse).substring(0, 500) + '...');
        throw new Error('Invalid API response format - message.content not found');
    }

    // Extract the content string
    let contentString = apiResponse.choices[0].message.content;

    // Clean the response by removing markdown code block markers
    contentString = contentString
        .replace(/^```json\s*/i, '')  // Remove opening ```json
        .replace(/\s*```\s*$/i, '')   // Remove closing ```
        .trim();

    try {
        // If it's valid JSON, parse it
        const parsedContent = JSON.parse(contentString);
        return parsedContent;
    } catch (e) {
        console.warn('Failed to parse content as JSON:', e.message);
        console.warn('First 200 characters of content:', contentString.substring(0, 200) + '...');

        // Save the content for debugging
        const contentDebugPath = path.join(RESPONSES_DIR, `debug_content_${Date.now()}.txt`);
        fs.writeFile(contentDebugPath, contentString, 'utf8')
            .then(() => console.log(`Problematic content saved to ${contentDebugPath}`))
            .catch(err => console.error('Failed to save content for debugging:', err));

        // Otherwise return as string
        return contentString;
    }
}

async function callAIApi(prompt, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`API request attempt ${attempt}/${retries}`);

            // Get API key
            const apiKey = process.env.OPENROUTER_API_KEY;
            if (!apiKey) {
                throw new Error('API key not found. Please set OPENROUTER_API_KEY in .env file');
            }

            // Config
            const modelName = process.env.AI_MODEL || "microsoft/phi-4-reasoning-plus:free";
            console.log(`Using AI model: ${modelName}`);

            // Log request info (without full prompt for brevity)
            console.log(`Request: ${prompt.substring(0, 100)}... (${prompt.length} chars)`);

            // Make the request
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "AI Prompt Processor"
                },
                body: JSON.stringify({
                    "model": modelName,
                    "messages": [{ "role": "user", "content": prompt }]
                })
            });

            // Handle non-successful responses
            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`API request failed with status ${response.status}: ${errorData}`);
            }

            // Parse response
            const responseText = await response.text();

            try {
                // Try to parse as JSON
                return JSON.parse(responseText);
            } catch (jsonError) {
                // If not valid JSON, log and save the raw response
                console.error('API returned invalid JSON response');
                const debugPath = path.join(RESPONSES_DIR, `debug_response_${Date.now()}.txt`);
                await fs.writeFile(debugPath, responseText, 'utf8');
                throw new Error(`API returned invalid JSON response (saved to ${debugPath})`);
            }

        } catch (error) {
            // On last attempt, rethrow the error
            if (attempt === retries) {
                throw error;
            }

            // Otherwise wait and retry
            const delay = 1000 * Math.pow(2, attempt - 1);
            console.log(`Attempt ${attempt} failed: ${error.message}`);
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Saves raw API response for debugging
 */
async function saveRawResponse(responseText, outputPath) {
    try {
        const content = [
            '# Raw API Response',
            `Generated on: ${new Date().toISOString()}`,
            '',
            '```',
            responseText || 'Empty response',
            '```'
        ].join('\n');

        await fs.writeFile(outputPath, content, 'utf8');
        console.log(`Raw response saved to ${outputPath}`);
    } catch (error) {
        console.error('Failed to save raw response:', error.message);
    }
}

// Command-line interface
if (require.main === module) {
    const promptType = process.argv[2]?.toLowerCase();

    if (promptType === 'room') {
        processPrompt('room');
    } else if (promptType === 'audio') {
        processPrompt('audio');
    } else {
        console.log('Usage: node process-prompt.js [room|audio]');
        console.log('  room  - Process RoomPrompt.md and save to responses/room.json');
        console.log('  audio - Process AudioPrompt.md and save to responses/audio.json');
    }
}

module.exports = { processPrompt };