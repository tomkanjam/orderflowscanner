/**
 * Connection status hook for server-side execution
 * Tracks WebSocket connection state and latency
 */
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'connecting';

interface UseConnectionStatusResult {
  status: ConnectionStatus;
  latency: number | null;
  lastPing: Date | null;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Create a dedicated client for connection monitoring
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function useConnectionStatus(): UseConnectionStatusResult {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [latency, setLatency] = useState<number | null>(null);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!supabase) {
      // Supabase client not configured
      setStatus('disconnected');
      return;
    }

    let isSubscribed = true;

    // Create a test channel to monitor connection
    const channel = supabase.channel('connection-status')
      .on('system', { event: '*' }, (payload) => {
        // System event received
      })
      .subscribe((status) => {
        if (!isSubscribed) return;

        // Channel status changed

        if (status === 'SUBSCRIBED') {
          setStatus('connected');
          startPingMonitoring();
        } else if (status === 'CHANNEL_ERROR') {
          setStatus('disconnected');
          stopPingMonitoring();
        } else if (status === 'TIMED_OUT') {
          setStatus('reconnecting');
        } else if (status === 'CLOSED') {
          setStatus('disconnected');
          stopPingMonitoring();
        }
      });

    // Ping monitoring for latency
    const startPingMonitoring = () => {
      stopPingMonitoring();

      pingIntervalRef.current = setInterval(async () => {
        const startTime = Date.now();
        try {
          // Send a simple RPC call as a ping
          await supabase.rpc('ping', {}).single();
          const endTime = Date.now();
          const pingLatency = endTime - startTime;

          if (isSubscribed) {
            setLatency(pingLatency);
            setLastPing(new Date());
          }
        } catch (error) {
          // Ping failed, will retry
          if (isSubscribed) {
            setStatus('reconnecting');
          }
        }
      }, 5000); // Ping every 5 seconds
    };

    const stopPingMonitoring = () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };

    // Handle window focus/blur for connection monitoring
    const handleFocus = () => {
      // Window focused, checking connection
      // Re-establish connection on focus
      if (status === 'disconnected') {
        setStatus('reconnecting');
      }
    };

    const handleBlur = () => {
      // Window blurred
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Cleanup
    return () => {
      isSubscribed = false;
      stopPingMonitoring();
      channel.unsubscribe();
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return {
    status,
    latency,
    lastPing
  };
}