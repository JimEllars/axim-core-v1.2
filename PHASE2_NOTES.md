# Phase 2 Development Notes

This file contains notes and considerations for beginning Phase 2 (Core Feature Completion).

## Phase 2 Objectives
1. **Implement Vector Database Integration (RAG Enhancement)**
   - Add embedding column to `ai_interactions_ax2024` table.
   - Implement embedding generation using Supabase's pgvector.
   - Create `useVectorSearch` hook for semantic queries.
   - Build "Memory Bank" search UI component.

2. **Complete Workflow Builder UI**
   - Create workflow builder component with drag-and-drop interface.
   - Implement workflow templates library.
   - Add workflow execution history and monitoring.
   - Build workflow scheduling UI.

3. **Expand External Service Integrations**
   - Add Email Service integration.
   - Add Calendar Service integration.
   - Add CRM workflow actions.
   - Create integration management UI.
   - Test dual-write consistency.

## Prerequisites & Preparations
- Ensure `pgvector` extension is enabled in Supabase prior to running migrations.
- Verify `isMockLlmEnabled` handles RAG queries gracefully in local dev mode.
- Update `OnyxAI` service to utilize vector search when querying Memory Banks.
