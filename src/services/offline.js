// src/services/offline.js
import logger from './logging';
import toast from 'react-hot-toast';
// We import the service here to avoid circular dependencies with ApiService.
// ApiService -> connectivityManager -> offlineManager -> ApiService (circular)
// By importing it inside a method, we break the cycle at module load time.
import api from './onyxAI/api';
// Do NOT add a top-level import for onyxAI here, as it will create a circular dependency
// that breaks the test environment: offlineManager -> onyxAI -> api -> supabaseClient -> config (mocked)

const REQUEST_QUEUE_STORAGE_KEY = 'axim-offline-request-queue';
const COMMAND_QUEUE_STORAGE_KEY = 'axim-offline-command-queue';
const DEAD_LETTER_QUEUE_STORAGE_KEY = 'axim-dead-letter-queue';
const MAX_RETRIES = 5;
const BATCH_SIZE = 3;

class OfflineManager {
  constructor() {
    this.requestQueue = this.loadQueue(REQUEST_QUEUE_STORAGE_KEY);
    this.commandQueue = this.loadQueue(COMMAND_QUEUE_STORAGE_KEY);
    this.deadLetterQueue = this.loadQueue(DEAD_LETTER_QUEUE_STORAGE_KEY);
    this.isProcessing = false;
  }

  /**
   * Loads a queue from localStorage.
   * @param {string} key The storage key.
   */
  loadQueue(key) {
    try {
      const storedQueue = localStorage.getItem(key);
      return storedQueue ? JSON.parse(storedQueue) : [];
    } catch (error) {
      logger.error(`Failed to load queue ${key} from localStorage.`, error);
      return [];
    }
  }

  /**
   * Saves a queue to localStorage.
   * @param {string} key The storage key.
   * @param {Array} queue The queue to save.
   */
  saveQueue(key, queue) {
    try {
      localStorage.setItem(key, JSON.stringify(queue));
    } catch (error) {
      logger.error(`Failed to save queue ${key} to localStorage.`, error);
    }
  }


  /**
   * Adds a request's details to the offline queue.
   * @param {string} methodName - The name of the ApiService method to call.
   * @param {Array} args - The arguments to pass to the method.
   */
  queueRequest(methodName, args) {
    logger.log(`Queueing request: ${methodName} with args:`, args);
    toast.info(`Offline: Your request (${methodName}) has been queued.`, { id: `queue-${methodName}` });
    const request = {
      id: new Date().toISOString() + Math.random().toString(36).substr(2, 9), // Unique ID
      methodName,
      args,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    this.requestQueue.push(request);
    this.saveQueue(REQUEST_QUEUE_STORAGE_KEY, this.requestQueue);
  }

  /**
   * Adds a raw AI command string to the offline command queue.
   * @param {string} command - The command string from the user.
   */
  queueCommand(command) {
    logger.log(`Queueing command: ${command}`);
    toast.info("Offline: Your command has been queued.", { id: 'command-queue' });
    this.commandQueue.push({
      id: new Date().toISOString() + Math.random().toString(36).substr(2, 9),
      command,
      createdAt: new Date().toISOString(),
    });
    this.saveQueue(COMMAND_QUEUE_STORAGE_KEY, this.commandQueue);
  }

  /**
   * Moves a failed request to the dead-letter queue.
   * @param {object} request - The request object that failed permanently.
   */
  moveToDeadLetterQueue(request, error) {
    const reason = error ? error.message : 'Unknown reason';
    logger.warn(`Request ${request.methodName || request.command} (${request.id}) has failed permanently after max retries. Moving to dead-letter queue. Reason: ${reason}`);
    this.deadLetterQueue.push({ ...request, error: reason, failedAt: new Date().toISOString() });
    this.saveQueue(DEAD_LETTER_QUEUE_STORAGE_KEY, this.deadLetterQueue);
    toast.error(`An offline operation (${request.methodName || request.command}) failed to sync.`);
  }

  /**
   * Processes both the command and request queues.
   */
  async processQueue() {
    if (this.isProcessing) return;
    if (this.requestQueue.length === 0 && this.commandQueue.length === 0) return;

    this.isProcessing = true;
    logger.log('Starting to process offline queues...');
    const toastId = toast.loading('Syncing offline changes...');

    // Process commands first, as they might generate new API requests.
    await this._processCommandQueue();
    // Then process API requests.
    await this._processRequestQueue();

    this.isProcessing = false;
    logger.log('Finished processing queues.');
    toast.success('Offline sync complete.', { id: toastId });
  }

  /**
   * Processes the command queue.
   * @private
   */
  async _processCommandQueue() {
    if (this.commandQueue.length === 0) return;
    const { default: onyxAI } = await import('./onyxAI');

    logger.log(`Processing ${this.commandQueue.length} queued commands...`);
    const processingQueue = [...this.commandQueue];
    this.commandQueue = []; // Clear the main queue to avoid race conditions

    for (let i = 0; i < processingQueue.length; i += BATCH_SIZE) {
      const batch = processingQueue.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (item) => {
          try {
            logger.log(`Executing queued command: ${item.command}`);
            await onyxAI.routeCommand(item.command, { isOfflineSync: true });
            toast.success(`Synced command: "${item.command}"`);
          } catch (error) {
            logger.error(`Failed to execute queued command: ${item.command}. Moving to dead-letter queue.`, error);
            this.moveToDeadLetterQueue(item, error);
          }
        })
      );
    }
    // Only save the queue after processing is complete
    this.saveQueue(COMMAND_QUEUE_STORAGE_KEY, this.commandQueue);
  }

  /**
   * Executes a single queued request and handles its success or failure.
   * @private
   */
  async _executeQueuedRequest(item) {
    try {
      logger.log(`Executing queued request: ${item.methodName} (Attempt: ${item.attempts + 1})`);
      if (typeof api[item.methodName] !== 'function') {
        throw new Error(`Method ${item.methodName} does not exist on ApiService.`);
      }
      await api[item.methodName](...item.args);
      return { success: true, item };
    } catch (error) {
      logger.error(`Failed to execute queued request: ${item.methodName}.`, error);
      return { success: false, item, error };
    }
  }

  /**
   * Handles a failed request by either re-queuing it or moving it to the dead-letter queue.
   * @private
   */
  _handleFailedRequest(item, error) {
    item.attempts += 1;
    if (item.attempts >= MAX_RETRIES) {
      this.moveToDeadLetterQueue(item, error);
    } else {
      // Re-queue it at the end to try again later
      this.requestQueue.push(item);
    }
  }

  /**
   * Processes the request queue, executing all pending API requests.
   * @private
   */
  async _processRequestQueue() {
    if (this.requestQueue.length === 0) return;

    const processingQueue = [...this.requestQueue];
    this.requestQueue = []; // Clear main queue

    logger.log(`Processing ${processingQueue.length} queued API requests...`);

    let hasFailure = false;

    for (let i = 0; i < processingQueue.length; i += BATCH_SIZE) {
      if (hasFailure) {
        // Halt processing of subsequent batches to prevent cascading dependency failures.
        // Re-queue the remaining unprocessed items at the FRONT to preserve strict FIFO.
        const remainingItems = processingQueue.slice(i);
        this.requestQueue.unshift(...remainingItems);
        break;
      }

      const batch = processingQueue.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (item) => {
          const result = await this._executeQueuedRequest(item);
          return { item, result };
        })
      );

      // Process results in the exact original order of the batch.
      for (const { item, result } of results) {
        if (result.success) {
          toast.success(`Synced offline request: ${item.methodName}`);
        } else {
          // Use the established class method to handle retries and dead-lettering safely
          this._handleFailedRequest(item, result.error);
          hasFailure = true;
        }
      }
    }

    // Persist the state of the queue after the batch is processed
    this.saveQueue(REQUEST_QUEUE_STORAGE_KEY, this.requestQueue);
    logger.log('Finished processing request queue batch.');
  }
}

const offlineManager = new OfflineManager();
export default offlineManager;
