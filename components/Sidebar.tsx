
import React, { useState, useEffect } from 'react';
import { KLINE_INTERVALS, GEMINI_MODELS, DEFAULT_KLINE_INTERVAL, DEFAULT_GEMINI_MODEL } from '../constants';
import { KlineInterval, GeminiModelOption, HistoricalScanConfig, HistoricalScanProgress, KlineHistoryConfig } from '../types';

interface SidebarProps {
  klineInterval: KlineInterval;
  onKlineIntervalChange: (interval: KlineInterval) => void;
  selectedGeminiModel: GeminiModelOption;
  onGeminiModelChange: (model: GeminiModelOption) => void;
  aiPrompt: string;
  onAiPromptChange: (prompt: string) => void;
  onRunAiScreener: () => void;
  isAiScreenerLoading: boolean;
  aiFilterDescription: string[] | null;
  onClearFilter: () => void;
  onAnalyzeMarket: () => void;
  isMarketAnalysisLoading: boolean;
  onShowAiResponse: () => void; // Renamed from onShowGeneratedCode
  aiScreenerError: string | null;
  strategy: string;
  onStrategyChange: (strategy: string) => void;
  signalDedupeThreshold: number;
  onSignalDedupeThresholdChange: (threshold: number) => void;
  hasActiveFilter: boolean;
  onRunHistoricalScan: () => void;
  isHistoricalScanning: boolean;
  historicalScanProgress: HistoricalScanProgress | null;
  historicalScanConfig: HistoricalScanConfig;
  onHistoricalScanConfigChange: (config: HistoricalScanConfig) => void;
  onCancelHistoricalScan: () => void;
  historicalSignalsCount: number;
  klineHistoryConfig: KlineHistoryConfig;
  onKlineHistoryConfigChange: (config: KlineHistoryConfig) => void;
  streamingProgress: string;
  streamingTokenCount: number;
  tokenUsage: {prompt: number; response: number; total: number} | null;
}

const Sidebar: React.FC<SidebarProps> = ({
  klineInterval,
  onKlineIntervalChange,
  selectedGeminiModel,
  onGeminiModelChange,
  aiPrompt,
  onAiPromptChange,
  onRunAiScreener,
  isAiScreenerLoading,
  aiFilterDescription,
  onClearFilter,
  onAnalyzeMarket,
  isMarketAnalysisLoading,
  onShowAiResponse, // Renamed
  aiScreenerError,
  strategy,
  onStrategyChange,
  signalDedupeThreshold,
  onSignalDedupeThresholdChange,
  hasActiveFilter,
  onRunHistoricalScan,
  isHistoricalScanning,
  historicalScanProgress,
  historicalScanConfig,
  onHistoricalScanConfigChange,
  onCancelHistoricalScan,
  historicalSignalsCount,
  klineHistoryConfig,
  onKlineHistoryConfigChange,
  streamingProgress,
  streamingTokenCount,
  tokenUsage,
}) => {
  const [showPromptAnimation, setShowPromptAnimation] = useState(false);
  const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState(false);
  
  // Debug streaming state
  useEffect(() => {
    if (streamingProgress) {
      console.log(`[${new Date().toISOString().slice(11, 23)}] [Sidebar] streamingProgress updated:`, streamingProgress);
    }
  }, [streamingProgress]);
  
  // Trigger animation when aiPrompt changes (but not on initial mount or empty)
  useEffect(() => {
    if (aiPrompt.trim()) {
      setShowPromptAnimation(true);
      const timer = setTimeout(() => {
        setShowPromptAnimation(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [aiPrompt]);

  return (
    <aside className="w-full md:w-1/3 xl:w-1/4 bg-[var(--tm-bg-secondary)] p-4 md:p-6 flex flex-col border-r border-[var(--tm-border)] h-screen overflow-y-auto">
      <h2 className="text-2xl font-bold text-[var(--tm-accent)] mb-4 tm-heading-lg">AI Screener</h2>
      <p className="text-[var(--tm-text-muted)] text-sm mb-6">
        Describe technical conditions for your selected interval. The AI will create a filter and suggest chart indicators.
      </p>

      <div className="mb-4">
        <label htmlFor="kline-interval-select" className="text-[var(--tm-text-secondary)] font-medium mb-1 block text-sm">Candle Interval:</label>
        <select
          id="kline-interval-select"
          value={klineInterval}
          onChange={(e) => onKlineIntervalChange(e.target.value as KlineInterval)}
          className="w-full tm-input"
        >
          {KLINE_INTERVALS.map(interval => (
            <option key={interval.value} value={interval.value}>{interval.label}</option>
          ))}
        </select>
      </div>

      {/* Advanced Settings Toggle */}
      <div className="mb-4">
        <button
          onClick={() => setIsAdvancedSettingsOpen(!isAdvancedSettingsOpen)}
          className="w-full flex items-center justify-between tm-btn tm-btn-secondary p-3"
        >
          <span className="font-medium">Advanced Settings</span>
          <svg 
            className={`w-5 h-5 transition-transform duration-200 ${isAdvancedSettingsOpen ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Collapsible Advanced Settings */}
      <div className={`overflow-hidden transition-all duration-300 ${isAdvancedSettingsOpen ? 'max-h-[500px] mb-4' : 'max-h-0'}`}>
        <div className="space-y-4 pb-4">
          <div>
            <label htmlFor="gemini-model-select" className="text-[var(--tm-text-secondary)] font-medium mb-1 block text-sm">AI Model:</label>
            <select
              id="gemini-model-select"
              value={selectedGeminiModel}
              onChange={(e) => onGeminiModelChange(e.target.value as GeminiModelOption)}
              className="w-full tm-input"
            >
              {GEMINI_MODELS.map(model => (
                <option key={model.value} value={model.value}>{model.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="signal-threshold" className="text-[var(--tm-text-secondary)] font-medium mb-1 block text-sm">
              Signal Deduplication Threshold:
            </label>
            <div className="flex items-center space-x-2">
              <input
                id="signal-threshold"
                type="number"
                min="1"
                max="500"
                value={signalDedupeThreshold}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!isNaN(value) && value >= 1 && value <= 500) {
                    onSignalDedupeThresholdChange(value);
                  }
                }}
                className="w-24 tm-input"
              />
              <span className="text-[var(--tm-text-secondary)] text-sm">bars</span>
            </div>
            <p className="text-[var(--tm-text-muted)] text-xs mt-1">
              Signals for the same symbol within this bar count will increment the count instead of creating a new entry.
            </p>
          </div>

          {/* Data Settings */}
          <div className="border-t border-[var(--tm-border-light)] pt-4">
            <h3 className="text-[var(--tm-text-secondary)] font-medium mb-3 text-sm">Data Settings</h3>
            <div>
              <label htmlFor="screener-limit" className="text-[var(--tm-text-secondary)] font-medium mb-1 block text-sm">
                Screener Candles:
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="screener-limit"
                  type="number"
                  min="50"
                  max="1000"
                  step="50"
                  value={klineHistoryConfig.screenerLimit}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 250;
                    onKlineHistoryConfigChange({
                      ...klineHistoryConfig,
                      screenerLimit: Math.min(Math.max(value, 50), 1000)
                    });
                  }}
                  className="w-24 tm-input"
                />
                <span className="text-[var(--tm-text-muted)] text-xs">
                  (50-1000)
                </span>
              </div>
              <p className="text-[var(--tm-text-muted)] text-xs mt-1">
                Number of candles for screener filters
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="ai-prompt" className="text-[var(--tm-text-secondary)] font-medium mb-1 block text-sm">Your Conditions:</label>
        <textarea
          id="ai-prompt"
          rows={4}
          value={aiPrompt}
          onChange={(e) => onAiPromptChange(e.target.value)}
          className={`w-full tm-input transition-all duration-300 ${
            showPromptAnimation 
              ? 'border-[var(--tm-accent)] ring-2 ring-[var(--tm-accent)] ring-opacity-50' 
              : ''
          }`}
          placeholder={`e.g., price crossed 20 MA up on high volume (for ${klineInterval})`}
        />
      </div>

      <button
        id="run-ai-btn"
        onClick={onRunAiScreener}
        disabled={isAiScreenerLoading || !aiPrompt.trim()}
        className="w-full tm-btn tm-btn-primary font-bold py-2.5 px-4 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isAiScreenerLoading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--tm-text-inverse)] mr-2"></div>
            <span>Generating Filter...</span>
          </>
        ) : (
          <span>✨ Run AI Screen</span>
        )}
      </button>

      {/* Streaming Progress Display */}
      {(isAiScreenerLoading || streamingProgress) && (
        <div className="mt-3 space-y-2">
          {streamingProgress && (
            <div className="flex items-center gap-2 text-sm text-[var(--tm-text-secondary)]">
              <div className={`rounded-full h-2 w-2 ${isAiScreenerLoading ? 'animate-pulse bg-[var(--tm-accent)]' : 'bg-[var(--tm-success)]'}`}></div>
              <span className="font-medium">{streamingProgress}</span>
            </div>
          )}
          {streamingTokenCount > 0 && isAiScreenerLoading && (
            <div className="text-xs text-[var(--tm-text-muted)]">
              ~{streamingTokenCount.toLocaleString()} tokens
            </div>
          )}
        </div>
      )}

      {aiScreenerError && (
        <div className="mt-3 text-[var(--tm-error)] bg-[var(--tm-error)]/10 p-3 rounded-lg text-sm">
          {aiScreenerError}
        </div>
      )}

      {aiFilterDescription && aiFilterDescription.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-[var(--tm-text-primary)] border-b border-[var(--tm-border-light)] pb-2 mb-3 tm-heading-md">Active Conditions:</h3>
          <ul className="list-disc list-inside text-[var(--tm-text-secondary)] space-y-1 text-sm">
            {aiFilterDescription.map((desc, index) => (
              <li key={index}>{desc}</li>
            ))}
          </ul>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
            <button
              onClick={onClearFilter}
              className="w-full tm-btn tm-btn-secondary font-bold py-2 px-4 text-sm"
            >
              Clear Filter
            </button>
            <button
              onClick={onShowAiResponse} // Renamed
              className="w-full tm-btn tm-btn-ghost font-bold py-2 px-4 text-sm"
            >
              📄 Show Response 
            </button>
          </div>
          {tokenUsage && (
            <div className="mt-3 text-xs text-[var(--tm-text-muted)] space-y-1">
              <div className="flex justify-between">
                <span>Prompt tokens:</span>
                <span>{tokenUsage.prompt.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Response tokens:</span>
                <span>{tokenUsage.response.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--tm-border-light)] pt-1">
                <span>Total tokens:</span>
                <span className="font-medium">{tokenUsage.total.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      )}
      
      
      {/* Strategy Section - Hidden for now */}
      {/* <div className="mt-6">
        <h2 className="text-xl font-bold text-yellow-400 mb-4">Strategy</h2>
        <p className="text-zinc-400 text-sm mb-4">
          Define your trading strategy for signal analysis.
        </p>
        <div className="mb-4">
          <label htmlFor="strategy-input" className="text-zinc-300 font-medium mb-1 block text-sm">Your Strategy:</label>
          <textarea
            id="strategy-input"
            rows={4}
            value={strategy}
            onChange={(e) => onStrategyChange(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 text-sm"
            placeholder="e.g., Buy when RSI < 30 with increasing volume, sell when RSI > 70, hold for at least 4 candles"
          />
        </div>
      </div> */}
      
      {/* Analyze Market Button - Hidden for now */}
      {/* <div className="mt-auto pt-6">
        <button
            onClick={onAnalyzeMarket}
            disabled={isMarketAnalysisLoading}
            className="w-full bg-blue-500 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-blue-600 transition duration-300 flex items-center justify-center disabled:opacity-50"
        >
            {isMarketAnalysisLoading ? (
            <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                <span>Analyzing Market...</span>
            </>
            ) : (
            <span>📊 Analyze Market Trends</span>
            )}
        </button>
      </div> */}
    </aside>
  );
};

export default Sidebar;
