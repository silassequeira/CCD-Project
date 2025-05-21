// room-validator.js
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

// Constants for directory paths
const RESPONSES_DIR = path.join(__dirname, 'responses');

/**
 * Validates and fixes room JSON data
 * @param {string} roomJsonPath - Path to the room JSON file
 * @returns {Promise<string>} - Path to the validated file
 */
async function validateRoom(roomJsonPath = path.join(RESPONSES_DIR, 'room.json')) {
    try {
        // Read the original room JSON
        console.log('Reading room JSON for validation...');
        const roomData = await fs.readFile(roomJsonPath, 'utf8');

        // Read validation prompt template
        console.log('Loading validation prompt...');
        const validationTemplate = await fs.readFile('RoomValidation.md', 'utf8');

        // Update the prompt to explicitly request raw JSON
        const updatedValidationTemplate = validationTemplate.replace(
            'Return a fixed version of the JSON',
            'IMPORTANT: Do NOT wrap your response in markdown code blocks (```). Just output the raw JSON directly without any formatting markers.\n\nReturn a fixed version of the JSON'
        );

        // Create the final prompt with room data inserted
        const finalPrompt = updatedValidationTemplate.replace('[paste the generated room JSON here]', roomData);

        // Call the API
        console.log('Validating room layout...');
        const apiResponse = await callAIApi(finalPrompt);

        // Extract and clean the content
        const contentString = apiResponse?.choices?.[0]?.message?.content;
        if (!contentString) {
            throw new Error('Invalid API response format');
        }

        // Save the raw response for reference
        const rawResponsePath = path.join(RESPONSES_DIR, 'validation_raw_response.txt');
        await fs.writeFile(rawResponsePath, contentString, 'utf8');
        console.log(`Raw response saved to ${rawResponsePath}`);

        // Clean the response by removing markdown code block markers
        const cleanedContent = contentString
            .replace(/^```json\s*/, '') // Remove opening ```json
            .replace(/```\s*$/, '')      // Remove closing ```
            .trim();

        console.log('Cleaned content for parsing...');

        // Try to parse as JSON
        let validatedContent;
        try {
            validatedContent = JSON.parse(cleanedContent);
            console.log('Successfully parsed JSON content');
        } catch (e) {
            console.error('Error parsing cleaned content:', e);
            throw new Error(`Failed to parse cleaned response as JSON. See ${rawResponsePath} for raw response.`);
        }

        // Save validated room (option A: save to new file)
        const validatedPath = path.join(RESPONSES_DIR, 'room_validated.json');
        await fs.writeFile(validatedPath, JSON.stringify(validatedContent, null, 2), 'utf8');
        console.log(`Validation complete! Saved to ${validatedPath}`);

        return validatedPath;
    } catch (error) {
        console.error('Error validating room:', error);
        throw error;
    }
}

/**
 * Makes a request to the AI API with robust error handling
 * @param {string} prompt - The prompt to send to the AI
 * @returns {Promise<object>} - The AI response
 */
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

            // Make the request
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "AI Room Validator"
                },
                body: JSON.stringify({
                    "model": modelName,
                    "messages": [{ "role": "user", "content": prompt }]
                })
            });

            // Handle errors
            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`API request failed with status ${response.status}: ${errorData}`);
            }

            // Parse response
            const responseText = await response.text();
            try {
                return JSON.parse(responseText);
            } catch (jsonError) {
                // Save raw response for debugging
                const debugPath = path.join(RESPONSES_DIR, `debug_${Date.now()}.md`);
                await saveRawResponse(responseText, debugPath);
                throw new Error(`Invalid JSON response (saved to ${debugPath})`);
            }

        } catch (error) {
            // On last attempt, rethrow the error
            if (attempt === retries) {
                throw error;
            }

            // Otherwise wait and retry
            const delay = 1000 * Math.pow(2, attempt - 1);
            console.log(`Attempt ${attempt} failed. Waiting ${delay}ms before retry...`);
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

// Run the validator if called directly
if (require.main === module) {
    validateRoom().catch(err => {
        console.error('Validation failed:', err);
        process.exit(1);
    });
}

module.exports = { validateRoom };