# AXiM Core Agent Protocol

This document outlines the development philosophy and technical guidelines for AI agents contributing to the AXiM Core Dashboard. Adherence to these protocols is crucial for maintaining a stable, high-quality, and continuously evolving enterprise-level application.

## Core Philosophy: The "Review, Plan, Build, Fix" Cycle

Our development process is iterative and prioritizes stability over rapid feature expansion. All agent contributions must follow this cycle:

1.  **Review:** Begin every task by thoroughly analyzing the user's request and the existing codebase. Use available tools to explore the file structure, read relevant code, and understand the current application state. Avoid making assumptions.
2.  **Plan:** Formulate a clear, step-by-step plan before writing any code. The plan should be strategic, breaking down the task into small, manageable, and non-disruptive steps. Present this plan to the user for approval.
3.  **Build:** Execute the plan methodically. Focus on one logical change at a time. Adhere to the coding standards and architectural patterns outlined below.
4.  **Fix (and Verify):** After every modification, verify your work. Run tests, lint the code, and use read-only tools to confirm that your changes were applied correctly and did not introduce regressions. Be prepared to debug and fix any issues that arise.

## Architectural Structural Priorities

When implementing features or architectural updates, the cost-effective hierarchy must be respected:

1.  **Micro Apps First:** Prefer offloading logic to micro-apps (like Cloudflare Workers edge computing) where code performs the bulk of work. This is the most cost-effective solution compared to costly backend databases.
2.  **Supabase as Primary Backend:** When a backend database or standard backend system is needed, Supabase must be utilized as the primary system.
3.  **Cloudflare Workers:** Leverage Cloudflare Workers to make systems more robust affordably.
4.  **Google Cloud Platform Support:** Google Cloud serves as the supportive infrastructure fallback.
5.  **AI & Blockchain Layers:** Continue to weave AI operations and the blockchain layer (`$AXIM` integration) seamlessly across these architectural foundations.

## Technical Guidelines

### 1. Code Quality and Style

*   **Linting:** All code must pass the ESLint checks configured in the repository (`npm run lint`). Do not commit code with linting errors.
*   **Modularity:** Strive for small, single-responsibility components and modules. If a component becomes too large or complex, refactor it. The `CommandHub` component serves as a good example of a well-factored orchestrator.
*   **Descriptive Naming:** Use clear and descriptive names for variables, functions, and components. Avoid abbreviations or overly generic names.
*   **Comments:** Add comments to explain complex logic, not to narrate the code. Focus on the "why," not the "what."

### 2. State Management and Data Flow

*   **Context for Global State:** Use React Context (`useContext`) for global state that is accessed by many components (e.g., `AuthContext`, `SupabaseContext`).
*   **Custom Hooks for Logic:** Encapsulate complex or reusable logic within custom hooks (e.g., `useCommandHandler`, `useSystemStats`). This keeps components clean and focused on rendering.
*   **Props for Local State:** Pass data down through props for state that is specific to a component tree. Avoid prop drilling by using context or composition where appropriate.

### 3. Error Handling

*   **Robust Error Boundaries:** The application uses a global `ErrorBoundary` to catch rendering errors. All new components should be designed to work within this boundary.
*   **Custom Error Types:** The `onyxAI` service uses custom error types (`CommandNotFoundError`, `DatabaseError`, etc.). All new AI commands and services must throw these custom errors to ensure they are handled gracefully by the UI.
*   **User-Friendly Feedback:** Always provide clear, user-friendly feedback for errors. The `useCommandHandler` hook provides a good pattern for this, using `react-hot-toast` for notifications and displaying structured error messages in the UI.

### 4. Testing

*   **Comprehensive Test Coverage:** All new features and bug fixes must be accompanied by tests. The project uses Vitest and React Testing Library.
*   **Mocking Dependencies:** When testing components or hooks, mock their dependencies (e.g., API services, custom hooks) to isolate the unit under test.
*   **Clean Test Runs:** Ensure that the test suite runs without any errors or unhandled promise rejections.

### 5. Verification and Submission

*   **Pre-Commit Checks:** Before submitting any change, run the linter and the test suite to ensure the codebase is in a clean state.
*   **Descriptive Commit Messages:** Write clear and concise commit messages that explain the purpose of the change.

By following these guidelines, we can ensure that the AXiM Core Dashboard remains a robust, maintainable, and enterprise-grade application.
