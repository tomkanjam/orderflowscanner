
import React, { useState } from 'react';
import { TraderList } from '../src/components/TraderList';
import { TraderForm } from '../src/components/TraderForm';
import { PortfolioMetrics } from '../src/components/PortfolioMetrics';
import { Trader } from '../src/abstractions/trader.interfaces';

interface SidebarProps {
  onSelectedTraderChange?: (traderId: string | null) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  onSelectedTraderChange,
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTrader, setEditingTrader] = useState<Trader | null>(null);
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null);

  const handleTraderCreated = (trader: Trader) => {
    setSelectedTraderId(trader.id);
    onSelectedTraderChange?.(trader.id);
    setShowCreateForm(false);
    setEditingTrader(null);
  };

  return (
    <aside className="w-full md:w-1/3 xl:w-1/4 bg-[var(--tm-bg-secondary)] p-4 md:p-6 flex flex-col border-r border-[var(--tm-border)] h-screen overflow-y-auto relative">
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--tm-accent)] to-[var(--tm-accent-dark)]"></div>
      <h2 className="text-2xl font-bold mb-4 tm-heading-lg">
        <span className="text-[var(--tm-accent)]">Trading</span> <span className="text-[var(--tm-text-primary)]">Dashboard</span>
      </h2>
      
      {/* Show form or list based on state */}
      {showCreateForm || editingTrader ? (
        <div className="flex-1">
          <TraderForm
            editingTrader={editingTrader}
            onTraderCreated={handleTraderCreated}
            onCancel={() => {
              setShowCreateForm(false);
              setEditingTrader(null);
            }}
          />
        </div>
      ) : (
        <>
          {/* Traders Section */}
          <div className="flex-1">
            <TraderList 
              onCreateTrader={() => setShowCreateForm(true)}
              onEditTrader={(trader) => {
                setEditingTrader(trader);
                setShowCreateForm(true);
              }}
              onSelectTrader={(traderId) => {
                setSelectedTraderId(traderId);
                onSelectedTraderChange?.(traderId);
              }}
              selectedTraderId={selectedTraderId}
            />
          </div>
          
          {/* Portfolio Metrics */}
          <div className="mt-6">
            <PortfolioMetrics />
          </div>
        </>
      )}
    </aside>
  );
};

export default Sidebar;
