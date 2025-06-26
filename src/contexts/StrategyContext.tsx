import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Strategy } from '../abstractions/interfaces';

interface StrategyContextType {
  activeStrategy: Strategy | null;
  strategies: Strategy[];
  setActiveStrategy: (strategy: Strategy | null) => void;
  addStrategy: (strategy: Omit<Strategy, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => void;
  updateStrategy: (id: string, updates: Partial<Strategy>) => void;
  deleteStrategy: (id: string) => void;
}

const StrategyContext = createContext<StrategyContextType | undefined>(undefined);

export function StrategyProvider({ children }: { children: ReactNode }) {
  const [activeStrategy, setActiveStrategy] = useState<Strategy | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);

  const addStrategy = useCallback((strategyData: Omit<Strategy, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    // In a real app, this would save to Supabase
    const newStrategy: Strategy = {
      ...strategyData,
      id: `temp-${Date.now()}`,
      userId: 'demo-user', // Would come from auth
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setStrategies(prev => [...prev, newStrategy]);
    
    // Auto-select if it's the first strategy
    if (strategies.length === 0) {
      setActiveStrategy(newStrategy);
    }
  }, [strategies.length]);

  const updateStrategy = useCallback((id: string, updates: Partial<Strategy>) => {
    setStrategies(prev => prev.map(s => 
      s.id === id ? { ...s, ...updates, updatedAt: new Date() } : s
    ));
    
    // Update active strategy if it's the one being updated
    if (activeStrategy?.id === id) {
      setActiveStrategy(prev => prev ? { ...prev, ...updates, updatedAt: new Date() } : null);
    }
  }, [activeStrategy]);

  const deleteStrategy = useCallback((id: string) => {
    setStrategies(prev => prev.filter(s => s.id !== id));
    
    // Clear active strategy if it's the one being deleted
    if (activeStrategy?.id === id) {
      setActiveStrategy(null);
    }
  }, [activeStrategy]);

  const value: StrategyContextType = {
    activeStrategy,
    strategies,
    setActiveStrategy,
    addStrategy,
    updateStrategy,
    deleteStrategy,
  };

  return (
    <StrategyContext.Provider value={value}>
      {children}
    </StrategyContext.Provider>
  );
}

export function useStrategy() {
  const context = useContext(StrategyContext);
  if (context === undefined) {
    throw new Error('useStrategy must be used within a StrategyProvider');
  }
  return context;
}