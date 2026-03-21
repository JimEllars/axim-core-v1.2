const { ipcMain } = require('electron');
const { apixClient, aximClient, onyxClient } = require('./apiClient.cjs');
const { mapToFile, mapToIngestRecord, mapToOnyxMessage } = require('./apiMappers.cjs');
const { supabase } = require('./supabaseClient.cjs');

function registerApiHandlers() {
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
