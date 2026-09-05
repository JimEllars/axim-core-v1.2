import re

with open("supabase/functions/voice-ingest/index.ts", "r") as f:
    content = f.read()

# Need to inject the threat check after extracting text but before doing telephony log insert
threat_check_code = """
        // Asguard Telephony Threat Verification
        const asguardApiUrl = Deno.env.get("ASGUARD_API_URL") || "https://api.asguard.axim.us.com";
        const internalKey = Deno.env.get("AXIM_INTERNAL_KEY") || supabaseKey;

        if (call_sid) {
            try {
                const threatRes = await fetch(`${asguardApiUrl}/api/v1/telephony/threat-check`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Axim-Signature': internalKey
                    },
                    body: JSON.stringify({
                        caller_number,
                        sip_source_ip,
                        call_sid
                    })
                });

                if (threatRes.ok) {
                    const threatData = await threatRes.json();
                    if (threatData.risk_level === 'CRITICAL' || threatData.is_blocked === true) {
                        await supabase.from('telephony_logs').insert({
                            call_sid,
                            caller_number,
                            duration,
                            recording_url,
                            transcript: text,
                            sentiment,
                            urgency_level,
                            device_id,
                            is_spam: true,
                            threat_score: threatData.risk_score
                        });

                        return new Response(JSON.stringify({ success: false, reason: "threat_blocked" }), {
                            status: 200,
                            headers: { ...corsHeaders, "Content-Type": "application/json" }
                        });
                    }
                }
            } catch (e) {
                console.error("Asguard threat check failed:", e);
            }
        }
"""

content = content.replace("let { text, audio_base64, device_id, call_sid, caller_number, duration, recording_url, transcript, sentiment, urgency_level } = payload;",
                          "let { text, audio_base64, device_id, call_sid, caller_number, sip_source_ip, duration, recording_url, transcript, sentiment, urgency_level } = payload;")

# Insert the threat check right after ensuring `text` is present and before the `if (call_sid)` block for standard triage
content = content.replace("""        if (!text) {
            return new Response(JSON.stringify({ error: "Missing text payload and no audio could be transcribed" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Insert into telephony_logs if telephony payload exists
        if (call_sid) {""",
        """        if (!text) {
            return new Response(JSON.stringify({ error: "Missing text payload and no audio could be transcribed" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
""" + threat_check_code + """
        // Insert into telephony_logs if telephony payload exists
        if (call_sid) {""")

with open("supabase/functions/voice-ingest/index.ts", "w") as f:
    f.write(content)
