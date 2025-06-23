import React from 'react';
import { PrebuiltStrategy } from '../types/strategy';

interface StrategyCardProps {
  strategy: PrebuiltStrategy;
  onSelect: (strategy: PrebuiltStrategy) => void;
  isLoading: boolean;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ strategy, onSelect, isLoading }) => {
  const getTimeframeBadgeColor = (timeframe: string) => {
    switch (timeframe) {
      case '1m':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case '5m':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case '15m':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case '1h':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  return (
    <div
      onClick={() => !isLoading && onSelect(strategy)}
      className={`
        bg-gray-800 rounded-lg p-4 cursor-pointer transition-all duration-300
        border border-gray-700 hover:border-purple-500/50 relative
        ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:transform hover:scale-[1.02] hover:shadow-xl'}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-white">{strategy.name}</h3>
        <span className={`text-xs px-2 py-1 rounded-md border ${getTimeframeBadgeColor(strategy.timeframe)}`}>
          {strategy.timeframe}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-400 mb-4">{strategy.description}</p>

      {/* Screener Conditions */}
      <div className="mb-4">
        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Screener Conditions</h4>
        <ul className="space-y-1">
          {strategy.conditions.map((condition, index) => (
            <li key={index} className="text-xs text-gray-300 flex items-start">
              <span className="text-purple-400 mr-1">•</span>
              {condition}
            </li>
          ))}
        </ul>
      </div>

      {/* Trade Plan */}
      <div className="bg-gray-900/50 rounded-lg p-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Trade Plan</h4>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Entry:</span>
            <span className="text-gray-300">{strategy.tradePlan.entry}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Stop Loss:</span>
            <span className="text-red-400">{strategy.tradePlan.stopLoss}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Take Profit:</span>
            <span className="text-green-400">{strategy.tradePlan.takeProfit}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Position:</span>
            <span className="text-gray-300">{strategy.tradePlan.positionSize}</span>
          </div>
        </div>
      </div>

      {/* Hold Time */}
      <div className="mt-3 pt-3 border-t border-gray-700 text-center">
        <span className="text-xs text-gray-500">Hold Time: </span>
        <span className="text-xs text-gray-300">{strategy.holdTime}</span>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 bg-gray-900/80 rounded-lg flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent"></div>
        </div>
      )}
    </div>
  );
};

export default StrategyCard;