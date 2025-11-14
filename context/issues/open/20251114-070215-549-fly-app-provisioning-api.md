# Fly API Integration for App Creation/Deletion

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-14 07:02:15

## Context

Need to integrate with Fly.io API to create, deploy, monitor, and delete dedicated Fly apps for Pro/Elite users.

## Linked Items

- Part of: `context/issues/open/20251114-070215-547-PROJECT-dedicated-fly-app-per-user.md`

## Progress

Spec phase.

## Spec

### Fly API Client Module

Create shared utility for Fly API operations in edge functions.

**File:** `supabase/functions/_shared/flyClient.ts`

```typescript
// Fly.io API client for app management
import { createHash } from "https://deno.land/std@0.208.0/crypto/mod.ts";

const FLY_API_BASE = "https://api.machines.dev/v1";
const FLY_API_TOKEN = Deno.env.get("FLY_API_TOKEN")!;
const FLY_ORG_SLUG = Deno.env.get("FLY_ORG_SLUG") || "personal";

interface FlyAppConfig {
  org_slug: string;
  app_name: string;
}

interface FlyMachineConfig {
  app_name: string;
  region: string;
  docker_image: string;
  env: Record<string, string>;
  cpu_count?: number;
  memory_mb?: number;
}

/**
 * Generate short app name from user ID
 * Format: vyx-user-{8-char-hash}
 */
export function generateFlyAppName(userId: string): string {
  const hash = createHash("sha256");
  hash.update(userId);
  const hexHash = hash.toString("hex");
  const shortHash = hexHash.substring(0, 8);
  return `vyx-user-${shortHash}`;
}

/**
 * Create a new Fly app
 */
export async function createFlyApp(
  userId: string
): Promise<{ success: boolean; appName: string; error?: string }> {
  const appName = generateFlyAppName(userId);

  try {
    const response = await fetch(`${FLY_API_BASE}/apps`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        org_slug: FLY_ORG_SLUG,
        app_name: appName,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to create Fly app:", error);
      return { success: false, appName, error };
    }

    const data = await response.json();
    console.log("Fly app created:", data);

    return { success: true, appName };
  } catch (error) {
    console.error("Error creating Fly app:", error);
    return { success: false, appName, error: String(error) };
  }
}

/**
 * Deploy a machine to the Fly app
 */
export async function deployFlyMachine(
  config: FlyMachineConfig
): Promise<{ success: boolean; machineId?: string; error?: string }> {
  try {
    const response = await fetch(
      `${FLY_API_BASE}/apps/${config.app_name}/machines`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FLY_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `${config.app_name}-main`,
          region: config.region,
          config: {
            image: config.docker_image,
            auto_destroy: false, // Keep running
            restart: {
              policy: "always", // Always restart on failure
            },
            guest: {
              cpu_kind: "shared",
              cpus: config.cpu_count || 2,
              memory_mb: config.memory_mb || 512,
            },
            env: config.env,
            services: [
              {
                ports: [
                  {
                    port: 80,
                    handlers: ["http"],
                  },
                  {
                    port: 443,
                    handlers: ["tls", "http"],
                  },
                ],
                protocol: "tcp",
                internal_port: 8080,
              },
            ],
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to deploy machine:", error);
      return { success: false, error };
    }

    const data = await response.json();
    console.log("Machine deployed:", data);

    return { success: true, machineId: data.id };
  } catch (error) {
    console.error("Error deploying machine:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Check app/machine health
 */
export async function checkFlyAppHealth(
  appName: string
): Promise<{ success: boolean; healthy: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${FLY_API_BASE}/apps/${appName}/machines`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${FLY_API_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, healthy: false, error };
    }

    const machines = await response.json();

    // Check if at least one machine is running
    const hasHealthyMachine = machines.some(
      (m: any) => m.state === "started" || m.state === "running"
    );

    return { success: true, healthy: hasHealthyMachine };
  } catch (error) {
    console.error("Error checking app health:", error);
    return { success: false, healthy: false, error: String(error) };
  }
}

/**
 * Delete a Fly app and all its machines
 */
export async function deleteFlyApp(
  appName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // First, list and stop all machines
    const machinesResponse = await fetch(
      `${FLY_API_BASE}/apps/${appName}/machines`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${FLY_API_TOKEN}`,
        },
      }
    );

    if (machinesResponse.ok) {
      const machines = await machinesResponse.json();

      // Stop and delete each machine
      for (const machine of machines) {
        await fetch(
          `${FLY_API_BASE}/apps/${appName}/machines/${machine.id}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${FLY_API_TOKEN}`,
            },
          }
        );
      }
    }

    // Delete the app itself
    const response = await fetch(`${FLY_API_BASE}/apps/${appName}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to delete Fly app:", error);
      return { success: false, error };
    }

    console.log("Fly app deleted:", appName);
    return { success: true };
  } catch (error) {
    console.error("Error deleting Fly app:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * List all apps in the organization
 */
export async function listFlyApps(): Promise<{
  success: boolean;
  apps?: any[];
  error?: string;
}> {
  try {
    const response = await fetch(
      `${FLY_API_BASE}/apps?org_slug=${FLY_ORG_SLUG}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${FLY_API_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const data = await response.json();
    return { success: true, apps: data.apps || [] };
  } catch (error) {
    console.error("Error listing Fly apps:", error);
    return { success: false, error: String(error) };
  }
}
```

### Edge Function: provision-user-fly-app

**File:** `supabase/functions/provision-user-fly-app/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createFlyApp,
  deployFlyMachine,
  generateFlyAppName,
} from "../_shared/flyClient.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOCKER_IMAGE = Deno.env.get("DOCKER_IMAGE")!; // Latest deployment image
const DEFAULT_REGION = Deno.env.get("FLY_DEFAULT_REGION") || "sjc";

serve(async (req) => {
  try {
    const { user_id, tier } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
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
        { status: 200 }
      );
    }

    const appName = generateFlyAppName(user_id);

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
        cpu_count: 2,
        memory_mb: 512,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert fly app record:", insertError);
      return new Response(
        JSON.stringify({ error: "Database error", details: insertError }),
        { status: 500 }
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

    // Create Fly app
    const createResult = await createFlyApp(user_id);

    if (!createResult.success) {
      // Update status to error
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
        { status: 500 }
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
        SUPABASE_SERVICE_KEY_B64: btoa(SUPABASE_SERVICE_KEY), // Base64 encode to avoid JWT stripping
        GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY")!,
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
        { status: 500 }
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
      { status: 200 }
    );
  } catch (error) {
    console.error("Provisioning error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500 }
    );
  }
});
```

### Edge Function: deprovision-user-fly-app

**File:** `supabase/functions/deprovision-user-fly-app/index.ts`

```typescript
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
        { status: 200 }
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
        { status: 500 }
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
      { status: 200 }
    );
  } catch (error) {
    console.error("Deprovisioning error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500 }
    );
  }
});
```

### Required Environment Variables

Add to Supabase Edge Functions secrets:

```bash
supabase secrets set \
  FLY_API_TOKEN=<your-fly-api-token> \
  FLY_ORG_SLUG=personal \
  FLY_DEFAULT_REGION=sjc \
  DOCKER_IMAGE=registry.fly.io/vyx-app:deployment-XXX
```
