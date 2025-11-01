import React, { useState } from 'react';
import { SignalLifecycle, Trade } from '../abstractions/interfaces';
import { X, TrendingUp, TrendingDown, DollarSign, Edit2 } from 'lucide-react';
import { signalManager } from '../services/signalManager';

interface PositionManagerProps {
  signal: SignalLifecycle;
  onClose: (reason: string, finalPrice: number) => void;
  onModify: (updates: Partial<Trade>) => void;
}

export function PositionManager({ signal, onClose, onModify }: PositionManagerProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editStopLoss, setEditStopLoss] = useState(signal.trade?.stopLoss?.toString() || '');
  const [editTakeProfit1, setEditTakeProfit1] = useState(signal.trade?.takeProfit?.[0]?.toString() || '');
  
  if (!signal.trade || signal.status !== 'in_position') {
    return null;
  }
  
  const trade = signal.trade;
  const direction = trade.direction;
  const entryPrice = trade.entryPrice || signal.initialPrice;
  const currentPrice = signal.currentPrice;
  
  // Calculate P&L
  const priceDiff = direction === 'long' 
    ? currentPrice - entryPrice 
    : entryPrice - currentPrice;
  const pnlPercent = (priceDiff / entryPrice) * 100;
  const pnlUSDT = (priceDiff / entryPrice) * (trade.positionSize || 0);
  
  // Calculate distances to SL/TP
  const distanceToSL = trade.stopLoss 
    ? Math.abs(currentPrice - trade.stopLoss) / currentPrice * 100 
    : 0;
  const distanceToTP = trade.takeProfit?.[0] 
    ? Math.abs(trade.takeProfit[0] - currentPrice) / currentPrice * 100 
    : 0;
  
  const handleClose = () => {
    if (!closeReason.trim()) {
      alert('Please provide a reason for closing');
      return;
    }
    
    setIsClosing(true);
    onClose(closeReason, currentPrice);
  };
  
  const handleModify = () => {
    const updates: Partial<Trade> = {};
    
    if (editStopLoss && editStopLoss !== trade.stopLoss?.toString()) {
      updates.stopLoss = parseFloat(editStopLoss);
    }
    
    if (editTakeProfit1 && editTakeProfit1 !== trade.takeProfit?.[0]?.toString()) {
      const existingTPs = trade.takeProfit || [];
      updates.takeProfit = [parseFloat(editTakeProfit1), ...existingTPs.slice(1)];
    }
    
    if (Object.keys(updates).length > 0) {
      onModify(updates);
      setIsEditing(false);
    }
  };
  
  return (
    <div className="bg-background border border-border rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {direction === 'long' ?
            <TrendingUp className="h-5 w-5 text-green-500" /> :
            <TrendingDown className="h-5 w-5 text-red-500" />
          }
          <h3 className="text-lg font-semibold text-primary">
            {signal.symbol} - {direction.toUpperCase()}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-1 hover:bg-muted rounded transition-colors"
            title="Modify position"
          >
            <Edit2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
      
      {/* P&L Display */}
      <div className="bg-muted rounded-lg p-4 mb-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">Unrealized P&L</p>
          <p className={`text-2xl font-bold ${
            pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'
          }`}>
            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
          </p>
          <p className={`text-sm ${
            pnlUSDT >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {pnlUSDT >= 0 ? '+' : ''}${pnlUSDT.toFixed(2)} USDT
          </p>
        </div>
      </div>
      
      {/* Position Details */}
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Entry Price</p>
            <p className="text-foreground font-mono">${entryPrice.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Current Price</p>
            <p className="text-foreground font-mono">${currentPrice.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Position Size</p>
            <p className="text-foreground font-mono">${trade.positionSize?.toFixed(2)} USDT</p>
          </div>
          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="text-foreground">
              {trade.createdAt && formatDuration(new Date(trade.createdAt))}
            </p>
          </div>
        </div>
        
        {/* Levels */}
        {isEditing ? (
          <div className="space-y-2 pt-2 border-t border-border">
            <div>
              <label className="text-xs text-muted-foreground">Stop Loss</label>
              <input
                type="number"
                value={editStopLoss}
                onChange={(e) => setEditStopLoss(e.target.value)}
                className="w-full px-2 py-1 bg-muted border border-border rounded text-foreground text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Take Profit 1</label>
              <input
                type="number"
                value={editTakeProfit1}
                onChange={(e) => setEditTakeProfit1(e.target.value)}
                className="w-full px-2 py-1 bg-muted border border-border rounded text-foreground text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleModify}
                className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
              >
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1 bg-muted text-foreground rounded text-sm hover:bg-muted/80"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-2 border-t border-border">
            {trade.stopLoss && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Stop Loss</span>
                <div className="text-right">
                  <span className="text-red-400 font-mono">${trade.stopLoss.toFixed(4)}</span>
                  <span className="text-xs text-muted-foreground ml-2">({distanceToSL.toFixed(1)}% away)</span>
                </div>
              </div>
            )}
            {trade.takeProfit?.[0] && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Take Profit 1</span>
                <div className="text-right">
                  <span className="text-green-400 font-mono">${trade.takeProfit[0].toFixed(4)}</span>
                  <span className="text-xs text-muted-foreground ml-2">({distanceToTP.toFixed(1)}% away)</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Close Position */}
      {!isClosing ? (
        <button
          onClick={() => setIsClosing(true)}
          className="w-full px-4 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors border border-red-500/50"
        >
          Close Position
        </button>
      ) : (
        <div className="space-y-3">
          <textarea
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            placeholder="Reason for closing (e.g., 'Target reached', 'Market conditions changed')"
            className="w-full px-3 py-2 bg-muted border border-border rounded text-foreground text-sm resize-none h-20"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setIsClosing(false)}
              className="flex-1 px-3 py-2 bg-muted text-foreground rounded hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleClose}
              className="flex-1 px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              Confirm Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(startDate: Date): string {
  const now = new Date();
  const diff = now.getTime() - startDate.getTime();
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}