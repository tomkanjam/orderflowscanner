import React, { useEffect, useState } from 'react';
import { tradeManager } from '../services/tradeManager';
import { TrendingUp, TrendingDown, DollarSign, Target, BarChart3 } from 'lucide-react';

export function PortfolioMetrics() {
  const [metrics, setMetrics] = useState({
    totalPnL: 0,
    totalPnLPercent: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
    openPositions: 0,
    closedTrades: 0,
  });
  
  useEffect(() => {
    // Update metrics whenever trades change
    const updateMetrics = () => {
      setMetrics(tradeManager.getPortfolioMetrics());
    };
    
    // Initial load
    updateMetrics();
    
    // Subscribe to updates
    const unsubscribe = tradeManager.subscribe(updateMetrics);
    
    return unsubscribe;
  }, []);
  
  const profitFactor = metrics.avgLoss !== 0 
    ? Math.abs(metrics.avgWin / metrics.avgLoss) 
    : metrics.avgWin > 0 ? Infinity : 0;
  
  return (
    <div className="bg-background border border-border rounded-lg p-4">
      <h3 className="text-lg font-semibold text-primary mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5" />
        Portfolio Performance
      </h3>
      
      {/* Main Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-muted rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Total P&L</p>
          <p className={`text-lg font-bold ${
            metrics.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'
          }`}>
            {metrics.totalPnL >= 0 ? '+' : ''}${metrics.totalPnL.toFixed(2)}
          </p>
          <p className={`text-xs ${
            metrics.totalPnLPercent >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {metrics.totalPnLPercent >= 0 ? '+' : ''}{metrics.totalPnLPercent.toFixed(2)}%
          </p>
        </div>
        
        <div className="bg-muted rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
          <p className={`text-lg font-bold ${
            metrics.winRate >= 50 ? 'text-green-500' : 'text-yellow-500'
          }`}>
            {metrics.winRate.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">
            {metrics.closedTrades} trades
          </p>
        </div>
        
        <div className="bg-muted rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Avg Win/Loss</p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-green-400">+{metrics.avgWin.toFixed(2)}%</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-sm text-red-400">{metrics.avgLoss.toFixed(2)}%</span>
          </div>
          <p className="text-xs text-muted-foreground">
            PF: {profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}
          </p>
        </div>
        
        <div className="bg-muted rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Open Positions</p>
          <p className="text-lg font-bold text-primary">
            {metrics.openPositions}
          </p>
          <p className="text-xs text-muted-foreground">
            Active
          </p>
        </div>
      </div>
      
      {/* Trade Distribution */}
      {metrics.closedTrades > 0 && (
        <div className="bg-muted rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">Win/Loss Distribution</p>
          <div className="relative h-4 bg-background rounded-full overflow-hidden">
            <div 
              className="absolute left-0 top-0 h-full bg-green-500/50"
              style={{ width: `${metrics.winRate}%` }}
            />
            <div 
              className="absolute right-0 top-0 h-full bg-red-500/50"
              style={{ width: `${100 - metrics.winRate}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs">
            <span className="text-green-400">
              Wins: {Math.round(metrics.closedTrades * metrics.winRate / 100)}
            </span>
            <span className="text-red-400">
              Losses: {metrics.closedTrades - Math.round(metrics.closedTrades * metrics.winRate / 100)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}