# Real-time Trader Error Notifications

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-18 21:48:00

## Context

After errors are persisted to database (issue 001), users need immediate notification when their traders fail. Currently:
- No real-time notifications exist
- Users discover failures only by checking manually
- Poor UX leading to missed trading opportunities

## Linked Items

- Part of: `context/issues/open/20251118-214800-000-PROJECT-trader-error-recovery-system.md`
- Depends on: `context/issues/open/20251118-214800-001-persist-trader-execution-errors.md`

## Progress

Not started.

## Spec

### Notification Channels

**1. Real-time In-App (Primary)**
- Supabase Realtime subscription to `trader_execution_errors` table
- Toast notification appears immediately when error inserted
- Error badge on trader card in UI
- Persistent notification center

**2. Email (Secondary, configurable)**
- Use existing `supabase/functions/send-notification-email/index.ts`
- Debounced: max 1 email per trader per hour
- Template includes error details + link to fix

**3. Push Notifications (Future)**
- Mobile app notifications
- Not in scope for this issue

### Database Trigger

```sql
-- Trigger to call notification function when error inserted
CREATE OR REPLACE FUNCTION notify_trader_error()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  user_settings JSONB;
BEGIN
  -- Get user email and notification settings
  SELECT email, raw_user_meta_data
  INTO user_email, user_settings
  FROM auth.users
  WHERE id = NEW.user_id;

  -- Check if user wants email notifications
  IF (user_settings->>'notify_trader_errors')::BOOLEAN IS NOT FALSE THEN
    -- Call email notification function (async via pg_net or Edge Function)
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/send-trader-error-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := jsonb_build_object(
        'error_id', NEW.id,
        'trader_id', NEW.trader_id,
        'user_id', NEW.user_id,
        'user_email', user_email,
        'error_type', NEW.error_type,
        'error_message', NEW.error_message
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trader_error_notification_trigger
AFTER INSERT ON trader_execution_errors
FOR EACH ROW
EXECUTE FUNCTION notify_trader_error();
```

### Frontend Implementation

**1. Realtime Subscription (src/hooks/useTraderErrors.ts)**

```typescript
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'

export interface TraderExecutionError {
  id: string
  trader_id: string
  error_type: string
  error_message: string
  created_at: string
  // ... other fields
}

export function useTraderErrors(traderIds: string[]) {
  const [errors, setErrors] = useState<TraderExecutionError[]>([])
  const { toast } = useToast()

  useEffect(() => {
    if (!traderIds.length) return

    // Subscribe to new errors for user's traders
    const channel = supabase
      .channel('trader-errors')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trader_execution_errors',
          filter: `trader_id=in.(${traderIds.join(',')})`
        },
        (payload) => {
          const error = payload.new as TraderExecutionError

          // Add to local state
          setErrors(prev => [error, ...prev])

          // Show toast notification
          toast({
            variant: 'destructive',
            title: `Trader Error: ${error.error_type}`,
            description: error.error_message.substring(0, 100),
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/traders/${error.trader_id}/errors/${error.id}`)}
              >
                View Details
              </Button>
            )
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [traderIds, toast])

  return errors
}
```

**2. Error Badge Component (src/components/trader/ErrorBadge.tsx)**

```typescript
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'

interface ErrorBadgeProps {
  errorCount: number
  lastErrorAt?: string
}

export function ErrorBadge({ errorCount, lastErrorAt }: ErrorBadgeProps) {
  if (!errorCount) return null

  const isRecent = lastErrorAt &&
    new Date(lastErrorAt) > new Date(Date.now() - 15 * 60 * 1000) // 15 mins

  return (
    <Badge
      variant={isRecent ? 'destructive' : 'secondary'}
      className="gap-1"
    >
      <AlertTriangle className="h-3 w-3" />
      {errorCount} {errorCount === 1 ? 'error' : 'errors'}
    </Badge>
  )
}
```

**3. Notification Center (src/components/layout/NotificationCenter.tsx)**

```typescript
// Persistent list of all trader errors
// Accessible via header bell icon
// Shows unread count badge
// Marks as read when viewed
```

### Email Template

Create `supabase/functions/send-trader-error-notification/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

interface NotificationPayload {
  error_id: string
  trader_id: string
  user_id: string
  user_email: string
  error_type: string
  error_message: string
}

serve(async (req) => {
  const payload: NotificationPayload = await req.json()

  // Check rate limit: max 1 email per trader per hour
  const rateLimitKey = `error_email:${payload.trader_id}`
  const lastSent = await kv.get(rateLimitKey)
  if (lastSent && Date.now() - lastSent < 60 * 60 * 1000) {
    return new Response('Rate limited', { status: 429 })
  }

  // Send email via Resend
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'alerts@vyxtrading.com',
      to: payload.user_email,
      subject: `⚠️ Trader Error: ${payload.error_type}`,
      html: `
        <h2>Your trader encountered an error</h2>
        <p><strong>Error Type:</strong> ${payload.error_type}</p>
        <p><strong>Message:</strong> ${payload.error_message}</p>
        <p><a href="${Deno.env.get('APP_URL')}/traders/${payload.trader_id}/errors/${payload.error_id}">
          View details and fix →
        </a></p>
      `
    })
  })

  // Set rate limit
  await kv.set(rateLimitKey, Date.now())

  return new Response('OK', { status: 200 })
})
```

### User Settings

Add to user preferences:
```typescript
interface NotificationSettings {
  notify_trader_errors: boolean  // default: true
  notify_trader_errors_email: boolean  // default: true
  error_email_frequency: 'immediate' | 'hourly' | 'daily'  // default: 'hourly'
}
```

### Testing Strategy

1. **E2E Test**: Trigger error → verify toast appears within 2 seconds
2. **Email Test**: Verify email sent and rate limiting works
3. **Realtime Test**: Multiple browser tabs receive notifications
4. **Load Test**: 100 concurrent error notifications

### Acceptance Criteria

- ✅ Toast notification appears within 2 seconds of error
- ✅ Email sent (if enabled) with rate limiting
- ✅ Error badge visible on trader cards
- ✅ Notification center shows all historical errors
- ✅ Mobile-responsive toast notifications
- ✅ Users can disable notifications in settings
