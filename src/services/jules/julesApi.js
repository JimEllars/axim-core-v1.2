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
  }
};