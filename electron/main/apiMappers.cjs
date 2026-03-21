/**
 * @fileoverview
 * This module contains mapper functions to transform raw data from external APIs
 * into the application's consistent internal data models. This ensures the renderer
 * process is decoupled from the specific data structures of the external services.
 */

/**
 * Maps a raw file object from the APiX-Drive API to the internal ApiFile model.
 * @param {object} externalFile - The raw file object from the APiX-Drive API.
 * @returns {import('../../src/models/apiData').ApiFile} A standardized file object.
 */
function mapToFile(externalFile) {
  return {
    id: externalFile.file_id || null,
    name: externalFile.file_name || 'Untitled',
    url: externalFile.download_url || '',
    size: externalFile.size_in_bytes || 0,
    mimeType: externalFile.mime_type || 'application/octet-stream',
    createdAt: externalFile.created_at || new Date().toISOString(),
    source: 'apix-drive',
  };
}

/**
 * Maps a raw ingest response from the AXiM Core API to a standardized format.
 * @param {object} externalIngestResponse - The raw response from the AXiM API.
 * @returns {import('../../src/models/apiData').AximIngestRecord} A standardized ingest record.
 */
function mapToIngestRecord(externalIngestResponse) {
  return {
    transactionId: externalIngestResponse.transaction_id || null,
    itemsProcessed: externalIngestResponse.processed_count || 0,
    status: externalIngestResponse.status || 'unknown',
    timestamp: externalIngestResponse.timestamp || new Date().toISOString(),
  };
}

/**
 * Maps a raw chat response from the Onyx AI Layer to a standardized message format.
 * @param {object} externalMessage - The raw message object from the Onyx API.
 * @returns {import('../../src/models/apiData').OnyxMessage} A standardized message object.
 */
function mapToOnyxMessage(externalMessage) {
  return {
    id: externalMessage.message_id || null,
    conversationId: externalMessage.conversation_id || null,
    content: externalMessage.text || '',
    author: 'onyx-ai',
    timestamp: externalMessage.timestamp || new Date().toISOString(),
    metadata: externalMessage.metadata || {},
  };
}

module.exports = { mapToFile, mapToIngestRecord, mapToOnyxMessage };
