import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import { User, UserTier, UserProfile, UserSubscription } from '../../types/subscription.types';
import { Save, Loader2, AlertCircle, Check, Users, Crown, Zap, Gift } from 'lucide-react';
import { getTierDisplayName, getTierColor } from '../../utils/tierAccess';

interface UserWithDetails {
  id: string;
  email: string;
  profile?: UserProfile;
  subscription?: UserSubscription;
}

export function UserManager() {
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all users with their profiles and subscriptions
      // Using joins since we can't use admin API with anon key
      const { data: usersData, error: usersError } = await supabase
        .from('user_profiles')
        .select(`
          id,
          email,
          display_name,
          is_admin,
          created_at,
          updated_at,
          user_subscriptions (
            tier,
            status,
            custom_signals_count,
            started_at,
            expires_at
          )
        `)
        .order('email', { ascending: true });

      if (usersError) throw usersError;

      // Transform the data to match our interface
      const usersWithDetails = (usersData || []).map(user => ({
        id: user.id,
        email: user.email,
        profile: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          is_admin: user.is_admin,
          created_at: user.created_at,
          updated_at: user.updated_at
        },
        subscription: user.user_subscriptions?.[0] ? {
          ...user.user_subscriptions[0],
          user_id: user.id
        } : undefined
      }));
      setUsers(usersWithDetails.sort((a, b) => a.email.localeCompare(b.email)));
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const updateUserTier = async (userId: string, newTier: UserTier) => {
    try {
      setSavingUser(userId);
      setError(null);
      setSuccessMessage(null);

      const { error: updateError } = await supabase
        .from('user_subscriptions')
        .update({ 
          tier: newTier,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      // Update local state
      setUsers(prev => prev.map(user => 
        user.id === userId 
          ? { ...user, subscription: { ...user.subscription!, tier: newTier } }
          : user
      ));

      setSuccessMessage(`Successfully updated tier to ${getTierDisplayName(newTier)}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error updating user tier:', err);
      setError(err instanceof Error ? err.message : 'Failed to update user tier');
    } finally {
      setSavingUser(null);
    }
  };

  const toggleAdmin = async (userId: string, isAdmin: boolean) => {
    try {
      setSavingUser(userId);
      setError(null);

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ 
          is_admin: isAdmin,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) throw updateError;

      // Update local state
      setUsers(prev => prev.map(user => 
        user.id === userId 
          ? { ...user, profile: { ...user.profile!, is_admin: isAdmin } }
          : user
      ));

      setSuccessMessage(`Admin status ${isAdmin ? 'granted' : 'revoked'}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error updating admin status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update admin status');
    } finally {
      setSavingUser(null);
    }
  };

  const getTierIcon = (tier: UserTier) => {
    switch (tier) {
      case 'elite':
        return <Crown className="w-4 h-4" />;
      case 'pro':
        return <Zap className="w-4 h-4" />;
      case 'free':
        return <Gift className="w-4 h-4" />;
      default:
        return <Users className="w-4 h-4" />;
    }
  };

  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.profile?.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--tm-accent)]" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--tm-bg-secondary)] rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-[var(--tm-text-primary)] flex items-center gap-2">
          <Users className="w-5 h-5 text-[var(--tm-accent)]" />
          User Management
        </h3>
        <div className="text-sm text-[var(--tm-text-secondary)]">
          {users.length} users total
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by email or name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 bg-[var(--tm-bg-primary)] border border-[var(--tm-border)] rounded-lg text-[var(--tm-text-primary)] placeholder-[var(--tm-text-muted)] focus:outline-none focus:border-[var(--tm-accent)]"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[var(--tm-error)]/10 border border-[var(--tm-error)] rounded-lg flex items-center gap-2 text-[var(--tm-error)]">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-3 bg-[var(--tm-success)]/10 border border-[var(--tm-success)] rounded-lg flex items-center gap-2 text-[var(--tm-success)]">
          <Check className="w-4 h-4" />
          <span className="text-sm">{successMessage}</span>
        </div>
      )}

      <div className="space-y-2">
        {filteredUsers.map((user) => (
          <div
            key={user.id}
            className="p-4 bg-[var(--tm-bg-primary)] rounded-lg border border-[var(--tm-border)] hover:border-[var(--tm-border-light)] transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--tm-text-primary)]">
                    {user.email}
                  </span>
                  {user.profile?.is_admin && (
                    <span className="px-2 py-0.5 bg-[var(--tm-accent)]/20 text-[var(--tm-accent)] text-xs rounded font-medium">
                      ADMIN
                    </span>
                  )}
                </div>
                {user.profile?.display_name && (
                  <div className="text-sm text-[var(--tm-text-secondary)] mt-1">
                    {user.profile.display_name}
                  </div>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-[var(--tm-text-muted)]">
                  <span>ID: {user.id.slice(0, 8)}...</span>
                  <span>Signals: {user.subscription?.custom_signals_count || 0}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Admin Toggle */}
                <button
                  onClick={() => toggleAdmin(user.id, !user.profile?.is_admin)}
                  disabled={savingUser === user.id}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-all flex items-center gap-2 ${
                    user.profile?.is_admin
                      ? 'bg-[var(--tm-accent)]/20 text-[var(--tm-accent)] hover:bg-[var(--tm-accent)]/30'
                      : 'bg-[var(--tm-bg-secondary)] text-[var(--tm-text-secondary)] hover:bg-[var(--tm-bg-hover)]'
                  }`}
                >
                  {savingUser === user.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Crown className="w-3 h-3" />
                  )}
                  Admin
                </button>

                {/* Tier Selector */}
                <select
                  value={user.subscription?.tier || 'free'}
                  onChange={(e) => updateUserTier(user.id, e.target.value as UserTier)}
                  disabled={savingUser === user.id}
                  className="px-3 py-1.5 bg-[var(--tm-bg-primary)] border border-[var(--tm-border)] rounded-lg text-sm text-[var(--tm-text-primary)] focus:outline-none focus:border-[var(--tm-accent)] cursor-pointer"
                  style={{ 
                    color: getTierColor(user.subscription?.tier || 'free')
                  }}
                >
                  <option value="free" style={{ color: getTierColor('free') }}>
                    Free Tier
                  </option>
                  <option value="pro" style={{ color: getTierColor('pro') }}>
                    Pro Tier
                  </option>
                  <option value="elite" style={{ color: getTierColor('elite') }}>
                    Elite Tier
                  </option>
                </select>

                {savingUser === user.id && (
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--tm-accent)]" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-8 text-[var(--tm-text-muted)]">
          {searchTerm ? 'No users found matching your search' : 'No users found'}
        </div>
      )}

      {/* Stats Summary */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="bg-[var(--tm-bg-primary)] p-4 rounded-lg border border-[var(--tm-border)]">
          <div className="text-[var(--tm-text-secondary)] text-sm">Total Users</div>
          <div className="text-2xl font-semibold text-[var(--tm-text-primary)] mt-1">
            {users.length}
          </div>
        </div>
        <div className="bg-[var(--tm-bg-primary)] p-4 rounded-lg border border-[var(--tm-border)]">
          <div className="text-[var(--tm-text-secondary)] text-sm flex items-center gap-1">
            {getTierIcon('free')} Free Tier
          </div>
          <div className="text-2xl font-semibold mt-1" style={{ color: getTierColor('free') }}>
            {users.filter(u => u.subscription?.tier === 'free').length}
          </div>
        </div>
        <div className="bg-[var(--tm-bg-primary)] p-4 rounded-lg border border-[var(--tm-border)]">
          <div className="text-[var(--tm-text-secondary)] text-sm flex items-center gap-1">
            {getTierIcon('pro')} Pro Tier
          </div>
          <div className="text-2xl font-semibold mt-1" style={{ color: getTierColor('pro') }}>
            {users.filter(u => u.subscription?.tier === 'pro').length}
          </div>
        </div>
        <div className="bg-[var(--tm-bg-primary)] p-4 rounded-lg border border-[var(--tm-border)]">
          <div className="text-[var(--tm-text-secondary)] text-sm flex items-center gap-1">
            {getTierIcon('elite')} Elite Tier
          </div>
          <div className="text-2xl font-semibold mt-1" style={{ color: getTierColor('elite') }}>
            {users.filter(u => u.subscription?.tier === 'elite').length}
          </div>
        </div>
      </div>
    </div>
  );
}