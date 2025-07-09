import React, { useState } from 'react';
import { useStrategy } from '../contexts/StrategyContext';
import { ServiceFactory } from '../services/serviceFactory';
import { AnalysisResult, MarketData } from '../abstractions/interfaces';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface EnhancedAnalysisProps {
  symbol: string;
  marketData: MarketData;
  onAnalysisComplete?: (result: AnalysisResult) => void;
}

export function EnhancedAnalysis({ symbol, marketData, onAnalysisComplete }: EnhancedAnalysisProps) {
  const { activeStrategy } = useStrategy();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');

  const runAnalysis = async () => {
    if (!activeStrategy) {
      setError('Please select a strategy first');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const analysisEngine = ServiceFactory.getAnalysis();
      const result = await analysisEngine.analyzeSetup(
        symbol,
        activeStrategy,
        marketData,
        undefined, // No chart image for now
        selectedModel
      );

      setAnalysis(result);
      onAnalysisComplete?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getDecisionIcon = () => {
    if (!analysis) return null;
    
    switch (analysis.decision) {
      case 'enter_trade':
        return analysis.direction === 'long' ? 
          <TrendingUp className="h-5 w-5 text-green-500" /> : 
          <TrendingDown className="h-5 w-5 text-red-500" />;
      case 'good_setup':
        return <CheckCircle className="h-5 w-5 text-yellow-500" />;
      case 'bad_setup':
        return <XCircle className="h-5 w-5 text-gray-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getDecisionColor = () => {
    if (!analysis) return 'text-gray-500';
    
    switch (analysis.decision) {
      case 'enter_trade':
        return analysis.direction === 'long' ? 'text-green-500' : 'text-red-500';
      case 'good_setup':
        return 'text-yellow-500';
      case 'bad_setup':
        return 'text-gray-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="bg-[#0d1421] border border-[#1a2332] rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-[#8efbba]">AI Analysis - {symbol}</h3>
        <div className="flex items-center gap-3">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-3 py-2 bg-[#1a2332] border border-[#2a3441] rounded text-[#e2e8f0] text-sm"
          >
            <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Fast)</option>
            <option value="gemini-1.5-pro-latest">Gemini 1.5 Pro (Advanced)</option>
          </select>
          <button
            onClick={runAnalysis}
            disabled={isAnalyzing || !activeStrategy}
            className="px-4 py-2 bg-[#8efbba] text-[#0d1421] rounded hover:bg-[#7ce3a8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {!activeStrategy && (
        <div className="text-center py-8 text-[#64748b]">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p>Please select a strategy to run analysis</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {analysis && (
        <div className="space-y-4">
          {/* Model indicator */}
          <div className="text-xs text-[#64748b] text-right">
            Model: {selectedModel === 'gemini-2.0-flash-exp' ? 'Gemini 2.0 Flash' : 'Gemini 1.5 Pro'}
          </div>
          
          {/* Decision */}
          <div className="flex items-center gap-3">
            {getDecisionIcon()}
            <div>
              <p className="text-sm text-[#64748b]">Decision</p>
              <p className={`font-semibold ${getDecisionColor()}`}>
                {analysis.decision.replace('_', ' ').toUpperCase()}
                {analysis.direction && ` - ${analysis.direction.toUpperCase()}`}
              </p>
            </div>
          </div>

          {/* Confidence */}
          <div>
            <p className="text-sm text-[#64748b] mb-1">Confidence</p>
            <div className="w-full bg-[#1a2332] rounded-full h-2">
              <div
                className="bg-[#8efbba] h-2 rounded-full transition-all duration-500"
                style={{ width: `${analysis.confidence * 100}%` }}
              />
            </div>
            <p className="text-sm text-[#e2e8f0] mt-1">{(analysis.confidence * 100).toFixed(1)}%</p>
          </div>

          {/* Reasoning */}
          <div>
            <p className="text-sm text-[#64748b] mb-1">Reasoning</p>
            <p className="text-[#e2e8f0] text-sm">{analysis.reasoning}</p>
          </div>

          {/* Key Levels */}
          {analysis.keyLevels && (
            <div>
              <p className="text-sm text-[#64748b] mb-2">Key Levels</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {analysis.keyLevels.entry && (
                  <div>
                    <p className="text-[#64748b]">Entry</p>
                    <p className="text-[#e2e8f0] font-mono">${analysis.keyLevels.entry.toFixed(4)}</p>
                  </div>
                )}
                {analysis.keyLevels.stopLoss && (
                  <div>
                    <p className="text-[#64748b]">Stop Loss</p>
                    <p className="text-red-400 font-mono">${analysis.keyLevels.stopLoss.toFixed(4)}</p>
                  </div>
                )}
                {analysis.keyLevels.takeProfit && analysis.keyLevels.takeProfit[0] && (
                  <div>
                    <p className="text-[#64748b]">Take Profit 1</p>
                    <p className="text-green-400 font-mono">${analysis.keyLevels.takeProfit[0].toFixed(4)}</p>
                  </div>
                )}
                {analysis.keyLevels.takeProfit && analysis.keyLevels.takeProfit[1] && (
                  <div>
                    <p className="text-[#64748b]">Take Profit 2</p>
                    <p className="text-green-400 font-mono">${analysis.keyLevels.takeProfit[1].toFixed(4)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chart Analysis */}
          {analysis.chartAnalysis && (
            <div>
              <p className="text-sm text-[#64748b] mb-1">Chart Analysis</p>
              <p className="text-[#e2e8f0] text-sm">{analysis.chartAnalysis}</p>
            </div>
          )}

          {/* Trade Decision */}
          {analysis.decision === 'enter_trade' && (
            <div className="mt-4 p-3 bg-[#1a2332] rounded-lg border border-[#8efbba]">
              <p className="text-[#8efbba] font-semibold mb-2">Trade Recommendation</p>
              <div className="space-y-1 text-sm">
                <p className="text-[#e2e8f0]">
                  <span className="text-[#64748b]">Direction:</span> {analysis.direction?.toUpperCase()}
                </p>
                {analysis.keyLevels && (
                  <>
                    <p className="text-[#e2e8f0]">
                      <span className="text-[#64748b]">Risk:</span> ${
                        Math.abs(analysis.keyLevels.entry! - analysis.keyLevels.stopLoss!).toFixed(4)
                      } ({(
                        (Math.abs(analysis.keyLevels.entry! - analysis.keyLevels.stopLoss!) / analysis.keyLevels.entry!) * 100
                      ).toFixed(2)}%)
                    </p>
                    {analysis.keyLevels.takeProfit?.[0] && (
                      <p className="text-[#e2e8f0]">
                        <span className="text-[#64748b]">Reward:</span> ${
                          Math.abs(analysis.keyLevels.takeProfit[0] - analysis.keyLevels.entry!).toFixed(4)
                        } ({(
                          (Math.abs(analysis.keyLevels.takeProfit[0] - analysis.keyLevels.entry!) / analysis.keyLevels.entry!) * 100
                        ).toFixed(2)}%)
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}