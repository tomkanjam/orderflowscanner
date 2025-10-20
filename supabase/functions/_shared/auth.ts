/**
 * Authentication middleware for Edge Functions
 * Provides JWT validation, user tier extraction, and security logging
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface AuthContext {
  userId?: string;
  email?: string;
  userTier: 'anonymous' | 'free' | 'pro' | 'elite';
  isAuthenticated: boolean;
}

export interface AuthConfig {
  requireAuth: boolean;
  allowAnonymous: boolean;
  minimumTier?: 'free' | 'pro' | 'elite';
}

/**
 * Get user tier from database
 */
async function getUserTier(supabase: any, userId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('tier')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      // Default to free tier if no subscription found
      return 'free';
    }

    return data.tier || 'free';
  } catch (error) {
    console.error('Failed to fetch user tier:', error);
    return 'free';
  }
}

/**
 * Validate authentication and extract user context
 */
export async function validateAuth(
  req: Request,
  config: AuthConfig = { requireAuth: false, allowAnonymous: true }
): Promise<{ success: boolean; context?: AuthContext; error?: string }> {
  const authHeader = req.headers.get('authorization');

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase configuration missing');
    return {
      success: false,
      error: 'Service configuration error'
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {}
    }
  });

  // Check for Bearer token
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        // Invalid token
        logAuthFailure(req, 'invalid_token', error?.message);

        if (config.requireAuth) {
          return {
            success: false,
            error: 'Invalid authentication token'
          };
        }
      } else {
        // Valid user - get tier
        const tier = await getUserTier(supabase, user.id);

        // Check minimum tier requirement
        if (config.minimumTier) {
          const tierHierarchy = { free: 1, pro: 2, elite: 3 };
          const userTierLevel = tierHierarchy[tier as keyof typeof tierHierarchy] || 1;
          const requiredTierLevel = tierHierarchy[config.minimumTier];

          if (userTierLevel < requiredTierLevel) {
            logAuthFailure(req, 'insufficient_tier', `Required: ${config.minimumTier}, User: ${tier}`);
            return {
              success: false,
              error: `This feature requires ${config.minimumTier} tier or higher`
            };
          }
        }

        return {
          success: true,
          context: {
            userId: user.id,
            email: user.email,
            userTier: tier as AuthContext['userTier'],
            isAuthenticated: true
          }
        };
      }
    } catch (error) {
      console.error('Auth validation error:', error);
      logAuthFailure(req, 'validation_error', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // No auth header or failed auth
  if (config.allowAnonymous) {
    return {
      success: true,
      context: {
        userTier: 'anonymous',
        isAuthenticated: false
      }
    };
  }

  if (config.requireAuth) {
    logAuthFailure(req, 'missing_auth', 'No authorization header');
    return {
      success: false,
      error: 'Authentication required'
    };
  }

  return {
    success: true,
    context: {
      userTier: 'anonymous',
      isAuthenticated: false
    }
  };
}

/**
 * Log authentication failures for security monitoring
 */
function logAuthFailure(req: Request, type: string, details?: string): void {
  const timestamp = new Date().toISOString();
  const origin = req.headers.get('origin') || 'no-origin';
  const ip = req.headers.get('x-forwarded-for') ||
             req.headers.get('x-real-ip') ||
             'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  console.warn(`[AUTH_FAILURE] ${timestamp}`, {
    type,
    details,
    origin,
    ip,
    method: req.method,
    url: req.url,
    userAgent
  });
}

/**
 * Log successful authentications for monitoring
 */
export function logAuthSuccess(context: AuthContext, endpoint: string): void {
  const timestamp = new Date().toISOString();

  console.log(`[AUTH_SUCCESS] ${timestamp}`, {
    userId: context.userId,
    tier: context.userTier,
    endpoint,
    authenticated: context.isAuthenticated
  });
}

/**
 * Create an unauthorized response with proper headers
 */
export function unauthorizedResponse(
  message: string,
  corsHeaders: HeadersInit = {}
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      code: 'UNAUTHORIZED'
    }),
    {
      status: 401,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="Edge Functions"'
      }
    }
  );
}

/**
 * Create a forbidden response for insufficient permissions
 */
export function forbiddenResponse(
  message: string,
  corsHeaders: HeadersInit = {}
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      code: 'FORBIDDEN'
    }),
    {
      status: 403,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    }
  );
}

/**
 * Rate limit check based on user tier
 * Note: This is a simple in-memory implementation
 * For production, use Redis-based rate limiting (Phase 3)
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(context: AuthContext, endpoint: string): boolean {
  const limits = {
    anonymous: 10,  // 10 requests per minute
    free: 100,      // 100 requests per minute
    pro: 500,       // 500 requests per minute
    elite: 1000     // 1000 requests per minute
  };

  const limit = limits[context.userTier];
  const key = `${context.userId || 'anon'}:${endpoint}`;
  const now = Date.now();
  const window = 60 * 1000; // 1 minute window

  const record = requestCounts.get(key);

  if (!record || record.resetAt < now) {
    // Start new window
    requestCounts.set(key, {
      count: 1,
      resetAt: now + window
    });
    return true;
  }

  if (record.count >= limit) {
    // Rate limit exceeded
    console.warn(`[RATE_LIMIT] User ${context.userId || 'anonymous'} exceeded limit for ${endpoint}`);
    return false;
  }

  // Increment count
  record.count++;
  return true;
}

/**
 * Create rate limit response
 */
export function rateLimitResponse(
  context: AuthContext,
  corsHeaders: HeadersInit = {}
): Response {
  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      tier: context.userTier,
      retryAfter: 60
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': '60'
      }
    }
  );
}