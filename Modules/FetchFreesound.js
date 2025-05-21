const axios = require('axios');
const fs = require('fs');
const path = require('path');

const FREESOUND = {
    AUTH_URL: 'https://freesound.org/apiv2/oauth2/authorize/',
    TOKEN_URL: 'https://freesound.org/apiv2/oauth2/access_token/',
    API_BASE: 'https://freesound.org/apiv2'
};

const BASE_DIR = path.join(__dirname, '..');
const CREDENTIALS_PATH = path.join(BASE_DIR, 'freesound_credentials.json');

class FetchFreesound {
    constructor(clientId, clientSecret) {
        this.CLIENT_ID = clientId;
        this.CLIENT_SECRET = clientSecret;

        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpires = null;
        this.apiClient = null;
        this.isAuthenticated = false;
        this.usingSessionToken = false;
    }

    loadCredentials() {
        if (!fs.existsSync(CREDENTIALS_PATH)) {
            throw new Error(`Credentials file not found at ${CREDENTIALS_PATH}. Please create it with your Freesound credentials.`);
        }

        try {
            const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
            return credentials;
        } catch (error) {
            throw new Error(`Error reading credentials file: ${error.message}`);
        }
    }

    saveTokens(accessToken, refreshToken, expiresIn) {
        let credentials = {};

        try {
            if (fs.existsSync(CREDENTIALS_PATH)) {
                credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
            }
        } catch (error) {
            console.warn('Could not load existing credentials, creating new file');
        }

        credentials.access_token = accessToken;
        credentials.refresh_token = refreshToken;
        credentials.expires_at = Date.now() + (expiresIn * 1000);

        try {
            fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));
            console.log('Tokens saved to credentials file');
        } catch (error) {
            console.warn('Could not save tokens to file:', error.message);
        }
    }

    async authenticateClientCredentials() {
        try {
            console.log('Authenticating with Freesound using Client Credentials...');

            const params = new URLSearchParams({
                client_id: this.CLIENT_ID,
                client_secret: this.CLIENT_SECRET,
                grant_type: 'client_credentials'
            });

            const response = await axios.post(
                FREESOUND.TOKEN_URL,
                params.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;
            this.tokenExpires = Date.now() + (response.data.expires_in * 1000);
            this.isAuthenticated = true;

            this.apiClient = axios.create({
                baseURL: FREESOUND.API_BASE,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            this.saveTokens(this.accessToken, this.refreshToken, response.data.expires_in);

            console.log('Authentication successful!');
            return true;
        } catch (error) {
            console.error('Authentication failed:', error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }

    async authenticate() {
        try {
            const credentials = this.loadCredentials();

            if (credentials.access_token && credentials.expires_at) {
                if (credentials.expires_at > Date.now() + 300000) {
                    console.log('Using saved access token...');
                    this.accessToken = credentials.access_token;
                    this.refreshToken = credentials.refresh_token;
                    this.tokenExpires = credentials.expires_at;
                    this.isAuthenticated = true;

                    this.apiClient = axios.create({
                        baseURL: FREESOUND.API_BASE,
                        headers: {
                            'Authorization': `Bearer ${this.accessToken}`
                        }
                    });

                    try {
                        await this.apiClient.get('/me/');
                        console.log('Saved token is valid!');
                        return true;
                    } catch (error) {
                        console.log('Saved token is invalid, will refresh or re-authenticate');
                    }
                }

                if (credentials.refresh_token) {
                    try {
                        await this.refreshAccessToken();
                        return true;
                    } catch (error) {
                        console.log('Token refresh failed, will re-authenticate');
                    }
                }
            }

            return await this.authenticateClientCredentials();

        } catch (error) {
            console.log('No valid credentials found, using client credentials flow...');
            return await this.authenticateClientCredentials();
        }
    }

    async refreshAccessToken() {
        try {
            console.log('Refreshing access token...');

            const params = new URLSearchParams({
                client_id: this.CLIENT_ID,
                client_secret: this.CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: this.refreshToken
            });

            const response = await axios.post(
                FREESOUND.TOKEN_URL,
                params.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;
            this.tokenExpires = Date.now() + (response.data.expires_in * 1000);

            this.apiClient.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;

            this.saveTokens(this.accessToken, this.refreshToken, response.data.expires_in);

            console.log('Token refreshed successfully!');
            return true;
        } catch (error) {
            console.error('Error refreshing token:', error.message);
            throw error;
        }
    }

    useSessionToken(token) {
        this.accessToken = token;
        this.isAuthenticated = true;
        this.usingSessionToken = true;

        this.apiClient = axios.create({
            baseURL: FREESOUND.API_BASE,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });

        return this;
    }

    async ensureFreshToken() {
        if (this.usingSessionToken) {
            // When using a session token, we don't refresh it here
            // The session middleware handles that
            return;
        }

        if (!this.isAuthenticated) {
            await this.authenticate();
            return;
        }

        if (this.tokenExpires && this.tokenExpires - Date.now() < 300000) {
            console.log('Access token is about to expire, refreshing...');
            try {
                await this.refreshAccessToken();
            } catch (error) {
                console.log('Token refresh failed, re-authenticating...');
                await this.authenticate();
            }
        }
    }

    /**
     * Search for sounds on Freesound with comprehensive filtering options
     * @param {string} query - Search query string
     * @param {object} options - Search options
     * @param {string} options.fields - Fields to include in the response
     * @param {number} options.pageSize - Number of results per page
     * @param {string} options.sort - How to sort results (score, duration_desc, etc.)
     * @param {string} options.filter - Custom filter string
     * @param {boolean} options.groupByPack - Group sounds by pack
     * @param {Object} options.params - Additional query parameters
     * @returns {Promise<Object>} Search results
     */
    async searchSounds(query, options = {}) {
        await this.ensureFreshToken();

        // Complete set of fields to avoid additional API calls
        const defaultFields = 'id,name,username,duration,previews,type,license,filesize,download,tags,description';

        // Apply format filter for MP3 and WAV
        let filter = 'type:(wav OR mp3)';

        // Add any additional filters
        if (options.filter) {
            filter = `${filter} AND (${options.filter})`;
        }

        // If max duration specified, add duration filter
        if (options.maxDuration) {
            filter = `${filter} AND duration:[0 TO ${options.maxDuration}]`;
        }

        console.log(`Using filter: ${filter}`);

        const params = {
            query,
            fields: options.fields || defaultFields,
            page_size: options.pageSize || 15,
            sort: options.sort || 'score',
            filter: filter,
            group_by_pack: options.groupByPack ? 1 : 0
        };

        // Add any additional parameters
        if (options.params) {
            Object.assign(params, options.params);
        }

        try {
            console.log(`Searching for sounds with query: "${query}"`);
            const response = await this.apiClient.get('/search/text/', { params });

            // Additional client-side format verification
            if (response.data.results) {
                console.log(`Got ${response.data.results.length} results, filtering for WAV/MP3...`);

                response.data.results = response.data.results.filter(sound => {
                    if (!sound.type) return false;

                    const fileType = sound.type.toLowerCase();
                    return fileType.includes('wav') || fileType.includes('mp3');
                });

                console.log(`Filtered to ${response.data.results.length} WAV/MP3 sounds`);
            }

            return response.data;
        } catch (error) {
            console.error(`Search failed: ${error.message}`);
            throw error;
        }
    }

    async getSoundInfo(soundId) {
        await this.ensureFreshToken();

        try {
            // Request all relevant fields to avoid additional API calls
            const response = await this.apiClient.get(`/sounds/${soundId}/`, {
                params: {
                    fields: 'id,name,username,duration,previews,type,license,filesize,download,tags,description'
                }
            });

            // Check if the sound is WAV or MP3 and log a warning if not
            const soundType = response.data.type?.toLowerCase() || '';
            if (!soundType.includes('wav') && !soundType.includes('mp3')) {
                console.warn(`Sound #${soundId} is not in WAV or MP3 format: ${soundType}`);
            }

            return response.data;
        } catch (error) {
            console.error(`Failed to get sound info: ${error.message}`);
            throw error;
        }
    }

    async getSoundDownloadUrl(soundId) {
        await this.ensureFreshToken();

        try {
            const response = await this.apiClient.get(`/sounds/${soundId}/download/`);

            if (response.data && response.data.download) {
                return response.data.download;
            }

            return `https://freesound.org/apiv2/sounds/${soundId}/download/`;
        } catch (error) {
            console.error(`Failed to get download URL: ${error.message}`);
            throw error;
        }
    }

    /**
     * Download a sound from Freesound
     * @param {string|number} soundId - Sound ID to download
     * @param {string} savePath - Path where to save the file
     * @param {string|null} sessionToken - Optional session token to use instead of stored token
     * @returns {Promise<Object>} Sound details
     */
    async downloadSound(soundId, savePath, sessionToken = null) {
        // If session token is provided, use it temporarily
        const wasUsingSessionToken = this.usingSessionToken;
        const originalToken = this.accessToken;

        if (sessionToken) {
            this.useSessionToken(sessionToken);
        } else {
            await this.ensureFreshToken();
        }

        console.log(`Getting sound info and download URL for sound #${soundId}`);

        try {
            // Get sound details first to check format
            const soundDetail = await this.getSoundInfo(soundId);

            // Check if the sound is WAV or MP3, provide warning if not
            const fileType = soundDetail.type?.toLowerCase() || '';
            if (!fileType.includes('wav') && !fileType.includes('mp3')) {
                console.warn(`Warning: Sound #${soundId} is not in WAV or MP3 format: ${fileType}`);
                console.warn('This might cause issues with Unity playback');
            }

            const downloadUrl = await this.getSoundDownloadUrl(soundId);
            const writer = fs.createWriteStream(savePath);

            const soundDownloadResponse = await axios({
                method: 'get',
                url: downloadUrl,
                responseType: 'stream',
                maxRedirects: 5,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            soundDownloadResponse.data.pipe(writer);

            // Return to original state if we temporarily used session token
            if (sessionToken && !wasUsingSessionToken) {
                this.accessToken = originalToken;
                this.usingSessionToken = false;
                this.apiClient.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;
            }

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log(`Sound saved to ${savePath}`);
                    resolve(soundDetail);
                });
                writer.on('error', (err) => {
                    console.error(`Error writing file: ${err.message}`);
                    reject(err);
                });
            });
        } catch (error) {
            console.error(`Error downloading sound #${soundId}:`, error.message);

            // Return to original state if we temporarily used session token
            if (sessionToken && !wasUsingSessionToken) {
                this.accessToken = originalToken;
                this.usingSessionToken = false;
                this.apiClient.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;
            }

            throw error;
        }
    }

    /**
     * Search for sounds and filter by multiple criteria
     * @param {string} query - Search query string
     * @param {object} options - Advanced filtering options
     * @returns {Promise<Object>} Filtered search results
     */
    async findSoundsWithCriteria(query, options = {}) {
        // Set defaults appropriate for game audio
        const filterCriteria = {
            maxDuration: options.maxDuration || 10,
            minRating: options.minRating || 0,
            formats: ['wav', 'mp3'],
            ...options
        };

        // Build filter string
        let filterParts = [];

        // Format filter
        filterParts.push('type:(wav OR mp3)');

        // Duration filter
        if (filterCriteria.maxDuration) {
            filterParts.push(`duration:[0 TO ${filterCriteria.maxDuration}]`);
        }

        // Rating filter
        if (filterCriteria.minRating) {
            filterParts.push(`avg_rating:[${filterCriteria.minRating} TO *]`);
        }

        // Downloads filter (popular sounds)
        if (filterCriteria.minDownloads) {
            filterParts.push(`num_downloads:[${filterCriteria.minDownloads} TO *]`);
        }

        // License filter
        if (filterCriteria.license) {
            filterParts.push(`license:"${filterCriteria.license}"`);
        }

        // Combine filters
        const filter = filterParts.join(' AND ');

        // Search with comprehensive fields and filtering
        return this.searchSounds(query, {
            fields: 'id,name,username,duration,previews,type,license,filesize,download,tags,description,avg_rating,num_downloads',
            filter: filter,
            pageSize: filterCriteria.pageSize || 15,
            sort: filterCriteria.sort || 'score',
            groupByPack: filterCriteria.groupByPack || false
        });
    }
}

module.exports = FetchFreesound;