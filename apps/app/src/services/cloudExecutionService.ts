/**
 * Cloud Execution Service
 * Handles all database queries for cloud execution infrastructure
 */

import { supabase } from '../config/supabase';
import type { CloudMachine, CloudSignal, CloudMetrics } from '../types/cloud.types';

/**
 * Fetch machine status for a specific user
 * @param userId - User ID to fetch machine for
 * @returns Machine record or null if doesn't exist
 */
export async function fetchMachineStatus(userId: string): Promise<CloudMachine | null> {
  try {
    console.log(`[CloudExecutionService] Fetching machine status for user: ${userId}`);

    const { data, error } = await supabase
      .from('cloud_machines')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[CloudExecutionService] Error fetching machine status:', error);
      throw new Error(`Failed to fetch machine status: ${error.message}`);
    }

    if (!data) {
      console.log('[CloudExecutionService] No machine found for user');
      return null;
    }

    console.log(`[CloudExecutionService] Machine found: ${data.machine_id}, status: ${data.status}`);
    return data as CloudMachine;
  } catch (error) {
    console.error('[CloudExecutionService] fetchMachineStatus failed:', error);
    throw error;
  }
}

/**
 * Fetch cloud signals for a user (paginated)
 * @param userId - User ID to fetch signals for
 * @param limit - Maximum number of signals to fetch
 * @param offset - Offset for pagination
 * @returns Array of cloud signals
 */
export async function fetchCloudSignals(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<CloudSignal[]> {
  try {
    console.log(`[CloudExecutionService] Fetching cloud signals for user: ${userId} (limit: ${limit}, offset: ${offset})`);

    // Join cloud_signals with cloud_machines to filter by user_id
    const { data, error } = await supabase
      .from('cloud_signals')
      .select(`
        *,
        cloud_machines!inner (
          user_id
        )
      `)
      .eq('cloud_machines.user_id', userId)
      .order('signal_time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[CloudExecutionService] Error fetching cloud signals:', error);
      throw new Error(`Failed to fetch cloud signals: ${error.message}`);
    }

    console.log(`[CloudExecutionService] Fetched ${data?.length || 0} cloud signals`);
    return (data || []) as CloudSignal[];
  } catch (error) {
    console.error('[CloudExecutionService] fetchCloudSignals failed:', error);
    throw error;
  }
}

/**
 * Fetch latest cloud metrics for a machine
 * @param machineId - Machine ID (UUID) to fetch metrics for
 * @param timeRange - Time range to fetch (e.g., '1h', '24h')
 * @returns Array of cloud metrics
 */
export async function fetchCloudMetrics(
  machineId: string,
  timeRange: string = '1h'
): Promise<CloudMetrics[]> {
  try {
    console.log(`[CloudExecutionService] Fetching cloud metrics for machine: ${machineId}, range: ${timeRange}`);

    // Calculate time threshold based on range
    const now = new Date();
    let thresholdDate: Date;

    if (timeRange.endsWith('h')) {
      const hours = parseInt(timeRange.slice(0, -1));
      thresholdDate = new Date(now.getTime() - hours * 60 * 60 * 1000);
    } else if (timeRange.endsWith('d')) {
      const days = parseInt(timeRange.slice(0, -1));
      thresholdDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    } else {
      // Default to 1 hour
      thresholdDate = new Date(now.getTime() - 60 * 60 * 1000);
    }

    const { data, error } = await supabase
      .from('cloud_metrics')
      .select('*')
      .eq('machine_id', machineId)
      .gte('recorded_at', thresholdDate.toISOString())
      .order('recorded_at', { ascending: false });

    if (error) {
      console.error('[CloudExecutionService] Error fetching cloud metrics:', error);
      throw new Error(`Failed to fetch cloud metrics: ${error.message}`);
    }

    console.log(`[CloudExecutionService] Fetched ${data?.length || 0} metric records`);
    return (data || []) as CloudMetrics[];
  } catch (error) {
    console.error('[CloudExecutionService] fetchCloudMetrics failed:', error);
    throw error;
  }
}

/**
 * Check if user has a machine (any status)
 * @param userId - User ID to check
 * @returns Boolean indicating if machine exists
 */
export async function hasMachine(userId: string): Promise<boolean> {
  try {
    const machine = await fetchMachineStatus(userId);
    return machine !== null;
  } catch (error) {
    console.error('[CloudExecutionService] hasMachine check failed:', error);
    return false;
  }
}

/**
 * Get machine ID for a user
 * @param userId - User ID to get machine ID for
 * @returns Machine ID (text) or null
 */
export async function getMachineId(userId: string): Promise<string | null> {
  try {
    const machine = await fetchMachineStatus(userId);
    return machine?.machine_id || null;
  } catch (error) {
    console.error('[CloudExecutionService] getMachineId failed:', error);
    return null;
  }
}
