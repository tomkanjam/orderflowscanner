import React, { useState, useRef } from 'react';
import { X, Wand2, Code, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { generateTrader, regenerateFilterCode } from '../../services/geminiService';
import { traderManager } from '../services/traderManager';
import { Trader, TraderGeneration } from '../abstractions/trader.interfaces';

interface CreateTraderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTraderCreated?: (trader: Trader) => void;
  editingTrader?: Trader;
}

type CreationMode = 'ai' | 'manual';

export function CreateTraderModal({ 
  isOpen, 
  onClose, 
  onTraderCreated,
  editingTrader 
}: CreateTraderModalProps) {
  const [mode, setMode] = useState<CreationMode>('ai');
  const [aiPrompt, setAiPrompt] = useState('');
  const [manualName, setManualName] = useState(editingTrader?.name || '');
  const [manualDescription, setManualDescription] = useState(editingTrader?.description || '');
  const [manualFilterCode, setManualFilterCode] = useState(editingTrader?.filter.code || '');
  const [manualStrategy, setManualStrategy] = useState(editingTrader?.strategy.instructions || '');
  const [filterConditions, setFilterConditions] = useState<string[]>(editingTrader?.filter?.description || []);
  const [generating, setGenerating] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [error, setError] = useState('');
  const [generatedTrader, setGeneratedTrader] = useState<TraderGeneration | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Track the original conditions to detect changes
  const originalConditionsRef = useRef<string[]>(editingTrader?.filter?.description || []);
  const [conditionsModified, setConditionsModified] = useState(false);

  // Update form fields when editingTrader changes
  React.useEffect(() => {
    if (editingTrader) {
      setMode('manual'); // Switch to manual mode when editing
      setManualName(editingTrader.name || '');
      setManualDescription(editingTrader.description || '');
      setManualFilterCode(editingTrader.filter?.code || '');
      setManualStrategy(editingTrader.strategy?.instructions || '');
      setFilterConditions(editingTrader.filter?.description || []);
      originalConditionsRef.current = editingTrader.filter?.description || [];
      setConditionsModified(false);
    }
  }, [editingTrader]);
  
  // Check if conditions have been modified
  React.useEffect(() => {
    const hasChanged = JSON.stringify(filterConditions) !== JSON.stringify(originalConditionsRef.current);
    setConditionsModified(hasChanged);
  }, [filterConditions]);

  const resetForm = () => {
    setMode('ai');
    setAiPrompt('');
    setManualName('');
    setManualDescription('');
    setManualFilterCode('');
    setManualStrategy('');
    setFilterConditions([]);
    setGenerating(false);
    setRegeneratingCode(false);
    setError('');
    setGeneratedTrader(null);
    originalConditionsRef.current = [];
    setConditionsModified(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleGenerateTrader = async () => {
    if (!aiPrompt.trim()) {
      setError('Please enter a strategy description');
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
      setConditionsModified(false);
    } catch (error) {
      console.error('Failed to generate trader:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate trader');
    } finally {
      setGenerating(false);
    }
  };
  
  const handleRegenerateFilterCode = async () => {
    const validConditions = filterConditions.filter(c => c.trim().length > 0);
    if (validConditions.length === 0) {
      setError('Please add at least one filter condition');
      return;
    }
    
    setRegeneratingCode(true);
    setError('');
    
    try {
      const { filterCode } = await regenerateFilterCode(validConditions);
      setManualFilterCode(filterCode);
      originalConditionsRef.current = [...filterConditions];
      setConditionsModified(false);
    } catch (error) {
      console.error('Failed to regenerate filter code:', error);
      setError(error instanceof Error ? error.message : 'Failed to regenerate filter code');
    } finally {
      setRegeneratingCode(false);
    }
  };

  const handleCreateTrader = async () => {
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
    const validConditions = filterConditions.filter(c => c.trim().length > 0);
    if (validConditions.length === 0) {
      setError('At least one filter condition is required');
      return;
    }
    
    // Check if we need to regenerate filter code due to condition changes
    if (conditionsModified) {
      setError('Filter conditions have been modified. Regenerating filter code...');
      try {
        setRegeneratingCode(true);
        const { filterCode } = await regenerateFilterCode(validConditions);
        setManualFilterCode(filterCode);
        originalConditionsRef.current = [...filterConditions];
        setConditionsModified(false);
      } catch (error) {
        console.error('Failed to regenerate filter code:', error);
        setError('Failed to regenerate filter code. Please try manually or revert changes.');
        return;
      } finally {
        setRegeneratingCode(false);
      }
    }

    if (!manualFilterCode.trim()) {
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
            code: manualFilterCode,
            description: validConditions,
            indicators: generatedTrader?.indicators || editingTrader.filter.indicators
          },
          strategy: {
            instructions: manualStrategy,
            riskManagement: generatedTrader?.riskParameters || editingTrader.strategy.riskManagement
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
            code: manualFilterCode,
            description: validConditions,
            indicators: generatedTrader?.indicators
          },
          strategy: {
            instructions: manualStrategy,
            riskManagement: generatedTrader?.riskParameters || {
              stopLoss: 0.02,
              takeProfit: 0.05,
              maxPositions: 3,
              positionSizePercent: 0.1
            }
          }
        });
        
        onTraderCreated?.(trader);
      }
      
      handleClose();
    } catch (error) {
      console.error('Failed to save trader:', error);
      setError(error instanceof Error ? error.message : 'Failed to save trader');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--tm-bg-primary)] rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--tm-border)]">
          <h2 className="text-xl font-semibold text-[var(--tm-text-primary)]">
            {editingTrader ? 'Edit Trader' : 'Create New Trader'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Mode Selection (only for new traders) */}
          {!editingTrader && (
            <div className="mb-6">
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
                  <div className="text-xs mt-1">Describe your strategy in natural language</div>
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
                  <div className="text-xs mt-1">Write filter code and strategy directly</div>
                </button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500 rounded-lg flex items-start gap-2 text-sm text-red-400">
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
                  {conditionsModified && (
                    <button
                      onClick={handleRegenerateFilterCode}
                      disabled={regeneratingCode}
                      className="flex items-center gap-1 px-2 py-1 bg-[var(--tm-accent)]/10 border border-[var(--tm-accent)] rounded text-xs text-[var(--tm-accent)] hover:bg-[var(--tm-accent)]/20 transition-all"
                    >
                      {regeneratingCode ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3" />
                          Regenerate Code
                        </>
                      )}
                    </button>
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
                <div className="flex items-start justify-between mt-2">
                  <p className="text-xs text-[var(--tm-text-muted)]">
                    Describe what market conditions this trader looks for in plain language
                  </p>
                  {conditionsModified && (
                    <p className="text-xs text-[var(--tm-accent)]">
                      ⚠️ Code needs regeneration
                    </p>
                  )}
                </div>
              </div>

              {/* Indicators Display */}
              {generatedTrader?.indicators && generatedTrader.indicators.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-[var(--tm-text-primary)] mb-1">
                    Chart Indicators
                  </label>
                  <div className="bg-[var(--tm-bg-secondary)] border border-[var(--tm-border)] rounded-lg p-3">
                    <div className="flex flex-wrap gap-2">
                      {generatedTrader.indicators.map((indicator) => (
                        <span 
                          key={indicator.id} 
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
                    ⚠️ Editing the code directly may break the trader. Only modify if you understand JavaScript.
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
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--tm-border)] flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] transition-colors"
          >
            Cancel
          </button>
          {(mode === 'manual' || editingTrader) && (
            <button
              onClick={handleCreateTrader}
              disabled={!manualName.trim() || !manualFilterCode.trim() || !manualStrategy.trim() || filterConditions.filter(c => c.trim()).length === 0 || regeneratingCode}
              className="px-4 py-2 bg-[var(--tm-accent)] text-[var(--tm-bg-primary)] rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              {regeneratingCode ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : conditionsModified ? (
                <>⚠️ {editingTrader ? 'Update Trader' : 'Create Trader'} (will regenerate code)</>
              ) : (
                editingTrader ? 'Update Trader' : 'Create Trader'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}