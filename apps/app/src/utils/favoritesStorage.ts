/**
 * localStorage key for persisting favorite signals
 */
const FAVORITES_KEY = 'vyx_signal_favorites';

/**
 * Loads favorite trader IDs from localStorage.
 * Returns an empty Set if localStorage is unavailable or data is corrupted.
 *
 * @returns Set of trader IDs marked as favorites
 */
export function loadFavorites(): Set<string> {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    if (!stored) return new Set();

    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    console.warn('[Favorites] Failed to load favorites:', error);
    return new Set();
  }
}

/**
 * Saves favorite trader IDs to localStorage.
 * Silently fails if localStorage is unavailable.
 *
 * @param favorites - Set of trader IDs to save
 */
export function saveFavorites(favorites: Set<string>): void {
  try {
    const array = Array.from(favorites);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(array));
  } catch (error) {
    console.warn('[Favorites] Failed to save favorites:', error);
  }
}

/**
 * Toggles a trader's favorite status.
 * Adds the trader if not favorited, removes if already favorited.
 * Automatically persists changes to localStorage.
 *
 * @param favorites - Current set of favorites
 * @param traderId - ID of trader to toggle
 * @returns New Set with updated favorites
 */
export function toggleFavorite(
  favorites: Set<string>,
  traderId: string
): Set<string> {
  const newFavorites = new Set(favorites);
  if (newFavorites.has(traderId)) {
    newFavorites.delete(traderId);
  } else {
    newFavorites.add(traderId);
  }
  saveFavorites(newFavorites);
  return newFavorites;
}
