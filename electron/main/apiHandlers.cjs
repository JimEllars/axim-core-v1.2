const { ipcMain } = require('electron');
const { apixClient, aximClient, onyxClient } = require('./apiClient.cjs');
const { mapToFile, mapToIngestRecord, mapToOnyxMessage } = require('./apiMappers.cjs');
const { supabase } = require('./supabaseClient.cjs');



const os = require('os');
const axios = require('axios');


  const fs = require('fs');
  const path = require('path');
  const { dialog } = require('electron');

  // Load pdf-parse dynamically or require it if installed
  let pdfParse;
  try {
      pdfParse = require('pdf-parse');
  } catch {
      console.warn("pdf-parse not installed, falling back...");
  }

  ipcMain.handle('readLocalDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });

    if (canceled || filePaths.length === 0) return { success: false, reason: 'canceled' };

    const dirPath = filePaths[0];
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.pdf') || f.endsWith('.txt'));

    // We will chunk and send back or just notify
    // Send event back to window for each processed file
    // The requirement says: "The Node.js backend must chunk the PDFs, extract the text using local streams, and pipe the payloads sequentially to the knowledge-ingest Edge Function. Emit upload progress back to the UI via IPC"

    // In a real app we'd dispatch to Supabase Edge Function directly from Node
    // But we need the token? Let's just return files and handle parsing here or let frontend do the request.
    // "pipe the payloads sequentially to the knowledge-ingest Edge Function"

    // We can just extract text here and send it back to frontend to upload, or do it all here.
    // Let's do it all here, but we need the auth token.
    // It's probably easier to return the extracted text to frontend via an event, or pass token to this IPC.
    return { success: true, dirPath, files };
  });

  ipcMain.handle('processLocalDirectory', async (event, { dirPath, files, token, supabaseUrl }) => {
     let processed = 0;
     for (const file of files) {
         const fullPath = path.join(dirPath, file);
         let text = '';
         if (file.endsWith('.pdf') && pdfParse) {
             const dataBuffer = fs.readFileSync(fullPath);
             const data = await pdfParse(dataBuffer);
             text = data.text;
         } else if (file.endsWith('.txt')) {
             text = fs.readFileSync(fullPath, 'utf8');
         }

         if (text) {
             try {
                await axios.post(`${supabaseUrl}/functions/v1/knowledge-ingest`, {
                    title: file,
                    text: text,
                    source_type: 'electron-ingest'
                }, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
             } catch(e) {
                console.error("Failed to ingest", file, e.message);
             }
         }
         processed++;
         event.sender.send('ingest-progress', { current: processed, total: files.length, currentFile: file });
     }

     return { success: true, processed };
  });

function registerApiHandlers() {
  ipcMain.handle('system:getDiagnostics', async () => {
    let detectedOS = 'Unknown';
    try {
      // Dynamic import to use ES module getOS
      const { getOS } = await import('../../src/utils/osDetection.js');

      // getOS relies on window.navigator. In the main process we can polyfill it
      // temporarily or pass user agent.
      const originalWindow = global.window;
      global.window = {
        navigator: {
          userAgent: 'Electron/Node.js',
          userAgentData: { platform: os.platform() }
        }
      };

      detectedOS = getOS();

      if (originalWindow) global.window = originalWindow;
      else delete global.window;
    } catch (err) {
      console.error(err);
    }

    return {
      os_detection: detectedOS,
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      totalmem: os.totalmem(),
      freemem: os.freemem(),
      cpus: os.cpus().length,
      loadavg: os.loadavg()
    };
  });


  // External API Handlers
  ipcMain.handle('apix:upload', async (event, fileData) => {
    try {
      const response = await apixClient.post('/upload', fileData);
      return { success: true, data: mapToFile(response.data) };
    } catch (error) {
      console.error('APiX-Drive API Error:', error.message);
      throw {
        name: 'ApiError',
        status: error.response?.status || 500,
        message: error.message,
        data: error.response?.data || null,
        source: 'apix-drive',
      };
    }
  });

  ipcMain.handle('axim:ingestData', async (event, ingestData) => {
    try {
      // The AXiM API requires the payload to be a JSON array.
      const response = await aximClient.post('/ingest', [ingestData]);
      return { success: true, data: mapToIngestRecord(response.data) };
    } catch (error) {
      console.error('AXiM Core API Error:', error.message);
      throw {
        name: 'ApiError',
        status: error.response?.status || 500,
        message: error.message,
        data: error.response?.data || null,
        source: 'axim-core',
      };
    }
  });

  ipcMain.handle('onyx:sendMessage', async (event, messageData) => {
    try {
      const response = await onyxClient.post('/chat/send-message-simple-api', messageData);
      return { success: true, data: mapToOnyxMessage(response.data) };
    } catch (error) {
      console.error('Onyx AI API Error:', error.message);
      throw {
        name: 'ApiError',
        status: error.response?.status || 500,
        message: error.message,
        data: error.response?.data || null,
        source: 'onyx-ai',
      };
    }
  });

  // Internal Supabase Handlers (Device Management)
  ipcMain.handle('device:list', async (event, userId) => {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('id, device_name, system_info, status, last_seen')
        .eq('user_id', userId)
        .order('last_seen', { ascending: false });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Device List Error:', error.message);
      throw { name: 'ApiError', message: error.message, source: 'supabase-device-list' };
    }
  });

  ipcMain.handle('device:update', async (event, { deviceId, updates }) => {
    try {
      const { data, error } = await supabase
        .from('devices')
        .update(updates)
        .eq('id', deviceId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Device Update Error:', error.message);
      throw { name: 'ApiError', message: error.message, source: 'supabase-device-update' };
    }
  });

  ipcMain.handle('device:delete', async (event, deviceId) => {
    try {
      const { error } = await supabase
        .from('devices')
        .delete()
        .eq('id', deviceId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Device Delete Error:', error.message);
      throw { name: 'ApiError', message: error.message, source: 'supabase-device-delete' };
    }
  });
}

module.exports = { registerApiHandlers };
