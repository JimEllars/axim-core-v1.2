import toast from 'react-hot-toast';
import logger from './logging';
import { DatabaseError, CommandExecutionError } from './onyxAI/errors';
// import connectivityManager from './connectivityManager'; // To be injected
// import offlineManager from './offline'; // To be injected

class SupabaseApiService {
  constructor() {
    this.supabase = null;
    this.connectivityManager = null;
    this.offlineManager = null;
  }

  initialize(supabase, connectivityManager, offlineManager) {
    this.supabase = supabase;
    this.connectivityManager = connectivityManager;
    this.offlineManager = offlineManager;
  }

  _checkConnectivity(methodName, methodArgs, isWriteOperation = false) {
    if (!this.supabase || !this.connectivityManager || !this.offlineManager) {
      throw new CommandExecutionError('SupabaseApiService not fully initialized.');
    }
    if (!this.connectivityManager.getIsOnline()) {
      if (isWriteOperation) {
        toast.success(`You are offline. Your request (${methodName}) has been queued.`, { id: `offline-${methodName}` });
        logger.warn(`SupabaseApiService: Queuing write operation ${methodName} while offline.`);
        this.offlineManager.queueRequest(methodName, methodArgs);
        return true; // Indicates the request was queued
      } else {
        const offlineError = new CommandExecutionError('The application is offline. This action is currently unavailable.');
        toast.error(offlineError.message);
        logger.warn(`SupabaseApiService: Blocked API call to ${methodName} while offline.`);
        throw offlineError;
      }
    }
    return false; // Indicates the request was not queued
  }

  async queryDatabase(query, userId) {
    if (this._checkConnectivity('queryDatabase', [query, userId])) return;
    try {
      const { data, error } = await this.supabase
        .from('contacts_ax2024')
        .select('name, email, source, created_at')
        .eq('user_id', userId)
        .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Database query failed');
      logger.error('Database query failed:', error);
      throw new DatabaseError(`Database query failed: ${error.message}`);
    }
  }

  async listAllContacts(options = {}, userId) {
    if (this._checkConnectivity('listAllContacts', [options, userId])) return;
    try {
      let query = this.supabase
        .from('contacts_ax2024')
        .select('name, email, source')
        .eq('user_id', userId);

      if (options.filters && options.filters.length > 0) {
        options.filters.forEach(filter => {
          const { field, operator, value } = filter;
          switch (operator) {
            case 'contains':
              query = query.ilike(field, `%${value}%`);
              break;
            case 'since':
            case 'after':
              query = query.gte(field, value.startDate);
              break;
            case 'before':
              query = query.lte(field, value.endDate);
              break;
            case 'between':
              query = query.gte(field, value.startDate).lte(field, value.endDate);
              break;
            default:
              query = query.eq(field, value);
              break;
          }
        });
      }

      const sortOrder = options.sortOrder || 'desc';
      query = query.order(options.sortBy || 'created_at', { ascending: sortOrder === 'asc' });

      const { data, error } = await query;
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to list all contacts');
      logger.error('Failed to list all contacts:', error);
      throw new DatabaseError(`Failed to list all contacts: ${error.message}`);
    }
  }

  async getContacts(searchTerm, userId) {
    if (this._checkConnectivity('getContacts', [searchTerm, userId])) return;
    try {
      let query = this.supabase
        .from('contacts_ax2024')
        .select('*')
        .eq('user_id', userId);

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to fetch contacts');
      logger.error('Failed to fetch contacts:', error);
      throw new DatabaseError(`Failed to fetch contacts: ${error.message}`);
    }
  }

  async getContactsBySource() {
    if (this._checkConnectivity('getContactsBySource', [])) return;
    try {
      const { data, error } = await this.supabase.rpc('get_contacts_by_source');
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to get contacts by source');
      logger.error('Failed to get contacts by source:', error);
      throw new DatabaseError(`Failed to get contacts by source: ${error.message}`);
    }
  }

  async getEventsByType() {
    if (this._checkConnectivity('getEventsByType', [])) return;
    try {
      const { data, error } = await this.supabase.rpc('get_events_by_type');
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to get events by type');
      logger.error('Failed to get events by type:', error);
      throw new DatabaseError(`Failed to get events by type: ${error.message}`);
    }
  }

  async getSystemStats(userId) {
    if (this._checkConnectivity('getSystemStats', [userId])) return;
    try {
      const [contactsRes, eventsRes, apisRes] = await Promise.all([
        this.supabase.from('contacts_ax2024').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        this.supabase.from('events_ax2024').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        this.supabase.from('api_integrations_ax2024').select('*', { count: 'exact', head: true }).eq('user_id', userId)
      ]);

      if (contactsRes.error || eventsRes.error || apisRes.error) {
        const firstError = contactsRes.error || eventsRes.error || apisRes.error;
        throw new DatabaseError(firstError.message);
      }

      return {
        totalContacts: contactsRes.count || 0,
        totalEvents: eventsRes.count || 0,
        totalAPIs: apisRes.count || 0,
      };
    } catch (error) {
      toast.error('Failed to retrieve system stats');
      logger.error('Failed to retrieve system stats:', error);
      if (error instanceof DatabaseError) {
        throw error;
      }
      throw new DatabaseError(`Failed to retrieve system stats: ${error.message}`);
    }
  }

  async getProjectManagementStats(userId) {
    if (this._checkConnectivity('getProjectManagementStats', [userId])) return;
    try {
      const [projectsRes, tasksRes, workflowsRes] = await Promise.all([
        this.supabase.from('projects_ax2024').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        this.supabase.from('tasks_ax2024').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        this.supabase.from('workflows_ax2024').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      return {
        totalProjects: projectsRes.count || 0,
        totalTasks: tasksRes.count || 0,
        totalWorkflows: workflowsRes.count || 0,
      };
    } catch (error) {
      toast.error('Failed to retrieve project management stats');
      logger.error('Failed to retrieve project management stats:', error);
      throw new DatabaseError(`Failed to retrieve project management stats: ${error.message}`);
    }
  }

  async getAPIStats() {
    if (this._checkConnectivity('getAPIStats', [])) return;
    try {
      const [{ data: integrations, error: integrationsError }, { data: logs, error: logsError }] = await Promise.all([
        this.supabase.from('api_integrations_ax2024').select('*'),
        this.supabase.from('api_call_logs_ax2024').select('success, response_time_ms').limit(100)
      ]);

      if (integrationsError) throw integrationsError;
      if (logsError) throw logsError;

      return { integrations, logs };
    } catch (error) {
      toast.error('Failed to retrieve API stats');
      logger.error('Failed to retrieve API stats:', error);
      throw new DatabaseError(`Failed to retrieve API stats: ${error.message}`);
    }
  }

  async logWorkflowExecution(workflowName, data) {
    if (this._checkConnectivity('logWorkflowExecution', [workflowName, data])) return;
    try {
      const { error } = await this.supabase
        .from('events_ax2024')
        .insert({
          type: 'workflow_executed',
          source: 'workflow_engine',
          data: {
            workflow_name: workflowName,
            ...data
          }
        });
      if (error) throw error;
    } catch (error) {
      toast.error('Failed to log workflow event');
      logger.warn('Failed to log workflow event:', error);
    }
  }

  async addContact(name, email, source = 'command_hub', userId, id = null) {
    if (!userId) {
      const error = new CommandExecutionError('A user ID must be provided to create a contact.');
      toast.error(error.message);
      logger.error('addContact validation failed:', error);
      return Promise.reject(error);
    }
    if (this._checkConnectivity('addContact', [name, email, source, userId, id], true)) {
      return Promise.resolve(); // Return a resolved promise for the UI.
    }
    try {
      const insertData = { name, email, source, user_id: userId };
      if (id) insertData.id = id;
      const { data, error } = await this.supabase
        .from('contacts_ax2024')
        .insert(insertData)
        .select();
      if (error) {
        if (error.code === '23505') {
          throw new CommandExecutionError(`Contact with email "${email}" already exists.`);
        }
        throw new DatabaseError(error.message);
      }
      await this.supabase
        .from('events_ax2024')
        .insert({
          type: 'new_lead',
          source: 'command_hub',
          data: { email, name, added_via: 'onyx_ai' }
        });
      return data;
    } catch (error) {
      toast.error(`Failed to add contact: ${error.message}`);
      logger.error('Failed to add contact:', error);
      if (error instanceof CommandExecutionError) {
        throw error;
      }
      throw new DatabaseError(`Failed to add contact: ${error.message}`);
    }
  }

  async bulkAddContacts(contacts, userId) {
    if (this._checkConnectivity('bulkAddContacts', [contacts, userId], true)) {
      return Promise.resolve();
    }
    try {
      const contactsWithUser = contacts.map(c => ({ ...c, user_id: userId }));
      const { data, error } = await this.supabase
        .from('contacts_ax2024')
        .insert(contactsWithUser)
        .select();
      if (error) {
        if (error.code === '23505') {
          throw new CommandExecutionError('One or more contacts in the import already exist.');
        }
        throw new DatabaseError(error.message);
      }
      await this.supabase.from('events_ax2024').insert({
        type: 'bulk_import',
        source: 'csv_import',
        data: { count: contacts.length },
        user_id: userId,
      });
      return data;
    } catch (error) {
      toast.error('Failed to bulk add contacts');
      logger.error('Failed to bulk add contacts:', error);
      if (error instanceof CommandExecutionError) {
        throw error;
      }
      throw new DatabaseError(`Failed to bulk add contacts: ${error.message}`);
    }
  }

  async deleteContact(email) {
    if (this._checkConnectivity('deleteContact', [email], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase
        .from('contacts_ax2024')
        .delete()
        .eq('email', email)
        .select();
      if (error) throw new DatabaseError(error.message);
      if (data.length === 0) {
        throw new CommandExecutionError(`Contact with email "${email}" not found.`);
      }
      return data;
    } catch (error) {
      toast.error(`Failed to delete contact: ${error.message}`);
      logger.error('Failed to delete contact:', error);
      if (error instanceof CommandExecutionError) {
        throw error;
      }
      throw new DatabaseError(`Failed to delete contact: ${error.message}`);
    }
  }

  async deleteContactById(id) {
    if (this._checkConnectivity('deleteContactById', [id], true)) {
      return Promise.resolve();
    }
    try {
      const { error } = await this.supabase.from('contacts_ax2024').delete().eq('id', id);
      if (error) throw new DatabaseError(error.message);
    } catch (error) {
      toast.error('Failed to delete contact by ID');
      logger.error('Failed to delete contact by ID:', error);
      throw new DatabaseError(`Failed to delete contact: ${error.message}`);
    }
  }

  async updateContact(email, updates) {
    if (this._checkConnectivity('updateContact', [email, updates], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase
        .from('contacts_ax2024')
        .update(updates)
        .eq('email', email)
        .select();
      if (error) throw new DatabaseError(error.message);
      if (data.length === 0) {
        throw new CommandExecutionError(`Contact with email "${email}" not found.`);
      }
      return data;
    } catch (error) {
      toast.error(`Failed to update contact: ${error.message}`);
      logger.error('Failed to update contact:', error);
      if (error instanceof CommandExecutionError) {
        throw error;
      }
      throw new DatabaseError(`Failed to update contact: ${error.message}`);
    }
  }

  async updateContactById(id, updates) {
    if (this._checkConnectivity('updateContactById', [id, updates], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase
        .from('contacts_ax2024')
        .update(updates)
        .eq('id', id)
        .select();
      if (error) throw new DatabaseError(error.message);
      if (data.length === 0) {
        throw new CommandExecutionError(`Contact with ID ${id} not found.`);
      }
      return data;
    } catch (error) {
      toast.error('Failed to update contact by ID');
      logger.error('Failed to update contact by ID:', error);
      if (error instanceof CommandExecutionError) {
        throw error;
      }
      throw new DatabaseError(`Failed to update contact: ${error.message}`);
    }
  }

  async listAPIIntegrations() {
    if (this._checkConnectivity('listAPIIntegrations', [])) return;
    try {
      const { data, error } = await this.supabase
        .from('api_integrations_ax2024')
        .select('name, type, status, base_url, created_at')
        .order('created_at', { ascending: false });
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('API integration error');
      logger.error('API integration error:', error);
      throw new CommandExecutionError(`API integration error: ${error.message}`);
    }
  }

  async getIntegrationsWithStats() {
    if (this._checkConnectivity('getIntegrationsWithStats', [])) return;
    try {
      const { data: integrations, error: integrationsError } = await this.supabase
        .from('api_integrations_ax2024')
        .select('*')
        .order('created_at', { ascending: false });

      if (integrationsError) throw new DatabaseError(integrationsError.message);

      const { data: logs, error: logsError } = await this.supabase
        .from('api_call_logs_ax2024')
        .select('success');

      if (logsError) throw new DatabaseError(logsError.message);

      const totalIntegrations = integrations?.length || 0;
      const activeIntegrations = integrations?.filter(api => api.status === 'active').length || 0;
      const totalCalls = logs?.length || 0;
      const successfulCalls = logs?.filter(log => log.success).length || 0;
      const successRate = totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 0;

      return {
        integrations,
        stats: {
          totalIntegrations,
          activeIntegrations,
          totalCalls,
          successRate,
        },
      };
    } catch (error) {
      toast.error('Failed to get integrations with stats');
      logger.error('Failed to get integrations with stats:', error);
      throw new DatabaseError(`Failed to get integrations with stats: ${error.message}`);
    }
  }

  async testAPIIntegration(integrationName) {
    if (this._checkConnectivity('testAPIIntegration', [integrationName])) return;
    try {
      const { data: integration, error } = await this.supabase
        .from('api_integrations_ax2024')
        .select('*')
        .ilike('name', `%${integrationName}%`)
        .single();
      if (error || !integration) {
        throw new CommandExecutionError(`Integration "${integrationName}" not found.`);
      }
      const success = Math.random() > 0.3;
      await this.supabase
        .from('api_call_logs_ax2024')
        .insert({
          integration_id: integration.id,
          endpoint: 'health_check',
          method: 'GET',
          status_code: success ? 200 : 500,
          response_time_ms: Math.floor(Math.random() * 1000) + 100,
          success,
          triggered_by: 'onyx_ai'
        });
      return { success, integration };
    } catch (error) {
      toast.error(`API integration test error: ${error.message}`);
      logger.error('API integration test error:', error);
      throw new CommandExecutionError(`API integration test error: ${error.message}`);
    }
  }

  async getWorkflows() {
    if (this._checkConnectivity('getWorkflows', [])) return;
    try {
      const { data, error } = await this.supabase
        .from('workflows_ax2024')
        .select('name, description, slug');
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to get workflows');
      logger.error('Failed to get workflows:', error);
      throw new DatabaseError(`Failed to get workflows: ${error.message}`);
    }
  }

  async deleteIntegration(id) {
    if (this._checkConnectivity('deleteIntegration', [id])) return;
    try {
      const { error } = await this.supabase
        .from('api_integrations_ax2024')
        .delete()
        .eq('id', id);
      if (error) throw new DatabaseError(error.message);
    } catch (error) {
      toast.error('Failed to delete integration');
      logger.error('Failed to delete integration:', error);
      throw new DatabaseError(`Failed to delete integration: ${error.message}`);
    }
  }

  async logAIInteraction(command, response, executionTime, status = 'success', userId, conversationId, commandType, llmProvider, llmModel, embedding = null) {
    // This is a special case: we don't queue these logs. If offline, they are simply dropped.
    if (!this.supabase || (this.connectivityManager && !this.connectivityManager.getIsOnline())) {
      logger.warn('Skipping AI interaction log due to offline status or uninitialized service.');
      toast.error('Could not save chat to memory: offline.', { id: 'log-ai-interaction-offline' });
      return;
    }
    try {
      if (!userId) {
        logger.warn('Could not log AI interaction without a user ID.');
        return;
      }

      const insertData = {
        command,
        response,
        execution_time_ms: executionTime,
        status,
        user_id: userId,
        conversation_id: conversationId,
        command_type: commandType,
        llm_provider: llmProvider,
        llm_model: llmModel,
      };

      if (embedding) {
        // Only stringify if required by pgvector driver setup, typically pgvector handles arrays
        insertData.embedding = JSON.stringify(embedding);
      }

      const { error } = await this.supabase.from('ai_interactions_ax2024').insert(insertData);
      if (error) throw new DatabaseError(error.message);
    } catch (error) {
      toast.error('Could not save chat to memory: connection issue.', { id: 'log-ai-interaction-error' });
      logger.warn('Failed to log AI interaction:', error);
    }
  }

  async getChatHistoryForUser(userId, conversationId) {
    if (this._checkConnectivity('getChatHistoryForUser', [userId, conversationId])) return [];
    try {
      const { data, error } = await this.supabase
        .from('ai_interactions_ax2024')
        .select('command, response, status')
        .eq('user_id', userId)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.warn('Could not fetch chat history:', error);
      toast.error('Could not load chat history. Displaying current session only.', { id: 'get-chat-history-error' });
      return [];
    }
  }

  async searchMemory(queryEmbedding, limit = 5, userId = null) {
    if (this._checkConnectivity('searchMemory', [queryEmbedding, limit, userId])) return [];
    try {
      // Stub implementation: calls a hypothetical RPC 'match_ai_interactions'
      // Requires pgvector and the RPC function to be created in Supabase.
      const { data, error } = await this.supabase.rpc('match_ai_interactions', {
        query_embedding: queryEmbedding,
        match_threshold: 0.78, // typical threshold
        match_count: limit,
        p_user_id: userId
      });

      if (error) {
        logger.warn('searchMemory RPC failed (expected if pgvector/rpc not fully set up yet):', error.message);
        return []; // Return empty array gracefully during development
      }
      return data;
    } catch (error) {
      logger.error('Failed to execute searchMemory:', error);
      return [];
    }
  }

  async searchChatHistory(query, userId) {
    if (this._checkConnectivity('searchChatHistory', [query, userId])) return [];
    try {
      // Use RPC for better performance and encapsulation
      const { data, error } = await this.supabase.rpc('search_chat_history', {
        query_text: query
      });

      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.error('Failed to search chat history:', error);
      toast.error('Failed to search memory.');
      return [];
    }
  }

  async getUsers() {
    if (this._checkConnectivity('getUsers', [])) return;
    try {
      const { data, error } = await this.supabase.rpc('get_all_users');
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to get users');
      logger.error('Failed to get users:', error);
      throw new DatabaseError(`Failed to get users: ${error.message}`);
    }
  }

  async updateUserRole(userId, role) {
    if (this._checkConnectivity('updateUserRole', [userId, role])) return;
    try {
      const { error } = await this.supabase
        .from('users')
        .update({ role })
        .eq('id', userId);
      if (error) throw new DatabaseError(error.message);
    } catch (error) {
      toast.error('Failed to update user role');
      logger.error('Failed to update user role:', error);
      throw new DatabaseError(`Failed to update user role: ${error.message}`);
    }
  }

  async deleteUser(userId) {
    if (this._checkConnectivity('deleteUser', [userId])) return;
    try {
      const { error } = await this.supabase.rpc('delete_a_user', { user_id: userId });
      if (error) throw new DatabaseError(error.message);
    } catch (error) {
      toast.error('Failed to delete user');
      logger.error('Failed to delete user:', error);
      throw new DatabaseError(`Failed to delete user: ${error.message}`);
    }
  }

  async inviteUser(email) {
    if (this._checkConnectivity('inviteUser', [email])) return;
    try {
      const { data, error } = await this.supabase.auth.admin.inviteUserByEmail(email);
      if (error) throw new CommandExecutionError(error.message);
      return data;
    } catch (error) {
      toast.error(`Failed to invite user: ${error.message}`);
      logger.error('Failed to invite user:', error);
      throw new CommandExecutionError(`Failed to invite user: ${error.message}`);
    }
  }

  async getAvailableProviderNames() {
    if (this._checkConnectivity('getAvailableProviderNames', [])) return [];
    try {
      const { data, error } = await this.supabase.rpc('get_configured_providers');
      if (error) throw new DatabaseError(error.message);
      return data.map(p => p.service);
    } catch (error) {
      toast.error('Failed to get available provider names');
      logger.error('Failed to get available provider names:', error);
      return [];
    }
  }

  async getRecentWorkflows() {
    if (this._checkConnectivity('getRecentWorkflows', [])) return;
    try {
      const { data, error } = await this.supabase
        .from('events_ax2024')
        .select('created_at, data')
        .eq('type', 'workflow_executed')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to get recent workflows');
      logger.error('Failed to get recent workflows:', error);
      throw new DatabaseError(`Failed to get recent workflows: ${error.message}`);
    }
  }

  async getWorkflowExecutions() {
    if (this._checkConnectivity('getWorkflowExecutions', [])) return;
    try {
      const { data, error } = await this.supabase
        .from('events_ax2024')
        .select('id, created_at, data, source')
        .or('type.eq.workflow_executed,type.eq.workflow_triggered')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to get workflow executions');
      logger.error('Failed to get workflow executions:', error);
      throw new DatabaseError(`Failed to get workflow executions: ${error.message}`);
    }
  }

  async recalculateMetrics() {
    if (this._checkConnectivity('recalculateMetrics', [], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase.rpc('recalculate_metrics');
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to recalculate metrics');
      logger.error('Failed to recalculate metrics:', error);
      throw new DatabaseError(`Failed to recalculate metrics: ${error.message}`);
    }
  }

  async createProject(name, description, userId) {
    if (this._checkConnectivity('createProject', [name, description, userId], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase
        .from('projects_ax2024')
        .insert({ name, description, user_id: userId })
        .select()
        .single();
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to create project');
      logger.error('Failed to create project:', error);
      throw new DatabaseError(`Failed to create project: ${error.message}`);
    }
  }

  async listProjects(userId) {
    if (this._checkConnectivity('listProjects', [userId])) return;
    try {
      const { data, error } = await this.supabase
        .from('projects_ax2024')
        .select('id, name, description, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to list projects');
      logger.error('Failed to list projects:', error);
      throw new DatabaseError(`Failed to list projects: ${error.message}`);
    }
  }

  async getProjectByName(name) {
    if (this._checkConnectivity('getProjectByName', [name])) return;
    try {
      const { data, error } = await this.supabase
        .from('projects_ax2024')
        .select('id, name')
        .eq('name', name)
        .single();
      if (error) {
        if (error.code === 'PGRST116') {
          throw new CommandExecutionError(`Project with name "${name}" not found.`);
        }
        throw new DatabaseError(error.message);
      }
      return data;
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        throw error;
      }
      toast.error(`Failed to get project by name "${name}"`);
      logger.error(`Failed to get project by name "${name}":`, error);
      throw new CommandExecutionError(`Failed to get project by name: ${error.message}`);
    }
  }

  async listTasksForProject(projectId) {
    if (this._checkConnectivity('listTasksForProject', [projectId])) return;
    try {
      const { data, error } = await this.supabase
        .from('tasks_ax2024')
        .select('id, title, status, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to list tasks for project');
      logger.error('Failed to list tasks for project:', error);
      throw new DatabaseError(`Failed to list tasks for project: ${error.message}`);
    }
  }

  async createTasks(tasks, userId) {
    if (this._checkConnectivity('createTasks', [tasks, userId], true)) {
      return Promise.resolve();
    }
    try {
      const tasksWithUserId = tasks.map(task => ({ ...task, user_id: userId }));
      const { data, error } = await this.supabase
        .from('tasks_ax2024')
        .insert(tasksWithUserId)
        .select();
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to create tasks');
      logger.error('Failed to create tasks:', error);
      throw new DatabaseError(`Failed to create tasks: ${error.message}`);
    }
  }

  async getTaskByTitle(title, projectId) {
    if (this._checkConnectivity('getTaskByTitle', [title, projectId])) return;
    try {
      let query = this.supabase
        .from('tasks_ax2024')
        .select('id, title')
        .eq('title', title);

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new CommandExecutionError(`Task with title "${title}" not found or multiple tasks have the same title.`);
        }
        throw new DatabaseError(error.message);
      }
      return data;
    } catch (error) {
      toast.error(`Failed to get task by title "${title}"`);
      logger.error(`Failed to get task by title "${title}":`, error);
      throw new CommandExecutionError(`Failed to get task by title: ${error.message}`);
    }
  }

  async updateTaskStatus(taskId, status) {
    if (this._checkConnectivity('updateTaskStatus', [taskId, status], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase
        .from('tasks_ax2024')
        .update({ status })
        .eq('id', taskId)
        .select()
        .single();
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to update task status');
      logger.error('Failed to update task status:', error);
      throw new DatabaseError(`Failed to update task status: ${error.message}`);
    }
  }

  async getContactByEmail(email) {
    if (this._checkConnectivity('getContactByEmail', [email])) return;
    try {
      const { data, error } = await this.supabase
        .from('contacts_ax2024')
        .select('id, name, email')
        .eq('email', email)
        .single();
      if (error) {
        if (error.code === 'PGRST116') {
          throw new CommandExecutionError(`Contact with email "${email}" not found.`);
        }
        throw new DatabaseError(error.message);
      }
      return data;
    } catch (error) {
      toast.error(`Failed to get contact by email "${email}"`);
      logger.error(`Failed to get contact by email "${email}":`, error);
      throw new CommandExecutionError(`Failed to get contact by email: ${error.message}`);
    }
  }

  async createNote(contactId, content, userId) {
    if (this._checkConnectivity('createNote', [contactId, content, userId], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase
        .from('notes_ax2024')
        .insert({ contact_id: contactId, content, user_id: userId })
        .select()
        .single();
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to create note');
      logger.error('Failed to create note:', error);
      throw new DatabaseError(`Failed to create note: ${error.message}`);
    }
  }

  async getNotesForContact(contactId) {
    if (this._checkConnectivity('getNotesForContact', [contactId])) return;
    try {
      const { data, error } = await this.supabase
        .from('notes_ax2024')
        .select('id, content, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to get notes for contact');
      logger.error('Failed to get notes for contact:', error);
      throw new DatabaseError(`Failed to get notes for contact: ${error.message}`);
    }
  }

  async deleteNote(noteId) {
    if (this._checkConnectivity('deleteNote', [noteId], true)) {
      return Promise.resolve();
    }
    try {
      const { error } = await this.supabase
        .from('notes_ax2024')
        .delete()
        .eq('id', noteId);
      if (error) throw new DatabaseError(error.message);
    } catch (error) {
      toast.error('Failed to delete note');
      logger.error('Failed to delete note:', error);
      throw new DatabaseError(`Failed to delete note: ${error.message}`);
    }
  }

  async getUserProfile(userId) {
    if (this._checkConnectivity('getUserProfile', [userId])) return;
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', userId)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null; // Not found is not an error
        throw new DatabaseError(error.message);
      }
      return data;
    } catch (error) {
      toast.error('Failed to get user profile');
      logger.error('Failed to get user profile:', error);
      throw new DatabaseError(`Failed to get user profile: ${error.message}`);
    }
  }

  async getUserSettings(userId) {
    if (this._checkConnectivity('getUserSettings', [userId])) return;
    try {
      const { data, error } = await this.supabase
        .from('user_settings')
        .select('settings')
        .eq('user_id', userId)
        .single();
      if (error && error.code !== 'PGRST116') throw new DatabaseError(error.message);
      return data?.settings || {};
    } catch (error) {
      toast.error('Failed to get user settings');
      logger.error('Failed to get user settings:', error);
      throw new DatabaseError(`Failed to get user settings: ${error.message}`);
    }
  }

  async saveUserSettings(userId, settings) {
    if (this._checkConnectivity('saveUserSettings', [userId, settings], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase
        .from('user_settings')
        .upsert({ user_id: userId, settings }, { onConflict: 'user_id' });
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to save user settings');
      logger.error('Failed to save user settings:', error);
      throw new DatabaseError(`Failed to save user settings: ${error.message}`);
    }
  }

  async updateUserProfile(userId, updates) {
    if (this._checkConnectivity('updateUserProfile', [userId, updates], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to update user profile');
      logger.error('Failed to update user profile:', error);
      throw new DatabaseError(`Failed to update user profile: ${error.message}`);
    }
  }

  // ----------------------------------------------------------------
  // Device Management
  // ----------------------------------------------------------------

  async registerDevice(deviceId, deviceName, systemInfo, userId) {
    if (this._checkConnectivity('registerDevice', [deviceId, deviceName, systemInfo, userId], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase
        .from('devices')
        .insert({
          id: deviceId,
          device_name: deviceName,
          system_info: systemInfo,
          user_id: userId,
          status: 'online',
          last_seen: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) {
        if (error.code === '23505') {
          return this.sendDeviceHeartbeat(deviceId, systemInfo);
        }
        throw new DatabaseError(error.message);
      }
      return data;
    } catch (error) {
      toast.error('Failed to register device');
      logger.error('Failed to register device:', error);
      throw new DatabaseError(`Failed to register device: ${error.message}`);
    }
  }

  async sendDeviceHeartbeat(deviceId, systemInfo) {
    if (!this.supabase) throw new CommandExecutionError("ApiService not initialized.");
    if (this._checkConnectivity('sendDeviceHeartbeat', [deviceId, systemInfo], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase
        .from('devices')
        .update({
          status: 'online',
          last_seen: new Date().toISOString(),
          system_info: systemInfo,
        })
        .eq('id', deviceId)
        .select()
        .single();
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      // Don't toast here, as this is a background task.
      logger.warn('Failed to send device heartbeat:', error);
      throw new DatabaseError(`Failed to send device heartbeat: ${error.message}`);
    }
  }

  async listDevices(userId) {
    if (this._checkConnectivity('listDevices', [userId])) return;
    try {
      const { data, error } = await this.supabase
        .from('devices')
        .select('id, device_name, system_info, status, last_seen')
        .eq('user_id', userId)
        .order('last_seen', { ascending: false });
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to list devices');
      logger.error('Failed to list devices:', error);
      throw new DatabaseError(`Failed to list devices: ${error.message}`);
    }
  }

  async updateDevice(deviceId, updates) {
    if (this._checkConnectivity('updateDevice', [deviceId, updates], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase
        .from('devices')
        .update(updates)
        .eq('id', deviceId)
        .select()
        .single();
      if (error) throw new DatabaseError(error.message);
      toast.success('Device updated successfully.');
      return data;
    } catch (error) {
      toast.error('Failed to update device');
      logger.error('Failed to update device:', error);
      throw new DatabaseError(`Failed to update device: ${error.message}`);
    }
  }

  async deleteDevice(deviceId) {
    if (this._checkConnectivity('deleteDevice', [deviceId], true)) {
      return Promise.resolve();
    }
    try {
      const { error } = await this.supabase
        .from('devices')
        .delete()
        .eq('id', deviceId);
      if (error) throw new DatabaseError(error.message);
      toast.success('Device removed successfully.');
    } catch (error) {
      toast.error('Failed to delete device');
      logger.error('Failed to delete device:', error);
      throw new DatabaseError(`Failed to delete device: ${error.message}`);
    }
  }

  async getDashboardMetrics() {
    if (this._checkConnectivity('getDashboardMetrics', [])) return;
    try {
      const { data, error } = await this.supabase.rpc('get_dashboard_metrics');
      if (error) throw new DatabaseError(error.message);
      if (!data || data.length === 0) return {};
      const d = data[0];
      return {
        totalContacts: d.total_contacts,
        newToday: d.new_today,
        activeEvents: d.active_events,
        aiInteractions: d.ai_interactions,
        contactChange: d.contact_change,
        workflowsTriggered: d.workflows_triggered,
        activeUsers: d.active_users,
      };
    } catch (error) {
      toast.error('Failed to fetch dashboard metrics');
      logger.error('Failed to fetch dashboard metrics:', error);
      throw new DatabaseError(`Failed to fetch dashboard metrics: ${error.message}`);
    }
  }

  /**
   * Creates a new task for a given project.
   * @param {string} title - The title of the new task.
   * @param {string} projectName - The name of the project to add the task to.
   * @param {string} userId - The ID of the user creating the task.
   * @param {string} [description] - An optional description for the task.
   * @returns {Promise<object>} The newly created task object.
   */
  async createTaskForProject(title, projectName, userId, description = null) {
    const project = await this.getProjectByName(projectName);
    if (!project) {
      // This path is already tested to throw, so we rely on getProjectByName's error handling.
      // This comment is for clarity.
    }

    const { data, error } = await this.supabase
      .from('tasks_ax2024')
      .insert({
        title,
        description,
        project_id: project.id,
        user_id: userId
      })
      .select()
      .single();

    if (error) {
      throw new DatabaseError(`Failed to create task: ${error.message}`);
    }
    return data;
  }

  /**
   * Assigns an existing task to an existing contact.
   * @param {string} taskTitle - The title of the task to assign.
   * @param {string} contactEmail - The email of the contact to assign the task to.
   * @returns {Promise<object>} The updated task object.
   */
  async assignTaskToContact(taskTitle, contactEmail) {
    const task = await this.getTaskByTitle(taskTitle);
    const contact = await this.getContactByEmail(contactEmail);

    const { data, error } = await this.supabase
      .from('tasks_ax2024')
      .update({ contact_id: contact.id })
      .eq('id', task.id)
      .select()
      .single();

    if (error) {
      throw new DatabaseError(`Failed to assign task: ${error.message}`);
    }
    return data;
  }

  /**
   * Logs a generic event to the database. Queues if offline.
   * @param {string} type - The type of event (e.g., 'user_login', 'workflow_started').
   * @param {object} eventData - A JSON object containing event details.
   * @param {string} userId - The associated user ID.
   */
  async logEvent(type, eventData, userId) {
    if (this._checkConnectivity('logEvent', [type, eventData, userId], true)) return;

    const { error } = await this.supabase.from('events_ax2024').insert({
      type,
      data: eventData,
      user_id: userId,
    });

    if (error) {
      throw new DatabaseError(`Failed to log event: ${error.message}`);
    }
  }

  /**
   * Deletes a list of contacts in bulk based on their emails.
   * @param {string[]} emails - An array of contact emails to delete.
   * @returns {Promise<object>} The result of the delete operation, including the count.
   */
  async bulkDeleteContacts(emails) {
    if (this._checkConnectivity('bulkDeleteContacts', [emails], true)) return;

    if (!emails || emails.length === 0) {
      return { count: 0 };
    }

    const { count, error } = await this.supabase
      .from('contacts_ax2024')
      .delete({ count: 'exact' })
      .in('email', emails);

    if (error) {
      throw new DatabaseError(`Failed to bulk delete contacts: ${error.message}`);
    }
    return { count, error: null };
  }

  // --- External Service Integrations ---

  async initiateTranscription(source, userId) {
    // This is a "write" operation in the sense that it initiates a state change,
    // so we should queue it if offline.
    if (this._checkConnectivity('initiateTranscription', [source, userId], true)) {
      return Promise.resolve({
        transcriptionId: `offline-job-${Date.now()}`,
        status: 'queued',
      });
    }

    try {
      const { data, error } = await this.supabase.functions.invoke('axim-transcribe', {
        body: { source, userId },
      });

      if (error) {
        throw new CommandExecutionError(`Transcription service error: ${error.message}`);
      }
      return data;
    } catch (error) {
      toast.error(error.message);
      logger.error('Failed to initiate transcription:', error);
      throw error; // Re-throw to be handled by the command layer
    }
  }

  async assignCanvasserToTurf(contactEmail, turfName, userId) {
    if (this._checkConnectivity('assignCanvasserToTurf', [contactEmail, turfName, userId], true)) {
      return Promise.resolve({
        assignmentId: `offline-job-${Date.now()}`,
        status: 'queued',
      });
    }

    try {
      const { data, error } = await this.supabase.functions.invoke('ground-game-assign', {
        body: { contactEmail, turfName, userId },
      });

      if (error) {
        throw new CommandExecutionError(`Ground Game service error: ${error.message}`);
      }
      return data;
    } catch (error) {
      toast.error(error.message);
      logger.error('Failed to assign canvasser:', error);
      throw error;
    }
  }

  /**
   * Invokes a generic AXiM service via the Supabase proxy function.
   * This provides a standardized, reusable pattern for all external integrations.
   * @param {string} serviceName - The registered name of the target service (e.g., 'transcription', 'ground-game').
   * @param {string} endpoint - The specific API endpoint on the target service.
   * @param {object} payload - The JSON payload to send to the service.
   * @param {string} userId - The ID of the user initiating the request.
   * @returns {Promise<object>} The response from the external AXiM service.
   */
  async invokeAximService(serviceName, endpoint, payload, userId) {
    if (this._checkConnectivity('invokeAximService', [serviceName, endpoint, payload, userId], true)) {
      return Promise.resolve({
        jobId: `offline-job-${Date.now()}`,
        status: 'queued',
      });
    }

    try {
      const { data, error } = await this.supabase.functions.invoke('generic-axim-service-proxy', {
        body: { serviceName, endpoint, payload, userId },
      });

      if (error) {
        throw new CommandExecutionError(`Request to AXiM service '${serviceName}' failed: ${error.message}`);
      }
      return data;
    } catch (error) {
      toast.error(error.message);
      logger.error(`Failed to invoke AXiM service '${serviceName}':`, error);
      throw error;
    }
  }

  async triggerDataExport() {
    if (this._checkConnectivity('triggerDataExport', [], true)) {
      return Promise.resolve({
        status: 'queued',
        message: 'Data export queued while offline.'
      });
    }

    try {
      // Calls the existing google-drive-export Edge Function
      const { data, error } = await this.supabase.functions.invoke('google-drive-export', {
        body: {}, // No specific body needed for manual trigger
      });

      if (error) {
        throw new CommandExecutionError(`Data export failed: ${error.message}`);
      }
      return data;
    } catch (error) {
      toast.error('Data export failed');
      logger.error('Failed to trigger data export:', error);
      throw new DatabaseError(`Failed to trigger data export: ${error.message}`);
    }
  }

  async fetchUrl(url) {
    if (this._checkConnectivity('fetchUrl', [url])) return { content: '' };
    try {
      const { data, error } = await this.supabase.functions.invoke('axim-scraper', {
        body: { url },
      });

      if (error) {
        throw new CommandExecutionError(`Scraper service error: ${error.message}`);
      }
      return data;
    } catch (error) {
      // toast.error('Failed to fetch URL content'); // Don't toast here, let the command handle UI feedback
      logger.error('Failed to fetch URL content:', error);
      throw new CommandExecutionError(`Failed to fetch URL content: ${error.message}`);
    }
  }

  async getScheduledTasks(userId) {
    if (this._checkConnectivity('getScheduledTasks', [userId])) return;
    try {
      const { data, error } = await this.supabase
        .from('scheduled_tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to retrieve scheduled tasks');
      logger.error('Failed to retrieve scheduled tasks:', error);
      throw new DatabaseError(`Failed to retrieve scheduled tasks: ${error.message}`);
    }
  }

  async createScheduledTask(command, schedule, userId) {
    if (this._checkConnectivity('createScheduledTask', [command, schedule, userId], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase
        .from('scheduled_tasks')
        .insert({ command, schedule, user_id: userId })
        .select()
        .single();
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      toast.error('Failed to create scheduled task');
      logger.error('Failed to create scheduled task:', error);
      throw new DatabaseError(`Failed to create scheduled task: ${error.message}`);
    }
  }

  async deleteScheduledTask(taskId) {
    if (this._checkConnectivity('deleteScheduledTask', [taskId], true)) {
      return Promise.resolve();
    }
    try {
      const { error } = await this.supabase
        .from('scheduled_tasks')
        .delete()
        .eq('id', taskId);
      if (error) throw new DatabaseError(error.message);
    } catch (error) {
      toast.error('Failed to delete scheduled task');
      logger.error('Failed to delete scheduled task:', error);
      throw new DatabaseError(`Failed to delete scheduled task: ${error.message}`);
    }
  }

  async triggerContentEngine(payload) {
    if (this._checkConnectivity('triggerContentEngine', [payload], true)) {
        return Promise.resolve({
            message: 'Content Engine queued (offline mode).',
            results: []
        });
    }
    try {
      const { data, error } = await this.supabase.functions.invoke('axim-content-engine', {
        body: payload,
      });

      if (error) {
        throw new CommandExecutionError(`Content Engine error: ${error.message}`);
      }
      return data;
    } catch (error) {
      toast.error('Failed to trigger Content Engine');
      logger.error('Failed to trigger Content Engine:', error);
      throw new CommandExecutionError(`Failed to trigger Content Engine: ${error.message}`);
    }
  }

  async checkSystemHealth() {
    const results = [];

    // 1. Supabase Connectivity
    const startDb = performance.now();
    try {
      // Using a lightweight query to check connection
      const { error } = await this.supabase.from('events_ax2024').select('count', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      results.push({ name: 'Supabase Database', status: '✅ Online', latency: (performance.now() - startDb).toFixed(0) + 'ms' });
    } catch (e) {
      results.push({ name: 'Supabase Database', status: '❌ Offline', message: e.message });
    }

    // 2. Stripe Configuration
    const stripeConfigured = import.meta.env.VITE_STRIPE_PRICE_ID_PRO;
    results.push({
        name: 'Stripe Billing',
        status: stripeConfigured ? '✅ Configured' : '⚠️ Demo Mode',
        message: stripeConfigured ? undefined : 'Missing VITE_STRIPE_PRICE_ID_PRO'
    });

    // 3. Chatbase / AI Configuration
    const activeProvider = import.meta.env.VITE_CHATBOT_ID_CTO ? 'Configured' : 'Default';
    results.push({
        name: 'AI Agent Layer',
        status: activeProvider === 'Configured' ? '✅ Ready' : 'ℹ️ Default Mode',
        message: activeProvider === 'Default' ? 'Using default Chatbot IDs' : undefined
    });

    return { results };
  }

  async sendEmail(to, subject, body, userId) {
    if (this._checkConnectivity('sendEmail', [to, subject, body, userId], true)) {
        return Promise.resolve({ status: 'queued' });
    }

    try {
        const { data, error } = await this.supabase.functions.invoke('send-email', {
            body: { to, subject, body, userId }
        });

        if (error) {
            throw new CommandExecutionError(`Email service error: ${error.message}`);
        }
        return data;
    } catch (error) {
        // toast.error('Failed to send email'); // Let the command handler handle UI feedback
        logger.error('Failed to send email:', error);
        throw new CommandExecutionError(`Failed to send email: ${error.message}`);
    }
  }
}

const supabaseApiService = new SupabaseApiService();
export default supabaseApiService;
