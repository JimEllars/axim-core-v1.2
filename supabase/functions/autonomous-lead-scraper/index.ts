$(awk '
  /Format for Albato/ {
    skip = 1
    print "      // Format for Data Plane"
    print "      const dataPlanePayload = {"
    print "        name: enrichedData.meta.name || enrichedData.meta.company,"
    print "        email: enrichedData.meta.email,"
    print "        phone: enrichedData.meta.phone,"
    print "        source: \"autonomous-lead-scraper\","
    print "        lead_status: \"Enriched\""
    print "      };"
    print ""
    print "      // Post to Data Plane directly"
    print "      const dataPlaneUrl = Deno.env.get(\"AXIM_CORE_REST_URL\") || Deno.env.get(\"SUPABASE_URL\") + \"/rest/v1\";"
    print "      const anonKey = Deno.env.get(\"SUPABASE_ANON_KEY\") || \"\";"
    print ""
    print "      try {"
    print "          const dataPlaneResponse = await fetch(`${dataPlaneUrl}/crm.contacts`, {"
    print "            method: \"POST\","
    print "            headers: {"
    print "               \"Content-Type\": \"application/json\","
    print "               \"Prefer\": \"resolution=merge-duplicates\","
    print "               \"Authorization\": `Bearer ${anonKey}`,"
    print "               \"apikey\": anonKey"
    print "            },"
    print "            body: JSON.stringify([dataPlanePayload])"
    print "          });"
    print ""
    print "          if (!dataPlaneResponse.ok) {"
    print "            console.error(`Failed to post to Data Plane for lead ${lead.id}`);"
    print "            continue;"
    print "          }"
    print "      } catch (e) {"
    print "          console.error(\"Data Plane fetch failed\", e);"
    print "          // Proceed anyway for testing purposes"
    print "      }"
    next
  }
  /console.error\("Albato webhook fetch failed", e\);/ {
    skip = 1
    next
  }
  /\/\/ Proceed anyway for testing purposes/ {
    skip = 0
    next
  }
  skip == 0 { print }
' supabase/functions/autonomous-lead-scraper/index.ts)
