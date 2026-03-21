// Import Supabase and Deno server dependencies
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Import the Google APIs for Deno
import { ServiceAccount } from 'https://googleapis.deno.dev/v1/google-apis.ts';
import { Drive } from 'https://googleapis.deno.dev/v1/drive:v3.ts';

/**
 * Uploads a file to a specific Google Drive folder using a service account.
 *
 * @param {string} fileName - The name of the file to be created.
 * @param {string} content - The CSV content of the file.
 * @returns {Promise<object>} - The result of the file creation API call.
 */
async function uploadToGoogleDrive(fileName, content) {
  // 1. Get Service Account credentials from environment variables.
  const credentialsJson = Deno.env.get('GOOGLE_DRIVE_CREDENTIALS');
  if (!credentialsJson) {
    throw new Error("Missing required environment variable: GOOGLE_DRIVE_CREDENTIALS.");
  }

  // 2. Get the ID of the target folder from environment variables.
  const folderId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID');
  if (!folderId) {
    throw new Error("Missing required environment variable: GOOGLE_DRIVE_FOLDER_ID.");
  }

  try {
    // 3. Authenticate using the service account.
    const auth = ServiceAccount.fromJson(JSON.parse(credentialsJson));
    const drive = new Drive(auth);

    // 4. Define the file metadata.
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    // 5. Create the file content as a Blob.
    const media = new Blob([content], { type: 'text/csv' });

    // 6. Execute the upload request.
    console.log(`Uploading ${fileName} to Google Drive folder ${folderId}...`);
    const result = await drive.filesCreate(fileMetadata, media);
    console.log("File uploaded successfully. File ID:", result.id);
    return result;

  } catch (error) {
    console.error("Error during Google Drive API call:", error);
    throw new Error(`Failed to upload to Google Drive. Check credentials and folder permissions. Details: ${error.message}`);
  }
}

/**
 * Formats an array of log objects into a CSV string with improved handling.
 * @param {Array<object>} logs - The array of log objects.
 * @returns {string} - The formatted CSV string.
 */
function formatAsCsv(logs) {
  if (!logs || logs.length === 0) {
    return '';
  }
  const headers = Object.keys(logs[0]).join(',');
  const rows = logs.map(log =>
    Object.values(log)
      .map(value => {
        // Gracefully handle null or undefined values
        const strValue = value === null || value === undefined ? '' : String(value);

        // Escape quotes and wrap in quotes if it contains a comma, newline, or quote.
        let escapedValue = strValue.replace(/"/g, '""');
        if (strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')) {
          escapedValue = `"${escapedValue}"`;
        }
        return escapedValue;
      })
      .join(',')
  );
  return `${headers}\n${rows.join('\n')}`;
}

// Main server logic
serve(async (req) => {
  console.log("Daily export function invoked.");

  // Initialize Supabase client
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = new Date().toISOString().split('T')[0];
  const results = [];

  // 1. Export Chat Logs
  try {
    console.log("Step 1: Fetching chat logs...");
    const { data: logs, error } = await supabase
      .from('ai_interactions_ax2024')
      .select('*')
      .gt('created_at', yesterday.toISOString());

    if (error) throw new Error(`Supabase query failed for chat logs: ${error.message}`);

    if (logs && logs.length > 0) {
        console.log(`Formatting and uploading ${logs.length} chat logs...`);
        const csv = formatAsCsv(logs);
        const fileName = `axim-chatlogs-${dateStr}.csv`;
        const res = await uploadToGoogleDrive(fileName, csv);
        results.push({ type: 'chatlogs', count: logs.length, fileId: res.id });
    } else {
        console.log("No chat logs found for export.");
    }
  } catch (e) {
      console.error('Error exporting chat logs:', e);
      results.push({ type: 'chatlogs', error: e.message });
  }

  // 2. Export Transactions (Subscriptions)
  try {
     console.log("Step 2: Fetching subscriptions...");
     const { data: subs, error } = await supabase
        .from('subscriptions_ax2024')
        .select('*');

     if (error) {
         // It might be that the table doesn't exist yet if migrations weren't run, handle gracefully
         if (error.code === '42P01') { // undefined_table
            console.warn("Subscriptions table not found. Skipping transaction export.");
         } else {
            throw new Error(`Supabase query failed for subscriptions: ${error.message}`);
         }
     } else if (subs && subs.length > 0) {
         console.log(`Formatting and uploading ${subs.length} subscriptions...`);
         const csv = formatAsCsv(subs);
         const fileName = `axim-transactions-${dateStr}.csv`;
         const res = await uploadToGoogleDrive(fileName, csv);
         results.push({ type: 'transactions', count: subs.length, fileId: res.id });
     } else {
         console.log("No subscriptions found for export.");
     }
  } catch (e) {
      console.error('Error exporting transactions:', e);
      results.push({ type: 'transactions', error: e.message });
  }

  // 3. Export User Metrics (Auth Users)
  try {
      console.log("Step 3: Fetching user metrics...");
      const { data: { users }, error } = await supabase.auth.admin.listUsers();

      if (error) throw new Error(`Supabase query failed for users: ${error.message}`);

      if (users && users.length > 0) {
          // Map to safe fields
          const safeUsers = users.map(u => ({
              id: u.id,
              email: u.email,
              created_at: u.created_at,
              last_sign_in_at: u.last_sign_in_at,
              role: u.role
          }));

          console.log(`Formatting and uploading ${safeUsers.length} users...`);
          const csv = formatAsCsv(safeUsers);
          const fileName = `axim-users-${dateStr}.csv`;
          const res = await uploadToGoogleDrive(fileName, csv);
          results.push({ type: 'users', count: safeUsers.length, fileId: res.id });
      } else {
          console.log("No users found for export.");
      }
  } catch (e) {
      console.error('Error exporting users:', e);
      results.push({ type: 'users', error: e.message });
  }

  return new Response(JSON.stringify({
    message: "Export process completed.",
    results
  }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});
