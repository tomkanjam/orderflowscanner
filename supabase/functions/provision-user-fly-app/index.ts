import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createFlyApp,
  deployFlyMachine,
  generateFlyAppName,
  calculateMonthlyCost,
  retryWithBackoff,
} from "../_shared/flyClient.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOCKER_IMAGE = Deno.env.get("DOCKER_IMAGE") || "registry.fly.io/vyx-app:latest";
const DEFAULT_REGION = Deno.env.get("FLY_DEFAULT_REGION") || "sin"; // Singapore - required for Binance API access

serve(async (req) => {
  try {
    const { user_id, tier } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check if user already has a Fly app
    const { data: existing } = await supabase
      .from("user_fly_apps")
      .select("*")
      .eq("user_id", user_id)
      .is("deleted_at", null)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "User already has a Fly app",
          app_name: existing.fly_app_name,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const appName = generateFlyAppName(user_id);
    const cpuCount = 2;
    const memoryMb = 512;
    const monthlyCost = calculateMonthlyCost(cpuCount, memoryMb);

    // Insert provisioning record
    const { data: flyApp, error: insertError } = await supabase
      .from("user_fly_apps")
      .insert({
        user_id,
        fly_app_name: appName,
        fly_org_slug: Deno.env.get("FLY_ORG_SLUG") || "personal",
        status: "provisioning",
        region: DEFAULT_REGION,
        docker_image: DOCKER_IMAGE,
        cpu_count: cpuCount,
        memory_mb: memoryMb,
        monthly_cost_estimate_usd: monthlyCost,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert fly app record:", insertError);
      return new Response(
        JSON.stringify({ error: "Database error", details: insertError }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Log event
    await supabase.from("user_fly_app_events").insert({
      fly_app_id: flyApp.id,
      user_id,
      event_type: "provision_started",
      status: "provisioning",
      metadata: { tier, region: DEFAULT_REGION },
    });

    // Create Fly app with retry logic
    let createResult;
    try {
      createResult = await retryWithBackoff(
        () => createFlyApp(user_id),
        3, // max retries
        2000 // initial delay 2s
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update status to error
      await supabase
        .from("user_fly_apps")
        .update({
          status: "error",
          error_message: errorMessage,
          retry_count: 3,
        })
        .eq("id", flyApp.id);

      await supabase.from("user_fly_app_events").insert({
        fly_app_id: flyApp.id,
        user_id,
        event_type: "provision_failed",
        status: "error",
        error_details: errorMessage,
        metadata: { max_retries_exceeded: true },
      });

      return new Response(
        JSON.stringify({ error: "Failed to create Fly app after retries", details: errorMessage }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!createResult.success) {
      // This shouldn't happen after retries, but handle it
      await supabase
        .from("user_fly_apps")
        .update({
          status: "error",
          error_message: createResult.error,
          retry_count: 1,
        })
        .eq("id", flyApp.id);

      await supabase.from("user_fly_app_events").insert({
        fly_app_id: flyApp.id,
        user_id,
        event_type: "provision_failed",
        status: "error",
        error_details: createResult.error,
      });

      return new Response(
        JSON.stringify({ error: "Failed to create Fly app", details: createResult.error }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Deploy machine to the app
    const deployResult = await deployFlyMachine({
      app_name: appName,
      region: DEFAULT_REGION,
      docker_image: DOCKER_IMAGE,
      cpu_count: 2,
      memory_mb: 512,
      env: {
        USER_ID: user_id,
        SUPABASE_URL: SUPABASE_URL,
        SUPABASE_SERVICE_KEY: SUPABASE_SERVICE_KEY,
        GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY") || "",
        BRAINTRUST_API_KEY: Deno.env.get("BRAINTRUST_API_KEY") || "",
        BRAINTRUST_PROJECT_ID: Deno.env.get("BRAINTRUST_PROJECT_ID") || "",
        OPENROUTER_API_KEY: Deno.env.get("OPENROUTER_API_KEY") || "",
        RUN_MODE: "user_dedicated", // Signal to Go backend to filter by user
      },
    });

    if (!deployResult.success) {
      await supabase
        .from("user_fly_apps")
        .update({
          status: "error",
          error_message: deployResult.error,
        })
        .eq("id", flyApp.id);

      await supabase.from("user_fly_app_events").insert({
        fly_app_id: flyApp.id,
        user_id,
        event_type: "provision_failed",
        status: "error",
        error_details: deployResult.error,
      });

      return new Response(
        JSON.stringify({ error: "Failed to deploy machine", details: deployResult.error }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Update status to active
    await supabase
      .from("user_fly_apps")
      .update({
        status: "active",
        deployed_at: new Date().toISOString(),
        health_status: "unknown",
      })
      .eq("id", flyApp.id);

    await supabase.from("user_fly_app_events").insert({
      fly_app_id: flyApp.id,
      user_id,
      event_type: "provision_completed",
      status: "active",
      metadata: { machine_id: deployResult.machineId },
    });

    return new Response(
      JSON.stringify({
        success: true,
        app_name: appName,
        machine_id: deployResult.machineId,
        message: "Fly app provisioned successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Provisioning error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
