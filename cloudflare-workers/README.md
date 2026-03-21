# AXiM Core Cloudflare Workers Integration

This directory contains the Cloudflare Worker logic for the AXiM Core ecosystem. Cloudflare Workers run at the edge, providing a low-latency proxy and caching layer for interacting with the AXiM Core API.

## Features

- **Edge Proxy:** Routes requests effectively to the main GCP backend (`/api/v1/*`).
- **Health Check Endpoint:** Simple endpoint to verify worker connectivity and status (`/api/edge/healthz`).
- **CORS Handling:** Automatically processes Cross-Origin Resource Sharing (CORS) preflight requests and appends appropriate headers.

## Prerequisites

Ensure you have Node.js and npm installed.

## Setup Instructions

1. **Install Dependencies:**
   Navigate to this directory (`cloudflare-workers/`) and install the Wrangler package:

   ```bash
   npm install
   ```

2. **Configure Variables:**
   Update `wrangler.toml` to set your actual `GCP_BACKEND_URL` and `SUPABASE_URL` if they differ from the defaults:

   ```toml
   [vars]
   GCP_BACKEND_URL = "https://your-actual-gcp-backend.com"
   SUPABASE_URL = "https://your-actual-supabase.co"
   ```

3. **Login to Cloudflare:**
   Authenticate Wrangler with your Cloudflare account:

   ```bash
   npx wrangler login
   ```

## Running Locally

To test the worker locally, use the Wrangler development server:

```bash
npm run dev
```

This will start a local server, usually on `http://localhost:8787`, proxying requests appropriately.

## Deployment

To deploy the worker to your Cloudflare account, run:

```bash
npm run deploy
```

You can view logs for your deployed worker by running:

```bash
npm run tail
```

## Future Enhancements

- **Edge Caching:** Implement caching for frequently accessed, read-only data (like legal constants or jurisdiction details).
- **Authentication Proxy:** Perform preliminary JWT/API key validation at the edge before hitting the origin server.
- **Micro-App Routing:** Directly map external micro-app requests to their specific Supabase Edge Functions.
