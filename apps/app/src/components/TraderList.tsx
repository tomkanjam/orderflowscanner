import React, { useEffect, useState, useMemo } from 'react';
import { Trader } from '../abstractions/trader.interfaces';
import { traderManager } from '../services/traderManager';
import { Plus, Activity, Cloud } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { getSignalAccess } from '../utils/tierAccess';
import { TierGate } from './TierGate';
import { UpgradePrompt } from './UpgradePrompt';
import { SubscriptionTier } from '../types/subscription.types';
import { SignalCardEnhanced } from './SignalCardEnhanced';
import { useCloudExecution } from '../hooks/useCloudExecution';
import { CloudExecutionPanel } from './cloud/CloudExecutionPanel';

interface TraderListProps {
  onCreateTrader: () => void;
  onEditTrader: (trader: Trader) => void;
  onSelectTrader?: (traderId: string | null) => void;
  selectedTraderId?: string | null;
}

export function TraderList({
  onCreateTrader,
  onEditTrader,
  onSelectTrader,
  selectedTraderId
}: TraderListProps) {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCloudPanel, setShowCloudPanel] = useState(false);
  const { currentTier, preferences, canCreateSignal, remainingSignals, toggleFavoriteSignal, profile } = useSubscription();
  const cloudExecution = useCloudExecution();

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

  // Filter and categorize traders based on access
  const { builtInSignals, customSignals, lockedSignals } = useMemo(() => {
    const builtIn: Trader[] = [];
    const custom: Trader[] = [];
    const locked: Trader[] = [];

    traders.forEach(trader => {
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

    return { builtInSignals: builtIn, customSignals: custom, lockedSignals: locked };
  }, [traders, currentTier]);

  const handleToggleTrader = async (trader: Trader) => {
    try {
      if (trader.enabled) {
        await traderManager.disableTrader(trader.id);
      } else {
        await traderManager.enableTrader(trader.id);
      }
    } catch (error) {
      console.error('Failed to toggle trader:', error);
    }
  };

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
    <div className="p-4 space-y-6">
      {/* Built-in Signals Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[var(--nt-text-primary)]">
            Signals
          </h3>
        </div>

        {builtInSignals.length === 0 && lockedSignals.length === 0 ? (
          <div className="text-center py-8 text-[var(--nt-text-muted)]">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="mb-2">No signals available</p>
          </div>
        ) : (
          <div className="space-y-2">
            {builtInSignals.map(trader => {
              const access = getSignalAccess(trader, currentTier);
              const isFavorite = preferences?.favorite_signals?.includes(trader.id) || false;
              const isSelected = selectedTraderId === trader.id;
              
              return (
                <SignalCardEnhanced
                  key={trader.id}
                  signal={trader}
                  isSelected={isSelected}
                  isFavorite={isFavorite}
                  canView={access.canView}
                  canFavorite={access.canFavorite}
                  showAccessIndicator={true}
                  showEditDelete={profile?.is_admin}
                  onSelect={() => onSelectTrader?.(isSelected ? null : trader.id)}
                  onEdit={() => onEditTrader(trader)}
                  onDelete={() => handleDeleteTrader(trader)}
                  onToggleFavorite={() => handleToggleFavorite(trader.id)}
                />
              );
            })}
            {lockedSignals.length > 0 && currentTier === 'anonymous' && (
              <UpgradePrompt 
                feature="20+ professional signals" 
                requiredTier={SubscriptionTier.FREE}
                className="mt-4"
              />
            )}
          </div>
        )}
      </div>

      {/* Custom Signals Section */}
      <TierGate minTier="pro" fallback={
        currentTier !== 'anonymous' && (
          <UpgradePrompt 
            feature="custom signal creation" 
            requiredTier={SubscriptionTier.PRO}
          />
        )
      }>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-[var(--nt-text-primary)]">
              {currentTier === 'elite' ? 'My AI Traders' : 'My Signals'}
            </h3>
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

              <button
                onClick={onCreateTrader}
                disabled={!canCreateSignal()}
                className="flex items-center gap-2 px-3 py-1.5 bg-[var(--nt-bg-primary)] text-[var(--nt-accent-lime)]
                  border border-[var(--nt-accent-lime)] rounded hover:bg-[var(--nt-accent-lime)] hover:text-[var(--nt-bg-primary)]
                  transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" />
                Create
              </button>
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
                const canEditDelete = profile?.is_admin || trader.createdBy === profile?.id;

                return (
                  <SignalCardEnhanced
                    key={trader.id}
                    signal={trader}
                    isSelected={isSelected}
                    isFavorite={isFavorite}
                    canView={access.canView}
                    canFavorite={access.canFavorite}
                    showEnableToggle={true}
                    showEditDelete={canEditDelete}
                    showAIFeatures={currentTier === 'elite'} // Pass tier info
                    showCloudExecution={cloudExecution.isEliteTier} // Show cloud controls for Elite users
                    cloudMachineStatus={cloudExecution.machineStatus}
                    onSelect={() => onSelectTrader?.(isSelected ? null : trader.id)}
                    onToggleEnable={() => handleToggleTrader(trader)}
                    onEdit={() => onEditTrader(trader)}
                    onDelete={() => handleDeleteTrader(trader)}
                    onToggleFavorite={() => handleToggleFavorite(trader.id)}
                    onToggleCloudExecution={() => handleToggleCloudExecution(trader)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </TierGate>

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