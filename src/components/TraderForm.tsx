import React, { useState, useRef } from 'react';
import { X, Wand2, Code, AlertCircle, Loader2, ChevronLeft } from 'lucide-react';
import { generateTrader, regenerateFilterCode } from '../../services/geminiService';
import { traderManager } from '../services/traderManager';
import { Trader, TraderGeneration } from '../abstractions/trader.interfaces';
import { MODEL_TIERS, type ModelTier } from '../constants/models';
import { KlineInterval } from '../../types';
import { KLINE_INTERVALS } from '../../constants';
import { useAuth } from '../hooks/useAuth';
import { EmailAuthModal } from './auth/EmailAuthModal';

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
  const [mode, setMode] = useState<CreationMode>(editingTrader ? 'manual' : 'ai');
  const [aiPrompt, setAiPrompt] = useState('');
  const [manualName, setManualName] = useState(editingTrader?.name || '');
  const [manualDescription, setManualDescription] = useState(editingTrader?.description || '');
  const [manualFilterCode, setManualFilterCode] = useState(editingTrader?.filter.code || '');
  const [manualStrategy, setManualStrategy] = useState(editingTrader?.strategy.instructions || '');
  const [filterConditions, setFilterConditions] = useState<string[]>(editingTrader?.filter?.description || []);
  const [aiAnalysisLimit, setAiAnalysisLimit] = useState(editingTrader?.strategy.aiAnalysisLimit || 100);
  const [modelTier, setModelTier] = useState<ModelTier>(editingTrader?.strategy.modelTier || 'standard');
  const [filterInterval, setFilterInterval] = useState<KlineInterval>(editingTrader?.filter?.interval || KlineInterval.ONE_MINUTE);
  const [maxConcurrentAnalysis, setMaxConcurrentAnalysis] = useState(editingTrader?.strategy.maxConcurrentAnalysis || 3);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [generatedTrader, setGeneratedTrader] = useState<TraderGeneration | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingTraderData, setPendingTraderData] = useState<any>(null);
  
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
      setFilterInterval(editingTrader.filter?.interval || KlineInterval.ONE_MINUTE);
      setMaxConcurrentAnalysis(editingTrader.strategy?.maxConcurrentAnalysis || 3);
      originalConditionsRef.current = editingTrader.filter?.description || [];
      originalIntervalRef.current = editingTrader.filter?.interval || KlineInterval.ONE_MINUTE;
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

    try {
      const generated = await generateTrader(aiPrompt);
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
          const { filterCode, requiredTimeframes } = await regenerateFilterCode(validConditions, 'gemini-2.5-pro', filterInterval);
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
      
      // Debug log indicators being saved
      const indicatorsToSave = generatedTrader?.indicators || (editingTrader?.filter?.indicators);
      console.log(`[DEBUG] TraderForm saving trader with indicators:`, {
        mode: editingTrader ? 'update' : 'create',
        indicatorCount: indicatorsToSave?.length || 0,
        indicators: indicatorsToSave?.map(ind => ({ id: ind.id, name: ind.name })) || []
      });
      
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
            requiredTimeframes: generatedTrader?.requiredTimeframes || editingTrader.filter.requiredTimeframes || [filterInterval]
          },
          strategy: {
            instructions: manualStrategy,
            riskManagement: generatedTrader?.riskParameters || editingTrader.strategy.riskManagement,
            aiAnalysisLimit: aiAnalysisLimit,
            modelTier: modelTier,
            maxConcurrentAnalysis: maxConcurrentAnalysis
          }
        });
        
        onTraderCreated?.(updated);
      } else {
        // Create new trader
        const trader = await traderManager.createTrader({
          name: manualName,
          description: manualDescription || manualName,
          enabled: true,
          mode: 'demo', // Always start in demo mode
          filter: {
            code: finalFilterCode,
            description: validConditions,
            indicators: generatedTrader?.indicators,
            refreshInterval: filterInterval,
            requiredTimeframes: generatedTrader?.requiredTimeframes || [filterInterval]
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
          }
        });
        
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
            className="p-1 text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <h3 className="text-lg font-semibold text-[var(--tm-text-primary)]">
          {editingTrader ? 'Edit Trader' : 'Create New Trader'}
        </h3>
      </div>

      {/* Mode Selection (only for new traders) */}
      {!editingTrader && (
        <div className="flex gap-2">
          <button
            onClick={() => setMode('ai')}
            className={`flex-1 p-3 rounded-lg border transition-all ${
              mode === 'ai'
                ? 'bg-[var(--tm-accent)]/10 border-[var(--tm-accent)] text-[var(--tm-accent)]'
                : 'border-[var(--tm-border)] text-[var(--tm-text-muted)] hover:border-[var(--tm-border-light)]'
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
                ? 'bg-[var(--tm-accent)]/10 border-[var(--tm-accent)] text-[var(--tm-accent)]'
                : 'border-[var(--tm-border)] text-[var(--tm-text-muted)] hover:border-[var(--tm-border-light)]'
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
            <label className="block text-sm font-medium text-[var(--tm-text-primary)] mb-2">
              Describe Your Trading Strategy
            </label>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Example: Create a momentum trader that buys strong uptrends with increasing volume"
              className="w-full p-3 bg-[var(--tm-bg-secondary)] border border-[var(--tm-border)] rounded-lg text-[var(--tm-text-primary)] placeholder-[var(--tm-text-muted)] focus:border-[var(--tm-accent)] focus:outline-none resize-none"
              rows={4}
            />
          </div>

          <button
            onClick={handleGenerateTrader}
            disabled={generating || !aiPrompt.trim()}
            className="w-full py-2 bg-[var(--tm-accent)] text-[var(--tm-bg-primary)] rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Generate Trader
              </>
            )}
          </button>

          <div className="text-xs text-[var(--tm-text-muted)]">
            The AI will create a complete trader including filter conditions, strategy instructions, and risk parameters based on your description.
          </div>
        </div>
      )}

      {/* Manual Entry Form */}
      {(mode === 'manual' || editingTrader) && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--tm-text-primary)] mb-1">
              Trader Name
            </label>
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="e.g., RSI Bounce Trader"
              className="w-full p-2 bg-[var(--tm-bg-secondary)] border border-[var(--tm-border)] rounded-lg text-[var(--tm-text-primary)] placeholder-[var(--tm-text-muted)] focus:border-[var(--tm-accent)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--tm-text-primary)] mb-1">
              Description
            </label>
            <input
              type="text"
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
              placeholder="Brief description of what this trader does"
              className="w-full p-2 bg-[var(--tm-bg-secondary)] border border-[var(--tm-border)] rounded-lg text-[var(--tm-text-primary)] placeholder-[var(--tm-text-muted)] focus:border-[var(--tm-accent)] focus:outline-none"
            />
          </div>

          {/* Filter Conditions - Editable */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-[var(--tm-text-primary)]">
                Filter Conditions
              </label>
              {regeneratingCode && (
                <div className="flex items-center gap-1 text-xs text-[var(--tm-accent)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Regenerating code...
                </div>
              )}
            </div>
            <div className="space-y-2">
              {filterConditions.map((condition, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-[var(--tm-accent)] mt-2 text-xs">▸</span>
                  <input
                    type="text"
                    value={condition}
                    onChange={(e) => {
                      const newConditions = [...filterConditions];
                      newConditions[index] = e.target.value;
                      setFilterConditions(newConditions);
                    }}
                    placeholder={`Condition ${index + 1}`}
                    className="flex-1 p-2 bg-[var(--tm-bg-secondary)] border border-[var(--tm-border)] rounded-lg text-[var(--tm-text-primary)] placeholder-[var(--tm-text-muted)] focus:border-[var(--tm-accent)] focus:outline-none text-sm"
                  />
                  <button
                    onClick={() => {
                      const newConditions = filterConditions.filter((_, i) => i !== index);
                      setFilterConditions(newConditions);
                    }}
                    className="p-2 text-[var(--tm-text-muted)] hover:text-red-500 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setFilterConditions([...filterConditions, ''])}
                className="w-full p-2 border border-dashed border-[var(--tm-border)] rounded-lg text-[var(--tm-text-muted)] hover:border-[var(--tm-accent)] hover:text-[var(--tm-accent)] transition-all text-sm"
              >
                + Add Condition
              </button>
            </div>
            <p className="text-xs text-[var(--tm-text-muted)] mt-2">
              Describe what market conditions this trader looks for in plain language
            </p>
          </div>

          {/* Indicators Display */}
          {generatedTrader?.indicators && generatedTrader.indicators.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-[var(--tm-text-primary)] mb-1">
                Chart Indicators
              </label>
              <div className="bg-[var(--tm-bg-secondary)] border border-[var(--tm-border)] rounded-lg p-3">
                <div className="flex flex-wrap gap-2">
                  {generatedTrader.indicators.map((indicator, index) => (
                    <span 
                      key={indicator.id || `indicator-${index}`} 
                      className="px-2 py-1 bg-[var(--tm-bg-primary)] rounded text-xs text-[var(--tm-text-secondary)]"
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
              className="text-sm text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] transition-colors flex items-center gap-1"
            >
              <span>{showAdvanced ? '▼' : '▶'}</span>
              Advanced Settings
            </button>
          </div>

          {/* Filter Code (Hidden by default) */}
          {showAdvanced && (
            <div>
              <label className="block text-sm font-medium text-[var(--tm-text-primary)] mb-1">
                Filter Code (Advanced)
              </label>
              <textarea
                value={manualFilterCode}
                onChange={(e) => setManualFilterCode(e.target.value)}
                placeholder="// JavaScript function body that returns boolean"
                className="w-full p-3 bg-[var(--tm-bg-secondary)] border border-[var(--tm-border)] rounded-lg text-[var(--tm-text-primary)] placeholder-[var(--tm-text-muted)] focus:border-[var(--tm-accent)] focus:outline-none resize-none font-mono text-sm"
                rows={6}
              />
              <p className="text-xs text-[var(--tm-text-muted)] mt-1">
                ⚠️ This code is automatically generated from the filter conditions above. Manual edits will be lost when conditions change.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--tm-text-primary)] mb-1">
              Strategy Instructions
            </label>
            <textarea
              value={manualStrategy}
              onChange={(e) => setManualStrategy(e.target.value)}
              placeholder="Detailed instructions for the AI analyzer. Include entry criteria, exit criteria, and risk management rules."
              className="w-full p-3 bg-[var(--tm-bg-secondary)] border border-[var(--tm-border)] rounded-lg text-[var(--tm-text-primary)] placeholder-[var(--tm-text-muted)] focus:border-[var(--tm-accent)] focus:outline-none resize-none"
              rows={4}
            />
          </div>

          {/* Candle Interval Selection */}
          <div>
            <label className="block text-sm font-medium text-[var(--tm-text-primary)] mb-1">
              Candle Interval
            </label>
            <select
              value={filterInterval}
              onChange={(e) => setFilterInterval(e.target.value as KlineInterval)}
              className="w-full p-2 bg-[var(--tm-bg-secondary)] border border-[var(--tm-border)] rounded-lg text-[var(--tm-text-primary)] focus:border-[var(--tm-accent)] focus:outline-none"
            >
              {KLINE_INTERVALS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--tm-text-muted)] mt-1">
              The time interval for candlestick data this trader will analyze
            </p>
          </div>

          {/* AI Analysis Data Limit */}
          <div>
            <label className="block text-sm font-medium text-[var(--tm-text-primary)] mb-1">
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
                className="w-20 tm-input text-sm px-2 py-1"
              />
              <span className="text-sm text-[var(--tm-text-muted)]">bars</span>
            </div>
            <p className="text-xs text-[var(--tm-text-muted)] mt-1">
              Number of historical price bars and indicator values sent to AI for signal analysis (1-1000 bars)
            </p>
          </div>

          {/* AI Model Selection */}
          <div>
            <label className="block text-sm font-medium text-[var(--tm-text-primary)] mb-1">
              AI Model for Analysis
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(MODEL_TIERS) as [ModelTier, typeof MODEL_TIERS[ModelTier]][]).map(([tier, config]) => (
                <button
                  key={tier}
                  onClick={() => setModelTier(tier)}
                  className={`p-2 rounded-lg border transition-all ${
                    modelTier === tier
                      ? 'bg-[var(--tm-accent)]/10 border-[var(--tm-accent)] text-[var(--tm-accent)]'
                      : 'border-[var(--tm-border)] text-[var(--tm-text-muted)] hover:border-[var(--tm-border-light)]'
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
            <label className="block text-sm font-medium text-[var(--tm-text-primary)] mb-1">
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
                className="w-16 tm-input text-sm px-2 py-1"
              />
              <span className="text-sm text-[var(--tm-text-muted)]">signals</span>
            </div>
            <p className="text-xs text-[var(--tm-text-muted)] mt-1">
              Maximum number of signals from this trader that can be analyzed simultaneously (1-10)
            </p>
          </div>

          {generatedTrader && (
            <div className="p-3 bg-[var(--tm-accent)]/10 border border-[var(--tm-accent)] rounded-lg text-sm">
              <div className="flex items-center gap-2 text-[var(--tm-accent)] mb-2">
                <Wand2 className="h-4 w-4" />
                <span className="font-medium">AI Generated</span>
              </div>
              <div className="text-[var(--tm-text-muted)]">
                This trader was generated from: "{aiPrompt}"
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {onCancel && (
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleCreateTrader}
              disabled={!manualName.trim() || !manualFilterCode.trim() || !manualStrategy.trim() || filterConditions.filter(c => c.trim()).length === 0 || regeneratingCode}
              className="flex-1 px-4 py-2 bg-[var(--tm-accent)] text-[var(--tm-bg-primary)] rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              {regeneratingCode ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Regenerating Code...
                </>
              ) : (
                editingTrader ? 'Update Trader' : 'Create Trader'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Email Auth Modal */}
      <EmailAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
        pendingPrompt={pendingTraderData?.aiPrompt || 
          (pendingTraderData?.mode === 'manual' ? `Create trader: ${pendingTraderData.name || 'New Trader'}` : undefined)}
      />
    </div>
  );
}