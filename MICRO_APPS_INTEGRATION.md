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
