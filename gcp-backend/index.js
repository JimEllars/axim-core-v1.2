// gcp-backend/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import apiService from './apiService.js';
import scheduler from './scheduler.js';
import { JURISDICTIONS, MICRO_APPS } from './legalConstants.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set.');
  process.exit(1);
}
const SATELLITE_TOKEN_EXPIRY = '24h';

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Albato Authentication Middleware
const authenticateApiKey = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('Albato Auth Failed: Missing or invalid Authorization header');
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const apiKey = authHeader.split(' ')[1];
  const userId = await apiService.verifyApiKey(apiKey);

  if (!userId) {
    console.warn('Albato Auth Failed: Invalid API Key');
    return res.status(401).json({ error: 'Invalid API Key' });
  }

  req.user = { id: userId };
  next();
};

// Satellite JWT Verification Middleware
const authenticateSatellite = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  try {
    req.satellite = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('AXiM Core GCP Backend is running.');
});

// === API Endpoints ===

/**
 * AUTHORIZATION PATTERN:
 * 1. Apply `authenticateApiKey` middleware to establish req.user.id
 * 2. Check for required userId parameter (returns 400 if missing)
 * 3. Compare userId !== req.user.id (returns 403 if mismatch) - BEFORE processing
 */


// --- Contacts ---

// Add a new contact
app.post('/contacts', authenticateApiKey, async (req, res) => {
  try {
    const { name, email, source, userId, id } = req.body;
    if (!name || !email || !userId) {
      return res.status(400).json({ error: 'Missing required fields: name, email, userId' });
    }

    // Ensure the authenticated user matches the requested user ID
    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot create contact for another user' });
    }
    const newContact = await apiService.addContact(name, email, source, userId, id);
    res.status(201).json(newContact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search AI Memory (Vector Search)
app.post('/interactions/memory', authenticateApiKey, async (req, res) => {
  try {
    const { embedding, limit, userId } = req.body;
    if (!userId || !embedding) {
      return res.status(400).json({ error: 'Missing required fields: userId, embedding' });
    }

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    const results = await apiService.searchMemory(embedding, limit || 5, userId);
    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/devices/:id/heartbeat', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { system_info } = req.body;
    const device = await apiService.sendDeviceHeartbeat(id, system_info);
    res.json(device);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Project Management ---

app.post('/projects', authenticateApiKey, async (req, res) => {
  try {
    const { name, description, userId } = req.body;
    if (!name || !userId) return res.status(400).json({ error: 'name and userId required' });

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    const project = await apiService.createProject(name, description, userId);
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/projects', authenticateApiKey, async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    const projects = await apiService.listProjects(userId);
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/tasks', authenticateApiKey, async (req, res) => {
  try {
    const { title, projectId, userId } = req.body;
    if (!title || !projectId || !userId) return res.status(400).json({ error: 'title, projectId, and userId required' });

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    const task = await apiService.createTask(title, projectId, userId);
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/projects/:id/tasks', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const tasks = await apiService.listTasks(id);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/tasks/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { updates } = req.body;
    if (!updates) return res.status(400).json({ error: 'updates required' });
    const task = await apiService.updateTask(id, updates);
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all contacts for a user
app.get('/contacts', authenticateApiKey, async (req, res) => {
  try {
    const { userId, sortBy, sortOrder, ...otherParams } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'Missing required query parameter: userId' });
    }

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }

    const options = {
      sortBy,
      sortOrder,
      filter: {}
    };

    const allowedFilterColumns = ['source', 'name', 'email'];
    allowedFilterColumns.forEach(key => {
      if (otherParams[key]) {
        options.filter[key] = otherParams[key];
      }
    });

    const contacts = await apiService.listAllContacts(userId, options);
    res.status(200).json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Enhanced Contacts Routes ---

app.get('/contacts/search', authenticateApiKey, async (req, res) => {
    try {
        const { q, userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required' });

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
        const contacts = await apiService.getContacts(q || '', userId);
        res.json(contacts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/contacts/email/:email', authenticateApiKey, async (req, res) => {
    try {
        const { email } = req.params;
        const contact = await apiService.getContactByEmail(email);
        if (!contact) return res.status(404).json({ error: 'Contact not found' });
        res.json(contact);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update contact by ID
app.patch('/contacts/:id', authenticateApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const { updates, userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
        const contact = await apiService.updateContactById(id, updates, userId);
        res.json(contact);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete contact by ID
app.delete('/contacts/:id', authenticateApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
        await apiService.deleteContactById(id, userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete contact by Email
app.delete('/contacts/email/:email', authenticateApiKey, async (req, res) => {
  try {
    const { email } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing required field in body: userId' });
    }

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    const deletedContact = await apiService.deleteContact(email, userId);
    res.status(200).json(deletedContact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Notes Routes ---

app.post('/contacts/:id/notes', authenticateApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const { content, userId } = req.body;
        if (!content || !userId) return res.status(400).json({ error: 'content and userId required' });

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
        const note = await apiService.createNote(id, content, userId);
        res.status(201).json(note);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/contacts/:id/notes', authenticateApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const notes = await apiService.getNotesForContact(id);
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/notes/:id', authenticateApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        await apiService.deleteNote(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- AI Interactions ---

// Log an AI interaction
app.post('/interactions', authenticateApiKey, async (req, res) => {
  try {
    const { command, response, executionTime, status, userId, conversationId, commandType, llmProvider, llmModel, embedding } = req.body;
    if (!userId || !command) {
      return res.status(400).json({ error: 'Missing required fields: userId, command' });
    }

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    const newInteraction = await apiService.logAIInteraction(command, response, executionTime, status, userId, conversationId, commandType, llmProvider, llmModel, embedding);
    res.status(201).json(newInteraction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chat history
app.get('/interactions/history', authenticateApiKey, async (req, res) => {
  try {
    const { userId, conversationId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'Missing required query parameter: userId' });
    }

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    const history = await apiService.getChatHistoryForUser(userId, conversationId);
    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search chat history
app.get('/interactions/search', authenticateApiKey, async (req, res) => {
  try {
    const { q, userId } = req.query;
    if (!userId || !q) {
      return res.status(400).json({ error: 'Missing required query parameters: userId, q' });
    }

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    const results = await apiService.searchChatHistory(q, userId);
    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Events ---

app.post('/events', authenticateApiKey, async (req, res) => {
  try {
    const { type, data, userId } = req.body;
    if (!type) {
      return res.status(400).json({ error: 'Missing required field: type' });
    }

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    const event = await apiService.logEvent(type, data, userId);
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Device Management ---

app.get('/devices', authenticateApiKey, async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    const devices = await apiService.listDevices(userId);
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/devices', authenticateApiKey, async (req, res) => {
  try {
    const { id, device_name, system_info, userId } = req.body;
    if (!id || !userId) return res.status(400).json({ error: 'id and userId required' });

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    const device = await apiService.registerDevice(id, device_name, system_info, userId);
    res.status(201).json(device);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/devices/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { updates, userId } = req.body;
    if (!updates || !userId) return res.status(400).json({ error: 'updates and userId required' });

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    const device = await apiService.updateDevice(id, updates, userId);
    res.json(device);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/devices/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    await apiService.deleteDevice(id, userId);
    res.status(200).json({ message: 'Device deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Metrics ---

app.get('/metrics/dashboard', authenticateApiKey, async (req, res) => {
  try {
    const metrics = await apiService.getDashboardMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Integrations Routes ---

app.get('/integrations', authenticateApiKey, async (req, res) => {
    try {
        const { stats } = req.query;
        if (stats === 'true') {
            const integrations = await apiService.getIntegrationsWithStats();
            return res.json(integrations);
        }
        const integrations = await apiService.listAPIIntegrations();
        res.json(integrations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/integrations/:id', authenticateApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        await apiService.deleteIntegration(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/integrations/transcribe', authenticateApiKey, async (req, res) => {
    try {
        const { source, userId } = req.body;

    if (userId && userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
        const result = await apiService.initiateTranscription(source, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/integrations/ground-game', authenticateApiKey, async (req, res) => {
    try {
        const { contactEmail, turfName, userId } = req.body;

    if (userId && userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
        const result = await apiService.assignCanvasserToTurf(contactEmail, turfName, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/integrations/invoke', authenticateApiKey, async (req, res) => {
    try {
        const { serviceName, endpoint, payload, userId } = req.body;

    if (userId && userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
        const result = await apiService.invokeAximService(serviceName, endpoint, payload, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Workflows Routes ---

app.get('/workflows', authenticateApiKey, async (req, res) => {
    try {
        const workflows = await apiService.getWorkflows();
        res.json(workflows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/workflows/log', authenticateApiKey, async (req, res) => {
    try {
        const { workflowName, data, userId } = req.body;

        if (userId && userId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
        }

        const effectiveUserId = userId || req.user.id;
        const result = await apiService.logWorkflowExecution(workflowName, data, effectiveUserId);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Albato Integration Routes ---

// Ingest Telemetry/Events
app.post('/api/v1/datasets/:name/ingest', authenticateApiKey, async (req, res) => {
  try {
    const { name } = req.params;

    // Normalize input: Albato can send { events: [...] } or just [...] or single object
    let eventList;
    if (Array.isArray(req.body)) {
        eventList = req.body;
    } else if (req.body && Array.isArray(req.body.events)) {
        eventList = req.body.events;
    } else if (req.body && typeof req.body === 'object') {
        // Treat single object as one event
        eventList = [req.body];
    } else {
        return res.status(400).json({ error: 'Invalid payload. Expected JSON object or array.' });
    }

    const result = await apiService.ingestDatasetEvents(name, eventList, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    console.error('Ingest Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Query Telemetry
app.get('/api/v1/datasets/:name/query', authenticateApiKey, async (req, res) => {
  try {
    const { name } = req.params;
    const { limit, offset, from, to } = req.query;

    const filters = {
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
        fromDate: from,
        toDate: to
    };

    const events = await apiService.queryDatasetEvents(name, filters, req.user.id);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Asset Status
app.patch('/api/v1/assets/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const asset = await apiService.updateAssetStatus(id, updates, req.user.id);
    if (!asset) {
        return res.status(404).json({ error: 'Asset not found or no changes made' });
    }
    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create Annotation
app.post('/api/v1/annotations', authenticateApiKey, async (req, res) => {
  try {
    const annotation = await apiService.createAnnotation(req.body, req.user.id);
    res.status(201).json(annotation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Control Infrastructure
app.put('/api/v1/control/:unit_id', authenticateApiKey, async (req, res) => {
  try {
    const { unit_id } = req.params;
    // Prompt says "urlEncoded parameters for direct commands".
    // But we are using express.json(). If they send urlencoded, we need app.use(express.urlencoded()).
    // However, Albato can send JSON. Let's assume JSON body with { command: ... } or query param?
    // "direct commands" might be the body.
    const command = req.body.command || req.query.command;

    if (!command) {
        return res.status(400).json({ error: 'Command required in body or query' });
    }

    const result = await apiService.controlInfrastructure(unit_id, command, req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Satellite Protocol Routes ---

// Handshake: Exchange App ID & Secret for a Satellite Token
app.post('/v1/handshake', async (req, res) => {
  try {
    const { app_id, app_secret } = req.body;
    if (!app_id || !app_secret) {
      return res.status(400).json({ error: 'app_id and app_secret required' });
    }

    const isValid = await apiService.verifySatelliteApp(app_id, app_secret);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Issue Satellite Token (JWT)
    const token = jwt.sign(
      { app_id, role: 'satellite' },
      JWT_SECRET,
      { expiresIn: SATELLITE_TOKEN_EXPIRY }
    );

    res.json({ token, expires_in: SATELLITE_TOKEN_EXPIRY });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pulse: Receive telemetry/events
app.post('/v1/pulse', authenticateSatellite, async (req, res) => {
  try {
    const { source, event, user_id, data, telemetry } = req.body;

    // Verify source matches token app_id (optional but recommended)
    if (source && source !== req.satellite.app_id) {
       console.warn(`Pulse source '${source}' does not match token app_id '${req.satellite.app_id}'`);
       // We might allow it if one token serves multiple services, but for now let's strict check or just log it.
    }

    // Log the pulse
    // Map standard pulse fields to DB columns
    // payload -> data
    // event_type -> event
    await apiService.logSatellitePulse(
        req.satellite.app_id,
        event || 'unknown',
        data || {},
        telemetry || {},
        user_id
    );

    // Return 202 Accepted (non-blocking processing implied)
    res.status(202).json({ status: 'received' });

  } catch (error) {
    console.error('Pulse Error:', error);
    res.status(500).json({ error: 'Internal Server Error processing pulse' });
  }
});

// --- Automations Routes ---

app.post('/automations', authenticateApiKey, async (req, res) => {
  try {
    const { command, schedule, userId } = req.body;
    if (!command || !schedule || !userId) {
      return res.status(400).json({ error: 'Missing required fields: command, schedule, userId' });
    }

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot create automation for another user' });
    }

    // Command usually needs to be stringified JSON
    const commandPayload = typeof command === 'object' ? JSON.stringify(command) : command;

    const newAutomation = await apiService.createAutomation(commandPayload, schedule, userId);

    // Refresh the scheduler so it picks up the new job immediately
    await scheduler.refreshScheduler();

    res.status(201).json(newAutomation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/automations', authenticateApiKey, async (req, res) => {
  try {
    const { userId } = req.query;
    if (userId && userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    const automations = await apiService.getActiveAutomations();
    res.json(automations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/automations/refresh', authenticateApiKey, async (req, res) => {
  try {
    const { userId } = req.body;
    if (userId && userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    await scheduler.refreshScheduler();
    res.json({ message: 'Scheduler refreshed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Micro Apps & API Side Door Routes ---

// Discovery API for partner micro apps
app.get('/capabilities', (req, res) => {
  res.json({
    status: 'active',
    version: '1.0',
    capabilities: Object.values(MICRO_APPS),
    features: ['document_generation', 'headless_api', 'whitelabeling']
  });
});

// Programmatic access to legal frameworks and state statutes
app.get('/jurisdictions', (req, res) => {
  res.json(JURISDICTIONS);
});

// Universal Billing Engine: Payment Intent
app.post('/payments/intent', authenticateApiKey, async (req, res) => {
  try {
    const { amount, currency, microAppId, userId } = req.body;

    if (userId && userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }

    // In a real implementation, this would interact with Stripe API
    // using the partner's pre-negotiated rates or bulk credits.
    console.log(`[Billing Engine] Partner ${req.user.id} requested intent for ${microAppId}: ${amount} ${currency}`);

    // Simulate successful intent creation
    const clientSecret = `pi_mock_${Date.now()}_secret_${crypto.randomBytes(8).toString('hex')}`;

    res.status(201).json({
      clientSecret,
      status: 'requires_payment_method',
      microAppId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Universal Billing Engine: Verification
app.post('/payments/verify', authenticateApiKey, async (req, res) => {
  try {
    const { paymentIntentId, userId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'paymentIntentId is required' });
    }

    if (userId && userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }

    console.log(`[Billing Engine] Partner ${req.user.id} verifying intent: ${paymentIntentId}`);

    // Simulate successful payment verification
    res.json({
      success: true,
      status: 'succeeded',
      paymentIntentId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// --- Email Routes ---

app.post('/email/send', authenticateApiKey, async (req, res) => {
  try {
    const { to, subject, body, userId } = req.body;
    if (!to || !subject || !body || !userId) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, body, userId' });
    }

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Cannot access data for another user' });
    }
    // Simulate email sending on GCP side as well
    console.log(`[GCP Email Service] User ${userId} sending email to ${to}`);
    // In real scenario: await emailProvider.send(...)

    res.status(200).json({
      success: true,
      message: `Email successfully sent to ${to} (GCP Backup)`,
      id: `gcp-mock-email-${Date.now()}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Users Routes ---

app.get('/users', authenticateApiKey, async (req, res) => {
    try {
        const users = await apiService.getUsers();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.patch('/users/:id/role', authenticateApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        const user = await apiService.updateUserRole(id, role);
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/users/:id', authenticateApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        await apiService.deleteUser(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/users/:id/profile', authenticateApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const profile = await apiService.getUserProfile(id);
        if (!profile) return res.status(404).json({ error: 'User not found' });
        res.json(profile);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start the server and initialize services
const startServer = async () => {
  try {
    await apiService.initialize();
    await scheduler.initScheduler();
    // In test environment, we might not want to listen automatically, or we want to export app for supertest
    // API Service initialization is still needed for routes to work if they rely on it (though we mock it in tests)
    if (process.env.NODE_ENV !== 'test') {
        app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
        });
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
