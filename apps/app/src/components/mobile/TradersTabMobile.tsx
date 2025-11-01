import React, { useState, useMemo } from 'react';
import { Trader } from '../../abstractions/trader.interfaces';
import { TraderCardMobile } from './TraderCardMobile';
import { Search } from 'lucide-react';

interface TradersTabMobileProps {
  traders: Trader[];
  onToggleTrader: (traderId: string) => void;
  onSelectTrader?: (trader: Trader) => void;
}

type FilterCategory = 'all' | 'builtin' | 'personal' | 'enabled';

export const TradersTabMobile: React.FC<TradersTabMobileProps> = ({
  traders,
  onToggleTrader,
  onSelectTrader,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Toggle favorite status
  const handleToggleFavorite = (traderId: string) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(traderId)) {
        newFavorites.delete(traderId);
      } else {
        newFavorites.add(traderId);
      }
      return newFavorites;
    });
  };

  // Filter and search traders
  const filteredTraders = useMemo(() => {
    let result = traders;

    // Apply category filter
    switch (activeFilter) {
      case 'builtin':
        result = result.filter(t => t.isBuiltIn);
        break;
      case 'personal':
        result = result.filter(t => !t.isBuiltIn);
        break;
      case 'enabled':
        result = result.filter(t => t.enabled);
        break;
      // 'all' shows everything
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        t =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
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
  }, [traders, activeFilter, searchQuery]);

  // Filter chip component
  const FilterChip: React.FC<{ category: FilterCategory; label: string }> = ({
    category,
    label,
  }) => (
    <button
      onClick={() => setActiveFilter(category)}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
        activeFilter === category
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      }`}
    >
      {label}
    </button>
  );

  // Count enabled traders
  const enabledCount = traders.filter(t => t.enabled).length;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header with counts */}
      <div className="px-4 pt-4 pb-2 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Trading Signals</h2>
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-primary">{enabledCount}</span> /{' '}
            {traders.length} active
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search traders..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          <FilterChip category="all" label="All" />
          <FilterChip category="enabled" label="Enabled" />
          <FilterChip category="builtin" label="Built-in" />
          <FilterChip category="personal" label="Personal" />
        </div>
      </div>

      {/* Trader Cards Grid */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filteredTraders.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 pb-20">
            {filteredTraders.map(trader => (
              <TraderCardMobile
                key={trader.id}
                trader={trader}
                onToggle={onToggleTrader}
                onFavorite={handleToggleFavorite}
                onClick={onSelectTrader}
                isFavorite={favorites.has(trader.id)}
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
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery
                ? `No results for "${searchQuery}"`
                : 'Try changing your filters'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
