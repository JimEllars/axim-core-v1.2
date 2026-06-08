export interface FleetMetrics {
  app_id: string;
  timestamp: number;
  active_users: number;
  revenue_cents: number;
  error_rate_percent: number;
  server_status: string;
}

export async function emitFleetTelemetry(payload: FleetMetrics) {
  const onyxUrl = Deno.env.get("ONYX_EDGE_URL");
  if (!onyxUrl) {
    console.warn("ONYX_EDGE_URL not set, skipping fleet telemetry dispatch.");
    return;
  }

  try {
    await fetch(`https://${onyxUrl}/api/telemetry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("Failed to dispatch fleet telemetry to Onyx mk3:", err);
  }
}

export async function notifyOperator(
  subject: string,
  html_content: string,
  text_content?: string,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, skipping operator notification.",
    );
    return;
  }

  try {
    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        to_email: "jrellars@gmail.com",
        subject,
        html_content,
        text_content: text_content || html_content.replace(/<[^>]*>?/gm, ""),
        app_source: "AXiM System Telemetry",
      }),
    });
  } catch (err) {
    console.error("Failed to send operator notification email:", err);
  }
}

export async function logTelemetry(
  endpoint: string,
  errorCode: number,
  details: any = {},
  severity: string = "INFO",
  correlationId?: string,
) {
  if (errorCode >= 500) {
    severity = "CRITICAL";
  } else if (errorCode >= 400) {
    severity = "WARNING";
  }

  const onyxUrl = Deno.env.get("ONYX_EDGE_URL");
  if (!onyxUrl) {
    console.warn("ONYX_EDGE_URL not set, skipping telemetry dispatch.");
    // proceed to critical alert even if telemetry fails
  } else {
    try {
      await fetch(`https://${onyxUrl}/api/telemetry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error_code: errorCode,
          endpoint,
          timestamp: new Date().toISOString(),
          details,
          severity,
          correlation_id: correlationId,
        }),
      });
    } catch (err) {
      console.error("Failed to notify Onyx mk3:", err);
    }
  }

  if (severity === "CRITICAL") {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (supabaseUrl && serviceRoleKey) {
      const systemPrompt = `[SYSTEM ALERT: Micro-app crash detected in ${endpoint}. Correlation ID: ${correlationId || "N/A"}. Log details: ${JSON.stringify(details)}]`;

      fetch(`${supabaseUrl}/functions/v1/onyx-bridge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ prompt: systemPrompt }),
      }).catch((err) =>
        console.error("Failed to trigger Onyx bridge analysis:", err),
      );
    }

    // Direct Operator Notification Hook for critical anomalies
    await notifyOperator(
      `Critical System Anomaly in ${endpoint}`,
      `<p>A critical anomaly was detected.</p><p>Endpoint: ${endpoint}</p><p>Error Code: ${errorCode}</p><p>Correlation ID: ${correlationId || "N/A"}</p><pre>${JSON.stringify(details, null, 2)}</pre>`,
    );
  }
}

export async function notifyOnyx(
  endpoint: string,
  errorCode: number,
  details: any = {},
  correlationId?: string,
) {
  return logTelemetry(endpoint, errorCode, details, "INFO", correlationId);
}
