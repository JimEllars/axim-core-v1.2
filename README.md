# Axim Core Command Hub

A powerful, intelligent operations dashboard with an integrated Onyx AI cognitive layer for natural language system control and data management.

## 🚀 Installation

Get up and running with Axim Core in just a few clicks.

1.  **Visit the [Releases Page](https://github.com/JimEllars/axim-core-dashboard/releases)** on GitHub.
2.  **Download the latest installer for your operating system:**
    *   **Windows:** `AXiM-Core-Setup-X.Y.Z.exe`
    *   **macOS:** `AXiM-Core-X.Y.Z.dmg`
    *   **Linux:** `AXiM-Core-X.Y.Z.AppImage`
3.  **Run the installer.**
    *   On Windows, double-click the `.exe` file and follow the setup wizard.
    *   On macOS, open the `.dmg` file and drag the "AXiM Core" application into your "Applications" folder.
    *   On Linux, make the `.AppImage` file executable (`chmod +x AXiM-Core-X.Y.Z.AppImage`) and then run it.
4.  **Launch the application.** That's it!

The application will automatically check for updates and notify you when a new version is available.

## 🧠 Features

### Onyx AI Cognitive Layer
- **Natural Language Processing**: Interact with your system using plain English commands.
- **Intelligent Routing**: The AI automatically determines the appropriate action based on your input.
- **Multi-Modal Operations**: Query data, trigger workflows, manage contacts, and generate content.

### Command Hub Interface
- **Advanced Chat Interface**: A professional, command-line style interface with message history.
- **System Telemetry**: Real-time monitoring of AI processing and system resources.
- **Workflow Integration**: Direct trigger controls for automated business processes.

### Multi-Page Architecture
- **Operations Dashboard**: A traditional dashboard with metrics, analytics, and data visualizations.
- **Command Hub**: The AI-powered natural language interface for advanced system control.
- **Automated Chatlog Export**: All conversations with OnyxAI are automatically exported daily to a configured Google Drive folder, ensuring a persistent and secure backup of all AI interactions.

## 🛠 Technical Architecture

The architecture of AXiM Core follows a strict hierarchy focused on cost-effectiveness and distributed computing power:

1.  **Micro Apps & Edge Computing (Primary):** Heavy processing and logic are preferentially handled by stateless micro-apps (using Cloudflare Workers) to minimize database dependency and computation costs.
2.  **Supabase (Primary Backend):** For persistent storage and database needs, Supabase serves as the core backend structure.
3.  **Cloudflare Workers (Robustness):** Edge computing is leveraged to make the systems more robust affordably.
4.  **Google Cloud Platform (Infrastructure Support):** GCP acts as the supportive infrastructure and fallback for complex orchestrations that extend beyond the Edge or Supabase limits.
5.  **AI & Blockchain:** Permeating all layers are the AI cognitive processes (OnyxAI) and the Blockchain/Decentralized trust layers.

**Tech Stack Highlights:**
- **Frontend**: React 18, Vite, Tailwind CSS, Framer Motion
- **Edge Proxy**: Cloudflare Workers
- **Backend Databases**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Supportive Backend**: Google Cloud Platform (GCP Node.js Backend)
- **Desktop Client**: Electron
- **Testing**: Vitest, React Testing Library
- **CI/CD**: GitHub Actions for scheduled tasks and deployments.

## 🔧 Developer Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/JimEllars/axim-core-dashboard.git
    cd axim-core-dashboard
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    -   Create a `.env` file by copying the example: `cp .env.example .env`
    -   Add your Supabase URL and anon key to the `.env` file.

4.  **Set up the database and authentication:**
    -   In your Supabase project, run the `setup.sql` script to create the initial tables. This script will also create a default seed user (`admin@example.com` with a random password). You must set a new password for this user via the Supabase Auth Dashboard before logging in.
    -   Run the migration files in the `/migrations` directory in numerical order.
    -   **Important Auth Configuration**: Ensure your Supabase Auth settings are correctly configured. Specifically, check that Email authentication is enabled and the JWT settings (secret) match your environment expectations. The seed user requires the `admin` role in the `public.users` table for full dashboard access.

5.  **Run the development server:**
    ```bash
    npm run dev
    ```

6.  **Run the Electron app for development:**
    ```bash
    npm run electron:dev
    ```

## ⚙️ Environment Variables

To enable all features, you will need to configure the following environment variables in your Supabase project's secrets and, if applicable, in the GitHub repository secrets for Actions.

-   `SUPABASE_URL`: Your project's Supabase URL.
-   `SUPABASE_ANON_KEY`: Your project's public anonymous key.
-   `SUPABASE_SERVICE_ROLE_KEY`: Your project's service role key (for backend functions).
-   `SUPABASE_PROJECT_ID`: The ID of your Supabase project (used by GitHub Actions).
-   `SUPABASE_ACCESS_TOKEN`: A Supabase personal access token with appropriate permissions (for GitHub Actions).
-   `GOOGLE_DRIVE_CREDENTIALS`: A single-line JSON string of your Google Cloud service account credentials with permissions to write to Google Drive.
-   `GOOGLE_DRIVE_FOLDER_ID`: The ID of the Google Drive folder where chatlog exports should be saved.
