import React, { useState, useMemo, useEffect } from 'react';
import { Trader } from '../../abstractions/trader.interfaces';
import { TraderCard } from './TraderCard';
import { Search, Plus } from 'lucide-react';
import { traderManager } from '../../services/traderManager';

interface TradersTabProps {
  onCreateTrader: () => void;
}

export const TradersTab: React.FC<TradersTabProps> = ({ onCreateTrader }) => {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Subscribe to trader updates
  useEffect(() => {
    const unsubscribe = traderManager.subscribe((updatedTraders) => {
      setTraders(updatedTraders);
      setLoading(false);
    });

    traderManager.getTraders().then((initialTraders) => {
      setTraders(initialTraders);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Toggle trader enabled/disabled
  const handleToggleTrader = async (traderId: string) => {
    const trader = traders.find(t => t.id === traderId);
    if (trader) {
      await traderManager.updateTrader(traderId, {
        enabled: !trader.enabled
      });
    }
  };

  // Filter traders by search query
  const filteredTraders = useMemo(() => {
    let result = traders;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        t =>
          t.name.toLowerCase().includes(query) ||
          t.description?.toLowerCase().includes(query) ||
          t.category?.toLowerCase().includes(query)
      );
    }

    // Sort: enabled first, then by name
    return result.sort((a, b) => {
      if (a.enabled !== b.enabled) {
        return a.enabled ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [traders, searchQuery]);

  const enabledCount = traders.filter(t => t.enabled).length;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Loading traders...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header - Sticky */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">Trading Signals</h2>
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-green-500">{enabledCount}</span>
            {' / '}
            {traders.length} active
          </div>
        </div>

        {/* Search Bar - Big, thumb-friendly */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search traders..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-muted border border-border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Trader Cards - Scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filteredTraders.length > 0 ? (
          <div className="space-y-3 pb-24">
            {filteredTraders.map(trader => (
              <TraderCard
                key={trader.id}
                trader={trader}
                onToggle={handleToggleTrader}
                isExpanded={expandedCardId === trader.id}
                onExpand={(id) => setExpandedCardId(expandedCardId === id ? null : id)}
              />
            ))}
          </div>
        ) : (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-2">No traders found</h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? `No results for "${searchQuery}"` : 'Get started by creating your first trader'}
            </p>
          </div>
        )}
      </div>

      {/* Create Button - Fixed at bottom */}
      <div className="flex-shrink-0 p-4 border-t border-border bg-background">
        <button
          onClick={onCreateTrader}
          className="w-full h-12 bg-primary text-primary-foreground rounded-lg font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <Plus className="w-5 h-5" />
          Create New Trader
        </button>
      </div>
    </div>
  );
};
