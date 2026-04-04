import axios from 'axios';
import config from '../config';
import logger from './logging';
import { DatabaseError, CommandExecutionError } from './onyxAI/errors';

class GcpApiService {
  constructor() {
    this.client = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      this.client = axios.create({
        baseURL: config.apiBaseUrl,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Basic health check
      await this.client.get('/healthz');

      this.isInitialized = true;
      logger.info('GcpApiService initialized and connected to backend.');
    } catch (error) {
      logger.error('Failed to initialize GcpApiService:', error);
      // We don't throw here to allow fallback to Supabase, but marking as not initialized.
      this.isInitialized = false;
    }
  }

  _ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('GcpApiService is not initialized or backend is unreachable.');
    }
  }

  // --- Contacts ---

  async addContact(name, email, source = 'command_hub', userId, id = null) {
    this._ensureInitialized();
    try {
      const payload = { name, email, source, userId };
      if (id) payload.id = id;
      const response = await this.client.post('/contacts', payload);
      return response.data;
    } catch (error) {
      logger.error('GCP addContact failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async searchMemory(queryEmbedding, limit = 5, userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.post('/interactions/memory', {
        embedding: queryEmbedding, limit, userId
      });
      return response.data;
    } catch (error) {
      logger.error('GCP searchMemory failed:', error);
      return [];
    }
  }

  async listAllContacts(options = {}, userId) {
    this._ensureInitialized();
    try {
        const { filter = {}, ...otherOptions } = options;
        const params = {
            userId,
            ...otherOptions,
            ...filter
        };
        const response = await this.client.get('/contacts', { params });
        return response.data;
    } catch (error) {
        logger.error('GCP listAllContacts failed:', error);
        throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async deleteContact(email, userId) {
    this._ensureInitialized();
    try {
      // Backend expects userId in body
      if (!userId) throw new Error('User ID required for deleteContact');
      const response = await this.client.delete(`/contacts/email/${email}`, { data: { userId } });
      return response.data;
    } catch (error) {
      logger.error('GCP deleteContact failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async getContacts(searchTerm, userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/contacts/search', { params: { q: searchTerm, userId } });
      return response.data;
    } catch (error) {
        logger.error('GCP getContacts failed:', error);
        throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async getContactByEmail(email) {
    this._ensureInitialized();
    try {
        const response = await this.client.get(`/contacts/email/${email}`);
        return response.data;
    } catch (error) {
        logger.error('GCP getContactByEmail failed:', error);
        throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async deleteContactById(id, userId) {
    this._ensureInitialized();
    try {
      // Assuming backend supports ID based deletion or we need to look it up.
      // For now, let's try the standard REST pattern.
      if (!userId) throw new Error('User ID required for deleteContactById');
      const response = await this.client.delete(`/contacts/${id}`, { data: { userId } });
      return response.data;
    } catch (error) {
      logger.error('GCP deleteContactById failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async updateContact(email, updates, userId) {
    this._ensureInitialized();
    try {
      if (!userId) throw new Error('User ID required for updateContact');
      const response = await this.client.patch(`/contacts/${email}`, { ...updates, userId });
      return response.data;
    } catch (error) {
      logger.error('GCP updateContact failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async updateContactById(id, updates, userId) {
    this._ensureInitialized();
    try {
      if (!userId) throw new Error('User ID required for updateContactById');
      const response = await this.client.patch(`/contacts/${id}`, { ...updates, userId });
      return response.data;
    } catch (error) {
      logger.error('GCP updateContactById failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  // --- Notes ---

  async createNote(contactId, content, userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.post(`/contacts/${contactId}/notes`, { content, userId });
      return response.data;
    } catch (error) {
      logger.error('GCP createNote failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async getNotesForContact(contactId) {
    this._ensureInitialized();
    try {
      const response = await this.client.get(`/contacts/${contactId}/notes`);
      return response.data;
    } catch (error) {
      logger.error('GCP getNotesForContact failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async deleteNote(noteId) {
    this._ensureInitialized();
    try {
      const response = await this.client.delete(`/notes/${noteId}`);
      return response.data;
    } catch (error) {
      logger.error('GCP deleteNote failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  // --- Integrations ---

  async listAPIIntegrations() {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/integrations');
      return response.data;
    } catch (error) {
      logger.error('GCP listAPIIntegrations failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async getIntegrationsWithStats() {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/integrations?stats=true');
      return response.data;
    } catch (error) {
      logger.error('GCP getIntegrationsWithStats failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async deleteIntegration(id) {
    this._ensureInitialized();
    try {
      const response = await this.client.delete(`/integrations/${id}`);
      return response.data;
    } catch (error) {
      logger.error('GCP deleteIntegration failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  // --- Workflows ---

  async getWorkflows() {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/workflows');
      return response.data;
    } catch (error) {
      logger.error('GCP getWorkflows failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  // logWorkflowExecution is already implemented via /events?
  // Let's check implementation of logWorkflowExecution in this file.
  // It was: POST /events, type: 'workflow_executed'.
  // But backend expects POST /workflows/log.
  // I should update it to use the new endpoint if I want consistency, OR keep using /events.
  // Using specific endpoint is cleaner.

  // --- Users ---

  async getUsers() {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/users');
      return response.data;
    } catch (error) {
      logger.error('GCP getUsers failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async updateUserRole(userId, role) {
    this._ensureInitialized();
    try {
      const response = await this.client.patch(`/users/${userId}/role`, { role });
      return response.data;
    } catch (error) {
      logger.error('GCP updateUserRole failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async deleteUser(userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.delete(`/users/${userId}`);
      return response.data;
    } catch (error) {
      logger.error('GCP deleteUser failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async getUserProfile(userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.get(`/users/${userId}/profile`);
      return response.data;
    } catch (error) {
      logger.error('GCP getUserProfile failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }


  // --- AI Interactions ---

  async logAIInteraction(command, response, executionTime, status, userId, conversationId, commandType, llmProvider, llmModel) {
    this._ensureInitialized();
    try {
      await this.client.post('/interactions', {
        command, response, executionTime, status, userId, conversationId, commandType, llmProvider, llmModel
      });
    } catch (error) {
      logger.error('GCP logAIInteraction failed:', error);
      // Don't throw for logging, just log error locally.
    }
  }

  async logEvent(type, eventData, userId) {
    this._ensureInitialized();
    try {
      await this.client.post('/events', { type, data: eventData, userId });
    } catch (error) {
      logger.error('GCP logEvent failed:', error);
      // Don't throw for logging
    }
  }

  async logWorkflowExecution(workflowName, data, userId) {
     this._ensureInitialized();
     try {
       const response = await this.client.post('/workflows/log', { workflowName, data, userId });
       return response.data;
     } catch (error) {
       logger.error('GCP logWorkflowExecution failed:', error);
       throw new DatabaseError(error.response?.data?.error || error.message);
     }
  }

  async getChatHistoryForUser(userId, conversationId) {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/interactions/history', {
        params: { userId, conversationId }
      });
      return response.data;
    } catch (error) {
       logger.error('GCP getChatHistoryForUser failed:', error);
       throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async searchChatHistory(query, userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/interactions/search', {
        params: { q: query, userId }
      });
      return response.data;
    } catch (error) {
      logger.error('GCP searchChatHistory failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  // --- External Service Proxies ---

  async initiateTranscription(source, userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.post('/integrations/transcribe', { source, userId });
      return response.data;
    } catch (error) {
      logger.error('GCP initiateTranscription failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async assignCanvasserToTurf(contactEmail, turfName, userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.post('/integrations/ground-game', { contactEmail, turfName, userId });
      return response.data;
    } catch (error) {
      logger.error('GCP assignCanvasserToTurf failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async invokeAximService(serviceName, endpoint, payload, userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.post('/integrations/invoke', { serviceName, endpoint, payload, userId });
      return response.data;
    } catch (error) {
      logger.error('GCP invokeAximService failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }


  // --- Devices ---

  async listDevices(userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/devices', { params: { userId } });
      return response.data;
    } catch (error) {
      logger.error('GCP listDevices failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async registerDevice(deviceId, deviceName, systemInfo, userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.post('/devices', { id: deviceId, device_name: deviceName, system_info: systemInfo, userId });
      return response.data;
    } catch (error) {
      logger.error('GCP registerDevice failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async updateDevice(deviceId, updates, userId) {
    this._ensureInitialized();
    try {
      if (!userId) throw new Error('User ID required for updateDevice');
      const response = await this.client.patch(`/devices/${deviceId}`, { updates, userId });
      return response.data;
    } catch (error) {
      logger.error('GCP updateDevice failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async deleteDevice(deviceId, userId) {
    this._ensureInitialized();
    try {
      if (!userId) throw new Error('User ID required for deleteDevice');
      const response = await this.client.delete(`/devices/${deviceId}`, { data: { userId } });
      return response.data;
    } catch (error) {
      logger.error('GCP deleteDevice failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async sendDeviceHeartbeat(deviceId, systemInfo) {
    this._ensureInitialized();
    try {
      const response = await this.client.post(`/devices/${deviceId}/heartbeat`, { system_info: systemInfo });
      return response.data;
    } catch (error) {
       logger.error('GCP sendDeviceHeartbeat failed:', error);
       throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }


  // --- Dashboard Metrics ---

  async getDashboardMetrics() {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/metrics/dashboard');
      return response.data;
    } catch (error) {
      logger.error('GCP getDashboardMetrics failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  // --- Project Management ---

  async createProject(name, description, userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.post('/projects', { name, description, userId });
      return response.data;
    } catch (error) {
      logger.error('GCP createProject failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async listProjects(userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/projects', { params: { userId } });
      return response.data;
    } catch (error) {
      logger.error('GCP listProjects failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async listTasksForProject(projectId) {
    this._ensureInitialized();
    try {
      const response = await this.client.get(`/projects/${projectId}/tasks`);
      return response.data;
    } catch (error) {
      logger.error('GCP listTasksForProject failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async updateTaskStatus(taskId, status) {
    this._ensureInitialized();
    try {
      const response = await this.client.patch(`/tasks/${taskId}`, { updates: { status } });
      return response.data;
    } catch (error) {
      logger.error('GCP updateTaskStatus failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  // --- Email ---

  async sendEmail(to, subject, body, userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.post('/email/send', { to, subject, body, userId });
      return response.data;
    } catch (error) {
      logger.error('GCP sendEmail failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  // --- Placeholders for other methods to trigger fallback ---
  // Any method called by api.js that isn't implemented here will cause a crash if we don't define it?
  // JavaScript classes don't enforce interface implementation.
  // If api.js calls `activeService.getUsers()`, and it's undefined on GcpApiService, it throws "is not a function".
  // This "crash" will be caught by the fallback mechanism in api.js?
  // No, TypeError is an error.
  // So I should define all methods or use a Proxy?
  // A Proxy is cleaner.
}

// Proxy handler to catch unimplemented methods
const handler = {
  get(target, prop, receiver) {
    if (Reflect.has(target, prop)) {
      return Reflect.get(target, prop, receiver);
    }
    return async function (...args) {
      // Log and throw to trigger fallback
      // logger.debug(`Method ${String(prop)} not implemented in GcpApiService, falling back.`);
      throw new Error(`Method ${String(prop)} not implemented in GcpApiService`);
    };
  }
};

const service = new GcpApiService();
export default new Proxy(service, handler);
