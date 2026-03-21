// Example Satellite App using the AXiM Protocol

// Assume we import the SDK (or copy `satellite/index.js` to your app)
const { AXiMHandshake } = require('./index.js'); // In real app: require('axim-satellite-sdk')

// Configuration
// In production, use process.env.AXIM_CORE_URL and process.env.APP_SECRET
const APP_ID = 'example-nda-app';
const APP_SECRET = 'your-super-secret-key-123';
const CORE_URL = 'http://localhost:8080';

// Initialize the Satellite App
const satellite = new AXiMHandshake(APP_ID, APP_SECRET, CORE_URL);

async function main() {
  try {
    console.log('--- Starting Satellite App Handshake ---');

    // 1. Handshake
    // This authenticates and stores the token internally.
    await satellite.connect();

    console.log('--- Handshake Complete ---');

    // 2. Pulse Usage
    // Simulate an app action (e.g., generating a document)
    console.log('Simulating app action (Creating NDA)...');

    const docData = {
        client: 'Acme Corp',
        type: 'Mutual NDA',
        path: '/tmp/nda_123.pdf'
    };

    // Emit Pulse (non-blocking)
    satellite.emit_pulse(
        'document.created',
        docData,
        { latency: 450, status: 'success' },
        'user_abc_123'
    );

    console.log('Pulse emitted (check backend logs/DB).');

    // Simulate another event after a delay
    setTimeout(() => {
        satellite.emit_pulse(
            'app.shutdown',
            { reason: 'User exit' },
            { uptime: 300 },
            'system'
        );
        console.log('Shutdown pulse emitted.');
    }, 2000);

  } catch (error) {
    console.error('Example failed:', error.message);
  }
}

main();
