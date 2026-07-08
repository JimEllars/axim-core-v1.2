sed -i 's|await supabase.functions.invoke(.*|await supabase.from("api_usage_logs").insert(payload);|' src/services/apiProxy.js
