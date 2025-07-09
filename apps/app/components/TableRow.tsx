
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
  const [flashEndTime, setFlashEndTime] = useState<number>(0);

  // Handle price changes and set flash color
  useEffect(() => {
    if (tickerData) {
      const currentPrice = parseFloat(tickerData.c);
      if (prevPrice !== null && currentPrice !== prevPrice) {
        if (currentPrice > prevPrice) {
          setPriceFlashClass('text-[var(--tm-success)]');
        } else if (currentPrice < prevPrice) {
          setPriceFlashClass('text-[var(--tm-error)]');
        }
        setFlashEndTime(Date.now() + 700);
      }
      setPrevPrice(currentPrice);
    }
  }, [tickerData, prevPrice]);

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

  if (!tickerData) {
    // Render a placeholder or nothing if ticker data is not yet available for this symbol
    return (
      <tr className="hover:bg-[var(--tm-bg-hover)]/50 transition-colors duration-150" onClick={() => onRowClick(symbol)}>
        <td className="px-4 py-3 whitespace-nowrap"><div className="font-semibold text-[var(--tm-accent)]">{symbol}</div></td>
        <td colSpan={4} className="px-4 py-3 whitespace-nowrap text-right text-[var(--tm-text-muted)]">Loading data...</td>
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
      className="hover:bg-[var(--tm-bg-hover)]/50 transition-colors duration-150 cursor-pointer"
      onClick={() => onRowClick(symbol)}
    >
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="font-semibold text-[var(--tm-accent)]">{symbol}</div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right font-medium">
        <span className={`transition-colors duration-700 ${priceFlashClass || 'text-[var(--tm-text-primary)]'}`}>
          {lastPrice.toFixed(priceFixed)}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right">
        <span className={priceChangePercent >= 0 ? 'text-[var(--tm-success)]' : 'text-[var(--tm-error)]'}>
          {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-[var(--tm-text-secondary)]">
        {Math.round(quoteVolume / 1_000_000)}M
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-center">
        <button
          className="text-[var(--tm-secondary)] hover:text-[var(--tm-secondary-light)] text-2xl p-1 focus:outline-none tm-focus-ring"
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
