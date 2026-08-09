import { useState, useEffect } from 'react';
import { julesApi } from '../services/jules/julesApi';
import { supabase } from '../services/supabaseClient';

export const useJulesSession = (sessionId) => {
  const [session, setSession] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [activities, setActivities] = useState([]);

  // Clear state when session ID changes to null, but outside useEffect
  if (!sessionId && (session !== null || state !== null || error !== null || activities.length !== 0)) {
    setSession(null);
    setState(null);
    setError(null);
    setActivities([]);
  }

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let intervalId;
    let isMounted = true;

    const pollSession = async () => {
      try {
        const [data, activitiesData] = await Promise.all([
          julesApi.getSession(sessionId),
          julesApi.listActivities(sessionId).catch(err => {
             console.error("Failed to fetch activities", err);
             return { activities: [] };
          })
        ]);

        if (isMounted) {
          setSession(data);
          setState(data.state || data.status);
          setActivities(activitiesData.activities || []);

          if ((data.state === 'AWAITING_PLAN_APPROVAL' || data.state === 'AWAITING_USER_FEEDBACK' || data.status === 'AWAITING_PLAN_APPROVAL' || data.status === 'AWAITING_USER_FEEDBACK') && isMounted) {
            // Check if log already exists
            const { data: existingLogs } = await supabase
              .from('hitl_audit_logs')
              .select('id')
              .eq('session_id', sessionId)
              .eq('status', 'pending');

            if (!existingLogs || existingLogs.length === 0) {
              await supabase.from('hitl_audit_logs').insert({
                action: 'jules_plan_approval',
                status: 'pending',
                session_id: sessionId,
                tool_called: JSON.stringify({ description: 'Business Development Agent requires authorization to proceed.' })
              });
            }
          }


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

  return { session, state, error, activities };
};
