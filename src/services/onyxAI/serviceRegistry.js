import api from './api';
import { listTools } from '../mcp/mcpClient';
import { supabase } from '../supabaseClient';

class ServiceRegistry {
  constructor() {
    this.services = new Map();
  }

  async initialize() {
    // 1. Load default services
    this.register('transcribe', {
      name: 'transcribe',
      type: 'internal_function',
      endpoint: 'axim-transcribe',
      description: 'AXiM Audio Transcription Service'
    });

    this.register('ground-game', {
      name: 'ground-game',
      type: 'internal_function',
      endpoint: 'ground-game-assign',
      description: 'Ground Game Canvassing Assignment'
    });

    this.register('foreman-os', {
      name: 'foreman-os',
      type: 'external_app',
      endpoint: 'foreman-os-proxy',
      description: 'ForemanOS Project Management'
    });

    // 2. Fetch dynamic integrations from DB
    try {
      const integrations = await api.listAPIIntegrations();
      if (integrations) {
        integrations.forEach(integration => {
          const key = integration.name.toLowerCase().replace(/\s+/g, '-');
          this.register(key, {
            name: integration.name,
            type: integration.type,
            endpoint: integration.base_url,
            description: 'Dynamic Integration'
          });
        });
      }
    } catch (e) {
      console.warn("Could not load dynamic integrations", e);
    }

    // 3. Fetch MCP Tools
    await this.loadMcpTools();
  }

  async loadMcpTools() {
    try {
      const mcpServers = await supabase
        .from('ecosystem_connections')
        .select('*')
        .eq('protocol', 'mcp');

      if (mcpServers.data && mcpServers.data.length > 0) {
        for (const server of mcpServers.data) {
          try {
            const token = server.auth_token;
            const tools = await listTools(server.base_url, token);

            tools.forEach(tool => {
              const key = `mcp:${server.name}:${tool.name}`.toLowerCase().replace(/\s+/g, '-');
              this.register(key, {
                name: tool.name,
                type: 'mcp_tool',
                endpoint: server.base_url,
                description: tool.description,
                inputSchema: tool.inputSchema,
                serverToken: token
              });
            });
          } catch (toolError) {
             console.warn(`Could not load tools from MCP server ${server.name}`, toolError);
          }
        }
      }
    } catch (e) {
       console.warn("Could not load MCP tools", e);
    }
  }

  register(key, serviceDefinition) {
    this.services.set(key, serviceDefinition);
  }

  getService(key) {
    return this.services.get(key);
  }

  getAllServices() {
    return Array.from(this.services.values());
  }
}

export default new ServiceRegistry();
