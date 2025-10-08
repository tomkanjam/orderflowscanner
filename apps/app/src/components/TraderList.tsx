import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Trader } from '../abstractions/trader.interfaces';
import { traderManager } from '../services/traderManager';
import { Activity, Cloud } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../hooks/useAuth';
import { getSignalAccess } from '../utils/tierAccess';
import { TierGate } from './TierGate';
import { UpgradePrompt } from './UpgradePrompt';
import { SubscriptionTier } from '../types/subscription.types';
import { SignalListItem } from './SignalListItem';
import { ExpandableSignalCard } from './ExpandableSignalCard';
import { CategoryHeader } from './CategoryHeader';
import { useCloudExecution } from '../hooks/useCloudExecution';
import { CloudExecutionPanel } from './cloud/CloudExecutionPanel';

type TabType = 'builtin' | 'personal' | 'favorites';

interface TraderListProps {
  onCreateTrader: () => void;
  onEditTrader: (trader: Trader) => void;
  onSelectTrader?: (traderId: string | null) => void;
  selectedTraderId?: string | null;
  activeTab?: TabType; // Which tab is active
  filterQuery?: string; // NEW: Search query to filter traders
}

export function TraderList({
  onCreateTrader,
  onEditTrader,
  onSelectTrader,
  selectedTraderId,
  activeTab = 'builtin', // Default to builtin tab
  filterQuery = '' // Default to empty filter
}: TraderListProps) {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCloudPanel, setShowCloudPanel] = useState(false);
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());
  const { currentTier, preferences, canCreateSignal, remainingSignals, toggleFavoriteSignal, profile } = useSubscription();
  const { user } = useAuth();
  const cloudExecution = useCloudExecution();

  // Toggle card expansion
  const handleToggleExpand = useCallback((traderId: string) => {
    setExpandedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(traderId)) {
        next.delete(traderId);
      } else {
        next.add(traderId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    // Subscribe to trader updates
    const unsubscribe = traderManager.subscribe((updatedTraders) => {
      setTraders(updatedTraders);
      setLoading(false);
    });

    // Initial load
    traderManager.getTraders().then(initialTraders => {
      setTraders(initialTraders);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Filter and categorize traders based on access, active tab, and search query
  const { builtInSignals, customSignals, lockedSignals, favoriteSignals } = useMemo(() => {
    const builtIn: Trader[] = [];
    const custom: Trader[] = [];
    const locked: Trader[] = [];
    const favorites: Trader[] = [];
    const favoriteIds = preferences?.favorite_signals || [];
    const lowerQuery = filterQuery.toLowerCase();

    // Helper to check if trader matches search query
    const matchesFilter = (trader: Trader): boolean => {
      if (!filterQuery.trim()) return true;
      return (
        trader.name.toLowerCase().includes(lowerQuery) ||
        trader.description?.toLowerCase().includes(lowerQuery) ||
        trader.category?.toLowerCase().includes(lowerQuery)
      );
    };

    traders.forEach(trader => {
      // Skip traders that don't match filter
      if (!matchesFilter(trader)) return;

      // Add to favorites if marked
      if (favoriteIds.includes(trader.id)) {
        favorites.push(trader);
      }

      if (trader.isBuiltIn) {
        const access = getSignalAccess(trader, currentTier);
        if (access.canView) {
          builtIn.push(trader);
        } else {
          locked.push(trader);
        }
      } else {
        custom.push(trader);
      }
    });

    // Sort built-in signals by category and difficulty
    builtIn.sort((a, b) => {
      if (a.category !== b.category) {
        return (a.category || '').localeCompare(b.category || '');
      }
      const difficultyOrder = { 'beginner': 0, 'intermediate': 1, 'advanced': 2 };
      return (difficultyOrder[a.difficulty || 'beginner'] || 0) - (difficultyOrder[b.difficulty || 'beginner'] || 0);
    });

    return { builtInSignals: builtIn, customSignals: custom, lockedSignals: locked, favoriteSignals: favorites };
  }, [traders, currentTier, preferences, filterQuery]);

  // Group built-in signals by category for display
  const groupedBuiltInSignals = useMemo(() => {
    const groups: { [category: string]: Trader[] } = {};
    builtInSignals.forEach(signal => {
      const category = signal.category || 'Other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(signal);
    });
    return groups;
  }, [builtInSignals]);

  const handleToggleTrader = async (trader: Trader) => {
    try {
      await traderManager.toggleUserPreference(trader.id, user?.id);
    } catch (error) {
      console.error('Failed to toggle trader:', error);
    }
  };

  // Helper to get effective enabled state for a trader
  const getEffectiveEnabled = useCallback((trader: Trader): boolean => {
    return traderManager.getEffectiveEnabled(trader, user?.id);
  }, [user?.id]);

  const handleDeleteTrader = async (trader: Trader) => {
    if (window.confirm(`Delete signal "${trader.name}"? This cannot be undone.`)) {
      try {
        await traderManager.deleteTrader(trader.id);
        if (selectedTraderId === trader.id) {
          onSelectTrader?.(null);
        }
      } catch (error) {
        console.error('Failed to delete trader:', error);
      }
    }
  };


  if (loading) {
    return (
      <div className="p-4 text-center text-[var(--nt-text-muted)]">
        Loading traders...
      </div>
    );
  }

  const handleToggleFavorite = async (signalId: string) => {
    try {
      await toggleFavoriteSignal(signalId);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleToggleCloudExecution = async (trader: Trader) => {
    try {
      const newValue = !trader.cloud_config?.enabledInCloud;
      await traderManager.updateCloudConfig(trader.id, { enabledInCloud: newValue });

      // Sync with cloud machine if it's running
      if (cloudExecution.machineStatus === 'running') {
        const allTraders = await traderManager.getTraders();
        cloudExecution.updateConfig(allTraders, Date.now());
      }
    } catch (error) {
      console.error('Failed to toggle cloud execution:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Built-in Signals Section */}
      {activeTab === 'builtin' && (
      <div>

        {builtInSignals.length === 0 && lockedSignals.length === 0 ? (
          <div className="text-center py-8 text-[var(--nt-text-muted)]">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="mb-2">No signals available</p>
          </div>
        ) : (
          <div>
            {/* Render signals grouped by category */}
            {Object.entries(groupedBuiltInSignals).map(([category, signals]) => (
              <div key={category}>
                <CategoryHeader category={category} count={signals.length} />
                <div className="space-y-2">
                  {signals.map(trader => {
                    const access = getSignalAccess(trader, currentTier);
                    const isFavorite = preferences?.favorite_signals?.includes(trader.id) || false;
                    const isSelected = selectedTraderId === trader.id;
                    const isExpanded = expandedCardIds.has(trader.id);
                    const effectivelyEnabled = getEffectiveEnabled(trader);

                    return (
                      <ExpandableSignalCard
                        key={trader.id}
                        signal={{...trader, enabled: effectivelyEnabled}}
                        isExpanded={isExpanded}
                        isSelected={isSelected}
                        isFavorite={isFavorite}
                        canEdit={profile?.is_admin || false}
                        canDelete={profile?.is_admin || false}
                        onToggleExpand={() => handleToggleExpand(trader.id)}
                        onSelect={() => onSelectTrader?.(isSelected ? null : trader.id)}
                        onToggleEnable={() => handleToggleTrader(trader)}
                        onEdit={() => onEditTrader(trader)}
                        onDelete={() => handleDeleteTrader(trader)}
                        onToggleFavorite={() => handleToggleFavorite(trader.id)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            {lockedSignals.length > 0 && currentTier === 'anonymous' && (
              <div className="p-4 mt-4">
                <UpgradePrompt
                  feature="20+ professional signals"
                  requiredTier={SubscriptionTier.FREE}
                />
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Custom Signals Section */}
      {activeTab === 'personal' && (
      <TierGate minTier="pro" fallback={
        currentTier !== 'anonymous' && (
          <UpgradePrompt
            feature="custom signal creation"
            requiredTier={SubscriptionTier.PRO}
          />
        )
      }>
        <div>
          <div className="flex items-center justify-end mb-3">
            <div className="flex items-center gap-3">
              {remainingSignals !== Infinity && (
                <span className="text-sm text-[var(--nt-text-muted)]">
                  {remainingSignals} remaining
                </span>
              )}

              {/* Cloud Machine Button - Elite Only */}
              {cloudExecution.isEliteTier && (
                <button
                  onClick={() => setShowCloudPanel(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[var(--nt-bg-primary)] text-blue-400
                    border border-blue-400 rounded hover:bg-blue-400 hover:text-[var(--nt-bg-primary)]
                    transition-all text-sm font-medium"
                  title="Manage cloud execution machine"
                >
                  <Cloud className="h-4 w-4" />
                  Cloud Machine
                </button>
              )}
            </div>
          </div>

          {customSignals.length === 0 ? (
            <div className="text-center py-8 text-[var(--nt-text-muted)]">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="mb-2">
                {currentTier === 'elite' ? 'No AI traders yet' : 'No signals yet'}
              </p>
              <p className="text-sm">
                {currentTier === 'elite'
                  ? 'Create your first AI trader to start automated analysis and trading'
                  : 'Create your first signal to start automated screening'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {customSignals.map(trader => {
                const access = getSignalAccess(trader, currentTier);
                const isFavorite = preferences?.favorite_signals?.includes(trader.id) || false;
                const isSelected = selectedTraderId === trader.id;
                const isExpanded = expandedCardIds.has(trader.id);
                const canEditDelete = profile?.is_admin || trader.createdBy === profile?.id;

                return (
                  <ExpandableSignalCard
                    key={trader.id}
                    signal={trader}
                    isExpanded={isExpanded}
                    isSelected={isSelected}
                    isFavorite={isFavorite}
                    showCloudStatus={cloudExecution.isEliteTier}
                    cloudMachineStatus={cloudExecution.machineStatus}
                    canEdit={canEditDelete}
                    canDelete={canEditDelete}
                    onToggleExpand={() => handleToggleExpand(trader.id)}
                    onSelect={() => onSelectTrader?.(isSelected ? null : trader.id)}
                    onToggleEnable={() => handleToggleTrader(trader)}
                    onToggleCloud={() => handleToggleCloudExecution(trader)}
                    onEdit={() => onEditTrader(trader)}
                    onDelete={() => handleDeleteTrader(trader)}
                    onToggleFavorite={() => handleToggleFavorite(trader.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </TierGate>
      )}

      {/* Favorites Section */}
      {activeTab === 'favorites' && (
        <div>
          {favoriteSignals.length === 0 ? (
            <div className="text-center py-8 text-[var(--nt-text-muted)]">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="mb-2">No favorite signals yet</p>
              <p className="text-sm">Click the star icon on any signal to add it to your favorites</p>
            </div>
          ) : (
            <div className="space-y-2">
              {favoriteSignals.map(trader => {
                const access = getSignalAccess(trader, currentTier);
                const isFavorite = true; // Always true in favorites tab
                const isSelected = selectedTraderId === trader.id;
                const isExpanded = expandedCardIds.has(trader.id);
                const effectivelyEnabled = getEffectiveEnabled(trader);
                const canEditDelete = profile?.is_admin || trader.createdBy === profile?.id;

                return (
                  <ExpandableSignalCard
                    key={trader.id}
                    signal={{...trader, enabled: effectivelyEnabled}}
                    isExpanded={isExpanded}
                    isSelected={isSelected}
                    isFavorite={isFavorite}
                    canEdit={canEditDelete}
                    canDelete={canEditDelete}
                    onToggleExpand={() => handleToggleExpand(trader.id)}
                    onSelect={() => onSelectTrader?.(isSelected ? null : trader.id)}
                    onToggleEnable={() => handleToggleTrader(trader)}
                    onEdit={() => onEditTrader(trader)}
                    onDelete={() => handleDeleteTrader(trader)}
                    onToggleFavorite={() => handleToggleFavorite(trader.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Cloud Execution Panel Modal */}
      {showCloudPanel && cloudExecution.isEliteTier && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="max-w-2xl w-full">
            <CloudExecutionPanel onClose={() => setShowCloudPanel(false)} />
          </div>
        </div>
      )}
    </div>
  );
}