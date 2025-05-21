const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BASE_DIR = path.join(__dirname, '..');
const RESPONSES_DIR = path.join(BASE_DIR, 'Unity', 'Assets', 'StreamingAssets', 'Responses');
const ROOM_JSON_PATH = path.join(RESPONSES_DIR, 'room.json');
const AUDIO_PROMPT_PATH = path.join(BASE_DIR, 'Prompts', 'AudioPrompt.md');
const AUDIO_OUTPUT_PATH = path.join(RESPONSES_DIR, 'audio.json');
const MAX_PROCESS_ATTEMPTS = 4; // Maximum number of attempts for the full process

class GenerateAudio {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.aiModel = process.env.AI_MODEL || 'microsoft/phi-4-reasoning-plus:free';

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

    async loadRoomData() {
        try {
            if (!fs.existsSync(ROOM_JSON_PATH)) {
                throw new Error(`Room data file not found at ${ROOM_JSON_PATH}`);
            }

            const roomJson = await fs.promises.readFile(ROOM_JSON_PATH, 'utf8');
            return JSON.parse(roomJson);
        } catch (error) {
            throw new Error(`Audio Flow: room.json missing or invalid: ${error.message}`);
        }
    }

    async readAudioPrompt() {
        try {
            if (!fs.existsSync(AUDIO_PROMPT_PATH)) {
                throw new Error(`Audio prompt file not found at ${AUDIO_PROMPT_PATH}`);
            }

            const prompt = await fs.promises.readFile(AUDIO_PROMPT_PATH, 'utf8');
            return prompt.trim();
        } catch (error) {
            throw new Error(`Failed to read audio prompt: ${error.message}`);
        }
    }

    buildEnhancedPrompt(basePrompt, roomData) {
        const profession = roomData.environment?.name?.replace("'s Bedroom", '') || 'Unknown';

        const objectsList = (roomData.objects || [])
            .map(obj => `${obj.name} (${obj.shape}, ${obj.color})`)
            .join('\n- ');

        return `${basePrompt}\n\n### ROOM CONTEXT ###\nProfession: ${profession}\n- ${objectsList}\n\nIMPORTANT: Use only listed objects.`;
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
            console.warn('Audio Flow: Response not valid JSON:', error.message);
            return content;
        }
    }

    validateObjectReferences(audioData, roomData) {
        if (!audioData || !audioData.scene || !Array.isArray(audioData.scene.interactions)) {
            return ['Invalid audio data structure'];
        }

        const validObjectNames = (roomData.objects || [])
            .map(obj => obj.name.toLowerCase());

        const referencedObjects = audioData.scene.interactions
            .filter(interaction => interaction && interaction.object) // Filter out null/invalid interactions
            .map(interaction => interaction.object.toLowerCase());

        const invalidReferences = referencedObjects
            .filter(obj => !validObjectNames.includes(obj));

        return invalidReferences;
    }

    async saveAudioData(audioData, outputPath = AUDIO_OUTPUT_PATH) {
        try {
            await fs.promises.writeFile(
                outputPath,
                JSON.stringify(audioData, null, 2)
            );
            console.log(`--- Audio Flow: Saved to ${outputPath}`);
        } catch (error) {
            throw new Error(`Failed to save audio data: ${error.message}`);
        }
    }

    // Add a validation method to check if audio data structure is complete
    validateAudioData(audioData) {
        if (!audioData || typeof audioData !== 'object') {
            return {
                valid: false,
                reason: 'Audio data is not an object'
            };
        }

        if (!audioData.scene) {
            return {
                valid: false,
                reason: 'Missing scene property'
            };
        }

        if (!Array.isArray(audioData.scene.interactions) || audioData.scene.interactions.length < 3) {
            return {
                valid: false,
                reason: 'Missing or insufficient interactions (at least 3 required)'
            };
        }

        if (!audioData.scene.background || !audioData.scene.background.title) {
            return {
                valid: false,
                reason: 'Missing background sound configuration'
            };
        }

        // Check if all interactions have required properties
        const invalidInteractions = audioData.scene.interactions.filter(interaction => {
            return !interaction || !interaction.title || !interaction.object || !interaction.freesound_query;
        });

        if (invalidInteractions.length > 0) {
            return {
                valid: false,
                reason: `${invalidInteractions.length} interactions are missing required properties`
            };
        }

        return { valid: true };
    }

    async processAudioFlow() {
        console.log('--- Audio Flow: Starting audio processing');

        for (let attempt = 1; attempt <= MAX_PROCESS_ATTEMPTS; attempt++) {
            console.log(`--- Audio Flow: Processing attempt ${attempt}/${MAX_PROCESS_ATTEMPTS}`);

            try {
                console.log('--- Audio Flow: Loading room data');
                const roomData = await this.loadRoomData();

                console.log('--- Audio Flow: Reading audio prompt template');
                const basePrompt = await this.readAudioPrompt();

                console.log('--- Audio Flow: Building enhanced prompt with room context');
                const enhancedPrompt = this.buildEnhancedPrompt(basePrompt, roomData);

                console.log('--- Audio Flow: Sending prompt to AI API');
                const apiResponse = await this.callAIApi(enhancedPrompt);

                console.log('--- Audio Flow: Processing API response');
                const audioData = this.extractContent(apiResponse);

                if (typeof audioData === 'string') {
                    throw new Error('Failed to parse audio data as JSON');
                }

                // Validate the audio data structure
                const validation = this.validateAudioData(audioData);
                if (!validation.valid) {
                    throw new Error(`Invalid audio data: ${validation.reason}`);
                }

                console.log('--- Audio Flow: Validating object references');
                const invalidReferences = this.validateObjectReferences(audioData, roomData);

                if (invalidReferences.length > 0) {
                    console.warn('Audio Flow: Found invalid object references:', invalidReferences);

                    // If too many invalid references, retry
                    if (invalidReferences.length > 3 && attempt < MAX_PROCESS_ATTEMPTS) {
                        throw new Error(`Too many invalid object references: ${invalidReferences.join(', ')}`);
                    }
                }

                // Fix any missing properties to ensure data structure is complete
                this.sanitizeAudioData(audioData);

                await this.saveAudioData(audioData);

                console.log('--- Audio Flow: Audio processing completed successfully');
                return audioData;

            } catch (error) {
                console.error(`--- Audio Flow: Error in attempt ${attempt}:`, error.message);

                if (attempt === MAX_PROCESS_ATTEMPTS) {
                    console.error('--- Audio Flow: All attempts failed');
                    throw new Error(`Audio generation failed after ${MAX_PROCESS_ATTEMPTS} attempts: ${error.message}`);
                }

                const delay = 2000 * attempt;
                console.log(`--- Audio Flow: Waiting ${delay / 1000} seconds before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // Add method to sanitize and fix common issues with the audio data
    sanitizeAudioData(audioData) {
        if (!audioData.scene) {
            audioData.scene = {};
        }

        if (!Array.isArray(audioData.scene.interactions)) {
            audioData.scene.interactions = [];
        }

        // Ensure each interaction has required fields
        audioData.scene.interactions.forEach((interaction, index) => {
            if (!interaction) {
                audioData.scene.interactions[index] = {
                    title: `Interaction ${index + 1}`,
                    object: "Unknown",
                    freesound_query: "general object sound",
                    volume: 0.5
                };
                return;
            }

            if (!interaction.title) interaction.title = `Interaction ${index + 1}`;
            if (!interaction.object) interaction.object = "Unknown";
            if (!interaction.freesound_query) interaction.freesound_query = "general object sound";
            if (!interaction.volume) interaction.volume = 0.5;
        });

        // Ensure background sound is configured
        if (!audioData.scene.background) {
            audioData.scene.background = {
                title: "Room Ambience",
                freesound_query: "quiet room ambience",
                tags: ["indoors"],
                duration: 30,
                loop: true,
                volume: 0.2
            };
        } else {
            const bg = audioData.scene.background;
            if (!bg.title) bg.title = "Room Ambience";
            if (!bg.freesound_query) bg.freesound_query = "quiet room ambience";
            if (!bg.tags) bg.tags = ["indoors"];
            if (!bg.duration) bg.duration = 30;
            if (bg.loop === undefined) bg.loop = true;
            if (!bg.volume) bg.volume = 0.2;
        }

        return audioData;
    }
}

module.exports = GenerateAudio;