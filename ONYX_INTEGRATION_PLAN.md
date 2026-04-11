# AXiM Core Onyx AI Integration Plan

## The Goal
Connect the AXiM Core frontend to the Onyx mk3 AI engine.

## The Architecture
Onyx mk3 will be hosted as an external Cloudflare Worker (`onyx-edge-worker`).

## The Flow
The AXiM CommandHub (`src/components/CommandHub.jsx`) will gather user input and context, send it through `src/services/onyxAI/api.js`, and POST it to the Cloudflare Worker URL.

## Security
Communication will be secured via a Bearer token (`VITE_ONYX_SECURE_KEY`).

## Database
AXiM Core will rely on Supabase for persistent state, auth, and RAG memory banks, initialized via the existing `supabase/migrations/` files.
