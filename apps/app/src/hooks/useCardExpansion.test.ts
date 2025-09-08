import { renderHook, act } from '@testing-library/react';
import { useCardExpansion } from './useCardExpansion';

describe('useCardExpansion', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Clear all timers
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialize with no cards expanded', () => {
    const { result } = renderHook(() => useCardExpansion());
    
    expect(result.current.expandedIds.size).toBe(0);
    expect(result.current.animatingIds.size).toBe(0);
  });

  it('should toggle card expansion', () => {
    const { result } = renderHook(() => useCardExpansion());
    
    // Expand card
    act(() => {
      result.current.toggleExpand('card1');
    });
    
    expect(result.current.isExpanded('card1')).toBe(true);
    expect(result.current.isAnimating('card1')).toBe(true);
    
    // Animation should complete after duration
    act(() => {
      jest.advanceTimersByTime(200);
    });
    
    expect(result.current.isAnimating('card1')).toBe(false);
    
    // Collapse card
    act(() => {
      result.current.toggleExpand('card1');
    });
    
    expect(result.current.isExpanded('card1')).toBe(false);
  });

  it('should handle multiple cards', () => {
    const { result } = renderHook(() => useCardExpansion());
    
    act(() => {
      result.current.expandCard('card1');
      result.current.expandCard('card2');
      result.current.expandCard('card3');
    });
    
    expect(result.current.expandedIds.size).toBe(3);
    expect(result.current.isExpanded('card1')).toBe(true);
    expect(result.current.isExpanded('card2')).toBe(true);
    expect(result.current.isExpanded('card3')).toBe(true);
  });

  it('should respect maxExpanded limit', () => {
    const { result } = renderHook(() => 
      useCardExpansion(undefined, { maxExpanded: 2 })
    );
    
    act(() => {
      result.current.expandCard('card1');
      result.current.expandCard('card2');
      result.current.expandCard('card3'); // Should remove card1
    });
    
    expect(result.current.expandedIds.size).toBe(2);
    expect(result.current.isExpanded('card1')).toBe(false);
    expect(result.current.isExpanded('card2')).toBe(true);
    expect(result.current.isExpanded('card3')).toBe(true);
  });

  it('should expand and collapse all cards', () => {
    const cardIds = ['card1', 'card2', 'card3'];
    const { result } = renderHook(() => useCardExpansion(cardIds));
    
    // Expand all
    act(() => {
      result.current.expandAll();
    });
    
    expect(result.current.expandedIds.size).toBe(3);
    cardIds.forEach(id => {
      expect(result.current.isExpanded(id)).toBe(true);
    });
    
    // Collapse all
    act(() => {
      result.current.collapseAll();
    });
    
    expect(result.current.expandedIds.size).toBe(0);
    cardIds.forEach(id => {
      expect(result.current.isExpanded(id)).toBe(false);
    });
  });

  it('should track animation state correctly', () => {
    const { result } = renderHook(() => 
      useCardExpansion(undefined, { animationDuration: 300 })
    );
    
    act(() => {
      result.current.expandCard('card1');
    });
    
    expect(result.current.isAnimating('card1')).toBe(true);
    
    // Halfway through animation
    act(() => {
      jest.advanceTimersByTime(150);
    });
    
    expect(result.current.isAnimating('card1')).toBe(true);
    
    // Animation complete
    act(() => {
      jest.advanceTimersByTime(150);
    });
    
    expect(result.current.isAnimating('card1')).toBe(false);
  });

  it('should persist state to localStorage when enabled', () => {
    const { result } = renderHook(() => 
      useCardExpansion(undefined, { 
        persistState: true, 
        storageKey: 'test-expansion' 
      })
    );
    
    act(() => {
      result.current.expandCard('card1');
      result.current.expandCard('card2');
    });
    
    const stored = localStorage.getItem('test-expansion');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed).toEqual(['card1', 'card2']);
  });

  it('should restore state from localStorage', () => {
    // Set initial state in localStorage
    localStorage.setItem('test-expansion', JSON.stringify(['card1', 'card2']));
    
    const { result } = renderHook(() => 
      useCardExpansion(undefined, { 
        persistState: true, 
        storageKey: 'test-expansion' 
      })
    );
    
    expect(result.current.expandedIds.size).toBe(2);
    expect(result.current.isExpanded('card1')).toBe(true);
    expect(result.current.isExpanded('card2')).toBe(true);
  });

  it('should handle localStorage errors gracefully', () => {
    // Mock localStorage to throw error
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = jest.fn(() => {
      throw new Error('Storage error');
    });
    
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    const { result } = renderHook(() => 
      useCardExpansion(undefined, { persistState: true })
    );
    
    act(() => {
      result.current.expandCard('card1');
    });
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save expansion state'),
      expect.any(Error)
    );
    
    // Restore original
    Storage.prototype.setItem = originalSetItem;
    consoleSpy.mockRestore();
  });
});