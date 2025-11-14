import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deleteFlyApp } from "../_shared/flyClient.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const { user_id, reason } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get user's Fly app
    const { data: flyApp } = await supabase
      .from("user_fly_apps")
      .select("*")
      .eq("user_id", user_id)
      .is("deleted_at", null)
      .single();

    if (!flyApp) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "User has no Fly app to deprovision",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Update status to deprovisioning
    await supabase
      .from("user_fly_apps")
      .update({ status: "deprovisioning" })
      .eq("id", flyApp.id);

    await supabase.from("user_fly_app_events").insert({
      fly_app_id: flyApp.id,
      user_id,
      event_type: "deprovision_started",
      status: "deprovisioning",
      metadata: { reason },
    });

    // Delete Fly app
    const deleteResult = await deleteFlyApp(flyApp.fly_app_name);

    if (!deleteResult.success) {
      await supabase
        .from("user_fly_apps")
        .update({
          status: "error",
          error_message: deleteResult.error,
        })
        .eq("id", flyApp.id);

      await supabase.from("user_fly_app_events").insert({
        fly_app_id: flyApp.id,
        user_id,
        event_type: "deprovision_failed",
        status: "error",
        error_details: deleteResult.error,
      });

      return new Response(
        JSON.stringify({ error: "Failed to delete Fly app", details: deleteResult.error }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Mark as deleted
    await supabase
      .from("user_fly_apps")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
      })
      .eq("id", flyApp.id);

    await supabase.from("user_fly_app_events").insert({
      fly_app_id: flyApp.id,
      user_id,
      event_type: "deprovision_completed",
      status: "deleted",
      metadata: { reason },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Fly app deprovisioned successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Deprovisioning error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
