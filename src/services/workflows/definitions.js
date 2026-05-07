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
        action: async (context) => {
          const isPolitical = context.eventData?.domain === 'ellars_political' ||
                              context.eventData?.metadata?.domain === 'ellars_political' ||
                              JSON.stringify(context.eventData).includes('political');

          const domainContext = isPolitical ? 'ellars_political' : 'axim_systems';
          const title = context.eventData?.title || 'a live session';

          const res = await api.invokeAximService(
            'onyx-bridge',
            '',
            {
              prompt: `The Founder has just gone live on video for ${title}. Draft a concise, engaging social media post announcing 'We are live right now!' and invite the audience to join. Keep it professional but urgent. Adopt the persona for domain: ${domainContext}`,
              options: { domain_context: domainContext }
            },
            context.userId
          );
          return { message: "Drafted announcement", data: res };
        }
      },
      {
        name: "Push to HITL Approval Queue",
        type: "query_database",
        action: async (context) => {
          const draftData = context['Draft Live Stream Announcement']?.data || {};
          const draft = draftData.response || draftData.text || draftData.content || "We are live right now! Join us.";
          const watchUrl = context.eventData?.watchUrl || context.eventData?.url || "https://axim.us.com/live";

          const fullPost = `${draft}\n\nWatch here: ${watchUrl}`;

          await api.supabaseApiService.supabase.from('hitl_audit_logs').insert({
            action: 'omnichannel_broadcast',
            status: 'pending',
            timestamp: new Date().toISOString(),
            tool_called: JSON.stringify({
              action: 'post_to_socials',
              description: "Approve this drafted social media post for the current live stream.",
              content: fullPost
            })
          });

          return { message: "Pushed drafted post to HITL approval queue." };
        }
      }
    ]
  }
};
