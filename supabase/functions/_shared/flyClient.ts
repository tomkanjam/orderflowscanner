// Fly.io API client for app management

const FLY_API_BASE = "https://api.machines.dev/v1";
const FLY_API_TOKEN = Deno.env.get("FLY_API_TOKEN")!;
const FLY_ORG_SLUG = Deno.env.get("FLY_ORG_SLUG") || "personal";

// Fly.io pricing (as of 2024, shared-cpu-1x)
// Source: https://fly.io/docs/about/pricing/
const FLY_PRICING = {
  // CPU pricing per vCPU per month
  cpu_per_vcpu_monthly: 2.50,
  // Memory pricing per GB per month
  memory_per_gb_monthly: 2.00,
  // Minimum cost (always-on machine)
  minimum_monthly: 5.00,
};

/**
 * Calculate estimated monthly cost for a Fly machine
 */
export function calculateMonthlyCost(cpuCount: number, memoryMb: number): number {
  const memoryGb = memoryMb / 1024;
  const cpuCost = cpuCount * FLY_PRICING.cpu_per_vcpu_monthly;
  const memoryCost = memoryGb * FLY_PRICING.memory_per_gb_monthly;
  const totalCost = cpuCost + memoryCost;

  // Round to 2 decimal places
  return Math.round(Math.max(totalCost, FLY_PRICING.minimum_monthly) * 100) / 100;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const delayMs = initialDelayMs * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1} failed, waiting ${delayMs}ms before retry...`);
        await sleep(delayMs);
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

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
  // Use a simple hash function that's deterministic
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Convert to hex and take first 8 chars
  const hexHash = Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
  return `vyx-user-${hexHash}`;
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
