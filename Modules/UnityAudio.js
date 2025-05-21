const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const FetchFreesound = require('./FetchFreesound');

const BASE_DIR = path.join(__dirname, '..');
const DEFAULT_UNITY_BASE_PATH = path.join(BASE_DIR, 'Unity');
const SCENE_FOLDER_NAME = 'current_scene';

class UnityAudio {
    constructor(freesoundApi, unityBasePath) {
        if (!(freesoundApi instanceof FetchFreesound)) {
            throw new Error('First parameter must be an instance of FetchFreesound');
        }

        this.freesoundApi = freesoundApi;
        this.UNITY_BASE_PATH = unityBasePath || DEFAULT_UNITY_BASE_PATH;
        this.UNITY_STREAMING_ASSETS_PATH = path.join(this.UNITY_BASE_PATH, 'Assets', 'StreamingAssets');
        this.UNITY_SOUNDS_PATH = path.join(this.UNITY_STREAMING_ASSETS_PATH, 'Sounds');

        this.ensureDirectories();
    }

    ensureDirectories() {
        if (!fs.existsSync(this.UNITY_STREAMING_ASSETS_PATH)) {
            fs.mkdirSync(this.UNITY_STREAMING_ASSETS_PATH, { recursive: true });
            console.log(`Created Unity StreamingAssets directory at ${this.UNITY_STREAMING_ASSETS_PATH}`);
        }
        if (!fs.existsSync(this.UNITY_SOUNDS_PATH)) {
            fs.mkdirSync(this.UNITY_SOUNDS_PATH, { recursive: true });
            console.log(`Created Unity Sounds directory at ${this.UNITY_SOUNDS_PATH}`);
        }
    }

    getLoudnessLUFS(filePath) {
        return new Promise((resolve, reject) => {
            try {
                console.log(`Analyzing audio loudness for: ${filePath}`);

                // Check if file exists
                if (!fs.existsSync(filePath)) {
                    console.error(`File does not exist: ${filePath}`);
                    resolve(-23); // Default value
                    return;
                }

                // Use a simplified approach that's less likely to fail
                ffmpeg(filePath)
                    .outputOptions(['-hide_banner', '-af', 'volumedetect', '-f', 'null'])
                    .on('start', cmd => console.log(`Starting FFmpeg analysis: ${cmd}`))
                    .on('stderr', stderrLine => {
                        // Look for mean_volume in the output
                        const match = stderrLine.match(/mean_volume: ([-\d.]+) dB/);
                        if (match) {
                            console.log(`Detected mean volume: ${match[1]} dB`);
                            // Convert from dB to LUFS (rough estimate)
                            const estimatedLUFS = parseFloat(match[1]) - 3;
                            resolve(estimatedLUFS);
                        }
                    })
                    .on('end', () => {
                        console.log('FFmpeg analysis complete, no explicit volume found');
                        resolve(-23); // Default if no match found
                    })
                    .on('error', err => {
                        console.error(`FFmpeg error: ${err.message}`);
                        resolve(-23); // Default on error
                    })
                    .save(process.platform === 'win32' ? 'NUL' : '/dev/null');
            } catch (error) {
                console.error(`FFmpeg exception: ${error.message}`);
                resolve(-23); // Default on exception
            }
        });
    }

    lufsToNormalized(lufs) {
        if (lufs === null || isNaN(lufs)) return 0.5;
        const clamped = Math.max(-60, Math.min(0, lufs));
        return +(1 - Math.abs(clamped) / 60).toFixed(2);
    }

    async processAudioJson(audioJsonPath, req = null) {
        console.log('Starting audio processing...');

        if (!fs.existsSync(audioJsonPath)) {
            throw new Error(`Audio JSON file not found at ${audioJsonPath}`);
        }

        const jsonContent = fs.readFileSync(audioJsonPath, 'utf8');
        const cleanedJson = jsonContent
            .replace(/\/\/.*$/gm, '')
            .replace(/,(\s*[\]}])/g, '$1');

        let sceneData;
        try {
            sceneData = JSON.parse(cleanedJson);
        } catch (error) {
            throw new Error(`Failed to parse audio JSON: ${error.message}`);
        }

        if (!sceneData || !sceneData.scene) {
            throw new Error('Invalid audio JSON structure, missing scene data');
        }

        const scenePath = path.join(this.UNITY_SOUNDS_PATH, SCENE_FOLDER_NAME);

        if (fs.existsSync(scenePath)) {
            console.log(`Removing previous scene folder: ${scenePath}`);
            fs.rmSync(scenePath, { recursive: true, force: true });
        }

        fs.mkdirSync(scenePath, { recursive: true });
        console.log(`Created scene folder: ${scenePath}`);

        const results = {
            successful: [],
            failed: []
        };

        const sessionToken = req && req.session && req.session.accessToken ? req.session.accessToken : null;
        console.log(`Using session token: ${sessionToken ? 'Yes' : 'No'}`);

        if (sceneData.scene.interactions && Array.isArray(sceneData.scene.interactions)) {
            console.log(`Processing ${sceneData.scene.interactions.length} interaction sounds...`);

            // Update the processAudioJson method for interaction sounds

            // For interaction sounds, modify the code like this:
            for (const interaction of sceneData.scene.interactions) {
                try {
                    console.log(`Searching for "${interaction.title}" (${interaction.object})`);

                    if (sessionToken) {
                        this.freesoundApi.useSessionToken(sessionToken);
                    }

                    // Try main query first
                    let searchResponse = await this.freesoundApi.searchSounds(interaction.freesound_query);

                    // If no results, try each tag as fallback
                    if (searchResponse.count === 0 && interaction.tags && interaction.tags.length > 0) {
                        console.log(`No sounds found for query: ${interaction.freesound_query}. Trying tags...`);

                        // Try each tag individually
                        for (const tag of interaction.tags) {
                            console.log(`Trying tag: "${tag}" for ${interaction.title}...`);
                            searchResponse = await this.freesoundApi.searchSounds(tag, {
                                filter: 'duration:[0 TO 5]', // Shorter for interaction sounds
                                sort: 'rating_desc'
                            });

                            if (searchResponse.count > 0) {
                                console.log(`Found ${searchResponse.count} sounds using tag: "${tag}"`);
                                break;
                            }
                        }

                        // If still no results, use a generic object sound based on the object name
                        if (searchResponse.count === 0) {
                            console.log(`Trying generic sound for "${interaction.object}"...`);
                            searchResponse = await this.freesoundApi.searchSounds(`${interaction.object} sound`, {
                                filter: 'duration:[0 TO 5]',
                                sort: 'rating_desc'
                            });
                        }
                    }

                    if (searchResponse.count === 0) {
                        throw new Error(`No sounds found for query: ${interaction.freesound_query} or tags`);
                    }

                    const sound = searchResponse.results[0];
                    console.log(`Found sound: "${sound.name}" (ID: ${sound.id})`);

                    // Create a base filename without extension
                    const sanitizedTitle = interaction.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const sanitizedObject = interaction.object.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const baseFilename = `${sanitizedObject}_${sanitizedTitle}_${sound.id}`;

                    const soundDetail = await this.freesoundApi.getSoundInfo(sound.id);

                    // More accurate extension detection
                    let soundExt = 'mp3'; // Default fallback

                    // First try to get extension from the original filename if available
                    if (soundDetail.name && soundDetail.name.includes('.')) {
                        const originalExt = soundDetail.name.split('.').pop().toLowerCase();
                        if (['wav', 'mp3', 'ogg', 'aiff', 'aif'].includes(originalExt)) {
                            soundExt = originalExt;
                        }
                    }
                    // Otherwise try to determine from MIME type
                    else if (soundDetail.type) {
                        // Map common MIME types to extensions
                        const mimeMap = {
                            'audio/wav': 'wav',
                            'audio/x-wav': 'wav',
                            'audio/wave': 'wav',
                            'audio/mp3': 'mp3',
                            'audio/mpeg': 'mp3',
                            'audio/ogg': 'ogg',
                            'audio/aiff': 'aiff',
                            'audio/x-aiff': 'aiff'
                        };

                        soundExt = mimeMap[soundDetail.type.toLowerCase()] ||
                            (soundDetail.type.split('/')[1] || 'mp3');
                    }

                    // Prefer WAV over MP3 when available since it's higher quality
                    if (soundDetail.previews && soundDetail.previews['preview-hq-wav']) {
                        soundExt = 'wav';
                    }

                    console.log(`Using file extension: .${soundExt} for sound: ${sound.name}`);

                    // Create the full filename with extension
                    const finalFilename = `${baseFilename}.${soundExt}`;
                    const savePath = path.join(scenePath, finalFilename);

                    // Download the sound
                    console.log(`Downloading to ${finalFilename}...`);
                    const downloadUrl = await this.freesoundApi.getSoundDownloadUrl(sound.id);

                    const writer = fs.createWriteStream(savePath);

                    const soundDownloadResponse = await axios({
                        method: 'get',
                        url: downloadUrl,
                        responseType: 'stream',
                        maxRedirects: 5,
                        headers: {
                            'Authorization': `Bearer ${sessionToken || this.freesoundApi.accessToken}`
                        }
                    });

                    soundDownloadResponse.data.pipe(writer);

                    // Wait for download to complete
                    await new Promise((resolve, reject) => {
                        writer.on('finish', async () => {
                            console.log(`Sound saved to ${savePath}`);

                            // Calculate loudness
                            const lufs = await this.getLoudnessLUFS(savePath);
                            const loudness = this.lufsToNormalized(lufs);

                            // Add to results
                            results.successful.push({
                                type: 'interaction',
                                title: interaction.title,
                                object: interaction.object,
                                soundId: sound.id,
                                soundName: sound.name,
                                filename: finalFilename, // Use the filename with extension
                                duration: soundDetail.duration || 0,
                                preview: soundDetail.previews ? soundDetail.previews['preview-hq-mp3'] : null,
                                loudness: loudness
                            });

                            resolve();
                        });
                        writer.on('error', (err) => {
                            console.error(`Error writing file: ${err.message}`);
                            reject(err);
                        });
                    });

                } catch (err) {
                    console.error(`Failed to process sound for ${interaction.title}: ${err.message}`);
                    results.failed.push({
                        title: interaction.title,
                        object: interaction.object,
                        error: err.message
                    });
                }
            }
            if (sceneData.scene.background) {
                try {
                    if (sessionToken) {
                        this.freesoundApi.useSessionToken(sessionToken);
                    }

                    const bg = sceneData.scene.background;
                    console.log(`Processing background sound "${bg.title}"...`);

                    // Try main query first
                    let searchResponse = await this.freesoundApi.searchSounds(bg.freesound_query, {
                        filter: 'duration:[10 TO 60]', // Ensure we get sounds between 10-60 seconds
                        sort: 'rating_desc'            // Get highest rated sounds first
                    });

                    // If no results, try each tag as a fallback
                    if (searchResponse.count === 0 && bg.tags && bg.tags.length > 0) {
                        console.log(`No sounds found for background query: ${bg.freesound_query}. Trying tags as fallback...`);

                        // Try each tag individually
                        for (const tag of bg.tags) {
                            console.log(`Trying tag: "${tag}" for background sound...`);
                            searchResponse = await this.freesoundApi.searchSounds(tag, {
                                filter: 'duration:[10 TO 60]',
                                sort: 'rating_desc'
                            });

                            if (searchResponse.count > 0) {
                                console.log(`Found ${searchResponse.count} sounds using tag: "${tag}"`);
                                break; // Use the first tag that returns results
                            }
                        }

                        // If still no results, try "ambient background" as a last resort
                        if (searchResponse.count === 0) {
                            console.log("No sounds found with tags. Trying generic ambient background...");
                            searchResponse = await this.freesoundApi.searchSounds("ambient background", {
                                filter: 'duration:[10 TO 60]',
                                sort: 'rating_desc'
                            });
                        }
                    }

                    // Final check if we found any sounds
                    if (searchResponse.count === 0) {
                        throw new Error(`No sounds found for background query or tags`);
                    }

                    const sound = searchResponse.results[0];
                    console.log(`Found background sound: "${sound.name}" (ID: ${sound.id})`);

                    // Create a base filename without extension
                    const sanitizedTitle = bg.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const baseFilename = `background_${sanitizedTitle}_${sound.id}`;

                    // Get sound detail to determine the extension
                    const soundDetail = await this.freesoundApi.getSoundInfo(sound.id);

                    // Determine file extension from sound type
                    const soundExt = soundDetail.type ?
                        (soundDetail.type.split('/')[1] || 'mp3') : 'mp3';

                    // Create the full filename with extension
                    const finalFilename = `${baseFilename}.${soundExt}`;
                    const savePath = path.join(scenePath, finalFilename);

                    // Download the sound
                    console.log(`Downloading background to ${finalFilename}...`);
                    const downloadUrl = await this.freesoundApi.getSoundDownloadUrl(sound.id);

                    const writer = fs.createWriteStream(savePath);

                    const soundDownloadResponse = await axios({
                        method: 'get',
                        url: downloadUrl,
                        responseType: 'stream',
                        maxRedirects: 5,
                        headers: {
                            'Authorization': `Bearer ${sessionToken || this.freesoundApi.accessToken}`
                        }
                    });

                    soundDownloadResponse.data.pipe(writer);

                    // Wait for download to complete
                    await new Promise((resolve, reject) => {
                        writer.on('finish', async () => {
                            console.log(`Background sound saved to ${savePath}`);

                            // Calculate loudness
                            const lufs = await this.getLoudnessLUFS(savePath);
                            const loudness = this.lufsToNormalized(lufs);

                            // Add to results
                            results.successful.push({
                                type: 'background',
                                title: bg.title,
                                object: 'Background',
                                soundId: sound.id,
                                soundName: sound.name,
                                filename: finalFilename, // Use the filename with extension
                                duration: soundDetail.duration || 0,
                                preview: soundDetail.previews ? soundDetail.previews['preview-hq-mp3'] : null,
                                loudness: loudness
                            });

                            resolve();
                        });
                        writer.on('error', (err) => {
                            console.error(`Error writing background file: ${err.message}`);
                            reject(err);
                        });
                    });

                } catch (err) {
                    console.error(`Failed to process background sound: ${err.message}`);
                    results.failed.push({
                        title: sceneData.scene.background.title,
                        type: 'background',
                        error: err.message
                    });
                }
            }

            const unityMapping = this.createUnityMapping(results.successful, sceneData);

            fs.writeFileSync(
                path.join(this.UNITY_STREAMING_ASSETS_PATH, 'unity_sound_mappings.json'),
                JSON.stringify(unityMapping, null, 2)
            );

            console.log('Audio processing completed!');
            console.log(`Successfully processed: ${results.successful.length} sounds`);
            console.log(`Failed: ${results.failed.length} sounds`);

            return {
                results,
                unityMapping,
                scenePath
            };
        }
    }

    normalizeAudioLevels(sounds) {
        // Find the average loudness to use as reference
        let totalLoudness = 0;
        let validCount = 0;

        // Calculate average loudness
        for (const sound of sounds) {
            if (sound.loudness && !isNaN(sound.loudness)) {
                totalLoudness += sound.loudness;
                validCount++;
            }
        }

        const targetLoudness = validCount > 0 ? totalLoudness / validCount : 0.5;
        console.log(`Target loudness for normalization: ${targetLoudness}`);

        // Apply normalization
        return sounds.map(sound => {
            if (!sound.loudness || isNaN(sound.loudness)) {
                sound.normalizedVolume = sound.type === 'background' ? 0.3 : 0.7;
                return sound;
            }

            // Calculate volume adjustment factor
            const loudnessRatio = targetLoudness / sound.loudness;
            // Apply a more conservative adjustment
            const adjustmentFactor = Math.sqrt(loudnessRatio); // Square root for less aggressive adjustment

            // Apply adjustment to base volume, with type-specific defaults
            const baseVolume = sound.type === 'background' ?
                (sound.volume || 0.3) :
                (sound.volume || 0.7);

            // Calculate normalized volume, clamped between reasonable bounds
            sound.normalizedVolume = Math.min(1.0, Math.max(0.2, baseVolume * adjustmentFactor));
            console.log(`Sound: ${sound.title}, Base volume: ${baseVolume}, Adjustment: ${adjustmentFactor.toFixed(2)}, Final: ${sound.normalizedVolume.toFixed(2)}`);

            return sound;
        });
    }

    createUnityMapping(sounds, sceneData) {
        // Apply volume normalization to make all sounds audible
        const normalizedSounds = this.normalizeAudioLevels([...sounds]);

        // Create sound mappings for Unity
        const unityMapping = {
            soundMappings: normalizedSounds.map(sound => {
                // Get the volume based on sound type, using normalized values
                let volume = sound.normalizedVolume || 0.5;
                let loop = false;

                if (sound.type === 'background') {
                    // Use normalized volume but keep loop setting
                    if (sceneData.scene.background) {
                        loop = sceneData.scene.background.loop !== undefined ?
                            sceneData.scene.background.loop : true;

                        // For background, keep volume a bit lower but ensure it's audible
                        volume = Math.max(0.15, Math.min(0.4, sound.normalizedVolume || 0.25));
                    }
                } else {
                    // For interaction sounds, use normalized volume but keep loop setting
                    const interactionData = sceneData.scene.interactions?.find(
                        item => item.title === sound.title
                    );

                    if (interactionData) {
                        loop = interactionData.loop !== undefined ? interactionData.loop : false;
                    }
                }

                // Return the mapping object with guaranteed audible volumes
                return {
                    title: sound.title || 'Untitled Sound',
                    type: sound.type || 'interaction',
                    objectName: sound.object || (sound.type === 'background' ? 'Background' : 'Unknown'),
                    filename: sound.filename,
                    duration: sound.duration || 0,
                    loop: Boolean(loop),
                    volume: parseFloat(volume.toFixed(2)), // Round to 2 decimal places
                    loudness: sound.loudness || 0.5,
                    // Add min volume to ensure all sounds are audible
                    minVolume: sound.type === 'background' ? 0.15 : 0.3
                };
            })
        };

        // Save the mappings to Unity StreamingAssets
        fs.writeFileSync(
            path.join(this.UNITY_STREAMING_ASSETS_PATH, 'unity_sound_mappings.json'),
            JSON.stringify(unityMapping, null, 2)
        );
        console.log('Saved sound mappings to Unity StreamingAssets folder');

        return unityMapping;
    }
}

module.exports = UnityAudio;