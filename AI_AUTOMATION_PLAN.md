# AXiM Core: AI & Automation Upgrade Plan

Based on a thorough code review across the AXiM Core layers (specifically looking at the AI system `OnyxAI`, database architecture in `setup.sql` and `migrations`, and `workflows` capability), here are the notes and planned updates for completing the AI capabilities and automation layers. This is intended to be executed across multiple upgrade waves.

## 1. Vector Database Integration & RAG Enhancements (High Priority)
Currently, `OnyxAI` memory features rely on simple text search (via `search_chat_history`). A true RAG (Retrieval-Augmented Generation) foundation using the `pgvector` Supabase extension is designed but not yet implemented.

**Status:**
- `searchMemory` stub exists in `supabaseApiService.js` calling a theoretical `match_ai_interactions` RPC.
- The `embedding` column does not exist in the `ai_interactions_ax2024` table yet (checked `setup.sql` and `migrations/`).

**Next Steps (Wave 1/2):**
- Create a new migration file to add an `embedding` column (`vector(1536)`) to `ai_interactions_ax2024`.
- Create a migration to implement the `match_ai_interactions` RPC.
- Wire up `OnyxAI`'s LLM pipeline (via `llm.js`) to generate vector embeddings when logging interactions and query vectors when searching memory.
- Add UI hooks (e.g., `useVectorSearch`) to the Memory Bank interface.

## 2. Advanced Workflow Builder UI & Engine
The `WorkflowBuilder.jsx` component provides a preview UI (using DnD Kit) but relies heavily on hardcoded workflow templates. The engine (`engine.js`) can execute code-defined workflows (`definitions.js`) synchronously.

**Status:**
- Basic step execution logic works, but complex state routing (conditions, parallel tasks) is limited.
- Added a `crm_sync` workflow to `definitions.js` as an initial implementation of CRM synchronization.
- Real integrations (like Email, Calendar, CRM APIs) need to be moved from stubs (`console.log`) to the actual `api.invokeAximService` pattern.

**Next Steps (Wave 2/3):**
- Expand `definitions.js` to parse actual drag-and-drop JSON definitions saved in the `workflows_ax2024` table instead of hardcoded objects.
- Wire the UI's Save Workflow capability to backend.
- Finish `EmailService` and `CalendarService` endpoints in `supabaseApiService.js`.
- Create dedicated `integrationCommands.js` for commands that interact directly with connected services (Deskera, Salesforce, Google Calendar).

## 3. Persistent Memory / "Cognitive Layer" Completeness
The OnyxAI system is great at command routing but lacks long-term context beyond the immediate chat session.

**Status:**
- History is saved in `conversationHistory`, and `logAIInteraction` logs to DB.
- But `aiCommands.js` fallback only fetches the last 5 messages. It does not actively summarize or fetch deep context from the vector database.

**Next Steps (Wave 3/4):**
- Update `generateContent` in `aiCommands.js` to automatically perform a RAG vector lookup based on user intent if it detects context missing.
- Build automated summaries: A scheduled task that runs nightly, summarizing a user's `ai_interactions_ax2024` for the day and storing it as a high-level `MemoryBank` entry.

## Recent Completed Actions
- Conducted the full AI layer & Automation review.
- Initialized the `crm_sync` workflow in `src/services/workflows/definitions.js` and added coverage in `definitions.test.js` to provide immediate CRM pushing capabilities.
