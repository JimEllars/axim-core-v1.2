# Micro Apps Integration Strategy & API Side Door

## Executive Summary
The dual-distribution strategy—combining a direct-to-consumer (D2C) web interface with an "API side door" for B2B partnerships—is a core model for the AXiM Systems ecosystem. This document outlines the blueprint for integrating micro apps like the Demand Letter Generator into AXiM Core.

## Blueprint for AXiM Core Application
The "API Side Door" is a standardized feature of AXiM Core, turning AXiM Systems into a utility layer for partners.

### Strategy: The Centralized Gateway

#### 1. Identity & Access Management (IAM)
- **Partner API Keys:** AXiM Core acts as the central authority for Partner API Keys. Validation middleware is required on the API side door.
- **OAuth2 Flows:** Handles OAuth2 for partners offering a "Login with AXiM" experience.

#### 2. Universal Billing Engine
- **Payment Abstraction:** Micro apps share a universal billing logic. Instead of each app having its own Stripe logic, AXiM Core provides `/payments/intent` and `/payments/verify` endpoints.
- **Bulk Partnership Credits:** Partners can pre-pay for bulk usage (e.g., 100 demand letters) at discounted rates.

#### 3. Discovery API
- **Capabilities Listing:** A `/capabilities` endpoint on AXiM Core lists all available micro apps (Demand Letter, Non-Compete, etc.) and their required data schemas.

### Specific Micro App Requirements (e.g., Demand Letter Generator)

#### A. Headless Generation Logic
- **Decoupled Logic:** Move document generation logic into separate, UI-agnostic services capable of running on edge environments (e.g., Cloudflare Workers using `nodejs_compat`).
- **JSON-to-PDF Endpoint:** Backend endpoints must accept a JSON payload of required data and return a generated artifact (e.g., signed PDF URL).

#### B. Partner-Aware Authentication
- **Partner Configs:** The API side door accepts parameters for whitelabeling, such as `partner_logo_url` and `theme_color`, applied to generated artifacts.

#### C. Integration Hooks
- **Data Ingestion:** Create connectors that map partner formats (e.g., QuickBooks invoices) to standardized AXiM payload structures.

### Implementation Checklist
- [x] Abstract payment verification logic into a shared AXiM Core library.
- [x] Update micro app environments (`wrangler.jsonc`) to include `nodejs_compat` compatibility flags for shared server-side utilities.
- [x] Standardize `constants.js` patterns across apps so Core programmatically understands supported legal jurisdictions and statutes.

## Ecosystem Runbook: Satellite Artifact Generation

### Round-Trip E2E Flow

This section serves as a verified, tested path for external platforms generating artifacts via the AXiM Core. It ensures that the strict "Internal Autonomy, External Simplicity" philosophy is upheld.

**Step 1: Ingress Authentication (`api-gateway`)**
The external caller authenticates to the `api-gateway` edge function either with an `axim_pk_` hashed API key or an authenticated user JWT.
```bash
curl -X POST "https://<supabase-project-id>.supabase.co/functions/v1/api-gateway" \
  -H "Authorization: Bearer axim_pk_abcd1234" \
  -H "Content-Type: application/json" \
  -d '{
    "app_source": "generate_nda",
    "document_data": { "company_name": "Lone Star Mfg", "recipient_name": "James Ellars" }
  }'
```

**Step 2: Enqueue Job**
Once authenticated, the `api-gateway` uses the `universal-dispatcher` to sanitize PII and push the request down into `satellite_job_queue` via `job-processor`.

**Step 3: Background Processor (`job-processor`)**
The `job-processor` pulls `pending` jobs from the `satellite_job_queue`, calls the shared `generatePdf()` generator, and stores the resulting bytes directly into the `secure_artifacts` storage bucket.

**Step 4: Vault Storage and Handoff**
Finally, a metadata record mapping the job to the file is written to `vault_records`, and an expiring Signed URL is optionally distributed back to the client or via the `send-email` edge function.

### Verification
This pipeline is verified continuously within the end-to-end Vitest suite (`tests/e2e-workflow.test.js`).
