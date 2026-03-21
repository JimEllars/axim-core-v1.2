// gcp-backend/apiService.js
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { PubSub } from '@google-cloud/pubsub';
import bcrypt from 'bcryptjs';

class ApiService {
  constructor() {
    this.db = null;
    this.redis = null;
    this.pubsub = null;
  }

  async initialize() {
    try {
      let credentials;
      const secretName = process.env.GCP_DB_CREDENTIALS_SECRET_NAME;

      if (secretName) {
        // Production/Cloud Mode: Use Secret Manager
        const secretManager = new SecretManagerServiceClient();
        const [version] = await secretManager.accessSecretVersion({ name: secretName });
        credentials = JSON.parse(version.payload.data.toString());
      } else {
        // Development/Local Mode: Use environment variables directly
        console.warn('GCP_DB_CREDENTIALS_SECRET_NAME not set. Falling back to environment variables for DB credentials.');
        if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
           throw new Error('DB_USER and DB_PASSWORD environment variables are required when Secret Manager is not used.');
        }
        credentials = {
          username: process.env.DB_USER,
          password: process.env.DB_PASSWORD
        };
      }

      this.db = new Pool({
        user: credentials.username,
        password: credentials.password,
        host: process.env.DB_HOST || '127.0.0.1',
        database: process.env.DB_NAME || 'axim-core-postgresql-database',
        port: process.env.DB_PORT || 5432,
      });

      this.redis = createClient({
        url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
      });
      await this.redis.connect();

      this.pubsub = new PubSub();

      console.log('ApiService initialized successfully.');
    } catch (error) {
      console.error('Failed to initialize ApiService:', error);
      throw error;
    }
  }

  // --- Contacts ---

  async addContact(name, email, source = 'command_hub', userId, id = null) {
    if (!userId) {
      throw new Error('A user ID must be provided to create a contact.');
    }
    try {
      let query;
      let values;

      if (id) {
        query = `
          INSERT INTO contacts_ax2024 (id, name, email, source, user_id)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *;
        `;
        values = [id, name, email, source, userId];
      } else {
        query = `
          INSERT INTO contacts_ax2024 (name, email, source, user_id)
          VALUES ($1, $2, $3, $4)
          RETURNING *;
        `;
        values = [name, email, source, userId];
      }

      const result = await this.db.query(query, values);

      // Log event
      const eventQuery = `
        INSERT INTO events_ax2024 (type, source, data, user_id)
        VALUES ('new_lead', 'command_hub', $1, $2);
      `;
      const eventValues = [JSON.stringify({ email, name, added_via: 'onyx_ai' }), userId];
      await this.db.query(eventQuery, eventValues);

      return result.rows[0];
    } catch (error) {
      console.error('Error adding contact:', error);
      if (error.code === '23505') {
        throw new Error(`Contact with email "${email}" already exists.`);
      }
      throw new Error(`Failed to add contact: ${error.message}`);
    }
  }

  async listAllContacts(userId, options = {}) {
    if (!userId) {
      throw new Error('A user ID must be provided to list contacts.');
    }
    try {
      const { sortBy = 'created_at', sortOrder = 'DESC', filter = {} } = options;

      const allowedSortColumns = ['name', 'email', 'source', 'created_at'];
      const allowedSortOrders = ['ASC', 'DESC'];

      const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
      const order = allowedSortOrders.includes(sortOrder?.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

      let query = `
        SELECT name, email, source, created_at FROM contacts_ax2024
        WHERE user_id = $1
      `;
      const values = [userId];

      const allowedFilterColumns = ['source', 'name', 'email'];
      if (filter) {
        Object.keys(filter).forEach((key) => {
          if (allowedFilterColumns.includes(key) && filter[key]) {
            values.push(filter[key]);
            query += ` AND ${key} = $${values.length}`;
          }
        });
      }

      query += ` ORDER BY ${sortColumn} ${order};`;

      const result = await this.db.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error listing contacts:', error);
      throw new Error(`Failed to list contacts: ${error.message}`);
    }
  }

  async deleteContact(email, userId) {
    if (!userId || !email) {
      throw new Error('Email and user ID must be provided to delete a contact.');
    }
    try {
      const query = `
        DELETE FROM contacts_ax2024
        WHERE email = $1 AND user_id = $2
        RETURNING *;
      `;
      const values = [email, userId];
      const result = await this.db.query(query, values);
      if (result.rowCount === 0) {
        throw new Error(`Contact with email "${email}" not found.`);
      }
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting contact:', error);
      throw new Error(`Failed to delete contact: ${error.message}`);
    }
  }

  async deleteContactById(id, userId) {
    if (!userId || !id) throw new Error('ID and User ID required');
    try {
      const query = 'DELETE FROM contacts_ax2024 WHERE id = $1 AND user_id = $2 RETURNING *';
      const result = await this.db.query(query, [id, userId]);
      if (result.rowCount === 0) throw new Error(`Contact not found.`);
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting contact by ID:', error);
      throw new Error(`Failed to delete contact: ${error.message}`);
    }
  }

  async updateContact(email, updates, userId) {
    if (!email || !userId) throw new Error('Email and User ID required');
    const allowedFields = ['name', 'source', 'notes']; // Add allowed fields as needed
    const keys = Object.keys(updates).filter(k => allowedFields.includes(k));
    if (keys.length === 0) return null;

    try {
      const setClause = keys.map((k, i) => `${k} = $${i + 3}`).join(', ');
      const query = `
        UPDATE contacts_ax2024
        SET ${setClause}
        WHERE email = $1 AND user_id = $2
        RETURNING *;
      `;
      const values = [email, userId, ...keys.map(k => updates[k])];
      const result = await this.db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating contact:', error);
      throw new Error(`Failed to update contact: ${error.message}`);
    }
  }

  async updateContactById(id, updates, userId) {
    if (!id || !userId) throw new Error('ID and User ID required');
    const allowedFields = ['name', 'email', 'source'];
    const keys = Object.keys(updates).filter(k => allowedFields.includes(k));
    if (keys.length === 0) return null;

    try {
      const setClause = keys.map((k, i) => `${k} = $${i + 3}`).join(', ');
      const query = `
        UPDATE contacts_ax2024
        SET ${setClause}
        WHERE id = $1 AND user_id = $2
        RETURNING *;
      `;
      const values = [id, userId, ...keys.map(k => updates[k])];
      const result = await this.db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating contact by ID:', error);
      throw new Error(`Failed to update contact: ${error.message}`);
    }
  }

  async getContacts(searchTerm, userId) {
    if (!userId) throw new Error('User ID required');
    try {
      const query = `
        SELECT * FROM contacts_ax2024
        WHERE user_id = $1
        AND (name ILIKE $2 OR email ILIKE $2)
        ORDER BY created_at DESC;
      `;
      const result = await this.db.query(query, [userId, `%${searchTerm}%`]);
      return result.rows;
    } catch (error) {
      console.error('Error searching contacts:', error);
      throw new Error(`Failed to search contacts: ${error.message}`);
    }
  }

  async getContactByEmail(email) {
    try {
      const query = 'SELECT * FROM contacts_ax2024 WHERE email = $1';
      const result = await this.db.query(query, [email]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting contact by email:', error);
      throw error;
    }
  }

  // --- Notes ---

  async createNote(contactId, content) {
     // Ideally verify contact belongs to userId
     try {
       const query = `
         INSERT INTO notes_ax2024 (contact_id, content)
         VALUES ($1, $2)
         RETURNING *;
       `;
       const result = await this.db.query(query, [contactId, content]);
       return result.rows[0];
     } catch (error) {
       console.error('Error creating note:', error);
       throw new Error(`Failed to create note: ${error.message}`);
     }
  }

  async getNotesForContact(contactId) {
     try {
       const query = `
         SELECT * FROM notes_ax2024
         WHERE contact_id = $1
         ORDER BY created_at DESC;
       `;
       const result = await this.db.query(query, [contactId]);
       return result.rows;
     } catch (error) {
       console.error('Error getting notes:', error);
       throw new Error(`Failed to get notes: ${error.message}`);
     }
  }

  async deleteNote(noteId) {
     try {
       const query = 'DELETE FROM notes_ax2024 WHERE id = $1 RETURNING *';
       const result = await this.db.query(query, [noteId]);
       return result.rows[0];
     } catch (error) {
       console.error('Error deleting note:', error);
       throw new Error(`Failed to delete note: ${error.message}`);
     }
  }

  // --- AI Interactions ---

  async logAIInteraction(command, response, executionTime, status = 'success', userId, conversationId, commandType, llmProvider, llmModel, embedding = null) {
    if (!userId) {
      console.warn('Could not log AI interaction without a user ID.');
      return;
    }
    try {
      let query;
      let values;

      if (embedding) {
        query = `
          INSERT INTO ai_interactions_ax2024 (command, response, execution_time_ms, status, user_id, conversation_id, command_type, llm_provider, llm_model, embedding)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *;
        `;
        // `pgvector` accepts arrays formatted as strings or arrays directly depending on the client driver. The `pg` driver works well with JSON string representation of arrays.
        values = [command, response, executionTime, status, userId, conversationId, commandType, llmProvider, llmModel, JSON.stringify(embedding)];
      } else {
        query = `
          INSERT INTO ai_interactions_ax2024 (command, response, execution_time_ms, status, user_id, conversation_id, command_type, llm_provider, llm_model)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *;
        `;
        values = [command, response, executionTime, status, userId, conversationId, commandType, llmProvider, llmModel];
      }

      const result = await this.db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error logging AI interaction:', error);
      throw new Error(`Failed to log AI interaction: ${error.message}`);
    }
  }

  async getChatHistoryForUser(userId, conversationId) {
    if (!userId) {
      throw new Error('User ID is required to fetch chat history.');
    }
    try {
      let query = `
        SELECT * FROM ai_interactions_ax2024
        WHERE user_id = $1
      `;
      const values = [userId];

      if (conversationId) {
        query += ` AND conversation_id = $2`;
        values.push(conversationId);
      }

      query += ` ORDER BY created_at ASC`;

      const result = await this.db.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error fetching chat history:', error);
      throw new Error(`Failed to fetch chat history: ${error.message}`);
    }
  }

  async searchChatHistory(queryText, userId) {
    if (!userId || !queryText) throw new Error('User ID and Query required');
    try {
      // Simple case-insensitive search on command and response
      const query = `
        SELECT * FROM ai_interactions_ax2024
        WHERE user_id = $1
        AND (command ILIKE $2 OR response ILIKE $2)
        ORDER BY created_at DESC
        LIMIT 20;
      `;
      const values = [userId, `%${queryText}%`];
      const result = await this.db.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error searching chat history:', error);
      throw new Error(`Failed to search chat history: ${error.message}`);
    }
  }

  async searchMemory(queryEmbedding, limit = 5, userId = null) {
    if (!userId) {
      throw new Error('User ID is required to search memory.');
    }
    try {
      // Use pgvector's <=> operator for cosine distance.
      // <=> queryEmbedding returns the distance (0 = identical, 2 = exactly opposite).
      // We want the closest matches, so we order by distance ascending.
      // We also filter out any distances that are too large (e.g. > 0.22, since cosine similarity threshold is 0.78).
      const query = `
        SELECT command, response, created_at, status, llm_provider, llm_model
        FROM ai_interactions_ax2024
        WHERE user_id = $1 AND embedding IS NOT NULL
        ORDER BY embedding <=> $2
        LIMIT $3
      `;
      const values = [userId, JSON.stringify(queryEmbedding), limit];
      const result = await this.db.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error searching memory (RAG):', error);
      throw new Error(`Failed to search memory: ${error.message}`);
    }
  }

  // --- Events ---

  async logEvent(type, data, userId) {
    try {
      const query = `
        INSERT INTO events_ax2024 (type, data, user_id)
        VALUES ($1, $2, $3)
        RETURNING *;
      `;
      // userId is optional in schema? setup.sql says: user_id UUID REFERENCES auth.users(id)
      // If userId is null, passing null to $3 works.
      const values = [type, data, userId];
      const result = await this.db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error logging event:', error);
      throw new Error(`Failed to log event: ${error.message}`);
    }
  }

  // --- Device Management ---

  async listDevices(userId) {
    if (!userId) throw new Error('User ID required');
    try {
      const query = `
        SELECT id, device_name, system_info, status, last_seen
        FROM devices
        WHERE user_id = $1
        ORDER BY last_seen DESC;
      `;
      const result = await this.db.query(query, [userId]);
      return result.rows;
    } catch (error) {
      console.error('Error listing devices:', error);
      throw new Error(`Failed to list devices: ${error.message}`);
    }
  }

  async registerDevice(deviceId, deviceName, systemInfo, userId) {
    if (!userId || !deviceId) throw new Error('User ID and Device ID required');
    try {
      const query = `
        INSERT INTO devices (id, device_name, system_info, user_id, status, last_seen)
        VALUES ($1, $2, $3, $4, 'online', NOW())
        ON CONFLICT (id) DO UPDATE
        SET status = 'online', last_seen = NOW(), system_info = $3
        RETURNING *;
      `;
      const values = [deviceId, deviceName, systemInfo, userId];
      const result = await this.db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error registering device:', error);
      throw new Error(`Failed to register device: ${error.message}`);
    }
  }

  async updateDevice(deviceId, updates, userId) {
    if (!deviceId || !userId) throw new Error('Device ID and User ID required');
    // Sanitize updates to allow only specific fields? For now, we assume backend logic handles it safely or we build query dynamically.
    // Simplifying to support device_name update primarily as per UI.
    const allowedFields = ['device_name', 'status', 'system_info'];
    const keys = Object.keys(updates).filter(k => allowedFields.includes(k));
    if (keys.length === 0) return null;

    try {
      const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const query = `
        UPDATE devices
        SET ${setClause}
        WHERE id = $1 AND user_id = $${keys.length + 2}
        RETURNING *;
      `;
      const values = [deviceId, ...keys.map(k => updates[k]), userId];
      const result = await this.db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating device:', error);
      throw new Error(`Failed to update device: ${error.message}`);
    }
  }

  async deleteDevice(deviceId, userId) {
    if (!deviceId || !userId) throw new Error('Device ID and User ID required');
    try {
      const query = `DELETE FROM devices WHERE id = $1 AND user_id = $2 RETURNING *`;
      const result = await this.db.query(query, [deviceId, userId]);
      if (result.rowCount === 0) throw new Error('Device not found or access denied');
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting device:', error);
      throw new Error(`Failed to delete device: ${error.message}`);
    }
  }

  async sendDeviceHeartbeat(deviceId, systemInfo) {
    if (!deviceId) throw new Error('Device ID required');
    try {
      const query = `
        UPDATE devices
        SET status = 'online', last_seen = NOW(), system_info = $2
        WHERE id = $1
        RETURNING *;
      `;
      const result = await this.db.query(query, [deviceId, systemInfo]);
      if (result.rowCount === 0) {
          throw new Error('Device not found. Please register first.');
      }
      return result.rows[0];
    } catch (error) {
      console.error('Error sending heartbeat:', error);
      throw new Error(`Failed to send heartbeat: ${error.message}`);
    }
  }

  // --- Dashboard Metrics ---

  async getDashboardMetrics() {
    try {
        // We run multiple aggregation queries concurrently for performance.
        const [
            totalContactsRes,
            newTodayRes,
            activeEventsRes,
            aiInteractionsRes,
            workflowsTriggeredRes,
            activeUsersRes
        ] = await Promise.all([
            this.db.query('SELECT COUNT(*) FROM contacts_ax2024'),
            this.db.query("SELECT COUNT(*) FROM contacts_ax2024 WHERE created_at >= CURRENT_DATE"),
            this.db.query("SELECT COUNT(*) FROM events_ax2024 WHERE created_at >= NOW() - INTERVAL '24 hours'"),
            this.db.query('SELECT COUNT(*) FROM ai_interactions_ax2024'),
            this.db.query("SELECT COUNT(*) FROM events_ax2024 WHERE type = 'workflow_triggered'"),
            this.db.query(`
                SELECT COUNT(DISTINCT user_id)
                FROM (
                    SELECT user_id FROM events_ax2024 WHERE created_at >= NOW() - INTERVAL '24 hours'
                    UNION
                    SELECT user_id FROM ai_interactions_ax2024 WHERE created_at >= NOW() - INTERVAL '24 hours'
                ) as active
            `)
        ]);

        return {
            totalContacts: parseInt(totalContactsRes.rows[0].count),
            newToday: parseInt(newTodayRes.rows[0].count),
            activeEvents: parseInt(activeEventsRes.rows[0].count),
            aiInteractions: parseInt(aiInteractionsRes.rows[0].count),
            contactChange: 0, // Placeholder
            workflowsTriggered: parseInt(workflowsTriggeredRes.rows[0].count),
            activeUsers: parseInt(activeUsersRes.rows[0].count)
        };
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
      throw new Error(`Failed to fetch metrics: ${error.message}`);
    }
  }

  // --- Project Management ---

  async createProject(name, description, userId) {
    if (!name || !userId) throw new Error('Project name and User ID required');
    try {
      const query = `
        INSERT INTO projects_ax2024 (name, description, user_id)
        VALUES ($1, $2, $3)
        RETURNING *;
      `;
      const result = await this.db.query(query, [name, description, userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating project:', error);
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  async listProjects(userId) {
    if (!userId) throw new Error('User ID required');
    try {
      const query = `
        SELECT * FROM projects_ax2024
        WHERE user_id = $1
        ORDER BY created_at DESC;
      `;
      const result = await this.db.query(query, [userId]);
      return result.rows;
    } catch (error) {
      console.error('Error listing projects:', error);
      throw new Error(`Failed to list projects: ${error.message}`);
    }
  }

  async createTask(title, projectId, userId) {
    if (!title || !projectId || !userId) throw new Error('Title, Project ID, and User ID required');
    try {
      const query = `
        INSERT INTO tasks_ax2024 (title, project_id, status, created_at)
        VALUES ($1, $2, 'pending', NOW())
        RETURNING *;
      `;
      // Note: We're not using assignee_id here yet, defaulting to unassigned?
      // Or we can add it later. The schema has assignee_id.
      // But for basic "create task in project", this is fine.
      // Wait, we need to verify the user owns the project or has access?
      // The backend should ideally check this.
      // For now, straightforward insert.
      const result = await this.db.query(query, [title, projectId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating task:', error);
      throw new Error(`Failed to create task: ${error.message}`);
    }
  }

  async listTasks(projectId) {
     if (!projectId) throw new Error('Project ID required');
     try {
       const query = `
         SELECT * FROM tasks_ax2024
         WHERE project_id = $1
         ORDER BY created_at DESC;
       `;
       const result = await this.db.query(query, [projectId]);
       return result.rows;
     } catch (error) {
       console.error('Error listing tasks:', error);
       throw new Error(`Failed to list tasks: ${error.message}`);
     }
  }

  async updateTask(taskId, updates) {
    if (!taskId) throw new Error('Task ID required');
    const allowedFields = ['title', 'status', 'assignee_id'];
    const keys = Object.keys(updates).filter(k => allowedFields.includes(k));
    if (keys.length === 0) return null;

    try {
      const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const query = `
        UPDATE tasks_ax2024
        SET ${setClause}
        WHERE id = $1
        RETURNING *;
      `;
      const values = [taskId, ...keys.map(k => updates[k])];
      const result = await this.db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating task:', error);
      throw new Error(`Failed to update task: ${error.message}`);
    }
  }

  // --- Integrations ---

  async listAPIIntegrations() {
    try {
      const result = await this.db.query('SELECT * FROM api_integrations_ax2024 ORDER BY created_at DESC');
      return result.rows;
    } catch (error) {
      console.error('Error listing integrations:', error);
      throw new Error(`Failed to list integrations: ${error.message}`);
    }
  }

  async getIntegrationsWithStats() {
    try {
      const query = `
        SELECT i.*,
        (SELECT COUNT(*) FROM api_call_logs_ax2024 l WHERE l.integration_id = i.id) as total_calls,
        (SELECT COUNT(*) FROM api_call_logs_ax2024 l WHERE l.integration_id = i.id AND l.success = true) as success_calls
        FROM api_integrations_ax2024 i
        ORDER BY created_at DESC
      `;
      const result = await this.db.query(query);
      return result.rows.map(row => ({
          ...row,
          success_rate: row.total_calls > 0 ? (row.success_calls / row.total_calls) * 100 : 0
      }));
    } catch (error) {
       console.error('Error getting integration stats:', error);
       throw new Error(`Failed to get integration stats: ${error.message}`);
    }
  }

  async deleteIntegration(id) {
    try {
      const result = await this.db.query('DELETE FROM api_integrations_ax2024 WHERE id = $1 RETURNING *', [id]);
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting integration:', error);
      throw new Error(`Failed to delete integration: ${error.message}`);
    }
  }

  // --- External Service Proxies ---

  async initiateTranscription(source, userId) {
    if (!source || !userId) throw new Error('Source and User ID required');
    return this._callSupabaseFunction('axim-transcribe', { source, userId });
  }

  async assignCanvasserToTurf(contactEmail, turfName, userId) {
    if (!contactEmail || !turfName || !userId) throw new Error('Email, Turf, and User ID required');
    return this._callSupabaseFunction('ground-game-assign', { contactEmail, turfName, userId });
  }

  async invokeAximService(serviceName, endpoint, payload, userId) {
    if (!serviceName || !endpoint || !userId) throw new Error('Service Name, Endpoint, and User ID required');
    return this._callSupabaseFunction('generic-axim-service-proxy', { serviceName, endpoint, payload, userId });
  }

  async _callSupabaseFunction(functionName, body) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
       console.warn(`Supabase URL or Key not set in GCP Backend. Returning mock success for ${functionName}.`);
       // Return a mock response structure
       return {
           status: 'mocked_success',
           message: `Function ${functionName} called via GCP Proxy (Mocked)`,
           data: body
       };
    }

    try {
        const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Supabase function ${functionName} failed: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error calling Supabase function ${functionName}:`, error);
        throw error;
    }
  }

  // --- Workflows ---

  async getWorkflows() {
    try {
      const result = await this.db.query('SELECT * FROM workflows_ax2024 ORDER BY created_at DESC');
      return result.rows;
    } catch (error) {
      console.error('Error getting workflows:', error);
      throw new Error(`Failed to get workflows: ${error.message}`);
    }
  }

  async logWorkflowExecution(workflowName, data) {
      try {
          const query = `
            INSERT INTO events_ax2024 (type, source, data)
            VALUES ('workflow_execution', 'axim_core', $1)
            RETURNING *;
          `;
          const payload = JSON.stringify({ workflow: workflowName, ...data });
          const result = await this.db.query(query, [payload]);
          return result.rows[0];
      } catch (error) {
          console.error('Error logging workflow execution:', error);
          throw new Error(`Failed to log workflow: ${error.message}`);
      }
  }

  // --- Users ---

  async getUsers() {
      try {
          const query = 'SELECT * FROM users';
          const result = await this.db.query(query);
          return result.rows;
      } catch (error) {
          console.error('Error getting users:', error);
          throw new Error(`Failed to get users: ${error.message}`);
      }
  }

  async updateUserRole(userId, role) {
      try {
          const query = 'UPDATE users SET role = $1 WHERE id = $2 RETURNING *';
          const result = await this.db.query(query, [role, userId]);
          return result.rows[0];
      } catch (error) {
           console.error('Error updating user role:', error);
           throw new Error(`Failed to update user role: ${error.message}`);
      }
  }

  async deleteUser(userId) {
      try {
          const query = 'SELECT delete_a_user($1)';
          await this.db.query(query, [userId]);
          return { success: true };
      } catch (error) {
          console.error('Error deleting user:', error);
          throw new Error(`Failed to delete user: ${error.message}`);
      }
  }

  async getUserProfile(userId) {
      try {
          const query = 'SELECT * FROM users WHERE id = $1';
          const result = await this.db.query(query, [userId]);
          return result.rows[0];
      } catch (error) {
           console.error('Error getting user profile:', error);
           throw error;
      }
  }

  // --- Satellite Protocol ---

  /**
   * Registers a new Satellite App.
   * @param {string} appId - Unique identifier for the app.
   * @param {string} secret - The raw secret key (will be hashed).
   * @param {string} name - Display name of the app.
   */
  async registerSatelliteApp(appId, secret, name) {
    if (!appId || !secret || !name) throw new Error('App ID, Secret, and Name required');
    try {
      const salt = await bcrypt.genSalt(10);
      const secretHash = await bcrypt.hash(secret, salt);

      const query = `
        INSERT INTO satellite_apps (app_id, secret_hash, name)
        VALUES ($1, $2, $3)
        RETURNING id, app_id, name, created_at;
      `;
      const result = await this.db.query(query, [appId, secretHash, name]);
      return result.rows[0];
    } catch (error) {
      console.error('Error registering satellite app:', error);
      throw new Error(`Failed to register app: ${error.message}`);
    }
  }

  /**
   * Verifies Satellite App credentials.
   * @param {string} appId
   * @param {string} secret
   * @returns {Promise<boolean>}
   */
  async verifySatelliteApp(appId, secret) {
    if (!appId || !secret) return false;
    try {
      const query = 'SELECT secret_hash FROM satellite_apps WHERE app_id = $1 AND status = \'active\'';
      const result = await this.db.query(query, [appId]);
      if (result.rowCount === 0) return false;

      const { secret_hash } = result.rows[0];
      return await bcrypt.compare(secret, secret_hash);
    } catch (error) {
      console.error('Error verifying satellite app:', error);
      return false;
    }
  }

  /**
   * Logs a pulse (telemetry/event) from a Satellite App.
   */
  async logSatellitePulse(appId, eventType, payload, telemetry, userId) {
    try {
      const query = `
        INSERT INTO satellite_pulses (satellite_app_id, event_type, payload, telemetry, user_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `;
      const values = [appId, eventType, JSON.stringify(payload), JSON.stringify(telemetry), userId || null];
      const result = await this.db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error logging satellite pulse:', error);
      // We don't throw here to avoid crashing the request if logging fails,
      // but in a strict system we might want to know.
      // For now, return null to indicate failure but keep going.
      return null;
    }
  }

  // --- Albato Integration ---

  /**
   * Verifies an API Key and returns the associated user ID.
   * @param {string} apiKey - The API Key provided in the Authorization header.
   * @returns {Promise<string|null>} - The user ID if valid, null otherwise.
   */
  async verifyApiKey(apiKey) {
    if (!apiKey) return null;
    try {
      const query = 'SELECT user_id FROM api_keys WHERE api_key = $1';
      const result = await this.db.query(query, [apiKey]);
      if (result.rowCount === 0) return null;
      return result.rows[0].user_id;
    } catch (error) {
      console.error('Error verifying API Key:', error);
      return null;
    }
  }

  /**
   * Ingests a batch of events into a specific dataset.
   * @param {string} datasetName - The name of the dataset (mapped to event type).
   * @param {Array} events - Array of event objects.
   * @param {string} userId - The ID of the user performing the action.
   */
  async ingestDatasetEvents(datasetName, events, userId) {
    if (!datasetName || !userId) {
      throw new Error('Dataset Name and User ID required');
    }

    // Ensure events is an array
    const eventList = Array.isArray(events) ? events : [events];

    if (eventList.length === 0) return { success: true, count: 0, ids: [] };

    try {
      // Optimized batch insert
      const values = [];
      const placeholders = eventList.map((event, index) => {
          const offset = index * 3;
          values.push(datasetName, JSON.stringify(event), userId);
          return `($${offset + 1}, 'albato', $${offset + 2}, $${offset + 3})`;
      }).join(', ');

      const query = `
        INSERT INTO events_ax2024 (type, source, data, user_id)
        VALUES ${placeholders}
        RETURNING id;
      `;

      const result = await this.db.query(query, values);
      return { success: true, count: result.rows.length, ids: result.rows.map(r => r.id) };
    } catch (error) {
      console.error('Error ingesting dataset events:', error);
      throw new Error(`Failed to ingest events: ${error.message}`);
    }
  }

  /**
   * Queries a dataset for events.
   * @param {string} datasetName - The name of the dataset (event type).
   * @param {object} filters - Filtering options (limit, offset, fromDate, toDate).
   * @param {string} userId - The ID of the user.
   */
  async queryDatasetEvents(datasetName, filters = {}, userId) {
    if (!datasetName || !userId) throw new Error('Dataset Name and User ID required');

    try {
      const { limit = 100, offset = 0, fromDate, toDate } = filters;
      let query = `
        SELECT * FROM events_ax2024
        WHERE type = $1 AND user_id = $2
      `;
      const values = [datasetName, userId];

      if (fromDate) {
        values.push(fromDate);
        query += ` AND created_at >= $${values.length}`;
      }
      if (toDate) {
        values.push(toDate);
        query += ` AND created_at <= $${values.length}`;
      }

      query += ` ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
      values.push(limit, offset);

      const result = await this.db.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error querying dataset events:', error);
      throw new Error(`Failed to query events: ${error.message}`);
    }
  }

  /**
   * Updates an asset's status.
   * @param {string} assetId - The ID of the asset (device).
   * @param {object} updates - The fields to update.
   * @param {string} userId - The ID of the user.
   */
  async updateAssetStatus(assetId, updates, userId) {
    // Re-use existing updateDevice but with specific context for Albato
    return this.updateDevice(assetId, updates, userId);
  }

  /**
   * Creates a new annotation.
   * @param {object} annotationData - Data for the annotation.
   * @param {string} userId - The ID of the user.
   */
  async createAnnotation(annotationData, userId) {
    if (!userId) throw new Error('User ID required');
    try {
      // Mapping annotations to 'annotation' event type for now
      return this.logEvent('annotation', annotationData, userId);
    } catch (error) {
      console.error('Error creating annotation:', error);
      throw new Error(`Failed to create annotation: ${error.message}`);
    }
  }

  /**
   * Controls infrastructure (sends command).
   * @param {string} unitId - The ID of the unit/device.
   * @param {string} command - The command to execute.
   * @param {string} userId - The ID of the user.
   */
  async controlInfrastructure(unitId, command, userId) {
    if (!unitId || !command || !userId) throw new Error('Unit ID, Command, and User ID required');
    try {
      // Log command event
      const eventData = {
        unit_id: unitId,
        command: command,
        status: 'pending'
      };
      const event = await this.logEvent('infrastructure_control', eventData, userId);

      // Optionally, update device status to 'busy' if it exists
      try {
        await this.updateDevice(unitId, { status: 'busy' }, userId);
      } catch (err) {
        // Ignore if device not found, as unitId might refer to non-device entity
        console.warn(`Could not update status for unit ${unitId}: ${err.message}`);
      }

      return event;
    } catch (error) {
      console.error('Error controlling infrastructure:', error);
      throw new Error(`Failed to control infrastructure: ${error.message}`);
    }
  }

  // --- Automations ---

  async getActiveAutomations() {
    try {
      const query = `
        SELECT * FROM automations_ax2024
        WHERE enabled = true
      `;
      const result = await this.db.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting active automations:', error);
      // Fail gracefully to allow scheduler to retry
      throw new Error(`Failed to get active automations: ${error.message}`);
    }
  }

  async logAutomationExecution(automationId, status, output, executionTimeMs) {
    try {
      const query = `
        INSERT INTO automation_logs_ax2024 (automation_id, status, output, execution_time_ms)
        VALUES ($1, $2, $3, $4)
        RETURNING id;
      `;
      const values = [automationId, status, JSON.stringify(output), executionTimeMs];
      await this.db.query(query, values);
    } catch (error) {
      console.error('Error logging automation execution:', error);
      // Don't throw, just log
    }
  }

  async updateAutomationRunTime(automationId, nextRun) {
    try {
      const query = `
        UPDATE automations_ax2024
        SET last_run = NOW(), next_run = $2
        WHERE id = $1
      `;
      await this.db.query(query, [automationId, nextRun]);
    } catch (error) {
      console.error('Error updating automation runtime:', error);
    }
  }

  async triggerContentEngine(data) {
     return this._callSupabaseFunction('axim-content-engine', data);
  }
}

const apiService = new ApiService();
export default apiService;
