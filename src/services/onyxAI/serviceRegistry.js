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

    const CORE_API_URL = import.meta.env.VITE_SUPABASE_URL || '';
    this.register('mcp:robotics-lab', {
      id: "mcp:robotics-lab",
      name: "AXiM Robotics Lab MCP Gateway",
      url: `${CORE_API_URL}/api/v1/robotics`,
      tier: "hardware_lab"
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
    await this.loadEcosystemNodes();

    // 4. Ensure axim-core-mcp is registered if not dynamically loaded
    if (!this.getService('mcp:axim-core-mcp')) {
      this.register('mcp:axim-core-mcp', {
        name: 'axim-core-mcp',
        type: 'mcp_tool',
        endpoint: 'https://api.axim.us.com/mcp',
        description: 'AXiM Core MCP Bridge Ecosystem Gateway'
      });
    }
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


  async loadEcosystemNodes() {
    try {
      const { data: nodes, error } = await supabase
        .from('ecosystem_nodes')
        .select('*')
        .eq('status', 'online');

      if (!error && nodes) {
        this.registerEcosystemNodes(nodes);
      }
    } catch (e) {
      console.warn("Could not load ecosystem nodes", e);
    }
  }

  registerEcosystemNodes(nodes) {
    if (!nodes || !Array.isArray(nodes)) return;
    nodes.forEach(node => {
      if (node.mcp_endpoint) {
        const key = `mcp:${node.name}`.toLowerCase().replace(/\s+/g, '-');
        this.register(key, {
          name: node.name,
          type: 'mcp_tool',
          endpoint: node.mcp_endpoint,
          description: `Dynamically registered MCP node: ${node.name}`
        });
      }
    });
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
