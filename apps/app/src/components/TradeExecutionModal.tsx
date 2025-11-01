import React, { useState, useEffect } from 'react';
import { SignalLifecycle, Trade } from '../abstractions/interfaces';
import { X, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface TradeExecutionModalProps {
  signal: SignalLifecycle;
  onClose: () => void;
  onExecute: (trade: Omit<Trade, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => void;
}

export function TradeExecutionModal({ signal, onClose, onExecute }: TradeExecutionModalProps) {
  const [positionSize, setPositionSize] = useState('100'); // USDT
  const [leverage, setLeverage] = useState('1');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit1, setTakeProfit1] = useState('');
  const [takeProfit2, setTakeProfit2] = useState('');
  const [takeProfit3, setTakeProfit3] = useState('');
  const [useRecommended, setUseRecommended] = useState(true);
  
  // Initialize with AI recommendations if available
  useEffect(() => {
    if (signal.analysis?.keyLevels && useRecommended) {
      const levels = signal.analysis.keyLevels;
      if (levels.stopLoss) setStopLoss(levels.stopLoss.toFixed(4));
      if (levels.takeProfit?.[0]) setTakeProfit1(levels.takeProfit[0].toFixed(4));
      if (levels.takeProfit?.[1]) setTakeProfit2(levels.takeProfit[1].toFixed(4));
      if (levels.takeProfit?.[2]) setTakeProfit3(levels.takeProfit[2].toFixed(4));
    }
  }, [signal.analysis, useRecommended]);
  
  const direction = signal.analysis?.direction || 'long';
  const entryPrice = signal.currentPrice;
  
  // Calculate risk and reward
  const calculateRisk = () => {
    if (!stopLoss || !entryPrice) return 0;
    const sl = parseFloat(stopLoss);
    const risk = Math.abs(entryPrice - sl) / entryPrice * 100;
    return risk.toFixed(2);
  };
  
  const calculateReward = (tp: string) => {
    if (!tp || !entryPrice) return 0;
    const target = parseFloat(tp);
    const reward = Math.abs(target - entryPrice) / entryPrice * 100;
    return reward.toFixed(2);
  };
  
  const calculateRiskReward = () => {
    const risk = parseFloat(calculateRisk());
    const reward = parseFloat(calculateReward(takeProfit1));
    if (risk === 0) return '0';
    return (reward / risk).toFixed(2);
  };
  
  const handleExecute = () => {
    const size = parseFloat(positionSize);
    const lev = parseFloat(leverage);
    
    if (!size || size <= 0) {
      alert('Please enter a valid position size');
      return;
    }
    
    const takeProfits = [
      takeProfit1 ? parseFloat(takeProfit1) : undefined,
      takeProfit2 ? parseFloat(takeProfit2) : undefined,
      takeProfit3 ? parseFloat(takeProfit3) : undefined,
    ].filter(Boolean) as number[];
    
    const trade: Omit<Trade, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
      strategyId: signal.strategyId,
      watchlistId: signal.id,
      symbol: signal.symbol,
      direction,
      entryPrice,
      currentPrice: entryPrice,
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      takeProfit: takeProfits.length > 0 ? takeProfits : undefined,
      positionSize: size * lev,
      tradePlan: signal.analysis?.reasoning || 'Manual trade execution',
      status: 'active',
    };
    
    onExecute(trade);
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-lg max-w-lg w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            {direction === 'long' ? 
              <TrendingUp className="h-5 w-5 text-green-500" /> : 
              <TrendingDown className="h-5 w-5 text-red-500" />
            }
            <h2 className="text-lg font-semibold text-primary">
              Execute {direction.toUpperCase()} Trade - {signal.symbol}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Entry Price */}
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Entry Price</label>
            <div className="px-3 py-2 bg-muted rounded text-foreground font-mono">
              ${entryPrice.toFixed(4)}
            </div>
          </div>
          
          {/* Position Size */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Position Size (USDT)</label>
              <input
                type="number"
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded text-foreground focus:border-primary focus:outline-none"
                placeholder="100"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Leverage</label>
              <select
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded text-foreground focus:border-primary focus:outline-none"
              >
                <option value="1">1x (Spot)</option>
                <option value="2">2x</option>
                <option value="3">3x</option>
                <option value="5">5x</option>
                <option value="10">10x</option>
              </select>
            </div>
          </div>
          
          {/* AI Recommendations Toggle */}
          {signal.analysis?.keyLevels && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useRecommended"
                checked={useRecommended}
                onChange={(e) => setUseRecommended(e.target.checked)}
                className="rounded border-border bg-muted text-primary focus:ring-primary"
              />
              <label htmlFor="useRecommended" className="text-sm text-foreground">
                Use AI recommended levels
              </label>
            </div>
          )}
          
          {/* Stop Loss */}
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">
              Stop Loss <span className="text-red-400">({calculateRisk()}% risk)</span>
            </label>
            <input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              disabled={useRecommended && !!signal.analysis?.keyLevels?.stopLoss}
              className="w-full px-3 py-2 bg-muted border border-border rounded text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
              placeholder={direction === 'long' ? 'Below entry' : 'Above entry'}
            />
          </div>
          
          {/* Take Profits */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Take Profit Levels</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-8">TP1</span>
                <input
                  type="number"
                  value={takeProfit1}
                  onChange={(e) => setTakeProfit1(e.target.value)}
                  disabled={useRecommended && !!signal.analysis?.keyLevels?.takeProfit?.[0]}
                  className="flex-1 px-3 py-2 bg-muted border border-border rounded text-foreground text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                  placeholder="First target"
                />
                <span className="text-xs text-green-400 w-16 text-right">
                  +{calculateReward(takeProfit1)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-8">TP2</span>
                <input
                  type="number"
                  value={takeProfit2}
                  onChange={(e) => setTakeProfit2(e.target.value)}
                  disabled={useRecommended && !!signal.analysis?.keyLevels?.takeProfit?.[1]}
                  className="flex-1 px-3 py-2 bg-muted border border-border rounded text-foreground text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                  placeholder="Second target (optional)"
                />
                <span className="text-xs text-green-400 w-16 text-right">
                  {takeProfit2 && `+${calculateReward(takeProfit2)}%`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-8">TP3</span>
                <input
                  type="number"
                  value={takeProfit3}
                  onChange={(e) => setTakeProfit3(e.target.value)}
                  disabled={useRecommended && !!signal.analysis?.keyLevels?.takeProfit?.[2]}
                  className="flex-1 px-3 py-2 bg-muted border border-border rounded text-foreground text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                  placeholder="Third target (optional)"
                />
                <span className="text-xs text-green-400 w-16 text-right">
                  {takeProfit3 && `+${calculateReward(takeProfit3)}%`}
                </span>
              </div>
            </div>
          </div>
          
          {/* Risk/Reward Summary */}
          <div className="bg-muted rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Risk/Reward Ratio:</span>
              <span className={`font-mono ${
                parseFloat(calculateRiskReward()) >= 2 ? 'text-green-400' : 
                parseFloat(calculateRiskReward()) >= 1 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                1:{calculateRiskReward()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Position:</span>
              <span className="text-foreground font-mono">
                ${(parseFloat(positionSize || '0') * parseFloat(leverage)).toFixed(2)} USDT
              </span>
            </div>
          </div>
          
          {/* AI Analysis */}
          {signal.analysis && (
            <div className="bg-muted rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-1">AI Analysis:</p>
                  <p className="text-sm text-foreground">{signal.analysis.reasoning}</p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-muted text-foreground rounded hover:bg-muted/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            className="flex-1 px-4 py-2 bg-primary text-background rounded hover:bg-primary/90 transition-colors font-medium"
          >
            Execute {direction.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}