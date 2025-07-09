export enum SubscriptionTier {
  FREE = 'free',
  PRO = 'pro',
  ELITE = 'elite'
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  PAST_DUE = 'past_due'
}

export interface UserProfile {
  id: string;
  email: string;
  display_name?: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  custom_signals_count: number;
  started_at: string;
  expires_at?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  favorite_signals: string[];
  notification_enabled: boolean;
  notification_channels: NotificationChannel[];
  created_at: string;
  updated_at: string;
}

export enum NotificationChannel {
  EMAIL = 'email',
  PUSH = 'push',
  IN_APP = 'in_app'
}

export enum NotificationType {
  SIGNAL_TRIGGERED = 'signal_triggered',
  ANALYSIS_COMPLETE = 'analysis_complete',
  TRADE_EXECUTED = 'trade_executed',
  POSITION_ALERT = 'position_alert'
}

export interface NotificationQueue {
  id: string;
  user_id: string;
  trader_id: string;
  signal_id?: string;
  type: NotificationType;
  channel: NotificationChannel;
  status: 'pending' | 'sent' | 'failed';
  payload?: any;
  error?: string;
  sent_at?: string;
  created_at: string;
}

export enum AccessTier {
  ANONYMOUS = 'anonymous',
  FREE = 'free',
  PRO = 'pro',
  ELITE = 'elite'
}

export interface TierFeatures {
  builtInSignals: boolean;
  customSignals: boolean;
  maxCustomSignals: number;
  signalHistory: boolean;
  favoriteSignals: boolean;
  notifications: boolean;
  aiAnalysis: boolean;
  aiMonitoring: boolean;
  aiTrading: boolean;
  advancedBacktesting: boolean;
}

export const TIER_FEATURES: Record<SubscriptionTier | 'anonymous', TierFeatures> = {
  anonymous: {
    builtInSignals: true,
    customSignals: false,
    maxCustomSignals: 0,
    signalHistory: false,
    favoriteSignals: false,
    notifications: false,
    aiAnalysis: false,
    aiMonitoring: false,
    aiTrading: false,
    advancedBacktesting: false
  },
  [SubscriptionTier.FREE]: {
    builtInSignals: true,
    customSignals: false,
    maxCustomSignals: 0,
    signalHistory: true,
    favoriteSignals: true,
    notifications: false,
    aiAnalysis: false,
    aiMonitoring: false,
    aiTrading: false,
    advancedBacktesting: false
  },
  [SubscriptionTier.PRO]: {
    builtInSignals: true,
    customSignals: true,
    maxCustomSignals: 10,
    signalHistory: true,
    favoriteSignals: true,
    notifications: true,
    aiAnalysis: false,
    aiMonitoring: false,
    aiTrading: false,
    advancedBacktesting: false
  },
  [SubscriptionTier.ELITE]: {
    builtInSignals: true,
    customSignals: true,
    maxCustomSignals: -1, // unlimited
    signalHistory: true,
    favoriteSignals: true,
    notifications: true,
    aiAnalysis: true,
    aiMonitoring: true,
    aiTrading: true,
    advancedBacktesting: true
  }
};