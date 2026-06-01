#!/bin/bash

# Define the new workflow to append
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
          // The CRM service handles masking for telemetry internally.
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

# Use awk to insert before the last closing brace of the workflowDefinitions object
awk -v wf="$NEW_WORKFLOW" '
  /};/ && !inserted {
    print wf
    inserted=1
  }
  {print}
' src/services/workflows/definitions.js > src/services/workflows/definitions.tmp && mv src/services/workflows/definitions.tmp src/services/workflows/definitions.js
