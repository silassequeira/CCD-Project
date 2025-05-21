const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BASE_DIR = path.join(__dirname, '..');
const RESPONSES_DIR = path.join(BASE_DIR, 'Unity', 'Assets', 'StreamingAssets', 'Responses');
const DEFAULT_PROMPT_PATH = path.join(BASE_DIR, 'Prompts', 'RoomPrompt.md');
const DEFAULT_OUTPUT_PATH = path.join(RESPONSES_DIR, 'room.json');
const MAX_JSON_ATTEMPTS = 3;

class GenerateRoom {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.aiModel = process.env.AI_MODEL || 'nousresearch/deephermes-3-mistral-24b-preview:free';

        this.ensureDirectories();
    }

    ensureDirectories() {
        if (!fs.existsSync(RESPONSES_DIR)) {
            fs.mkdirSync(RESPONSES_DIR, { recursive: true });
            console.log(`Created responses directory at ${RESPONSES_DIR}`);
        }
    }

    validateApiKey() {
        if (!this.apiKey) {
            throw new Error('Missing OPENROUTER_API_KEY in environment variables');
        }
    }

    async readPromptFile(inputPath = DEFAULT_PROMPT_PATH) {
        try {
            const prompt = await fs.promises.readFile(inputPath, 'utf8');
            return prompt.trim();
        } catch (error) {
            throw new Error(`Failed to read prompt file: ${error.message}`);
        }
    }

    async callAIApi(prompt, retries = 3) {
        this.validateApiKey();

        for (let i = 1; i <= retries; i++) {
            try {
                const response = await axios.post(
                    'https://openrouter.ai/api/v1/chat/completions',
                    {
                        model: this.aiModel,
                        messages: [{ role: 'user', content: prompt }]
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                return response.data;
            } catch (error) {
                console.error(`API call attempt ${i} failed:`, error.message);

                if (i === retries) {
                    throw new Error(`Failed to call AI API after ${retries} attempts: ${error.message}`);
                }

                const delay = 1000 * Math.pow(2, i - 1);
                console.log(`Retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    extractContent(apiResponse) {
        if (!apiResponse.choices || !apiResponse.choices[0] || !apiResponse.choices[0].message) {
            throw new Error('Invalid API response format');
        }

        let content = apiResponse.choices[0].message.content;

        content = content
            .replace(/^```json\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();

        try {
            return JSON.parse(content);
        } catch (error) {
            console.warn('Room Flow: Response not valid JSON');
            return content;
        }
    }

    async saveOutput(data, outputPath = DEFAULT_OUTPUT_PATH) {
        try {
            await fs.promises.writeFile(
                outputPath,
                JSON.stringify(data, null, 2)
            );
            console.log(`Room Flow: Saved output to ${outputPath}`);
        } catch (error) {
            throw new Error(`Failed to save output: ${error.message}`);
        }
    }

    fixJsonStructure(data) {
        const fixedData = JSON.parse(JSON.stringify(data));

        if (fixedData.object && !fixedData.objects) {
            console.log('Room Flow: Converting "object" array to "objects" for Unity compatibility');
            fixedData.objects = fixedData.object;
            delete fixedData.object;
        }

        return fixedData;
    }

    async processRoomPrompt(inputPath = DEFAULT_PROMPT_PATH, outputPath = DEFAULT_OUTPUT_PATH) {
        console.log('--- Room Flow: Starting room processing');

        console.log(`--- Room Flow: Reading prompt from ${inputPath}`);
        const prompt = await this.readPromptFile(inputPath);

        let processedData;
        for (let attempt = 1; attempt <= MAX_JSON_ATTEMPTS; attempt++) {
            console.log(`--- Room Flow: Sending to AI API (attempt ${attempt}/${MAX_JSON_ATTEMPTS})`);

            const apiResponse = await this.callAIApi(prompt);
            const result = this.extractContent(apiResponse);

            if (typeof result !== 'string') {
                processedData = result;
                break;
            }

            console.warn(`--- Room Flow: Invalid JSON on attempt ${attempt}`);

            if (attempt === MAX_JSON_ATTEMPTS) {
                throw new Error('Failed to receive valid JSON after multiple attempts');
            }
        }

        // Fix the JSON structure before saving
        const fixedData = this.fixJsonStructure(processedData);

        await this.saveOutput(fixedData, outputPath);

        console.log('--- Room Flow: Processing completed successfully');
        return fixedData;
    }
}

module.exports = GenerateRoom;