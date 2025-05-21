const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const cors = require('cors');

// Load environment variables
dotenv.config();

// Create Express app first!
const app = express();

// Then apply middlewares
app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware (just once)
app.use(session({
    secret: process.env.SESSION_SECRET || 'freesound-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        httpOnly: false,  // Allow JavaScript to access cookies
        maxAge: 7 * 24 * 60 * 60 * 1000 // One week
    }
}));

// Add this middleware after your session middleware:
app.use((req, res, next) => {
    // Check for session already set
    if (req.session.accessToken) {
        return next();
    }

    // Check for token in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        req.session.accessToken = token;
        console.log('Set session token from Authorization header');
    }

    next();
});

// Import modules
const FetchFreesound = require('./Modules/FetchFreesound');
const UnityAudio = require('./Modules/UnityAudio');
const GenerateRoom = require('./Modules/GenerateRoom');
const GenerateAudio = require('./Modules/GenerateAudio');
const FreesoundSession = require('./Modules/FreesoundSession');

// Initialize modules
const freesoundApi = new FetchFreesound(
    process.env.FREESOUND_CLIENT_ID,
    process.env.FREESOUND_CLIENT_SECRET
);

const freesoundSession = new FreesoundSession(
    app,
    process.env.FREESOUND_CLIENT_ID,
    process.env.FREESOUND_CLIENT_SECRET,
    process.env.SESSION_SECRET || 'default-session-secret'
);

const roomGenerator = new GenerateRoom();
const audioGenerator = new GenerateAudio();
const unityAudioProcessor = new UnityAudio(freesoundApi);

// Ensure response directories exist
const RESPONSES_DIR = path.join('Unity', 'Assets', 'StreamingAssets', 'Responses');
if (!fs.existsSync(RESPONSES_DIR)) {
    fs.mkdirSync(RESPONSES_DIR, { recursive: true });
    console.log(`Created responses directory at ${RESPONSES_DIR}`);
}

// API Routes
app.get('/api/status', (req, res) => {
    res.json({ status: 'Server is running' });
});

let pipelineStatus = {
    running: false,
    startTime: null,
    currentStep: '',
    progress: 0
};

// Status endpoint to check pipeline progress
app.get('/api/generate/status', (req, res) => {
    res.json({
        running: pipelineStatus.running,
        elapsedSeconds: pipelineStatus.startTime ?
            Math.floor((Date.now() - pipelineStatus.startTime) / 1000) : 0,
        currentStep: pipelineStatus.currentStep,
        progress: pipelineStatus.progress
    });
});

// Add token endpoint for Unity authentication
app.post('/api/auth/token', async (req, res) => {
    try {
        // Check if there's already a token
        if (req.session.accessToken) {
            return res.json({
                success: true,
                authenticated: true,
                message: "Already authenticated"
            });
        }

        // Get token from saved credentials file if possible
        try {
            const credentialsPath = path.join(__dirname, 'freesound_credentials.json');
            if (fs.existsSync(credentialsPath)) {
                const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

                if (credentials.access_token) {
                    // Store token in session
                    req.session.accessToken = credentials.access_token;

                    console.log('Using saved token for session authentication');
                    return res.json({
                        success: true,
                        authenticated: true,
                        message: "Authenticated using saved token"
                    });
                }
            }
        } catch (err) {
            console.error('Error loading saved credentials:', err);
        }

        // If we get here, no valid token is available
        res.status(401).json({
            success: false,
            authenticated: false,
            error: "No authentication token available",
            redirect: '/freesound/login'
        });
    } catch (error) {
        console.error('Auth token error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Auth status endpoint
app.get('/api/auth/status', (req, res) => {
    console.log('Auth status check - session token:', req.session.accessToken ? 'Present' : 'Not present');
    res.json({
        authenticated: !!req.session.accessToken,
        loginUrl: '/freesound/login'
    });
});

// Update your pipeline endpoint to track status
app.post('/api/generate/pipeline', async (req, res) => {
    try {
        // Initialize pipeline status
        pipelineStatus = {
            running: true,
            startTime: Date.now(),
            currentStep: 'Starting pipeline',
            progress: 0
        };

        // Check authentication for step 3 (audio processing)
        const needsAuth = true; // Set to true if you require auth for this endpoint

        if (needsAuth && !req.session.accessToken) {
            pipelineStatus.running = false;
            res.status(401).json({
                success: false,
                error: 'User authentication required for downloading sounds',
                redirect: '/freesound/login'
            });
            return;
        }

        // Set status to "running" and send immediate response
        res.json({
            success: true,
            message: "Pipeline started",
            status: "running"
        });

        // Run the pipeline asynchronously after response is sent
        try {
            // Step 1: Generate room
            console.log('Starting full generation pipeline...');
            pipelineStatus.currentStep = 'Generating room';
            pipelineStatus.progress = 0.1;
            console.log('Step 1: Generating room...');
            const roomData = await roomGenerator.processRoomPrompt();
            pipelineStatus.progress = 0.3;

            // Step 2: Generate audio based on room
            console.log('Step 2: Generating audio...');
            pipelineStatus.currentStep = 'Generating audio configuration';
            const audioData = await audioGenerator.processAudioFlow();
            pipelineStatus.progress = 0.5;

            // Step 3: Process audio for Unity
            console.log('Step 3: Processing audio for Unity...');
            pipelineStatus.currentStep = 'Processing audio for Unity';
            const audioJsonPath = path.join(RESPONSES_DIR, 'audio.json');
            const unityResults = await unityAudioProcessor.processAudioJson(audioJsonPath, req);
            pipelineStatus.progress = 1.0;
            pipelineStatus.currentStep = 'Complete';

            console.log('Pipeline completed successfully');
            pipelineStatus.running = false;

        } catch (error) {
            console.error('Pipeline error:', error);
            pipelineStatus.running = false;
            pipelineStatus.currentStep = `Error: ${error.message}`;
        }
    } catch (error) {
        console.error('Pipeline initialization error:', error);
        pipelineStatus.running = false;
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Individual endpoints for each generation step
app.post('/api/generate/room', async (req, res) => {
    try {
        const roomData = await roomGenerator.processRoomPrompt();
        res.json({ success: true, room: roomData });
    } catch (error) {
        console.error('Room generation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/generate/audio', async (req, res) => {
    try {
        const audioData = await audioGenerator.processAudioFlow();
        res.json({ success: true, audio: audioData });
    } catch (error) {
        console.error('Audio generation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/process/unity', async (req, res) => {
    try {
        // Check for session authentication
        if (!req.session.accessToken) {
            res.status(401).json({
                success: false,
                error: 'User authentication required',
                redirect: '/freesound/login'
            });
            return;
        }

        const audioJsonPath = path.join(RESPONSES_DIR, 'audio.json');
        // Pass req to have access to session token
        const unityResults = await unityAudioProcessor.processAudioJson(audioJsonPath, req);
        res.json({
            success: true,
            unity: {
                successful: unityResults.results.successful.length,
                failed: unityResults.results.failed.length,
                mapping: unityResults.unityMapping
            }
        });
    } catch (error) {
        console.error('Unity processing error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/auth/unity-token', async (req, res) => {
    // Skip login page and directly get token if possible
    try {
        // Try loading from credentials file first
        try {
            const credentialsPath = path.join(__dirname, 'freesound_credentials.json');
            if (fs.existsSync(credentialsPath)) {
                const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

                if (credentials.access_token) {
                    // Store in session and return
                    req.session.accessToken = credentials.access_token;
                    req.session.save();

                    return res.json({
                        success: true,
                        token: credentials.access_token,
                        authenticated: true
                    });
                }
            }
        } catch (err) {
            console.error('Error reading credentials:', err);
        }

        // If already in session, use that
        if (req.session.accessToken) {
            return res.json({
                success: true,
                token: req.session.accessToken,
                authenticated: true
            });
        }

        // If we reach here, no token available
        res.status(401).json({
            success: false,
            authenticated: false,
            message: "No token available"
        });

    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Add a basic frontend for testing
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Site URL: ${process.env.SITE_URL || `http://localhost:${PORT}`}`);
});