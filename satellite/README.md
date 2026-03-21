# AXiM Satellite SDK

This directory contains the core implementation of the AXiM Satellite Protocol, designed for lightweight, self-contained apps (like an NDA Generator) to communicate with the AXiM Core.

## Protocol Overview

1.  **Handshake**: The app authenticates with `APP_ID` and `APP_SECRET` to receive a `Satellite-Token` (JWT).
2.  **Pulse**: The app emits telemetry/events to the Core using the token.

## Usage (Node.js)

### Installation

```bash
npm install axim-satellite-sdk  # If published
# Or simply include the `satellite/index.js` file in your project.
```

### Example

```javascript
const { AXiMHandshake } = require('./satellite/index.js'); // Adjust path as needed

// 1. Initialize with Config
const app = new AXiMHandshake('my-nda-app', 'super-secret-key', 'http://localhost:8080');

// 2. Perform Handshake (Async, awaits connection)
await app.connect();

// 3. Emit Pulse (Non-blocking / Fire-and-forget)
app.emit_pulse('document.generated', {
    file_name: 'NDA_ClientX.pdf',
    size_kb: 1024
}, {
    latency: 120.5,
    status: 'success'
}, 'user_123');

// The pulse is sent in the background.
```

## Protocol Details

### Handshake Endpoint

`POST /v1/handshake`

**Request Body:**
```json
{
  "app_id": "string",
  "app_secret": "string"
}
```

**Response:**
```json
{
  "token": "JWT_STRING",
  "expires_in": "24h"
}
```

### Pulse Endpoint

`POST /v1/pulse`

**Headers:**
`Authorization: Bearer <SATELLITE_TOKEN>`

**Request Body:**
```json
{
  "source": "app-name",
  "event": "event.category.action", // e.g., 'document.created'
  "user_id": "optional-user-id",
  "data": {}, // Specific app data
  "telemetry": { "latency": 123.45, "status": "ok" }
}
```

## Security

*   Never hardcode secrets. Use `.env` files.
*   Tokens expire after 24 hours. Re-authenticate on `401 Unauthorized` errors.
