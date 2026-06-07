#!/bin/bash
git checkout 3d6f07d -- src/services/workflows/definitions.js

# Now insert the UNIFIRST_PROSPECT_RESEARCH safely at the end of workflowDefinitions object.
NEW_WORKFLOW='
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
          const prompt = `Analyze this OSINT data for a UniFirst prospect in Longview, TX region. Highlight garment needs, decision-makers, competitors, and target initiatives: ${JSON.stringify(rawData)}`;

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
'

awk -v wf="$NEW_WORKFLOW" '
  /^[[:space:]]*LIVE_STREAM_STARTED:/ {
    print wf
  }
  {print}
' src/services/workflows/definitions.js > src/services/workflows/definitions.tmp && mv src/services/workflows/definitions.tmp src/services/workflows/definitions.js
