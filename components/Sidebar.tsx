
import React from 'react';
import { KLINE_INTERVALS, GEMINI_MODELS, DEFAULT_KLINE_INTERVAL, DEFAULT_GEMINI_MODEL } from '../constants';
import { KlineInterval, GeminiModelOption } from '../types';

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
}) => {
  return (
    <aside className="w-full md:w-1/3 xl:w-1/4 bg-gray-800 p-4 md:p-6 flex flex-col border-r border-gray-700 h-screen overflow-y-auto">
      <h2 className="text-2xl font-bold text-yellow-400 mb-4">AI Screener</h2>
      <p className="text-gray-400 text-sm mb-6">
        Describe technical conditions for your selected interval. The AI will create a filter and suggest chart indicators.
      </p>

      <div className="mb-4">
        <label htmlFor="gemini-model-select" className="text-gray-300 font-medium mb-1 block text-sm">AI Model:</label>
        <select
          id="gemini-model-select"
          value={selectedGeminiModel}
          onChange={(e) => onGeminiModelChange(e.target.value as GeminiModelOption)}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 text-sm"
        >
          {GEMINI_MODELS.map(model => (
            <option key={model.value} value={model.value}>{model.label}</option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label htmlFor="kline-interval-select" className="text-gray-300 font-medium mb-1 block text-sm">Candle Interval:</label>
        <select
          id="kline-interval-select"
          value={klineInterval}
          onChange={(e) => onKlineIntervalChange(e.target.value as KlineInterval)}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 text-sm"
        >
          {KLINE_INTERVALS.map(interval => (
            <option key={interval.value} value={interval.value}>{interval.label}</option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label htmlFor="ai-prompt" className="text-gray-300 font-medium mb-1 block text-sm">Your Conditions:</label>
        <textarea
          id="ai-prompt"
          rows={4}
          value={aiPrompt}
          onChange={(e) => onAiPromptChange(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 text-sm"
          placeholder={`e.g., price crossed 20 MA up on high volume (for ${klineInterval})`}
        />
      </div>

      <button
        id="run-ai-btn"
        onClick={onRunAiScreener}
        disabled={isAiScreenerLoading || !aiPrompt.trim()}
        className="w-full bg-yellow-400 text-gray-900 font-bold py-2.5 px-4 rounded-lg hover:bg-yellow-500 transition duration-300 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isAiScreenerLoading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900 mr-2"></div>
            <span>Analyzing...</span>
          </>
        ) : (
          <span>✨ Run AI Screen</span>
        )}
      </button>

      {aiScreenerError && (
        <div className="mt-3 text-red-400 bg-red-900/50 p-3 rounded-lg text-sm">
          {aiScreenerError}
        </div>
      )}

      {aiFilterDescription && aiFilterDescription.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-600 pb-2 mb-3">Active AI Conditions:</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
            {aiFilterDescription.map((desc, index) => (
              <li key={index}>{desc}</li>
            ))}
          </ul>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
            <button
              onClick={onClearFilter}
              className="w-full bg-gray-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-700 transition duration-300 text-sm"
            >
              Clear Filter
            </button>
            <button
              onClick={onShowAiResponse} // Renamed
              className="w-full bg-purple-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-600 transition duration-300 text-sm"
            >
              📄 Show Response 
            </button>
          </div>
        </div>
      )}
      
      {/* Strategy Section */}
      <div className="mt-6">
        <h2 className="text-xl font-bold text-yellow-400 mb-4">Strategy</h2>
        <p className="text-gray-400 text-sm mb-4">
          Define your trading strategy for signal analysis.
        </p>
        <div className="mb-4">
          <label htmlFor="strategy-input" className="text-gray-300 font-medium mb-1 block text-sm">Your Strategy:</label>
          <textarea
            id="strategy-input"
            rows={4}
            value={strategy}
            onChange={(e) => onStrategyChange(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 text-sm"
            placeholder="e.g., Buy when RSI < 30 with increasing volume, sell when RSI > 70, hold for at least 4 candles"
          />
        </div>
      </div>
      
      {/* Signal Settings Section */}
      <div className="mt-6">
        <h2 className="text-xl font-bold text-yellow-400 mb-4">Signal Settings</h2>
        <div className="mb-4">
          <label htmlFor="signal-threshold" className="text-gray-300 font-medium mb-1 block text-sm">
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
              className="w-24 bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 text-sm"
            />
            <span className="text-gray-300 text-sm">bars</span>
          </div>
          <p className="text-gray-400 text-xs mt-1">
            Signals for the same symbol within this bar count will increment the count instead of creating a new entry.
          </p>
        </div>
      </div>
      
      <div className="mt-auto pt-6"> 
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
      </div>
    </aside>
  );
};

export default Sidebar;
