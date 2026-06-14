import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

async function retryWithBackoff(fn, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`Attempt ${i + 1} failed, retrying in ${RETRY_DELAY * (i + 1)}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)));
    }
  }
}

async function exportChatlogs() {
  try {
    // Initialize Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Initialize Google Drive
    const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS);
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

    // Cleanup
    await fs.unlink(filePath);

  } catch (error) {
    console.error("❌ Export failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

exportChatlogs();
