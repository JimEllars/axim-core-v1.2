import { useState, useEffect } from 'react';
import { julesApi } from '../services/jules/julesApi';

export const useJulesSession = (sessionId) => {
  const [session, setSession] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setState(null);
      setError(null);
      return;
    }

    let intervalId;
    let isMounted = true;

    const pollSession = async () => {
      try {
        const data = await julesApi.getSession(sessionId);
        if (isMounted) {
          setSession(data);
          setState(data.state || data.status);

          if (data.state === 'COMPLETED' || data.state === 'FAILED' || data.status === 'COMPLETED' || data.status === 'FAILED') {
            if (intervalId) {
              clearInterval(intervalId);
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err);
          if (intervalId) {
            clearInterval(intervalId);
          }
        }
      }
    };

    // Initial fetch
    pollSession();

    intervalId = setInterval(pollSession, 10000);

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [sessionId]);

  return { session, state, error };
};
