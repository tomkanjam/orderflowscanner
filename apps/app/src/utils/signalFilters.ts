import { Trader } from '../abstractions/trader.interfaces';

/**
 * Grouped signals organized by category
 */
export interface GroupedSignals {
  [category: string]: Trader[];
}

/**
 * Segmented data organized by tab type
 */
export interface SegmentedData {
  builtin: GroupedSignals;
  personal: Trader[];
  favorites: Trader[];
}

/**
 * Filters traders based on search query.
 * Searches across name, description, and category.
 *
 * @param traders - Array of traders to filter
 * @param query - Search query string
 * @returns Filtered array of traders
 */
export function filterTraders(traders: Trader[], query: string): Trader[] {
  if (!query.trim()) return traders;

  const lowerQuery = query.toLowerCase();
  return traders.filter(trader =>
    trader.name.toLowerCase().includes(lowerQuery) ||
    trader.description?.toLowerCase().includes(lowerQuery) ||
    trader.category?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Segments traders into built-in, personal, and favorites categories.
 *
 * @param traders - Array of all traders
 * @param favorites - Set of trader IDs marked as favorites
 * @returns Segmented data organized by tab type
 */
export function segmentTraders(
  traders: Trader[],
  favorites: Set<string>
): SegmentedData {
  const builtin = traders.filter(t => t.isBuiltIn);
  const personal = traders.filter(t => !t.isBuiltIn);
  const favoriteList = traders.filter(t => favorites.has(t.id));

  return {
    builtin: groupByCategory(builtin),
    personal,
    favorites: favoriteList
  };
}

/**
 * Groups traders by their category.
 * Traders without a category are grouped under "Other".
 *
 * @param traders - Array of traders to group
 * @returns Traders organized by category
 */
export function groupByCategory(traders: Trader[]): GroupedSignals {
  return traders.reduce((groups, trader) => {
    const category = trader.category || 'Other';
    if (!groups[category]) groups[category] = [];
    groups[category].push(trader);
    return groups;
  }, {} as GroupedSignals);
}
