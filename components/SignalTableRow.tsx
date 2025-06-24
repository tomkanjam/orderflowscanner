import React, { useState, useEffect, memo } from 'react';
import { CombinedSignal, HistoricalSignal } from '../types';

interface SignalTableRowProps {
  signal: CombinedSignal;
  currentPrice: number;
  onRowClick: (symbol: string) => void;
  onAiInfoClick: (symbol: string, event: React.MouseEvent) => void;
}

// Type guard to check if signal is historical
function isHistoricalSignal(signal: CombinedSignal): signal is HistoricalSignal {
  return 'isHistorical' in signal && signal.isHistorical === true;
}

const SignalTableRow: React.FC<SignalTableRowProps> = ({ 
  signal, 
  currentPrice, 
  onRowClick, 
  onAiInfoClick 
}) => {
  const [priceFlashClass, setPriceFlashClass] = useState('');
  const [prevPrice, setPrevPrice] = useState<number>(currentPrice);
  const [flashEndTime, setFlashEndTime] = useState<number>(0);

  // Calculate gain/loss
  const priceChange = currentPrice - signal.priceAtSignal;
  const priceChangePercent = (priceChange / signal.priceAtSignal) * 100;

  // Handle price changes and set flash color
  useEffect(() => {
    if (currentPrice !== prevPrice && prevPrice !== null) {
      if (currentPrice > prevPrice) {
        setPriceFlashClass('text-[var(--tm-success)]');
      } else if (currentPrice < prevPrice) {
        setPriceFlashClass('text-[var(--tm-error)]');
      }
      setFlashEndTime(Date.now() + 700);
      setPrevPrice(currentPrice);
    }
  }, [currentPrice, prevPrice]);

  // Handle returning to white after flash duration
  useEffect(() => {
    if (flashEndTime > 0) {
      const timeUntilEnd = flashEndTime - Date.now();
      if (timeUntilEnd <= 0) {
        setPriceFlashClass('');
        setFlashEndTime(0);
      } else {
        const timer = setTimeout(() => {
          setPriceFlashClass('');
          setFlashEndTime(0);
        }, timeUntilEnd);
        return () => clearTimeout(timer);
      }
    }
  }, [flashEndTime]);

  // Format time - show bars ago for historical signals
  const formatTime = (timestamp: number) => {
    if (isHistoricalSignal(signal) && signal.barsAgo !== undefined) {
      return `${signal.barsAgo} bars ago`;
    }
    
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      });
    } else {
      return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit'
      });
    }
  };

  // Determine decimal places based on price
  const getPriceFixed = (price: number) => {
    if (price < 0.001) return 8;
    else if (price < 0.01) return 6;
    else if (price < 0.1) return 5;
    else if (price < 1) return 4;
    else if (price < 100) return 3;
    return 2;
  };

  const priceFixed = getPriceFixed(signal.priceAtSignal);

  return (
    <tr
      className="hover:bg-[var(--tm-bg-hover)]/50 transition-colors duration-150 cursor-pointer"
      onClick={() => onRowClick(signal.symbol)}
    >
      <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-xs md:text-sm text-[var(--tm-text-muted)]">
        {formatTime(signal.timestamp)}
      </td>
      {/* Count column - Hidden for now */}
      {/* <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-center">
        <span className={`inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 text-xs font-semibold rounded-full ${
          signal.count > 1 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-zinc-700/50 text-zinc-400'
        }`}>
          {signal.count || 1}
        </span>
      </td> */}
      <td className="p-2 md:px-4 md:py-3 whitespace-nowrap">
        <div>
          <div className="font-semibold text-[var(--tm-accent)]">{signal.symbol}</div>
          <div className="text-xs text-[var(--tm-text-muted)] truncate max-w-[150px]" title={signal.filterDesc}>
            {signal.filterDesc}
          </div>
        </div>
      </td>
      <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-right font-medium text-[var(--tm-text-secondary)]">
        {signal.priceAtSignal.toFixed(priceFixed)}
      </td>
      {/* Current Price column - Hidden for now */}
      {/* <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-right font-medium">
        <span className={`transition-colors duration-700 ${priceFlashClass || 'text-white'}`}>
          {currentPrice.toFixed(priceFixed)}
        </span>
      </td> */}
      <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-right">
        <span className={priceChangePercent >= 0 ? 'text-[var(--tm-success)]' : 'text-[var(--tm-error)]'}>
          {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
        </span>
      </td>
      <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-right text-[var(--tm-text-secondary)] hidden sm:table-cell">
        {Math.round(signal.volumeAtSignal / 1_000_000)}M
      </td>
      {/* Analyze column - Hidden for now */}
      {/* <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-center">
        <div className="flex items-center justify-center gap-2">
          {signal.tradeDecision && (
            <span className={`px-2 py-1 text-xs font-bold rounded ${
              signal.tradeDecision === 'BUY' ? 'bg-green-500 text-white' :
              signal.tradeDecision === 'SELL' ? 'bg-red-500 text-white' :
              signal.tradeDecision === 'HOLD' ? 'bg-blue-500 text-white' :
              'bg-zinc-600 text-white'
            }`} title={signal.reasoning || ''}>
              {signal.tradeDecision}
            </span>
          )}
          <button
            className="text-blue-400 hover:text-blue-300 text-2xl p-1 focus:outline-none"
            onClick={(e) => onAiInfoClick(signal.symbol, e)}
            title={`AI Analysis for ${signal.symbol}`}
          >
            ✨
          </button>
        </div>
      </td> */}
    </tr>
  );
};

export default memo(SignalTableRow);