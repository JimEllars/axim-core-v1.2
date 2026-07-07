$(awk '
  /Push to Albato webhook/ {
    skip = 1
    print "      // Push to Data Plane directly"
    print "      const dataPlaneUrl = Deno.env.get(\"AXIM_CORE_REST_URL\") || Deno.env.get(\"SUPABASE_URL\") + \"/rest/v1\";"
    print "      const anonKey = Deno.env.get(\"SUPABASE_ANON_KEY\") || \"\";"
    print "      await fetch(`${dataPlaneUrl}/crm.contacts`, {"
    print "        method: \"POST\","
    print "        headers: {"
    print "           \"Content-Type\": \"application/json\","
    print "           \"Prefer\": \"resolution=merge-duplicates\","
    print "           \"Authorization\": `Bearer ${anonKey}`,"
    print "           \"apikey\": anonKey"
    print "        },"
    print "        body: JSON.stringify([enrichedPayload])"
    print "      });"
    print "      console.log(`[Predictive Engagement] Pushed enriched prospect to Data Plane with score ${leadScore}`);"
    next
  }
  /console.log\(`\[Predictive Engagement\] Pushed enriched prospect to Albato with score \${leadScore}`\);/ {
    skip = 0
    next
  }
  skip == 0 { print }
' supabase/functions/predictive-engagement/index.ts)
