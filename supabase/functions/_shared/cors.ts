/**
 * Shared CORS utility for all Edge Functions
 * Provides dynamic origin validation based on environment configuration
 */

export interface CorsOptions {
  allowCredentials?: boolean;
  maxAge?: number;
  allowedMethods?: string[];
  allowedHeaders?: string[];
}

/**
 * Get CORS headers with dynamic origin validation
 * @param req - The incoming request
 * @param options - Optional CORS configuration
 * @returns Headers object with appropriate CORS settings
 */
export function getCorsHeaders(
  req: Request,
  options: CorsOptions = {}
): HeadersInit {
  const origin = req.headers.get('origin') || '';

  // Get allowed origins from environment variable
  const allowedOriginsEnv = Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:5173';
  const allowedOrigins = allowedOriginsEnv
    .split(',')
    .map(o => o.trim())
    .filter(o => o.length > 0);

  // Check if current environment is production
  const isProduction = Deno.env.get('ENVIRONMENT') === 'production';

  // Determine if origin is allowed
  let isAllowed = false;

  if (allowedOrigins.includes(origin)) {
    // Origin is explicitly allowed
    isAllowed = true;
  } else if (!isProduction && origin.includes('localhost')) {
    // In development, allow any localhost origin
    isAllowed = true;
  } else if (!isProduction && origin.includes('127.0.0.1')) {
    // In development, allow local IP origins
    isAllowed = true;
  }

  // Build CORS headers
  const headers: HeadersInit = {
    // Only set origin if it's allowed, otherwise don't set it (blocks the request)
    ...(isAllowed && { 'Access-Control-Allow-Origin': origin }),
    'Access-Control-Allow-Methods': (options.allowedMethods || ['POST', 'OPTIONS']).join(', '),
    'Access-Control-Allow-Headers': (options.allowedHeaders || [
      'authorization',
      'x-client-info',
      'apikey',
      'content-type'
    ]).join(', '),
    'Access-Control-Max-Age': String(options.maxAge || 86400), // 24 hours default
  };

  // Add credentials header if specified
  if (options.allowCredentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}

/**
 * Handle CORS preflight request
 * @param req - The incoming request
 * @param options - Optional CORS configuration
 * @returns Response for preflight request
 */
export function handleCorsPreflightRequest(
  req: Request,
  options: CorsOptions = {}
): Response | null {
  if (req.method === 'OPTIONS') {
    const headers = getCorsHeaders(req, options);
    return new Response(null, {
      status: 204,
      headers
    });
  }
  return null;
}

/**
 * Log CORS violations for security monitoring
 */
export function logCorsViolation(req: Request): void {
  const origin = req.headers.get('origin') || 'no-origin';
  const timestamp = new Date().toISOString();
  const ip = req.headers.get('x-forwarded-for') ||
             req.headers.get('x-real-ip') ||
             'unknown';

  console.warn(`[CORS_VIOLATION] ${timestamp}`, {
    origin,
    ip,
    method: req.method,
    url: req.url,
    userAgent: req.headers.get('user-agent'),
  });
}

/**
 * Wrapper to add CORS headers to any response
 * @param response - The original response
 * @param req - The incoming request
 * @param options - Optional CORS configuration
 * @returns Response with CORS headers added
 */
export function withCorsHeaders(
  response: Response,
  req: Request,
  options: CorsOptions = {}
): Response {
  const corsHeaders = getCorsHeaders(req, options);

  // Check if origin was allowed
  if (!corsHeaders['Access-Control-Allow-Origin']) {
    // Origin not allowed - log violation
    logCorsViolation(req);
  }

  // Clone response and add CORS headers
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    if (value) {
      headers.set(key, value as string);
    }
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}