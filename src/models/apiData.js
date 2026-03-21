/**
 * @fileoverview
 * This file defines the internal data models (Data Transfer Objects) for the application.
 * These JSDoc types are used to ensure a consistent data structure throughout the
 * renderer process, regardless of the original format from the external APIs.
 */

/**
 * @typedef {object} ApiFile
 * @property {string} id - The unique identifier for the file.
 * @property {string} name - The name of the file.
 * @property {string} url - The direct download URL for the file.
 * @property {number} size - The size of the file in bytes.
 * @property {string} mimeType - The MIME type of the file.
 * @property {string} createdAt - The ISO 8601 timestamp of when the file was created.
 * @property {string} source - The source API (e.g., 'apix-drive').
 */

/**
 * @typedef {object} AximIngestRecord
 * @property {string} transactionId - The unique identifier for the ingest operation.
 * @property {number} itemsProcessed - The number of items successfully processed.
 * @property {string} status - The status of the ingest operation (e.g., 'completed', 'failed').
 * @property {string} timestamp - The ISO 8601 timestamp of the operation.
 */

/**
 * @typedef {object} OnyxMessage
 * @property {string} id - The unique identifier for the message.
 * @property {string} conversationId - The identifier for the conversation thread.
 * @property {string} content - The text content of the message.
 * @property {string} author - The author of the message (e.g., 'user', 'onyx-ai').
 * @property {string} timestamp - The ISO 8601 timestamp of when the message was sent.
 * @property {object} metadata - Any additional metadata associated with the message.
 */

// This file is for JSDoc type definitions only and does not export any runtime code.
export {};
