import React from 'react';
import StrategyCard from './StrategyCard';
import { PrebuiltStrategy, prebuiltStrategies } from '../types/strategy';

interface StrategyGridProps {
  onSelectStrategy: (strategy: PrebuiltStrategy) => void;
  loadingStrategyId: string | null;
}

const StrategyGrid: React.FC<StrategyGridProps> = ({ onSelectStrategy, loadingStrategyId }) => {
  return (
    <div className="w-full">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">
          Choose a Day Trading Strategy
        </h2>
        <p className="text-zinc-400">
          Select a pre-built strategy to instantly scan the market for opportunities
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
        {prebuiltStrategies.map((strategy) => (
          <StrategyCard
            key={strategy.id}
            strategy={strategy}
            onSelect={onSelectStrategy}
            isLoading={loadingStrategyId === strategy.id}
          />
        ))}
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-zinc-500">
          All strategies use real-time market data • Performance metrics based on backtesting
        </p>
      </div>
    </div>
  );
};

export default StrategyGrid;