import React, { useState, useEffect, memo } from 'react';
import { SignalLogEntry } from '../types';

interface SignalTableRowProps {
  signal: SignalLogEntry;
  currentPrice: number;
  onRowClick: (symbol: string) => void;
  onAiInfoClick: (symbol: string, event: React.MouseEvent) => void;
}

const SignalTableRow: React.FC<SignalTableRowProps> = ({ 
  signal, 
  currentPrice, 
  onRowClick, 
  onAiInfoClick 
}) => {
  const [flashClass, setFlashClass] = useState('');
  const [prevPrice, setPrevPrice] = useState<number>(currentPrice);

  // Calculate gain/loss
  const priceChange = currentPrice - signal.priceAtSignal;
  const priceChangePercent = (priceChange / signal.priceAtSignal) * 100;

  useEffect(() => {
    if (currentPrice !== prevPrice) {
      if (currentPrice > prevPrice) {
        setFlashClass('flash-green');
      } else if (currentPrice < prevPrice) {
        setFlashClass('flash-red');
      }
      const timer = setTimeout(() => setFlashClass(''), 700);
      setPrevPrice(currentPrice);
      return () => clearTimeout(timer);
    }
  }, [currentPrice, prevPrice]);

  // Format time
  const formatTime = (timestamp: number) => {
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
      className={`hover:bg-gray-700/50 transition-colors duration-150 cursor-pointer ${flashClass}`}
      onClick={() => onRowClick(signal.symbol)}
    >
      <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-xs md:text-sm text-gray-400">
        {formatTime(signal.timestamp)}
      </td>
      <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-center">
        <span className={`inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 text-xs font-semibold rounded-full ${
          signal.count > 1 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-600/50 text-gray-400'
        }`}>
          {signal.count || 1}
        </span>
      </td>
      <td className="p-2 md:px-4 md:py-3 whitespace-nowrap">
        <div className="font-semibold text-yellow-400">{signal.symbol}</div>
        <div className="text-xs text-gray-500 truncate max-w-[150px]" title={signal.filterDesc}>
          {signal.filterDesc}
        </div>
      </td>
      <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-right font-medium text-gray-300">
        {signal.priceAtSignal.toFixed(priceFixed)}
      </td>
      <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-right font-medium">
        {currentPrice.toFixed(priceFixed)}
      </td>
      <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-right">
        <span className={priceChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
          {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
        </span>
      </td>
      <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-right text-gray-300 hidden sm:table-cell">
        {Math.round(signal.volumeAtSignal / 1_000_000)}M
      </td>
      <td className="p-2 md:px-4 md:py-3 whitespace-nowrap text-center">
        <div className="flex items-center justify-center gap-2">
          {signal.tradeDecision && (
            <span className={`px-2 py-1 text-xs font-bold rounded ${
              signal.tradeDecision === 'BUY' ? 'bg-green-500 text-white' :
              signal.tradeDecision === 'SELL' ? 'bg-red-500 text-white' :
              signal.tradeDecision === 'HOLD' ? 'bg-blue-500 text-white' :
              'bg-gray-500 text-white'
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
      </td>
    </tr>
  );
};

export default memo(SignalTableRow);