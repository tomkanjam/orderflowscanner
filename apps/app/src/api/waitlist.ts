import { supabase } from '../config/supabase';

export interface WaitlistResponse {
  success: boolean;
  message: string;
  error?: 'INVALID_EMAIL' | 'SERVER_ERROR' | 'NO_SUPABASE';
}

/**
 * Join the Pro tier waitlist
 * @param email User's email address
 * @returns Promise with success/error response
 */
export async function joinWaitlist(email: string): Promise<WaitlistResponse> {
  // Check if Supabase is configured
  if (!supabase) {
    console.error('[waitlist] Supabase not configured');
    return {
      success: false,
      message: 'Database connection not available',
      error: 'NO_SUPABASE'
    };
  }

  // Validate email format (RFC 5322 simplified regex)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      success: false,
      message: 'Please enter a valid email address',
      error: 'INVALID_EMAIL'
    };
  }

  try {
    // Sanitize email
    const cleanEmail = email.toLowerCase().trim();

    // Get current user ID if authenticated (optional)
    const { data: { user } } = await supabase.auth.getUser();

    // Insert into pro_waitlist table
    // Use upsert to handle duplicate emails gracefully
    const { error } = await supabase
      .from('pro_waitlist')
      .upsert(
        {
          email: cleanEmail,
          user_id: user?.id || null,
          joined_at: new Date().toISOString(),
        },
        {
          onConflict: 'email',
          // Don't update if email already exists (preserve original join date)
          ignoreDuplicates: true
        }
      );

    if (error) {
      console.error('[waitlist] Database error:', error);
      return {
        success: false,
        message: 'Something went wrong. Please try again',
        error: 'SERVER_ERROR'
      };
    }

    // Success - show confirmation regardless of new vs existing
    return {
      success: true,
      message: "You're on the waitlist!"
    };

  } catch (error) {
    console.error('[waitlist] Unexpected error:', error);
    return {
      success: false,
      message: 'Something went wrong. Please try again',
      error: 'SERVER_ERROR'
    };
  }
}
