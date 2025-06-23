
import React, { useState, useEffect, memo } from 'react';
import { Ticker } from '../types';

interface TableRowProps {
  symbol: string;
  tickerData: Ticker | undefined;
  onRowClick: (symbol: string) => void;
  onAiInfoClick: (symbol: string, event: React.MouseEvent) => void;
}

const TableRow: React.FC<TableRowProps> = ({ symbol, tickerData, onRowClick, onAiInfoClick }) => {
  const [priceFlashClass, setPriceFlashClass] = useState('');
  const [prevPrice, setPrevPrice] = useState<number | null>(null);

  useEffect(() => {
    if (tickerData) {
      const currentPrice = parseFloat(tickerData.c);
      if (prevPrice !== null) {
        if (currentPrice > prevPrice) {
          setPriceFlashClass('text-green-400');
        } else if (currentPrice < prevPrice) {
          setPriceFlashClass('text-red-400');
        }
        const timer = setTimeout(() => setPriceFlashClass(''), 700);
        return () => clearTimeout(timer);
      }
      setPrevPrice(currentPrice);
    }
  }, [tickerData, prevPrice]);

  if (!tickerData) {
    // Render a placeholder or nothing if ticker data is not yet available for this symbol
    return (
      <tr className="hover:bg-gray-700/50 transition-colors duration-150" onClick={() => onRowClick(symbol)}>
        <td className="px-4 py-3 whitespace-nowrap"><div className="font-semibold text-yellow-400">{symbol}</div></td>
        <td colSpan={4} className="px-4 py-3 whitespace-nowrap text-right text-gray-500">Loading data...</td>
      </tr>
    );
  }

  const priceChangePercent = parseFloat(tickerData.P);
  const lastPrice = parseFloat(tickerData.c);
  const quoteVolume = parseFloat(tickerData.q);

  // Determine decimal places based on price
  let priceFixed = 2;
  if (lastPrice < 0.001) priceFixed = 8;
  else if (lastPrice < 0.01) priceFixed = 6;
  else if (lastPrice < 0.1) priceFixed = 5;
  else if (lastPrice < 1) priceFixed = 4;
  else if (lastPrice < 100) priceFixed = 3;


  return (
    <tr
      className="hover:bg-gray-700/50 transition-colors duration-150 cursor-pointer"
      onClick={() => onRowClick(symbol)}
    >
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="font-semibold text-yellow-400">{symbol}</div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right font-medium">
        <span className={`transition-colors duration-700 ${priceFlashClass || 'text-white'}`}>
          {lastPrice.toFixed(priceFixed)}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right">
        <span className={priceChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
          {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-gray-300">
        {Math.round(quoteVolume / 1_000_000)}M
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-center">
        <button
          className="text-blue-400 hover:text-blue-300 text-2xl p-1 focus:outline-none"
          data-symbol={symbol}
          onClick={(e) => onAiInfoClick(symbol, e)}
          title={`AI Analysis for ${symbol}`}
        >
          ✨
        </button>
      </td>
    </tr>
  );
};

export default memo(TableRow); // Memoize for performance as ticker data updates frequently
