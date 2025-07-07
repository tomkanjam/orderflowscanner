import { supabase } from '../config/supabase';
import { 
  NotificationChannel, 
  NotificationType, 
  NotificationQueue 
} from '../types/subscription.types';

export class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Queue a notification for sending
   */
  async queueNotification({
    userId,
    traderId,
    signalId,
    type,
    payload
  }: {
    userId: string;
    traderId: string;
    signalId?: string;
    type: NotificationType;
    payload?: any;
  }): Promise<void> {
    try {
      // Check user preferences
      const { data: preferences, error: prefError } = await supabase
        .from('user_preferences')
        .select('notification_enabled, notification_channels')
        .eq('user_id', userId)
        .single();

      if (prefError || !preferences?.notification_enabled) {
        return; // User has notifications disabled
      }

      const channels = preferences.notification_channels || [];
      
      // Queue notification for each enabled channel
      const notifications = channels.map(channel => ({
        user_id: userId,
        trader_id: traderId,
        signal_id: signalId,
        type,
        channel,
        status: 'pending',
        payload
      }));

      if (notifications.length > 0) {
        const { error } = await supabase
          .from('notification_queue')
          .insert(notifications);

        if (error) {
          console.error('Error queuing notifications:', error);
        }
      }
    } catch (error) {
      console.error('Error in queueNotification:', error);
    }
  }

  /**
   * Send pending notifications (called by Edge Function)
   */
  async processPendingNotifications(): Promise<void> {
    try {
      // Fetch pending notifications
      const { data: notifications, error } = await supabase
        .from('notification_queue')
        .select(`
          *,
          user_profiles!user_id (email, display_name),
          traders!trader_id (name)
        `)
        .eq('status', 'pending')
        .limit(100);

      if (error || !notifications) {
        console.error('Error fetching notifications:', error);
        return;
      }

      // Process each notification
      for (const notification of notifications) {
        await this.sendNotification(notification);
      }
    } catch (error) {
      console.error('Error processing notifications:', error);
    }
  }

  /**
   * Send individual notification
   */
  private async sendNotification(notification: any): Promise<void> {
    try {
      const { id, channel, type, user_profiles, traders, payload } = notification;

      let success = false;
      let error = null;

      switch (channel) {
        case NotificationChannel.EMAIL:
          const result = await this.sendEmailNotification({
            to: user_profiles.email,
            userName: user_profiles.display_name || 'Trader',
            signalName: traders.name,
            type,
            payload
          });
          success = result.success;
          error = result.error;
          break;

        case NotificationChannel.IN_APP:
          // In-app notifications are handled by real-time subscriptions
          success = true;
          break;

        case NotificationChannel.PUSH:
          // TODO: Implement push notifications
          console.log('Push notifications not yet implemented');
          break;
      }

      // Update notification status
      await supabase
        .from('notification_queue')
        .update({
          status: success ? 'sent' : 'failed',
          sent_at: success ? new Date().toISOString() : null,
          error: error
        })
        .eq('id', id);

    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  /**
   * Send email notification via Edge Function
   */
  private async sendEmailNotification({
    to,
    userName,
    signalName,
    type,
    payload
  }: {
    to: string;
    userName: string;
    signalName: string;
    type: NotificationType;
    payload?: any;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // Call Edge Function to send email via Resend
      const { data, error } = await supabase.functions.invoke('send-notification-email', {
        body: {
          to,
          subject: this.getEmailSubject(type, signalName),
          html: this.getEmailHtml(type, userName, signalName, payload)
        }
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get email subject based on notification type
   */
  private getEmailSubject(type: NotificationType, signalName: string): string {
    switch (type) {
      case NotificationType.SIGNAL_TRIGGERED:
        return `🚨 Signal Triggered: ${signalName}`;
      case NotificationType.ANALYSIS_COMPLETE:
        return `✅ Analysis Complete: ${signalName}`;
      case NotificationType.TRADE_EXECUTED:
        return `💰 Trade Executed: ${signalName}`;
      case NotificationType.POSITION_ALERT:
        return `⚠️ Position Alert: ${signalName}`;
      default:
        return `Signal Update: ${signalName}`;
    }
  }

  /**
   * Get email HTML content
   */
  private getEmailHtml(
    type: NotificationType, 
    userName: string, 
    signalName: string, 
    payload?: any
  ): string {
    const baseStyle = `
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
    `;

    let content = '';

    switch (type) {
      case NotificationType.SIGNAL_TRIGGERED:
        content = `
          <p>Your signal "<strong>${signalName}</strong>" has triggered on ${payload?.symbol || 'a symbol'}.</p>
          <p>Price: $${payload?.price || 'N/A'}</p>
          <p>Time: ${new Date().toLocaleString()}</p>
        `;
        break;

      case NotificationType.ANALYSIS_COMPLETE:
        content = `
          <p>AI analysis for "<strong>${signalName}</strong>" is complete.</p>
          <p>Symbol: ${payload?.symbol || 'N/A'}</p>
          <p>Result: ${payload?.result || 'Check the app for details'}</p>
        `;
        break;

      case NotificationType.TRADE_EXECUTED:
        content = `
          <p>A trade has been executed for "<strong>${signalName}</strong>".</p>
          <p>Symbol: ${payload?.symbol || 'N/A'}</p>
          <p>Side: ${payload?.side || 'N/A'}</p>
          <p>Quantity: ${payload?.quantity || 'N/A'}</p>
          <p>Price: $${payload?.price || 'N/A'}</p>
        `;
        break;

      case NotificationType.POSITION_ALERT:
        content = `
          <p>Position alert for "<strong>${signalName}</strong>".</p>
          <p>Symbol: ${payload?.symbol || 'N/A'}</p>
          <p>Alert: ${payload?.message || 'Check the app for details'}</p>
        `;
        break;
    }

    return `
      <div style="${baseStyle}">
        <h2 style="color: #4F46E5;">Hello ${userName},</h2>
        ${content}
        <p style="margin-top: 30px;">
          <a href="${process.env.VITE_APP_URL || 'https://your-app.com'}" 
             style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View in App
          </a>
        </p>
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          You received this email because you have notifications enabled for your signals.
          Manage your notification preferences in the app settings.
        </p>
      </div>
    `;
  }

  /**
   * Get real-time notifications for a user
   */
  subscribeToNotifications(
    userId: string, 
    callback: (notification: NotificationQueue) => void
  ) {
    return supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_queue',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          if (payload.new) {
            callback(payload.new as NotificationQueue);
          }
        }
      )
      .subscribe();
  }
}

export const notificationService = NotificationService.getInstance();