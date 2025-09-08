import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, X, AlertCircle, Shield, Zap } from 'lucide-react';
import { tradingManager } from '../services/tradingManager';
import { Position, Balance } from '../abstractions/trading.interfaces';
import { DemoTradingEngine } from '../implementations/trading/DemoTradingEngine';

interface PositionsPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function PositionsPanel({ isOpen = true, onClose }: PositionsPanelProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [demoStats, setDemoStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [tradingMode, setTradingMode] = useState<'demo' | 'live'>('demo');

  // Refresh positions and balances
  const refreshData = async () => {
    const engine = tradingManager.getEngine();
    if (!engine) return;

    setIsLoading(true);
    setError('');

    try {
      // Get positions
      const currentPositions = await engine.getPositions();
      setPositions(currentPositions);

      // Get balances
      const currentBalances = await engine.getBalances();
      setBalances(currentBalances);

      // Get demo stats if in demo mode
      if (tradingManager.getConfig().mode === 'demo') {
        const demoEngine = engine as DemoTradingEngine;
        setDemoStats(demoEngine.getDemoStats());
      }

      setTradingMode(tradingManager.getConfig().mode);
    } catch (error: any) {
      console.error('Failed to refresh positions:', error);
      setError(error.message || 'Failed to load positions');
    } finally {
      setIsLoading(false);
    }
  };

  // Set up auto-refresh
  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, []);

  // Calculate total P&L
  const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
  const totalRealizedPnL = positions.reduce((sum, pos) => sum + pos.realizedPnl, 0);

  // Get USDT balance
  const usdtBalance = balances.find(b => b.currency === 'USDT');

  if (!isOpen) return null;

  return (
    <div className="nt-card p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--nt-text-primary)]">Positions & P&L</h3>
          {tradingMode === 'demo' ? (
            <Shield className="w-4 h-4 text-cyan-500" title="Demo Trading" />
          ) : (
            <Zap className="w-4 h-4 text-orange-500" title="Live Trading" />
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[var(--nt-text-muted)] hover:text-[var(--nt-text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Balance Summary */}
      <div className="mb-3 p-2 bg-[var(--nt-bg-hover)] rounded-md">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--nt-text-muted)]">Balance</span>
          <span className="font-mono font-semibold">
            ${usdtBalance?.total.toFixed(2) || '0.00'} USDT
          </span>
        </div>
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-[var(--nt-text-muted)]">Available</span>
          <span className="font-mono">
            ${usdtBalance?.free.toFixed(2) || '0.00'}
          </span>
        </div>
      </div>

      {/* P&L Summary */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2 bg-[var(--nt-bg-hover)] rounded-md">
          <div className="text-xs text-[var(--nt-text-muted)]">Unrealized P&L</div>
          <div className={`text-sm font-mono font-semibold ${
            totalUnrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'
          }`}>
            {totalUnrealizedPnL >= 0 ? '+' : ''}{totalUnrealizedPnL.toFixed(2)}
          </div>
        </div>
        <div className="p-2 bg-[var(--nt-bg-hover)] rounded-md">
          <div className="text-xs text-[var(--nt-text-muted)]">Realized P&L</div>
          <div className={`text-sm font-mono font-semibold ${
            totalRealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'
          }`}>
            {totalRealizedPnL >= 0 ? '+' : ''}{totalRealizedPnL.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Demo Stats */}
      {demoStats && (
        <div className="mb-3 p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-md text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[var(--nt-text-muted)]">Total Trades:</span>{' '}
              <span className="font-semibold">{demoStats.totalTrades}</span>
            </div>
            <div>
              <span className="text-[var(--nt-text-muted)]">Win Rate:</span>{' '}
              <span className="font-semibold">{demoStats.winRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Positions List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {isLoading && positions.length === 0 ? (
          <div className="text-center py-4 text-[var(--nt-text-muted)] text-sm">
            Loading positions...
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-4 text-[var(--nt-text-muted)] text-sm">
            No open positions
          </div>
        ) : (
          positions.map(position => (
            <div
              key={position.id}
              className="p-2 bg-[var(--nt-bg-hover)] rounded-md space-y-1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{position.symbol}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    position.side === 'long' 
                      ? 'bg-green-500/20 text-green-500' 
                      : 'bg-red-500/20 text-red-500'
                  }`}>
                    {position.side.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {position.percentage >= 0 ? (
                    <TrendingUp className="w-3 h-3 text-green-500" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-sm font-mono font-semibold ${
                    position.percentage >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {position.percentage >= 0 ? '+' : ''}{position.percentage.toFixed(2)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-[var(--nt-text-muted)]">Size:</span>{' '}
                  <span className="font-mono">{position.contracts.toFixed(3)}</span>
                </div>
                <div>
                  <span className="text-[var(--nt-text-muted)]">Entry:</span>{' '}
                  <span className="font-mono">${position.entryPrice.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-[var(--nt-text-muted)]">Mark:</span>{' '}
                  <span className="font-mono">${position.markPrice.toFixed(4)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="text-[var(--nt-text-muted)]">Unrealized:</span>{' '}
                  <span className={`font-mono ${
                    position.unrealizedPnl >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {position.unrealizedPnl >= 0 ? '+' : ''}${position.unrealizedPnl.toFixed(2)}
                  </span>
                </div>
                {position.liquidationPrice && (
                  <div className="flex items-center gap-1 text-orange-500">
                    <AlertCircle className="w-3 h-3" />
                    <span className="font-mono">${position.liquidationPrice.toFixed(4)}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-2 p-2 bg-red-500/10 border border-red-500 rounded-md text-sm text-red-500">
          {error}
        </div>
      )}
    </div>
  );
}