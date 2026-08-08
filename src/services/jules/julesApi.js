import { apiProxy } from '../apiProxy';

export const julesApi = {
  createSession: async (prompt, branchName) => {
    try {
      const payload = {
        sourceContext: {
          githubRepoContext: {
            startingBranch: branchName
          }
        },
        automationMode: 'AUTO_CREATE_PR',
        prompt: prompt
      };
      const response = await apiProxy.post('/jules/sessions', payload);
      return response;
    } catch (error) {
      console.error('Error creating Jules session:', error);
      throw error;
    }
  },

  getSession: async (sessionId) => {
    try {
      const response = await apiProxy.get(`/jules/sessions/${sessionId}`);
      return response;
    } catch (error) {
      console.error('Error fetching Jules session:', error);
      throw error;
    }
  },

  approvePlan: async (sessionId) => {
    try {
      const response = await apiProxy.post(`/jules/sessions/${sessionId}:approvePlan`, {});
      return true;
    } catch (error) {
      console.error('Error approving Jules plan:', error);
      return false;
    }
  },

  listActivities: async (sessionId) => {
    try {
      const response = await apiProxy.get(`/jules/sessions/${sessionId}/activities`);
      return response;
    } catch (error) {
      console.error('Error fetching Jules activities:', error);
      throw error;
    }
  },

  sendMessage: async (sessionId, prompt) => {
    try {
      const response = await apiProxy.post(`/jules/sessions/${sessionId}:sendMessage`, { prompt });
      return response;
    } catch (error) {
      console.error('Error sending message to Jules:', error);
      throw error;
    }
  },

  listSessions: async (pageSize = 30) => {
    try {
      const response = await apiProxy.get(`/jules/sessions?pageSize=${pageSize}`);
      return response.sessions || [];
    } catch (error) {
      console.error('Error fetching Jules sessions:', error);
      return [];
    }
  }
};