import React, { useState, useRef } from 'react';
import { X, Wand2, Code, AlertCircle, Loader2, ChevronLeft, Shield } from 'lucide-react';
import { generateTrader, generateFilterCode } from '../../services/geminiService';
import { traderManager } from '../services/traderManager';
import { Trader, TraderGeneration } from '../abstractions/trader.interfaces';
import { MODEL_TIERS, type ModelTier } from '../constants/models';
import { KlineInterval } from '../../types';
import { KLINE_INTERVALS } from '../../constants';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../contexts/SubscriptionContext';
import { EmailAuthModal } from './auth/EmailAuthModal';
import { AccessTier, SubscriptionTier } from '../types/subscription.types';
import { UpgradePrompt } from './UpgradePrompt';

interface TraderFormProps {
  onTraderCreated?: (trader: Trader) => void;
  editingTrader?: Trader;
  onCancel?: () => void;
}

type CreationMode = 'ai' | 'manual';

export function TraderForm({ 
  onTraderCreated,
  editingTrader,
  onCancel
}: TraderFormProps) {
  const { user } = useAuth();
  const { profile, canCreateSignal, currentTier } = useSubscription();
  const [mode, setMode] = useState<CreationMode>(editingTrader ? 'manual' : 'ai');
  const [aiPrompt, setAiPrompt] = useState('');
  const [manualName, setManualName] = useState(editingTrader?.name || '');
  const [manualDescription, setManualDescription] = useState(editingTrader?.description || '');
  const [manualFilterCode, setManualFilterCode] = useState(editingTrader?.filter.code || '');
  const [manualStrategy, setManualStrategy] = useState(editingTrader?.strategy.instructions || '');
  const [filterConditions, setFilterConditions] = useState<string[]>(editingTrader?.filter?.description || []);
  const [aiAnalysisLimit, setAiAnalysisLimit] = useState(editingTrader?.strategy.aiAnalysisLimit || 100);
  const [modelTier, setModelTier] = useState<ModelTier>(editingTrader?.strategy.modelTier || 'standard');
  const [filterInterval, setFilterInterval] = useState<KlineInterval>(editingTrader?.filter?.interval || KlineInterval.FIVE_MINUTES);
  const [maxConcurrentAnalysis, setMaxConcurrentAnalysis] = useState(editingTrader?.strategy.maxConcurrentAnalysis || 3);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [generatedTrader, setGeneratedTrader] = useState<TraderGeneration | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingTraderData, setPendingTraderData] = useState<any>(null);
  
  // Streaming state
  const [generationProgress, setGenerationProgress] = useState(0);
  const [streamingConditions, setStreamingConditions] = useState<string[]>([]);
  const [streamingStrategy, setStreamingStrategy] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Admin fields for built-in signals
  const [isBuiltIn, setIsBuiltIn] = useState(editingTrader?.isBuiltIn || false);
  const [accessTier, setAccessTier] = useState<AccessTier>(editingTrader?.accessTier || AccessTier.ELITE);
  const [category, setCategory] = useState(editingTrader?.category || '');
  const [difficulty, setDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>(editingTrader?.difficulty || 'beginner');
  const [adminNotes, setAdminNotes] = useState(editingTrader?.adminNotes || '');
  const [defaultEnabled, setDefaultEnabled] = useState(editingTrader?.default_enabled || false);

  // Automation toggles
  const [autoAnalyzeSignals, setAutoAnalyzeSignals] = useState(editingTrader?.auto_analyze_signals || false);
  const [autoExecuteTrades, setAutoExecuteTrades] = useState(editingTrader?.auto_execute_trades || false);

  // Track the original conditions and interval to detect changes
  const originalConditionsRef = useRef<string[]>(editingTrader?.filter?.description || []);
  const originalIntervalRef = useRef<KlineInterval>(editingTrader?.filter?.interval || KlineInterval.ONE_MINUTE);
  

  // Check for pending prompt in localStorage on component mount
  React.useEffect(() => {
    const pendingPrompt = localStorage.getItem('pendingScreenerPrompt');
    if (pendingPrompt && user && !editingTrader) {
      // Pre-fill the AI prompt and switch to AI mode
      setMode('ai');
      setAiPrompt(pendingPrompt);
      // Clear the localStorage immediately to prevent re-use
      localStorage.removeItem('pendingScreenerPrompt');
      // Optionally, auto-trigger generation
      // handleGenerateTrader(); // Uncomment if you want auto-generation
    }
  }, [user, editingTrader]);

  // Update form fields when editingTrader changes
  React.useEffect(() => {
    if (editingTrader) {
      setMode('manual'); // Switch to manual mode when editing
      setManualName(editingTrader.name || '');
      setManualDescription(editingTrader.description || '');
      setManualFilterCode(editingTrader.filter?.code || '');
      setManualStrategy(editingTrader.strategy?.instructions || '');
      setFilterConditions(editingTrader.filter?.description || []);
      setAiAnalysisLimit(editingTrader.strategy?.aiAnalysisLimit || 100);
      setModelTier(editingTrader.strategy?.modelTier || 'standard');
      setFilterInterval(editingTrader.filter?.interval || KlineInterval.FIVE_MINUTES);
      setMaxConcurrentAnalysis(editingTrader.strategy?.maxConcurrentAnalysis || 3);
      originalConditionsRef.current = editingTrader.filter?.description || [];
      originalIntervalRef.current = editingTrader.filter?.interval || KlineInterval.FIVE_MINUTES;
    }
  }, [editingTrader]);

  // Handle auth success - resume pending operation
  const handleAuthSuccess = React.useCallback(() => {
    setShowAuthModal(false);
    
    // Also check localStorage in case modal was closed differently
    const pendingPrompt = localStorage.getItem('pendingScreenerPrompt');
    if (pendingPrompt) {
      setMode('ai');
      setAiPrompt(pendingPrompt);
      localStorage.removeItem('pendingScreenerPrompt');
      setPendingTraderData({ aiPrompt: pendingPrompt });
    } else if (pendingTraderData) {
      if (pendingTraderData.aiPrompt) {
        // Resume AI generation
        setAiPrompt(pendingTraderData.aiPrompt);
        // We'll trigger the generation after the component re-renders
      } else if (pendingTraderData.mode === 'manual') {
        // Resume manual creation after the component re-renders
      }
    }
  }, [pendingTraderData]);

  // Effect to resume operations after auth success
  React.useEffect(() => {
    if (user && pendingTraderData && !showAuthModal) {
      if (pendingTraderData.aiPrompt) {
        handleGenerateTrader();
      } else if (pendingTraderData.mode === 'manual') {
        handleCreateTrader();
      }
      setPendingTraderData(null);
    }
  }, [user, pendingTraderData, showAuthModal]);
  
  

  const resetForm = () => {
    setMode('ai');
    setAiPrompt('');
    setManualName('');
    setManualDescription('');
    setManualFilterCode('');
    setManualStrategy('');
    setFilterConditions([]);
    setAiAnalysisLimit(100);
    setModelTier('standard');
    setFilterInterval(KlineInterval.ONE_MINUTE);
    setMaxConcurrentAnalysis(3);
    setGenerating(false);
    setRegeneratingCode(false);
    setError('');
    setGeneratedTrader(null);
    setPendingTraderData(null);
    originalConditionsRef.current = [];
    originalIntervalRef.current = KlineInterval.ONE_MINUTE;
    // Clear streaming state
    setGenerationProgress(0);
    setStreamingConditions([]);
    setStreamingStrategy('');
    setIsStreaming(false);
    // Clear any pending prompt from localStorage
    localStorage.removeItem('pendingScreenerPrompt');
  };

  const handleCancel = () => {
    resetForm();
    onCancel?.();
  };

  const handleGenerateTrader = async () => {
    if (!aiPrompt.trim()) {
      setError('Please enter a strategy description');
      return;
    }

    // Check if user is authenticated
    if (!user) {
      // Store the AI prompt and show auth modal
      setPendingTraderData({ aiPrompt });
      setShowAuthModal(true);
      return;
    }

    setGenerating(true);
    setError('');
    setIsStreaming(true);
    setGenerationProgress(0);
    setStreamingConditions([]);
    setStreamingStrategy('');

    try {
      const generated = await generateTrader(
        aiPrompt, 
        modelTier === 'fast' ? 'gemini-2.5-flash' : 'gemini-2.5-pro',
        filterInterval,
        // Streaming callback
        (update) => {
          switch (update.type) {
            case 'progress':
              setGenerationProgress(update.progress || 0);
              break;
            case 'condition':
              if (update.condition) {
                setStreamingConditions(prev => [...prev, update.condition!]);
              }
              break;
            case 'strategy':
              if (update.strategyText) {
                setStreamingStrategy(update.strategyText);
              }
              break;
            case 'complete':
              setIsStreaming(false);
              break;
            case 'error':
              setIsStreaming(false);
              setError(update.error?.message || 'Generation failed');
              break;
          }
        }
      );
      
      setGeneratedTrader(generated);
      
      // Switch to manual mode and populate fields
      setMode('manual');
      setManualName(generated.suggestedName);
      setManualDescription(generated.description);
      setManualFilterCode(generated.filterCode);
      setManualStrategy(generated.strategyInstructions);
      setFilterConditions(generated.filterDescription || []);
      originalConditionsRef.current = generated.filterDescription || [];
      originalIntervalRef.current = filterInterval;
    } catch (error) {
      console.error('Failed to generate trader:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate trader');
      // Clear any pending prompt from localStorage on error
      localStorage.removeItem('pendingScreenerPrompt');
    } finally {
      setGenerating(false);
      setIsStreaming(false);
    }
  };
  

  const handleCreateTrader = async () => {
    // Check if user is authenticated
    if (!user) {
      // Store the current form data
      setPendingTraderData({
        mode: 'manual',
        name: manualName,
        description: manualDescription,
        filterCode: manualFilterCode,
        strategy: manualStrategy,
        filterConditions,
        aiAnalysisLimit,
        modelTier,
        filterInterval,
        maxConcurrentAnalysis,
        generatedTrader,
        editingTrader
      });
      setShowAuthModal(true);
      return;
    }

    // Check if user has permission to create signals (Pro or Elite tier)
    if (!editingTrader && !canCreateSignal()) {
      setError('Upgrade to Pro to create custom signals');
      return;
    }

    // Validate fields
    if (!manualName.trim()) {
      setError('Trader name is required');
      return;
    }

    if (!manualStrategy.trim()) {
      setError('Strategy instructions are required');
      return;
    }

    // Validate filter conditions
    const validConditions = filterConditions.filter((c: string) => c.trim().length > 0);
    if (validConditions.length === 0) {
      setError('At least one filter condition is required');
      return;
    }
    
    // Check if we need to regenerate code for edited traders
    let finalFilterCode = manualFilterCode;
    if (editingTrader) {
      // Check if conditions have changed
      const conditionsChanged = JSON.stringify(validConditions) !== JSON.stringify(originalConditionsRef.current) ||
                              filterInterval !== originalIntervalRef.current;
      
      if (conditionsChanged) {
        // Regenerate filter code
        setRegeneratingCode(true);
        try {
          const { filterCode, requiredTimeframes } = await generateFilterCode(validConditions, 'gemini-2.5-pro', filterInterval);
          finalFilterCode = filterCode;
          // Update the generated trader with new required timeframes if available
          if (requiredTimeframes && generatedTrader) {
            setGeneratedTrader({
              ...generatedTrader,
              requiredTimeframes
            });
          }
        } catch (error) {
          console.error('Failed to regenerate filter code:', error);
          setError('Failed to regenerate filter code. Please try again.');
          setRegeneratingCode(false);
          return;
        }
        setRegeneratingCode(false);
      }
    }

    if (!finalFilterCode.trim()) {
      setError('Filter code is required');
      return;
    }

    try {
      setError('');
      
      if (editingTrader) {
        // Update existing trader
        const updated = await traderManager.updateTrader(editingTrader.id, {
          name: manualName,
          description: manualDescription || manualName,
          filter: {
            code: finalFilterCode,
            description: validConditions,
            indicators: generatedTrader?.indicators || editingTrader.filter.indicators,
            refreshInterval: filterInterval,
            requiredTimeframes: generatedTrader?.requiredTimeframes || editingTrader.filter.requiredTimeframes || [filterInterval],
            language: 'go' as const // All new/updated traders use Go backend
          },
          strategy: {
            instructions: manualStrategy,
            riskManagement: generatedTrader?.riskParameters || editingTrader.strategy.riskManagement,
            aiAnalysisLimit: aiAnalysisLimit,
            modelTier: modelTier,
            maxConcurrentAnalysis: maxConcurrentAnalysis
          },
          // Admin fields
          ...(profile?.is_admin && {
            isBuiltIn,
            // Clear userId when converting to built-in
            userId: isBuiltIn ? undefined : editingTrader.userId,
            ownershipType: isBuiltIn ? 'system' : 'user',
            accessTier,
            category: isBuiltIn ? category : undefined,
            difficulty: isBuiltIn ? difficulty : undefined,
            adminNotes: isBuiltIn ? adminNotes : undefined,
            default_enabled: isBuiltIn ? defaultEnabled : undefined
          }),
          // Automation toggles
          auto_analyze_signals: autoAnalyzeSignals,
          auto_execute_trades: autoExecuteTrades
        });
        
        onTraderCreated?.(updated);
      } else {
        // Create new trader
        const trader = await traderManager.createTrader({
          name: manualName,
          description: manualDescription || manualName,
          enabled: true,
          mode: 'demo', // Always start in demo mode
          // Built-in signals should not have userId (system-owned)
          userId: (profile?.is_admin && isBuiltIn) ? undefined : user?.id,
          filter: {
            code: finalFilterCode,
            description: validConditions,
            indicators: generatedTrader?.indicators || [],
            refreshInterval: filterInterval,
            requiredTimeframes: generatedTrader?.requiredTimeframes || [filterInterval],
            language: 'go' as const // All new traders use Go backend
          },
          strategy: {
            instructions: manualStrategy,
            riskManagement: generatedTrader?.riskParameters || {
              stopLoss: 0.02,
              takeProfit: 0.05,
              maxPositions: 3,
              positionSizePercent: 0.1
            },
            aiAnalysisLimit: aiAnalysisLimit,
            modelTier: modelTier,
            maxConcurrentAnalysis: maxConcurrentAnalysis
          },
          // Automation toggles
          auto_analyze_signals: autoAnalyzeSignals,
          auto_execute_trades: autoExecuteTrades,
          // Admin fields for new traders
          ...(profile?.is_admin && {
            isBuiltIn,
            ownershipType: isBuiltIn ? 'system' : 'user',
            accessTier,
            category: isBuiltIn ? category : undefined,
            difficulty: isBuiltIn ? difficulty : undefined,
            adminNotes: isBuiltIn ? adminNotes : undefined,
            default_enabled: isBuiltIn ? defaultEnabled : undefined
          })
        });

        // Execute trader immediately to generate initial signals
        try {
          await traderManager.executeTraderImmediate(trader.id);
          console.log('[TraderForm] Initial signals generated successfully');
        } catch (execError) {
          // Log but don't fail - trader was created successfully
          console.error('[TraderForm] Failed to generate initial signals:', execError);
          // User will see signals on next candle close
        }

        onTraderCreated?.(trader);
      }

      // Clear any pending prompt from localStorage on successful creation
      localStorage.removeItem('pendingScreenerPrompt');
      resetForm();
    } catch (error) {
      console.error('Failed to save trader:', error);
      setError(error instanceof Error ? error.message : 'Failed to save trader');
      // Clear any pending prompt from localStorage on error
      localStorage.removeItem('pendingScreenerPrompt');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        {onCancel && (
          <button
            onClick={handleCancel}
            className="p-1 text-[var(--nt-text-muted)] hover:text-[var(--nt-text-primary)] transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <h3 className="text-lg font-semibold text-[var(--nt-text-primary)]">
          {editingTrader ? 'Edit Signal' : 'Create New Signal'}
        </h3>
      </div>

      {/* Show upgrade prompt for Free users and stop here */}
      {!editingTrader && user && currentTier === 'free' ? (
        <UpgradePrompt 
          feature="custom signal creation" 
          requiredTier={SubscriptionTier.PRO}
          compact={false}
        />
      ) : (
      /* Only show form content if user can create signals or is editing */
        <>
      {/* Mode Selection (only for new traders) */}
      {!editingTrader && (
        <div className="flex gap-2">
          <button
            onClick={() => setMode('ai')}
            className={`flex-1 p-3 rounded-lg border transition-all ${
              mode === 'ai'
                ? 'bg-[var(--nt-accent-lime)]/10 border-[var(--nt-accent-lime)] text-[var(--nt-accent-lime)]'
                : 'border-[var(--nt-border-default)] text-[var(--nt-text-muted)] hover:border-[var(--nt-border-light)]'
            }`}
          >
            <Wand2 className="h-5 w-5 mx-auto mb-1" />
            <div className="text-sm font-medium">AI Generate</div>
            <div className="text-xs mt-1">Describe in natural language</div>
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 p-3 rounded-lg border transition-all ${
              mode === 'manual'
                ? 'bg-[var(--nt-accent-lime)]/10 border-[var(--nt-accent-lime)] text-[var(--nt-accent-lime)]'
                : 'border-[var(--nt-border-default)] text-[var(--nt-text-muted)] hover:border-[var(--nt-border-light)]'
            }`}
          >
            <Code className="h-5 w-5 mx-auto mb-1" />
            <div className="text-sm font-medium">Manual Entry</div>
            <div className="text-xs mt-1">Write code directly</div>
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500 rounded-lg flex items-start gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* AI Generation Form */}
      {mode === 'ai' && !editingTrader && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-2">
              Describe Your Signal
            </label>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Example: Create a momentum trader that buys strong uptrends with increasing volume"
              className="w-full p-3 bg-[var(--nt-bg-secondary)] border border-[var(--nt-border-default)] rounded-lg text-[var(--nt-text-primary)] placeholder-[var(--nt-text-muted)] focus:border-amber-500/50 focus:outline-none resize-none"
              rows={4}
            />
          </div>

          <button
            onClick={handleGenerateTrader}
            disabled={generating || !aiPrompt.trim()}
            className="w-full py-2 bg-[var(--nt-accent-lime)] text-[var(--nt-bg-primary)] rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Generate Signal
              </>
            )}
          </button>

          {/* Streaming Progress Display */}
          {isStreaming && (
            <div className="space-y-3 p-4 bg-[var(--nt-bg-secondary)] border border-[var(--nt-border-default)] rounded-lg">
              {/* Progress Bar */}
              <div>
                <div className="flex justify-between text-xs text-[var(--nt-text-muted)] mb-1">
                  <span>Generating trader...</span>
                  <span>{generationProgress}%</span>
                </div>
                <div className="w-full h-2 bg-[var(--nt-bg-primary)] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[var(--nt-accent-lime)] transition-all duration-300"
                    style={{ width: `${generationProgress}%` }}
                  />
                </div>
              </div>

              {/* Streaming Conditions */}
              {streamingConditions.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-[var(--nt-text-primary)] mb-2">Filter Conditions:</h4>
                  <div className="space-y-1">
                    {streamingConditions.map((condition, index) => (
                      <div key={index} className="flex items-start gap-2 animate-fadeIn">
                        <span className="text-[var(--nt-accent-lime)] text-xs mt-0.5">▸</span>
                        <span className="text-sm text-[var(--nt-text-secondary)]">{condition}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Streaming Strategy */}
              {streamingStrategy && (
                <div>
                  <h4 className="text-sm font-medium text-[var(--nt-text-primary)] mb-2">Strategy Instructions:</h4>
                  <p className="text-sm text-[var(--nt-text-secondary)] leading-relaxed">{streamingStrategy}</p>
                </div>
              )}

              {/* Loading Spinner for current step */}
              <div className="flex items-center gap-2 text-sm text-[var(--nt-text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {generationProgress < 90 ? 'Analyzing market patterns...' : 'Generating filter code...'}
                </span>
              </div>
            </div>
          )}

          <div className="text-xs text-[var(--nt-text-muted)]">
            The AI will create a complete trader including filter conditions, strategy instructions, and risk parameters based on your description.
          </div>
        </div>
      )}

      {/* Manual Entry Form */}
      {(mode === 'manual' || editingTrader) && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-1">
              Signal Name
            </label>
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="e.g., RSI Bounce Signal"
              className="w-full p-2 bg-[var(--nt-bg-secondary)] border border-[var(--nt-border-default)] rounded-lg text-[var(--nt-text-primary)] placeholder-[var(--nt-text-muted)] focus:border-amber-500/50 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-1">
              Description
            </label>
            <input
              type="text"
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
              placeholder="Brief description of what this trader does"
              className="w-full p-2 bg-[var(--nt-bg-secondary)] border border-[var(--nt-border-default)] rounded-lg text-[var(--nt-text-primary)] placeholder-[var(--nt-text-muted)] focus:border-amber-500/50 focus:outline-none"
            />
          </div>

          {/* Filter Conditions - Editable */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-[var(--nt-text-primary)]">
                Filter Conditions
              </label>
              {regeneratingCode && (
                <div className="flex items-center gap-1 text-xs text-[var(--nt-accent-lime)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Regenerating code...
                </div>
              )}
            </div>
            <div className="space-y-2">
              {filterConditions.map((condition, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-[var(--nt-accent-lime)] mt-2 text-xs">▸</span>
                  <input
                    type="text"
                    value={condition}
                    onChange={(e) => {
                      const newConditions = [...filterConditions];
                      newConditions[index] = e.target.value;
                      setFilterConditions(newConditions);
                    }}
                    placeholder={`Condition ${index + 1}`}
                    className="flex-1 p-2 bg-[var(--nt-bg-secondary)] border border-[var(--nt-border-default)] rounded-lg text-[var(--nt-text-primary)] placeholder-[var(--nt-text-muted)] focus:border-amber-500/50 focus:outline-none text-sm"
                  />
                  <button
                    onClick={() => {
                      const newConditions = filterConditions.filter((_, i) => i !== index);
                      setFilterConditions(newConditions);
                    }}
                    className="p-2 text-[var(--nt-text-muted)] hover:text-red-500 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setFilterConditions([...filterConditions, ''])}
                className="w-full p-2 border border-dashed border-[var(--nt-border-default)] rounded-lg text-[var(--nt-text-muted)] hover:border-[var(--nt-accent-lime)] hover:text-[var(--nt-accent-lime)] transition-all text-sm"
              >
                + Add Condition
              </button>
            </div>
            <p className="text-xs text-[var(--nt-text-muted)] mt-2">
              Describe what market conditions this trader looks for in plain language
            </p>
          </div>

          {/* Indicators Display */}
          {generatedTrader?.indicators && generatedTrader.indicators.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-1">
                Chart Indicators
              </label>
              <div className="bg-[var(--nt-bg-secondary)] border border-[var(--nt-border-default)] rounded-lg p-3">
                <div className="flex flex-wrap gap-2">
                  {generatedTrader.indicators.map((indicator, index) => (
                    <span 
                      key={indicator.id || `indicator-${index}`} 
                      className="px-2 py-1 bg-[var(--nt-bg-primary)] rounded text-xs text-[var(--nt-text-secondary)]"
                    >
                      {indicator.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Advanced Settings Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-[var(--nt-text-muted)] hover:text-[var(--nt-text-primary)] transition-colors flex items-center gap-1"
            >
              <span>{showAdvanced ? '▼' : '▶'}</span>
              Advanced Settings
            </button>
          </div>

          {/* Filter Code (Hidden by default) */}
          {showAdvanced && (
            <div>
              <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-1">
                Filter Code (Advanced)
              </label>
              <textarea
                value={manualFilterCode}
                onChange={(e) => setManualFilterCode(e.target.value)}
                placeholder="// JavaScript function body that returns boolean"
                className="w-full p-3 bg-[var(--nt-bg-secondary)] border border-[var(--nt-border-default)] rounded-lg text-[var(--nt-text-primary)] placeholder-[var(--nt-text-muted)] focus:border-amber-500/50 focus:outline-none resize-none font-mono text-sm"
                rows={6}
              />
              <p className="text-xs text-[var(--nt-text-muted)] mt-1">
                ⚠️ This code is automatically generated from the filter conditions above. Manual edits will be lost when conditions change.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-1">
              Strategy Instructions
            </label>
            <textarea
              value={manualStrategy}
              onChange={(e) => setManualStrategy(e.target.value)}
              placeholder="Detailed instructions for the AI analyzer. Include entry criteria, exit criteria, and risk management rules."
              className="w-full p-3 bg-[var(--nt-bg-secondary)] border border-[var(--nt-border-default)] rounded-lg text-[var(--nt-text-primary)] placeholder-[var(--nt-text-muted)] focus:border-amber-500/50 focus:outline-none resize-none"
              rows={4}
            />
          </div>

          {/* Candle Interval Selection */}
          <div>
            <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-1">
              Candle Interval
            </label>
            <select
              value={filterInterval}
              onChange={(e) => setFilterInterval(e.target.value as KlineInterval)}
              className="w-full p-2 bg-[var(--nt-bg-secondary)] border border-[var(--nt-border-default)] rounded-lg text-[var(--nt-text-primary)] focus:border-amber-500/50 focus:outline-none"
            >
              {KLINE_INTERVALS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--nt-text-muted)] mt-1">
              The time interval for candlestick data this trader will analyze
            </p>
            {editingTrader && filterInterval !== originalIntervalRef.current && (
              <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200">
                  <strong>Warning:</strong> You've changed the interval from {originalIntervalRef.current} to {filterInterval}.
                  Consider regenerating the filter code to ensure it's optimized for the new interval.
                </p>
              </div>
            )}
          </div>

          {/* AI Analysis Data Limit */}
          <div>
            <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-1">
              AI Analysis Data Limit
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="1000"
                step="10"
                value={aiAnalysisLimit}
                onChange={(e) => setAiAnalysisLimit(parseInt(e.target.value))}
                className="flex-1"
              />
              <input
                type="number"
                min="1"
                max="1000"
                value={aiAnalysisLimit}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value >= 1 && value <= 1000) {
                    setAiAnalysisLimit(value);
                  }
                }}
                className="w-20 nt-input text-sm px-2 py-1"
              />
              <span className="text-sm text-[var(--nt-text-muted)]">bars</span>
            </div>
            <p className="text-xs text-[var(--nt-text-muted)] mt-1">
              Number of historical price bars and indicator values sent to AI for signal analysis (1-1000 bars)
            </p>
          </div>

          {/* AI Model Selection */}
          <div>
            <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-1">
              AI Model for Analysis
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(MODEL_TIERS) as [ModelTier, typeof MODEL_TIERS[ModelTier]][]).map(([tier, config]) => (
                <button
                  key={tier}
                  onClick={() => setModelTier(tier)}
                  className={`p-2 rounded-lg border transition-all ${
                    modelTier === tier
                      ? 'bg-[var(--nt-accent-lime)]/10 border-[var(--nt-accent-lime)] text-[var(--nt-accent-lime)]'
                      : 'border-[var(--nt-border-default)] text-[var(--nt-text-muted)] hover:border-[var(--nt-border-light)]'
                  }`}
                >
                  <div className="font-medium text-sm">{config.name}</div>
                  <div className="text-xs mt-1">{config.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Max Concurrent Analysis */}
          <div>
            <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-1">
              Max Concurrent Analysis
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={maxConcurrentAnalysis}
                onChange={(e) => setMaxConcurrentAnalysis(parseInt(e.target.value))}
                className="flex-1"
              />
              <input
                type="number"
                min="1"
                max="10"
                value={maxConcurrentAnalysis}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value >= 1 && value <= 10) {
                    setMaxConcurrentAnalysis(value);
                  }
                }}
                className="w-16 nt-input text-sm px-2 py-1"
              />
              <span className="text-sm text-[var(--nt-text-muted)]">signals</span>
            </div>
            <p className="text-xs text-[var(--nt-text-muted)] mt-1">
              Maximum number of signals from this trader that can be analyzed simultaneously (1-10)
            </p>
          </div>

          {/* Automation Settings (Elite tier only) */}
          {currentTier === 'elite' && (
            <div className="space-y-4 p-4 bg-[var(--nt-bg-tertiary)] rounded-lg border border-[var(--nt-border-light)]">
              <div className="font-medium text-sm text-[var(--nt-text-primary)]">
                Automation Settings
              </div>
              <p className="text-xs text-[var(--nt-text-muted)]">
                Control automatic AI analysis and trade execution for this trader
              </p>

              {/* Auto-Analyze Signals Toggle */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="autoAnalyzeSignals"
                  checked={autoAnalyzeSignals}
                  onChange={(e) => setAutoAnalyzeSignals(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[var(--nt-border-default)] bg-[var(--nt-bg-secondary)]
                    text-[var(--nt-accent-lime)] focus:ring-[var(--nt-accent-lime)] focus:ring-offset-0"
                />
                <label htmlFor="autoAnalyzeSignals" className="flex-1 cursor-pointer">
                  <div className="font-medium text-sm text-[var(--nt-text-primary)]">
                    Auto-Analyze Signals
                  </div>
                  <p className="text-xs text-[var(--nt-text-muted)] mt-1">
                    Automatically run AI analysis on every new signal from this trader
                  </p>
                </label>
              </div>

              {/* Auto-Execute Trades Toggle (Coming Soon) */}
              <div className="flex items-start gap-3 opacity-50">
                <input
                  type="checkbox"
                  id="autoExecuteTrades"
                  checked={autoExecuteTrades}
                  disabled={true}
                  className="mt-1 h-4 w-4 rounded border-[var(--nt-border-default)] bg-[var(--nt-bg-secondary)]
                    text-[var(--nt-accent-lime)] focus:ring-[var(--nt-accent-lime)] focus:ring-offset-0"
                />
                <label htmlFor="autoExecuteTrades" className="flex-1">
                  <div className="font-medium text-sm text-[var(--nt-text-primary)]">
                    Auto-Execute Trades
                    <span className="ml-2 text-xs text-[var(--nt-text-muted)]">(Coming Soon)</span>
                  </div>
                  <p className="text-xs text-[var(--nt-text-muted)] mt-1">
                    Automatically execute trades based on AI analysis recommendations
                  </p>
                </label>
              </div>
            </div>
          )}

          {/* Admin-only fields for built-in signals */}
          {profile?.is_admin && (
            <div className="space-y-4 p-4 bg-[var(--nt-bg-tertiary)] rounded-lg border border-[var(--nt-border-light)]">
              <div className="flex items-center gap-2 text-[var(--nt-warning)] mb-2">
                <Shield className="h-4 w-4" />
                <span className="font-medium text-sm">Admin Configuration</span>
              </div>

              {/* Built-in Signal Toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isBuiltIn"
                  checked={isBuiltIn}
                  onChange={(e) => setIsBuiltIn(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--nt-border-default)] bg-[var(--nt-bg-secondary)] 
                    text-[var(--nt-accent-lime)] focus:ring-[var(--nt-accent-lime)] focus:ring-offset-0"
                />
                <label htmlFor="isBuiltIn" className="text-sm text-[var(--nt-text-primary)]">
                  Mark as Built-in Signal
                </label>
              </div>

              {isBuiltIn && (
                <>
                  {/* Access Tier */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-1">
                      Access Tier
                    </label>
                    <select
                      value={accessTier}
                      onChange={(e) => setAccessTier(e.target.value as AccessTier)}
                      className="w-full nt-input"
                    >
                      <option value={AccessTier.ANONYMOUS}>Anonymous (No login required)</option>
                      <option value={AccessTier.FREE}>Free (Login required)</option>
                      <option value={AccessTier.PRO}>Pro</option>
                      <option value={AccessTier.ELITE}>Elite</option>
                    </select>
                    <p className="text-xs text-[var(--nt-text-muted)] mt-1">
                      Minimum tier required to access this signal
                    </p>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-1">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full nt-input"
                    >
                      <option value="">Select category</option>
                      <option value="momentum">Momentum</option>
                      <option value="reversal">Reversal</option>
                      <option value="trend">Trend Following</option>
                      <option value="volume">Volume Analysis</option>
                      <option value="volatility">Volatility</option>
                      <option value="pattern">Pattern Recognition</option>
                    </select>
                  </div>

                  {/* Difficulty */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-1">
                      Difficulty
                    </label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as 'beginner' | 'intermediate' | 'advanced')}
                      className="w-full nt-input"
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>

                  {/* Admin Notes */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-1">
                      Admin Notes
                    </label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Internal notes about this signal..."
                      className="w-full nt-input resize-none"
                      rows={2}
                    />
                  </div>

                  {/* Default Enabled Checkbox */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="defaultEnabled"
                      checked={defaultEnabled}
                      onChange={(e) => setDefaultEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--nt-border-default)] bg-[var(--nt-bg-secondary)]
                        text-[var(--nt-accent-lime)] focus:ring-[var(--nt-accent-lime)] focus:ring-offset-0"
                    />
                    <label htmlFor="defaultEnabled" className="text-sm text-[var(--nt-text-primary)]">
                      Enable by default for new users
                    </label>
                  </div>
                  <p className="text-xs text-[var(--nt-text-muted)] mt-1">
                    When checked, this signal will automatically run for new users when they first open the app
                  </p>
                </>
              )}
            </div>
          )}

          {generatedTrader && (
            <div className="p-3 bg-[var(--nt-accent-lime)]/10 border border-[var(--nt-accent-lime)] rounded-lg text-sm">
              <div className="flex items-center gap-2 text-[var(--nt-accent-lime)] mb-2">
                <Wand2 className="h-4 w-4" />
                <span className="font-medium">AI Generated</span>
              </div>
              <div className="text-[var(--nt-text-muted)]">
                This trader was generated from: "{aiPrompt}"
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {onCancel && (
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 text-[var(--nt-text-muted)] hover:text-[var(--nt-text-primary)] transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleCreateTrader}
              disabled={!manualName.trim() || !manualFilterCode.trim() || !manualStrategy.trim() || filterConditions.filter(c => c.trim()).length === 0 || regeneratingCode}
              className="flex-1 px-4 py-2 bg-[var(--nt-accent-lime)] text-[var(--nt-bg-primary)] rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              {regeneratingCode ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Regenerating Code...
                </>
              ) : (
                editingTrader ? 'Update Signal' : 'Create Signal'
              )}
            </button>
          </div>
        </div>
      )}
        </>
      )}

      {/* Email Auth Modal */}
      <EmailAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
        pendingPrompt={pendingTraderData?.aiPrompt || 
          (pendingTraderData?.mode === 'manual' ? `Create signal: ${pendingTraderData.name || 'New Signal'}` : undefined)}
      />
    </div>
  );
}