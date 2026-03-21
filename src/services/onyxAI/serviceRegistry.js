import api from './api';

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
    // We catch errors to ensure the default services are still available even if the DB fetch fails.
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
        // Suppress warning if it's just that the API isn't ready/mock mode
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
