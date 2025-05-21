// Create this new file to check your API key status
require('dotenv').config();
const fetch = require('node-fetch');

async function checkApiKeyStatus() {
    try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            console.error('API key not found. Please set OPENROUTER_API_KEY in .env file');
            return;
        }

        console.log('Checking API key status...');
        const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error(`API key check failed with status ${response.status}: ${errorData}`);
            return;
        }

        const keyData = await response.json();
        console.log('API Key Information:');
        console.log('--------------------');
        console.log(`Label: ${keyData.data.label || 'Not set'}`);
        console.log(`Usage: ${keyData.data.usage} credits`);
        console.log(`Limit: ${keyData.data.limit || 'Unlimited'} credits`);
        console.log(`Free tier: ${keyData.data.is_free_tier ? 'Yes' : 'No'}`);
        console.log(`Rate limit: ${keyData.data.rate_limit.requests} requests per ${keyData.data.rate_limit.interval}`);

        // Calculate remaining credits
        if (keyData.data.limit) {
            const remaining = keyData.data.limit - keyData.data.usage;
            console.log(`Credits remaining: ${remaining}`);

            if (remaining <= 0) {
                console.error('⚠️ WARNING: You have no credits remaining!');
                console.log('Empty API responses are often due to insufficient credits.');
            }
        }
    } catch (error) {
        console.error('Error checking API key:', error.message);
    }
}

// Run the check
checkApiKeyStatus();