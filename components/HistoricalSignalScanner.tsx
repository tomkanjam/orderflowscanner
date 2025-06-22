import React, { useState } from 'react';
import { useHistoricalScanner } from '../hooks/useHistoricalScanner';
import { HistoricalScanConfig, HistoricalSignal, Kline, Ticker, KlineInterval } from '../types';

interface Props {
  symbols: string[];
  historicalData: Map<string, Kline[]>;
  tickers: Map<string, Ticker>;
  filterCode: string;
  filterDescription: string[];
  klineInterval: KlineInterval;
  onSignalClick: (signal: HistoricalSignal) => void;
}

export const HistoricalSignalScanner: React.FC<Props> = ({
  symbols,
  historicalData,
  tickers,
  filterCode,
  filterDescription,
  klineInterval,
  onSignalClick,
}) => {
  const [config, setConfig] = useState<HistoricalScanConfig>({
    lookbackHours: 4,
    scanInterval: 5,
    maxSignalsPerSymbol: 10,
    includeIndicatorSnapshots: true,
  });
  
  const { isScanning, progress, signals, error, startScan, cancelScan, clearSignals } = 
    useHistoricalScanner({
      symbols,
      historicalData,
      tickers,
      filterCode,
      filterDescription,
      klineInterval,
    });
  
  const handleStartScan = () => {
    startScan(config);
  };
  
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      {/* Controls */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white mb-3">Historical Signal Scanner</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Lookback Period
            </label>
            <select 
              value={config.lookbackHours} 
              onChange={e => setConfig({...config, lookbackHours: +e.target.value})}
              disabled={isScanning}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white 
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value={1}>Last 1 Hour</option>
              <option value={4}>Last 4 Hours</option>
              <option value={12}>Last 12 Hours</option>
              <option value={24}>Last 24 Hours</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Scan Detail
            </label>
            <select 
              value={config.scanInterval} 
              onChange={e => setConfig({...config, scanInterval: +e.target.value})}
              disabled={isScanning}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white 
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value={1}>Every Bar (Detailed)</option>
              <option value={5}>Every 5 Bars (Balanced)</option>
              <option value={10}>Every 10 Bars (Fast)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Max Signals/Symbol
            </label>
            <select 
              value={config.maxSignalsPerSymbol} 
              onChange={e => setConfig({...config, maxSignalsPerSymbol: +e.target.value})}
              disabled={isScanning}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white 
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value={5}>5 signals</option>
              <option value={10}>10 signals</option>
              <option value={20}>20 signals</option>
            </select>
          </div>
          
          <div className="flex items-end">
            {!isScanning ? (
              <button 
                onClick={handleStartScan}
                disabled={!filterCode || symbols.length === 0}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 
                         disabled:cursor-not-allowed text-white font-medium rounded transition-colors"
              >
                🔍 Scan Historical
              </button>
            ) : (
              <button 
                onClick={cancelScan}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium 
                         rounded transition-colors"
              >
                Cancel Scan
              </button>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <input 
            type="checkbox" 
            id="includeIndicators"
            checked={config.includeIndicatorSnapshots}
            onChange={e => setConfig({...config, includeIndicatorSnapshots: e.target.checked})}
            disabled={isScanning}
            className="rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="includeIndicators">
            Include indicator snapshots
          </label>
        </div>
      </div>
      
      {/* Progress */}
      {isScanning && progress && (
        <div className="mb-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="mb-2">
              <div className="flex justify-between text-sm text-gray-400 mb-1">
                <span>Scanning {progress.currentSymbol}</span>
                <span>{progress.percentComplete}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percentComplete}%` }}
                />
              </div>
            </div>
            <div className="text-sm text-gray-400">
              {progress.symbolIndex}/{progress.totalSymbols} symbols • {progress.signalsFound} signals found
            </div>
          </div>
        </div>
      )}
      
      {/* Error */}
      {error && !isScanning && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded text-red-400 text-sm">
          {error}
        </div>
      )}
      
      {/* Results */}
      {!isScanning && signals.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-white font-medium">
              Historical Signals ({signals.length})
            </h4>
            <button
              onClick={clearSignals}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Clear
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
            {signals.map(signal => (
              <HistoricalSignalCard
                key={signal.id}
                signal={signal}
                onClick={() => onSignalClick(signal)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Empty state */}
      {!isScanning && !error && signals.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">📊</div>
          <p>Run a historical scan to find past signals</p>
        </div>
      )}
    </div>
  );
};

// Historical Signal Card Component
const HistoricalSignalCard: React.FC<{
  signal: HistoricalSignal;
  onClick: () => void;
}> = ({ signal, onClick }) => {
  const timeAgo = formatTimeAgo(signal.klineTimestamp);
  const priceChange = signal.percentChangeSinceSignal || 0;
  const changeClass = priceChange >= 0 ? 'text-green-400' : 'text-red-400';
  
  return (
    <div 
      className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-blue-600 
                 cursor-pointer transition-all hover:shadow-lg"
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-white font-medium">{signal.symbol}</span>
        <span className="text-xs text-gray-400">⏰ {timeAgo}</span>
      </div>
      
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Signal Price:</span>
          <span className="text-white">${signal.priceAtSignal.toFixed(4)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-400">Current Price:</span>
          <span className="text-white">${signal.currentPrice?.toFixed(4)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-400">Change:</span>
          <span className={changeClass}>
            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
          </span>
        </div>
      </div>
      
      {signal.indicators && (
        <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-gray-400">
          <div className="grid grid-cols-2 gap-1">
            {signal.indicators.rsi !== undefined && (
              <span>RSI: {signal.indicators.rsi.toFixed(1)}</span>
            )}
            {signal.indicators.ma20 !== undefined && (
              <span>MA20: ${signal.indicators.ma20.toFixed(2)}</span>
            )}
            {signal.indicators.volume !== undefined && (
              <span>Vol: {(signal.indicators.volume / 1000000).toFixed(1)}M</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function formatTimeAgo(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}