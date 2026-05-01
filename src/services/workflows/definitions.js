import api from "../onyxAI/api";

// We are migrating towards fully database-driven workflows.
// These local stubs serve as fallbacks or examples of hardcoded logic.
export const workflowDefinitions = {
  LIVE_STREAM_STARTED: {
    name: "Live Stream Omnichannel Broadcast",
    description: "Autonomously draft and push social media updates when a live stream begins.",
    steps: [
      {
        name: "Draft Live Stream Announcement",
        type: "api_call",
        config: {
          service: "onyx-bridge",
          endpoint: "",
          payload: {
            prompt: "The Founder has just gone live on video. Draft a concise, engaging social media post announcing 'We are live right now!' and invite the audience to join. Keep it professional but urgent.",
          }
        }
      },
      {
        name: "Push to HITL Approval Queue",
        type: "query_database",
        action: async (context) => {
          const draft = context.data?.response || context.data?.text || "We are live right now! Join us.";
          const watchUrl = context.data?.watchUrl || "https://axim.us.com/live"; // Fallback watch URL

          const fullPost = `${draft}\n\nWatch here: ${watchUrl}`;

          await api.supabaseApiService.supabase.from('hitl_audit_logs').insert({
            action_type: 'omnichannel_broadcast',
            entity_type: 'post',
            entity_id: context.workflowRunId,
            proposed_changes: { content: fullPost },
            status: 'pending'
          });

          return { message: "Pushed drafted post to HITL approval queue." };
        }
      }
    ]
  }
};
