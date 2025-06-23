import React from 'react';
import { PrebuiltStrategy } from '../types/strategy';

interface StrategyCardProps {
  strategy: PrebuiltStrategy;
  onSelect: (strategy: PrebuiltStrategy) => void;
  isLoading: boolean;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ strategy, onSelect, isLoading }) => {
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low':
        return 'text-green-400 bg-green-400/10';
      case 'medium':
        return 'text-yellow-400 bg-yellow-400/10';
      case 'high':
        return 'text-red-400 bg-red-400/10';
      default:
        return 'text-gray-400 bg-gray-400/10';
    }
  };

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
        border border-gray-700 hover:border-purple-500/50
        ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:transform hover:scale-[1.02] hover:shadow-xl'}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{strategy.icon}</span>
          <h3 className="text-lg font-semibold text-white">{strategy.name}</h3>
        </div>
        <span className={`text-xs px-2 py-1 rounded-md border ${getTimeframeBadgeColor(strategy.timeframe)}`}>
          {strategy.timeframe}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-400 mb-4">{strategy.description}</p>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-900/50 rounded-lg p-2">
          <p className="text-xs text-gray-500">Win Rate</p>
          <p className="text-green-400 font-semibold">{strategy.winRate || 'N/A'}</p>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2">
          <p className="text-xs text-gray-500">Avg Gain</p>
          <p className="text-blue-400 font-semibold">{strategy.avgGain || 'N/A'}</p>
        </div>
      </div>

      {/* Additional Info */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Hold:</span>
          <span className="text-gray-300">{strategy.holdTime}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Trades/Day:</span>
          <span className="text-gray-300">{strategy.tradesPerDay}</span>
        </div>
      </div>

      {/* Risk Level */}
      <div className="mt-3 pt-3 border-t border-gray-700">
        <span className={`text-xs px-2 py-1 rounded-md ${getRiskColor(strategy.riskLevel)}`}>
          {strategy.riskLevel.toUpperCase()} RISK
        </span>
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