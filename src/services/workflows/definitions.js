import api from "../onyxAI/api";

// We are migrating towards fully database-driven workflows.
// These local stubs serve as fallbacks or examples of hardcoded logic.
export const workflowDefinitions = {

  NEW_AFFILIATE_LEAD: {
    name: "Powur Lead Orchestration",
    description: "Handle new affiliate leads from Powur frontend.",
    steps: [
      {
        name: "Push Lead to CRM",
        type: "api_call",
        action: async (context) => {
          const res = await api.invokeAximService(
            'generic-axim-service-proxy',
            '/crm/push',
            {
              lead: {
                name: context.eventData?.name,
                email: context.eventData?.email,
                phone: context.eventData?.phone,
                affiliate_program: context.eventData?.affiliate_program,
                intent: context.eventData?.intent
              }
            },
            context.userId
          );
          return { message: "Pushed lead to CRM", data: res };
        }
      },
      {
        name: "Create Tracking Task",
        type: "api_call",
        action: async (context) => {
          const title = `Follow up with Solar Lead: ${context.eventData?.name || 'Unknown'}`;
          const res = await api.createTaskForProject(title, 'Powur Affiliate Tracking', context.userId, `Intent: ${context.eventData?.intent || 'None'}`);
          return { message: "Created tracking task in PM", data: res };
        }
      },
      {
        name: "Dispatch Welcome Email",
        type: "email",
        action: async (context) => {
          const email = context.eventData?.email;
          if (!email) {
            throw new Error("No email provided in event data");
          }
          const link = context.eventData?.affiliate_program === 'seller' ? 'https://powur.com/axim/solar-careers' : 'https://powur.com/axim/solar';
          const body = `Welcome to Powur! Here is your affiliate link: ${link}`;
          await api.sendEmail(email, 'Welcome to Powur Solar!', body, context.userId);
          return { message: "Dispatched welcome email" };
        }
      },
      {
        name: "Wait for Event",
        type: "wait_for_event",
        config: {
          event_type: "email_opened_or_clicked",
          timeout_hours: 48
        }
      }
    ]
  },


  UNIFIRST_PROSPECT_RESEARCH: {
    name: "UniFirst Prospect Research",
    description: "Generate high-performance sales profiles and sync to CRM.",
    steps: [
      {
        name: "OSINT Scrape",
        type: "api_call",
        action: async (context) => {
          const res = await api.invokeAximService(
            "universal-dispatcher",
            "",
            {
              action: "scrape_osint",
              target: context.eventData?.target_domain || "unifirst prospect"
            },
            context.userId
          );
          return { message: "Scraped OSINT data", data: res };
        }
      },
      {
        name: "Generate Analytical Profile",
        type: "api_call",
        action: async (context) => {
          const rawData = context["OSINT Scrape"]?.data || {};
          const targetDomain = context.eventData?.target_domain || "prospect";

          const prompt = `Analyze this OSINT data for a UniFirst prospect in Longview, TX region.
Data: ${JSON.stringify(rawData)}

Apply the UniFirst Lens Schema:
1. Territory Boundaries: Map the business location against the Longview, TX territory parameters (covering the Longview region to the LA/TX border across zips: 75654, 75667, 75633, 75643, 75681, 75639, 75669, 75652, 75631, 75691, 75684, 75662, 75603, 75672, 75602, 75692, 75661, 75657, 75630, 75683, 75640, 75651, 75670, 75672, 75604, 75695).
2. Program Assessment: Audit the prospect's operations for uniform rental potential (weekly laundering/washing needs) or uniform lease potential (standard look without weekly cleaning) to steer them away from costly, non-recurring direct purchase configurations.
3. Facility Items: Identify opportunities for ancillary facility items (mats, mops, direct hygiene inventory checks) to prime the sales representative for an initial Customer Needs Analysis (CNA) appointment format.

Format the aggregated data object, output all discovered search tags in a strict comma-separated format.`;

          const res = await api.invokeAximService(
            "onyx-bridge",
            "",
            { prompt },
            context.userId
          );
          return { message: "Profile generated", data: res };
        }
      },
      {
        name: "Generate PDF Profile Artifact",
        type: "api_call",
        action: async (context) => {
          const profileData = context["Generate Analytical Profile"]?.data?.response || "";

          const res = await api.invokeAximService(
            "universal-dispatcher",
            "",
            {
              action_type: "generate_pdf_artifact",
              payload: {
                content: profileData,
                bucket: "secure_artifacts",
                filename: `unifirst_prospect_${Date.now()}.pdf`
              }
            },
            context.userId
          );

          // Flash status to UI (if running in a context with access to a toast/notification system)
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('axim:flash-status', {
               detail: { message: "UniFirst Profile PDF Generated & Saved to Secure Artifacts Bucket" }
            }));
          }

          return { message: "PDF Generated", data: res };
        }
      },
      {
        name: "Sync to Deskera CRM via Albato",
        type: "api_call",
        action: async (context) => {
          const profile = context["Generate Analytical Profile"]?.data?.response || "";
          const res = await api.invokeAximService(
            "albato-connector",
            "/sync",
            {
              crm: "deskera",
              payload: {
                name: context.eventData?.target_domain,
                profile: profile,
                source: "UNIFIRST_PROSPECT_RESEARCH"
              }
            },
            context.userId
          );
          return { message: "Synced to CRM", data: res };
        }
      }
    ]
  },

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
