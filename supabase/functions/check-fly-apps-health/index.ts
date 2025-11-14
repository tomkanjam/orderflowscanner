import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkFlyAppHealth } from "../_shared/flyClient.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get all active apps
    const { data: apps } = await supabase
      .from("user_fly_apps")
      .select("*")
      .eq("status", "active")
      .is("deleted_at", null);

    if (!apps || apps.length === 0) {
      return new Response(
        JSON.stringify({ message: "No apps to check", results: [] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const results = [];

    for (const app of apps) {
      const healthResult = await checkFlyAppHealth(app.fly_app_name);

      await supabase
        .from("user_fly_apps")
        .update({
          last_health_check: new Date().toISOString(),
          health_status: healthResult.healthy ? "healthy" : "unhealthy",
          error_message: healthResult.error || null,
        })
        .eq("id", app.id);

      if (!healthResult.healthy) {
        await supabase.from("user_fly_app_events").insert({
          fly_app_id: app.id,
          user_id: app.user_id,
          event_type: "health_check_failed",
          status: "unhealthy",
          error_details: healthResult.error,
        });
      } else {
        await supabase.from("user_fly_app_events").insert({
          fly_app_id: app.id,
          user_id: app.user_id,
          event_type: "health_check_passed",
          status: "healthy",
          metadata: {},
        });
      }

      results.push({
        app: app.fly_app_name,
        user_id: app.user_id,
        healthy: healthResult.healthy,
        error: healthResult.error,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: apps.length,
        results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Health check error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
