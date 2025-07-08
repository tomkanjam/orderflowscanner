import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from '../hooks/useAuth';
import { 
  UserProfile, 
  UserSubscription, 
  UserPreferences, 
  SubscriptionTier,
  TierFeatures,
  TIER_FEATURES,
  AccessTier
} from '../types/subscription.types';

interface SubscriptionContextType {
  profile: UserProfile | null;
  subscription: UserSubscription | null;
  preferences: UserPreferences | null;
  loading: boolean;
  error: string | null;
  currentTier: SubscriptionTier | 'anonymous';
  features: TierFeatures;
  canAccessTier: (requiredTier: AccessTier) => boolean;
  canCreateSignal: () => boolean;
  remainingSignals: number;
  toggleFavoriteSignal: (signalId: string) => Promise<void>;
  updateNotificationPreferences: (enabled: boolean, channels: string[]) => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Fetch user data when authenticated
  useEffect(() => {
    if (user) {
      // User is logged in, fetch their data
      setLoading(true);
      fetchUserData();
    } else if (hasInitialized) {
      // User logged out after initialization
      setProfile(null);
      setSubscription(null);
      setPreferences(null);
      setLoading(false);
    } else {
      // Initial load with no user
      setLoading(false);
      setHasInitialized(true);
    }
  }, [user, hasInitialized]);

  const fetchUserData = async () => {
    if (!user) return;

    console.log('[SubscriptionContext] Starting fetchUserData for user:', user.id);
    setLoading(true);
    setError(null);

    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code === 'PGRST116') {
        // Profile doesn't exist, create it
        console.log('Creating user profile...');
        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({ 
            id: user.id, 
            email: user.email || '',
            is_admin: false 
          })
          .select()
          .single();
        
        if (createError) throw createError;
        setProfile(newProfile);
      } else if (profileError) {
        throw profileError;
      } else {
        console.log('[SubscriptionContext] Profile fetched:', {
          id: profileData.id,
          email: profileData.email,
          is_admin: profileData.is_admin
        });
        setProfile(profileData);
      }

      // Fetch subscription
      const { data: subData, error: subError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (subError && subError.code === 'PGRST116') {
        // Subscription doesn't exist, create it
        console.log('Creating user subscription...');
        const { data: newSub, error: createError } = await supabase
          .from('user_subscriptions')
          .insert({ 
            user_id: user.id,
            tier: 'free',
            status: 'active'
          })
          .select()
          .single();
        
        if (createError) throw createError;
        setSubscription(newSub);
      } else if (subError) {
        throw subError;
      } else {
        setSubscription(subData);
      }

      // Fetch preferences
      const { data: prefData, error: prefError } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (prefError && prefError.code === 'PGRST116') {
        // Preferences don't exist, create them
        console.log('Creating user preferences...');
        const { data: newPref, error: createError } = await supabase
          .from('user_preferences')
          .insert({ user_id: user.id })
          .select()
          .single();
        
        if (createError) throw createError;
        setPreferences(newPref);
      } else if (prefError) {
        throw prefError;
      } else {
        setPreferences(prefData);
      }

    } catch (err) {
      console.error('Error fetching user data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch user data');
    } finally {
      console.log('[SubscriptionContext] Completed fetchUserData, setting loading to false');
      setLoading(false);
      setHasInitialized(true);
    }
  };

  const refreshSubscription = async () => {
    await fetchUserData();
  };

  // Determine current tier
  const currentTier = subscription?.tier || 'anonymous';
  const features = TIER_FEATURES[currentTier];

  // Access control functions
  const canAccessTier = (requiredTier: AccessTier): boolean => {
    const tierOrder = ['anonymous', 'free', 'pro', 'elite'];
    const userTierIndex = tierOrder.indexOf(currentTier);
    const requiredTierIndex = tierOrder.indexOf(requiredTier);
    return userTierIndex >= requiredTierIndex;
  };

  const canCreateSignal = (): boolean => {
    if (!features.customSignals) return false;
    if (features.maxCustomSignals === -1) return true; // Unlimited
    return (subscription?.custom_signals_count || 0) < features.maxCustomSignals;
  };

  const remainingSignals = features.maxCustomSignals === -1 
    ? Infinity 
    : Math.max(0, features.maxCustomSignals - (subscription?.custom_signals_count || 0));

  // Preference management
  const toggleFavoriteSignal = async (signalId: string) => {
    if (!user || !preferences) return;

    const currentFavorites = preferences.favorite_signals || [];
    const newFavorites = currentFavorites.includes(signalId)
      ? currentFavorites.filter(id => id !== signalId)
      : [...currentFavorites, signalId];

    const { error } = await supabase
      .from('user_preferences')
      .update({ favorite_signals: newFavorites })
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating favorites:', error);
      throw error;
    }

    setPreferences({ ...preferences, favorite_signals: newFavorites });
  };

  const updateNotificationPreferences = async (enabled: boolean, channels: string[]) => {
    if (!user || !preferences) return;

    const { error } = await supabase
      .from('user_preferences')
      .update({ 
        notification_enabled: enabled,
        notification_channels: channels 
      })
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating notification preferences:', error);
      throw error;
    }

    setPreferences({ 
      ...preferences, 
      notification_enabled: enabled,
      notification_channels: channels as any 
    });
  };

  const value: SubscriptionContextType = {
    profile,
    subscription,
    preferences,
    loading,
    error,
    currentTier,
    features,
    canAccessTier,
    canCreateSignal,
    remainingSignals,
    toggleFavoriteSignal,
    updateNotificationPreferences,
    refreshSubscription
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}