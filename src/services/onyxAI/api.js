import config from '../../config';
import gcpApiService from '../gcpApiService';
import supabaseApiService from '../supabaseApiService';
import logger from '../logging';
import { NotImplementedError } from './errors';

class ApiService {
  constructor() {
    this.primaryService = null;
    this.secondaryService = null;
  }

  async initialize(supabase, connectivityManager = { getIsOnline: () => true }, offlineManager = { queueCommand: () => {} }) {
    // Initialize Supabase service (Primary backend for AXiM Core)
    supabaseApiService.initialize(supabase, connectivityManager, offlineManager);

    // Initialize GCP service (Secondary/Redundant backend)
    await gcpApiService.initialize();

    if (config.dataSource === 'gcp') {
      // Developer override or specific cloud configuration
      this.primaryService = gcpApiService;
      this.secondaryService = supabaseApiService;
    } else {
      // Standard Configuration: Supabase handles bulk of work, GCP provides redundancy.
      this.primaryService = supabaseApiService;
      this.secondaryService = gcpApiService;
    }
  }

  /**
   * Executes an API operation with fallback logic.
   * @param {string} methodName - The name of the method to execute.
   * @param {...any} args - Arguments to pass to the method.
   */
  async _executeWithFallback(methodName, ...args) {
    let primaryError = null;

    // Try Primary Service
    if (this.primaryService) {
      try {
        return await this.primaryService[methodName](...args);
      } catch (error) {
        if (error instanceof NotImplementedError) {
          logger.debug(`Primary service (${this.primaryService.constructor.name}) does not implement ${methodName}, falling back.`);
        } else {
          // Log warning but don't toast yet, unless it's a critical error that shouldn't fallback?
          // Generally we try fallback.
          logger.warn(`Primary service (${this.primaryService.constructor.name}) failed for ${methodName}:`, error);
        }
        primaryError = error;
      }
    }

    // Try Secondary Service
    if (this.secondaryService) {
      try {
        logger.info(`Falling back to secondary service (${this.secondaryService.constructor.name}) for ${methodName}`);
        return await this.secondaryService[methodName](...args);
      } catch (error) {
        if (error instanceof NotImplementedError) {
          logger.debug(`Secondary service (${this.secondaryService.constructor.name}) does not implement ${methodName}.`);
        } else {
          logger.error(`Secondary service (${this.secondaryService.constructor.name}) failed for ${methodName}:`, error);
        }
        // Throw the error from the secondary service (or primary if secondary didn't even run?)
        throw error;
      }
    }

    // If we get here, both failed or no services available.
    throw primaryError || new Error('No API service available.');
  }

  /**
   * Executes a write operation on both primary and secondary services (Dual Write).
   * Ensures data consistency by writing to both backends.
   * @param {string} methodName - The name of the method to execute.
   * @param {...any} args - Arguments to pass to the method.
   */
  async _executeDualWrite(methodName, ...args) {
    let primaryResult = null;
    let primaryError = null;
    let secondaryResult = null;
    let secondaryError = null;
    let primaryExecuted = false;
    let secondaryExecuted = false;

    // 1. Primary Service
    if (this.primaryService) {
      try {
        primaryExecuted = true;
        primaryResult = await this.primaryService[methodName](...args);
      } catch (error) {
        primaryError = error;
        if (error instanceof NotImplementedError) {
          logger.debug(`Primary service (${this.primaryService.constructor.name}) does not implement ${methodName}.`);
        } else {
          logger.warn(`Primary service (${this.primaryService.constructor.name}) failed for ${methodName}:`, error);
        }
      }
    }

    // 2. Secondary Service
    // Only write if secondary is different and exists
    if (this.secondaryService && this.secondaryService !== this.primaryService) {
      try {
        secondaryExecuted = true;
        secondaryResult = await this.secondaryService[methodName](...args);
      } catch (error) {
        secondaryError = error;
        if (error instanceof NotImplementedError) {
          logger.debug(`Secondary service (${this.secondaryService.constructor.name}) does not implement ${methodName}.`);
        } else {
          logger.warn(`Secondary service (${this.secondaryService.constructor.name}) failed for ${methodName}:`, error);
        }
      }
    }

    // 3. Return Logic
    // If Primary succeeded, return its result.
    if (primaryExecuted && !primaryError) {
      return primaryResult;
    }

    // If Primary failed (or didn't run) but Secondary succeeded, return Secondary result.
    if (secondaryExecuted && !secondaryError) {
      // If Primary failed, we might want to notify user, but technically operation succeeded on backup.
      // We rely on the logger.warn above for observability.
      return secondaryResult;
    }

    // If both failed, throw Primary error (or Secondary if Primary didn't exist).
    throw primaryError || secondaryError || new Error('No API service available for dual write.');
  }

  async queryDatabase(query, userId) {
    return this._executeWithFallback('queryDatabase', query, userId);
  }

  async listAllContacts(options = {}, userId) {
    return this._executeWithFallback('listAllContacts', options, userId);
  }

  async getDevices() {
    return this._executeWithFallback('getDevices');
  }

  async getContacts(searchTerm, userId) {
    return this._executeWithFallback('getContacts', searchTerm, userId);
  }

  async getContactsBySource() {
    return this._executeWithFallback('getContactsBySource');
  }

  async getEventsByType() {
    return this._executeWithFallback('getEventsByType');
  }

  async getSystemStats(userId) {
    return this._executeWithFallback('getSystemStats', userId);
  }

  async getProjectManagementStats(userId) {
    return this._executeWithFallback('getProjectManagementStats', userId);
  }

  async getAPIStats() {
    return this._executeWithFallback('getAPIStats');
  }

  async logWorkflowExecution(workflowName, data) {
    return this._executeWithFallback('logWorkflowExecution', workflowName, data);
  }

  async addContact(name, email, source = 'command_hub', userId) {
    // Generate a consistent UUID for both backends
    const id = crypto.randomUUID();
    return this._executeDualWrite('addContact', name, email, source, userId, id);
  }

  async bulkAddContacts(contacts, userId) {
    // We assume bulk add contacts already have IDs or we generate them?
    // For now, let's keep fallback for bulk as it's complex to sync generated IDs for array.
    // Ideally we should generate IDs for all here.
    const contactsWithIds = contacts.map(c => ({ ...c, id: c.id || crypto.randomUUID() }));
    return this._executeDualWrite('bulkAddContacts', contactsWithIds, userId);
  }

  async deleteContact(email, userId) {
    return this._executeDualWrite('deleteContact', email, userId);
  }

  async deleteContactById(id, userId) {
    return this._executeDualWrite('deleteContactById', id, userId);
  }

  async updateContact(email, updates, userId) {
    return this._executeDualWrite('updateContact', email, updates, userId);
  }

  async updateContactById(id, updates, userId) {
    return this._executeDualWrite('updateContactById', id, updates, userId);
  }

  async listAPIIntegrations() {
    return this._executeWithFallback('listAPIIntegrations');
  }

  async getIntegrationsWithStats() {
    return this._executeWithFallback('getIntegrationsWithStats');
  }

  async testAPIIntegration(integrationName) {
    return this._executeWithFallback('testAPIIntegration', integrationName);
  }

  async getWorkflows() {
    return this._executeWithFallback('getWorkflows');
  }

  async createWorkflow(name, description, slug, definition, userId) {
    return this._executeWithFallback('createWorkflow', name, description, slug, definition, userId);
  }

  async deleteIntegration(id) {
    return this._executeWithFallback('deleteIntegration', id);
  }

  async logAIInteraction(command, response, executionTime, status = 'success', userId, conversationId, commandType, llmProvider, llmModel, embedding = null) {
    const args = [command, response, executionTime, status, userId, conversationId, commandType, llmProvider, llmModel, embedding];
    let primarySuccess = false;

    // 1. Try Primary Service (e.g., GCP)
    if (this.primaryService) {
      try {
        await this.primaryService.logAIInteraction(...args);
        primarySuccess = true;
      } catch (error) {
        logger.warn(`Primary service (${this.primaryService.constructor.name}) failed to log AI interaction:`, error);
      }
    }

    // 2. Try Secondary Service (e.g., Supabase) for redundancy/backup
    // We log to secondary if:
    // a) Primary failed (to ensure data isn't lost)
    // b) Secondary exists and is different from Primary (for dual-write redundancy/export support)
    if (this.secondaryService && this.secondaryService !== this.primaryService) {
      try {
        await this.secondaryService.logAIInteraction(...args);
      } catch (error) {
        logger.warn(`Secondary service (${this.secondaryService.constructor.name}) failed to log AI interaction:`, error);
        // If both failed, throw error
        if (!primarySuccess) {
           throw error;
        }
      }
    } else if (!primarySuccess) {
      // No secondary service and primary failed
      throw new Error('All services failed to log AI interaction.');
    }
  }

  async getChatHistoryForUser(userId, conversationId) {
    return this._executeWithFallback('getChatHistoryForUser', userId, conversationId);
  }

  async searchChatHistory(query, userId) {
    return this._executeWithFallback('searchChatHistory', query, userId);
  }

  async searchMemory(queryEmbedding, limit = 5, userId = null) {
    return this._executeWithFallback('searchMemory', queryEmbedding, limit, userId);
  }

  async getUsers() {
    return this._executeWithFallback('getUsers');
  }

  async updateUserRole(userId, role) {
    return this._executeWithFallback('updateUserRole', userId, role);
  }

  async deleteUser(userId) {
    return this._executeWithFallback('deleteUser', userId);
  }

  async inviteUser(email) {
    return this._executeWithFallback('inviteUser', email);
  }

  async getAvailableProviderNames() {
    return this._executeWithFallback('getAvailableProviderNames');
  }

  async getRecentWorkflows() {
    return this._executeWithFallback('getRecentWorkflows');
  }

  async getWorkflowExecutions() {
    return this._executeWithFallback('getWorkflowExecutions');
  }

  async recalculateMetrics() {
    return this._executeWithFallback('recalculateMetrics');
  }

  async createProject(name, description, userId) {
    return this._executeWithFallback('createProject', name, description, userId);
  }

  async listProjects(userId) {
    return this._executeWithFallback('listProjects', userId);
  }

  async getProjectByName(name) {
    return this._executeWithFallback('getProjectByName', name);
  }

  async listTasksForProject(projectId) {
    return this._executeWithFallback('listTasksForProject', projectId);
  }

  async createTasks(tasks, userId) {
    return this._executeWithFallback('createTasks', tasks, userId);
  }

  async getTaskByTitle(title, projectId) {
    return this._executeWithFallback('getTaskByTitle', title, projectId);
  }

  async updateTaskStatus(taskId, status) {
    return this._executeWithFallback('updateTaskStatus', taskId, status);
  }

  async getContactByEmail(email) {
    return this._executeWithFallback('getContactByEmail', email);
  }

  async createNote(contactId, content, userId) {
    return this._executeWithFallback('createNote', contactId, content, userId);
  }

  async getNotesForContact(contactId) {
    return this._executeWithFallback('getNotesForContact', contactId);
  }

  async deleteNote(noteId) {
    return this._executeWithFallback('deleteNote', noteId);
  }

  async getUserProfile(userId) {
    return this._executeWithFallback('getUserProfile', userId);
  }

  async getUserSettings(userId) {
    return this._executeWithFallback('getUserSettings', userId);
  }

  async saveUserSettings(userId, settings) {
    return this._executeWithFallback('saveUserSettings', userId, settings);
  }

  async updateUserProfile(userId, updates) {
    return this._executeWithFallback('updateUserProfile', userId, updates);
  }

  async registerDevice(deviceId, deviceName, systemInfo, userId) {
    return this._executeDualWrite('registerDevice', deviceId, deviceName, systemInfo, userId);
  }

  async sendDeviceHeartbeat(deviceId, systemInfo) {
    // Heartbeats are high frequency, maybe Fallback is better than Dual Write to reduce traffic?
    // But we want device status on both.
    return this._executeDualWrite('sendDeviceHeartbeat', deviceId, systemInfo);
  }

  async listDevices(userId) {
    return this._executeWithFallback('listDevices', userId);
  }

  async updateDevice(deviceId, updates, userId) {
    return this._executeDualWrite('updateDevice', deviceId, updates, userId);
  }

  async deleteDevice(deviceId, userId) {
    return this._executeDualWrite('deleteDevice', deviceId, userId);
  }

  async getDashboardMetrics() {
    return this._executeWithFallback('getDashboardMetrics');
  }

  async createTaskForProject(title, projectName, userId, description = null) {
    return this._executeWithFallback('createTaskForProject', title, projectName, userId, description);
  }

  async assignTaskToContact(taskTitle, contactEmail) {
    return this._executeWithFallback('assignTaskToContact', taskTitle, contactEmail);
  }

  async logEvent(type, eventData, userId) {
    return this._executeDualWrite('logEvent', type, eventData, userId);
  }

  async bulkDeleteContacts(emails) {
    return this._executeWithFallback('bulkDeleteContacts', emails);
  }


  async verifyApiKey(apiKey) {
    return this._executeWithFallback('verifyApiKey', apiKey);
  }

  async getDiscoveryCapabilities() {
    return this._executeWithFallback('getDiscoveryCapabilities');
  }


  async logHitlAction(userId, actionName, toolCalledJson) {
    return this._executeDualWrite('logHitlAction', userId, actionName, toolCalledJson);
  }

  async resolveHitlAction(logId, status, actionPayload = null) {
    // Forward to the new resolve-hitl edge function so it can trigger word-press publisher if needed
    const { data, error } = await this.supabase.functions.invoke("resolve-hitl", {
        body: { log_id: logId, status, action_payload: actionPayload }
    });
    if (error) throw error;
    return data;
  }

  async getHitlAuditLog(logId) {
    return this._executeWithFallback('getHitlAuditLog', logId);
  }


  async updateEcosystemAppStatus(appId, newStatus) {
    return this._executeDualWrite('updateEcosystemAppStatus', appId, newStatus);
  }

  async getAllEcosystemApps() {
    return this._executeWithFallback('getAllEcosystemApps');
  }


  async getApiKeys(userId) {
    return this._executeWithFallback('getApiKeys', userId);
  }

  async getPartnerCredit(userId) {
    return this._executeWithFallback('getPartnerCredit', userId);
  }

  async generateB2BApiKey(serviceName, userId) {
    return this._executeDualWrite('generateB2BApiKey', serviceName, userId);
  }

  async addApiKey(keyData, userId) {
    return this._executeDualWrite('addApiKey', keyData, userId);
  }

  async updateApiKey(apiKey) {
    return this._executeDualWrite('updateApiKey', apiKey);
  }

  async deleteApiKey(id) {
    return this._executeDualWrite('deleteApiKey', id);
  }


  async submitProductFeedback(feedback) {
    return this._executeDualWrite('submitProductFeedback', feedback);
  }

  async getProductFeedback() {
    return this._executeWithFallback('getProductFeedback');
  }

// --- External Service Integrations ---

  async initiateTranscription(source, userId) {
    return this._executeWithFallback('initiateTranscription', source, userId);
  }

  async assignCanvasserToTurf(contactEmail, turfName, userId) {
    return this._executeWithFallback('assignCanvasserToTurf', contactEmail, turfName, userId);
  }

  async invokeAximService(serviceName, endpoint, payload, userId) {
    return this._executeWithFallback('invokeAximService', serviceName, endpoint, payload, userId);
  }

  async getScheduledTasks(userId) {
    return this._executeWithFallback('getScheduledTasks', userId);
  }

  async createScheduledTask(command, schedule, userId) {
    return this._executeWithFallback('createScheduledTask', command, schedule, userId);
  }

  async deleteScheduledTask(taskId) {
    return this._executeWithFallback('deleteScheduledTask', taskId);
  }

  async triggerDataExport() {
    return this._executeWithFallback('triggerDataExport');
  }

  async createAutomation(command, schedule, userId) {
    return this._executeWithFallback('createAutomation', command, schedule, userId);
  }

  async fetchUrl(url) {
    return this._executeWithFallback('fetchUrl', url);
  }

  async triggerContentEngine(payload) {
    return this._executeWithFallback('triggerContentEngine', payload);
  }

  async checkSystemHealth() {
    return this._executeWithFallback('checkSystemHealth');
  }

  async sendEmail(to, subject, body, userId) {
    let result;
    try {
      // Try Supabase first (primary)
      result = await supabaseApiService.sendEmail(to, subject, body, userId);
    } catch (error) {
      logger.warn(`Supabase sendEmail failed, falling back to GCP: ${error.message}`);
      // Fallback to GCP
      try {
        result = await gcpApiService.sendEmail(to, subject, body, userId);
      } catch (fallbackError) {
        logger.error(`Both Supabase and GCP sendEmail failed.`);
        throw fallbackError;
      }
    }
    return result;
  }

  async sendToOnyxWorker(payload) {
    const workerUrl = import.meta.env.VITE_ONYX_WORKER_URL;
    const secureKey = import.meta.env.VITE_ONYX_SECURE_KEY;

    if (!workerUrl) {
      throw new Error('Onyx Edge Worker URL is not configured.');
    }

    const response = await fetch(`${workerUrl}/api/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + secureKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Onyx Worker Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

export default new ApiService();
