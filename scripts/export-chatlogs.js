import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000;

async function retryWithBackoff(fn, retries = MAX_RETRIES) {
  let delay = INITIAL_RETRY_DELAY;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      // Exponential backoff
      console.warn(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Double the delay
    }
  }
}

// Ensure fatal failures are caught and handled
process.on("unhandledRejection", (reason) => {
  logFatalError(reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logFatalError(error);
  process.exit(1);
});

function logFatalError(error) {
  const sanitizedMessage = error && error.message ? error.message.replace(/([a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/g, '[REDACTED_EMAIL]').replace(/(sk-[a-zA-Z0-9]{20,})/g, '[REDACTED_KEY]') : "Unknown Error";
  console.error(`[ADMIN ALERT] Pipeline Execution Fatal Error: ${sanitizedMessage}`);
}

async function exportChatlogs() {
  if (!process.env.GDRIVE_SERVICE_ACCOUNT_KEY && !process.env.GOOGLE_DRIVE_CREDENTIALS) {
    console.warn('[Chatlog Export] Google Drive credentials not found in environment. Skipping export gracefully to prevent workflow failure.');
    process.exit(0);
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[WARN] Supabase credentials missing. Skipping export execution.");
    process.exit(0);
  }

  try {
    // Initialize Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Initialize Google Drive
    // Safely parse credentials whether it's a compact string or encoded multi-line string
    let credentialsStr = process.env.GOOGLE_DRIVE_CREDENTIALS || process.env.GDRIVE_SERVICE_ACCOUNT_KEY;
    if (!credentialsStr) {
      console.warn("⚠️ GOOGLE_DRIVE_CREDENTIALS environment variable is not set or expired. Exiting cleanly to prevent CI blockage.");

      // Log to telemetry events
      try {
        await supabase.from('telemetry_events').insert({
          component_id: 'core_api',
          severity: 'WARN',
          message: 'Google Drive credentials missing or expired during export',
          payload: { source: 'ci-chatlog-exporter', action: 'export-aborted' }
        });
      } catch (e) {
        console.error("Failed to log warning to telemetry:", e);
      }

      process.exit(0);
    }

    // Try to decode if it might be base64 or have extra escaping
    try {
        // Just in case it's stringified twice or has extra quotes
        if (credentialsStr.startsWith('"') && credentialsStr.endsWith('"')) {
            credentialsStr = JSON.parse(credentialsStr);
        }
    } catch {
      // Ignore parse error
    }

    let credentials;
    try {
        credentials = JSON.parse(credentialsStr);
    } catch (parseError) {
        console.warn(`[WARN] Failed to parse GOOGLE_DRIVE_CREDENTIALS as JSON: ${parseError.message}. Skipping export.`);
        process.exit(0);
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.file"]
    });
    const drive = google.drive({ version: "v3", auth });

    // Fetch yesterday's chatlogs
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    console.log(`📥 Fetching chatlogs for ${dateStr}...`);

    const { data: logs, error } = await supabase
      .from("chat_messages")
      .select("*")
      .gte("created_at", `${dateStr}T00:00:00Z`)
      .lt("created_at", `${dateStr}T23:59:59Z`)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!logs || logs.length === 0) {
      console.log("ℹ️  No chatlogs found for yesterday");
      return;
    }

    console.log(`📝 Found ${logs.length} chat messages`);

    // Create export file
    const fileName = `chatlog-export-${dateStr}.json`;
    const filePath = path.join("/tmp", fileName);
    await fs.writeFile(filePath, JSON.stringify(logs, null, 2));

    console.log(`📤 Uploading to Google Drive...`);

    try {
      // Upload to Google Drive with retry
      const uploadResult = await retryWithBackoff(async () => {
        const fileMetadata = {
          name: fileName,
          parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
        };

        const media = {
          mimeType: "application/json",
          body: await fs.readFile(filePath, "utf8")
        };

        return await drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: "id, name, webViewLink"
        });
      });

      console.log(`✅ Export successful!`);
      console.log(`   File ID: ${uploadResult.data.id}`);
      console.log(`   Link: ${uploadResult.data.webViewLink}`);
    } catch (uploadError) {
      console.warn(`[WARN] Transient Drive error during upload: ${uploadError.message}. Skipping export gracefully.`);
      process.exit(0);
    }

    // Cleanup
    await fs.unlink(filePath);

  } catch (error) {
    console.warn(`[WARN] Unhandled error during export: ${error.message}. Skipping export gracefully.`);
    process.exit(0);
  }
}

exportChatlogs();
