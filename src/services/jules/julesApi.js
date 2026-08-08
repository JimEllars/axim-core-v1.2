const BASE_URL = 'https://jules.googleapis.com/v1alpha';

export const julesApi = {
  createSession: async (prompt, branchName) => {
    try {
      const response = await fetch(`${BASE_URL}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceContext: {
            githubRepoContext: {
              startingBranch: branchName
            }
          },
          automationMode: 'AUTO_CREATE_PR',
          prompt: prompt
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create Jules session: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating Jules session:', error);
      throw error;
    }
  },

  getSession: async (sessionId) => {
    try {
      const response = await fetch(`${BASE_URL}/sessions/${sessionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Jules session: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching Jules session:', error);
      throw error;
    }
  }
};
