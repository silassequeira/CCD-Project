const express = require('express');
const session = require('express-session');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const FREESOUND = {
    AUTH_URL: 'https://freesound.org/apiv2/oauth2/authorize/',
    TOKEN_URL: 'https://freesound.org/apiv2/oauth2/access_token/',
    API_BASE: 'https://freesound.org/apiv2'
};

class FreesoundSession {
    constructor(app, clientId, clientSecret, sessionSecret) {
        this.CLIENT_ID = clientId;
        this.CLIENT_SECRET = clientSecret;

        // Initialize session middleware
        app.use(session({
            secret: sessionSecret || 'freesound-session-secret',
            resave: false,
            saveUninitialized: false,
            cookie: { secure: process.env.NODE_ENV === 'production' }
        }));

        // Add auth routes
        this.setupRoutes(app);
    }

    setupRoutes(app) {
        // Login - Step 1 of OAuth2 flow
        app.get('/freesound/login', (req, res) => {
            // Generate a random state for security
            const state = Math.random().toString(36).substring(2);
            req.session.oauthState = state;

            // Redirect to Freesound authorization page
            const authUrl = `${FREESOUND.AUTH_URL}?client_id=${this.CLIENT_ID}&response_type=code&state=${state}`;
            res.redirect(authUrl);
        });

        // OAuth2 callback - Step 2 and 3 of OAuth2 flow
        app.get('/freesound/callback', async (req, res) => {
            try {
                const { code, error, state } = req.query;

                // Verify state to prevent CSRF attacks
                if (state !== req.session.oauthState) {
                    return res.status(403).send('Invalid state parameter');
                }

                if (error) {
                    return res.send(`<h1>Authorization Failed</h1><p>Error: ${error}</p><p><a href="/">Return home</a></p>`);
                }

                if (!code) {
                    return res.send('<h1>No authorization code received</h1><p><a href="/">Return home</a></p>');
                }

                // Exchange authorization code for access token
                const params = new URLSearchParams({
                    client_id: this.CLIENT_ID,
                    client_secret: this.CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code: code
                });

                const tokenResponse = await axios.post(
                    FREESOUND.TOKEN_URL,
                    params.toString(),
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    }
                );

                // Store tokens in session
                req.session.accessToken = tokenResponse.data.access_token;
                req.session.refreshToken = tokenResponse.data.refresh_token;
                req.session.tokenExpires = Date.now() + (tokenResponse.data.expires_in * 1000);

                // Redirect to home page
                res.redirect('/');
            } catch (error) {
                console.error('OAuth callback error:', error.message);
                if (error.response) {
                    console.error('Response status:', error.response.status);
                    console.error('Response data:', error.response.data);
                }
                res.status(500).send(`
            <h1>Authentication Error</h1>
            <p>Failed to authenticate with Freesound. Please try again.</p>
            <p>Error: ${error.message}</p>
            <p><a href="/freesound/login">Retry login</a> | <a href="/">Return home</a></p>
        `);
            }
        });

        // Logout
        app.get('/freesound/logout', (req, res) => {
            delete req.session.accessToken;
            delete req.session.refreshToken;
            delete req.session.tokenExpires;
            res.redirect('/');
        });

        // Auth status check
        app.get('/freesound/status', (req, res) => {
            const loggedIn = !!req.session.accessToken;
            res.json({ loggedIn });
        });
    }

    // Middleware to ensure token is fresh
    ensureFreshToken(req, res, next) {
        if (!req.session.accessToken) {
            return res.redirect('/freesound/login');
        }

        // Check if token is about to expire (within 5 minutes)
        if (req.session.tokenExpires && req.session.tokenExpires - Date.now() < 300000) {
            console.log('Session token is about to expire, refreshing...');
            this.refreshAccessToken(req)
                .then(() => next())
                .catch(error => {
                    console.error('Token refresh error:', error);
                    delete req.session.accessToken;
                    res.redirect('/freesound/login');
                });
        } else {
            next();
        }
    }

    async refreshAccessToken(req) {
        try {
            const params = new URLSearchParams({
                client_id: this.CLIENT_ID,
                client_secret: this.CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: req.session.refreshToken
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

            // Update session with new tokens
            req.session.accessToken = response.data.access_token;
            req.session.refreshToken = response.data.refresh_token;
            req.session.tokenExpires = Date.now() + (response.data.expires_in * 1000);

            return req.session.accessToken;
        } catch (error) {
            console.error('Error refreshing token:', error.message);
            throw error;
        }
    }

    // Create API client with session token
    createApiClient(req) {
        if (!req.session.accessToken) {
            throw new Error('No access token available');
        }

        return axios.create({
            baseURL: FREESOUND.API_BASE,
            headers: {
                'Authorization': `Bearer ${req.session.accessToken}`
            }
        });
    }
}

module.exports = FreesoundSession;