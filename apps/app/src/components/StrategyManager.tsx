import React, { useState } from 'react';
import { useStrategy } from '../contexts/StrategyContext';
import { Save, Trash2, Edit2, Plus, Check, X } from 'lucide-react';

export function StrategyManager() {
  const { activeStrategy, strategies, setActiveStrategy, addStrategy, updateStrategy, deleteStrategy } = useStrategy();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newStrategy, setNewStrategy] = useState({ name: '', description: '' });
  const [editStrategy, setEditStrategy] = useState({ name: '', description: '' });

  const handleAdd = () => {
    if (newStrategy.name && newStrategy.description) {
      addStrategy({
        name: newStrategy.name,
        description: newStrategy.description,
        filterCode: '', // Will be generated when user creates a filter
        isActive: true,
      });
      setNewStrategy({ name: '', description: '' });
      setIsAdding(false);
    }
  };

  const handleEdit = (id: string) => {
    if (editStrategy.name && editStrategy.description) {
      updateStrategy(id, {
        name: editStrategy.name,
        description: editStrategy.description,
      });
      setEditingId(null);
    }
  };

  const startEdit = (strategy: any) => {
    setEditingId(strategy.id);
    setEditStrategy({ name: strategy.name, description: strategy.description });
  };

  return (
    <div className="bg-background border border-border rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-primary">Trading Strategies</h2>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="px-3 py-1 bg-primary text-background rounded hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Strategy
          </button>
        )}
      </div>

      {/* Add new strategy form */}
      {isAdding && (
        <div className="mb-4 p-3 bg-muted rounded-lg">
          <input
            type="text"
            placeholder="Strategy Name"
            value={newStrategy.name}
            onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
            className="w-full px-3 py-2 bg-background border border-border rounded text-foreground mb-2"
          />
          <textarea
            placeholder="Strategy Description (e.g., 'Buy when RSI is oversold and price bounces off support')"
            value={newStrategy.description}
            onChange={(e) => setNewStrategy({ ...newStrategy, description: e.target.value })}
            className="w-full px-3 py-2 bg-background border border-border rounded text-foreground mb-2 h-20 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="px-3 py-1 bg-primary text-background rounded hover:bg-primary/90 transition-colors flex items-center gap-1"
            >
              <Check className="h-4 w-4" />
              Save
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewStrategy({ name: '', description: '' });
              }}
              className="px-3 py-1 bg-muted text-foreground rounded hover:bg-muted/80 transition-colors flex items-center gap-1"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Strategy list */}
      <div className="space-y-2">
        {strategies.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No strategies yet. Create your first strategy!</p>
        ) : (
          strategies.map((strategy) => (
            <div
              key={strategy.id}
              className={`p-3 rounded-lg border transition-all ${
                activeStrategy?.id === strategy.id
                  ? 'bg-muted border-primary'
                  : 'bg-background border-border hover:border-border'
              }`}
            >
              {editingId === strategy.id ? (
                // Edit mode
                <div>
                  <input
                    type="text"
                    value={editStrategy.name}
                    onChange={(e) => setEditStrategy({ ...editStrategy, name: e.target.value })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-foreground mb-2"
                  />
                  <textarea
                    value={editStrategy.description}
                    onChange={(e) => setEditStrategy({ ...editStrategy, description: e.target.value })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-foreground mb-2 h-16 resize-none text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(strategy.id)}
                      className="px-2 py-1 bg-primary text-background rounded text-sm hover:bg-primary/90 transition-colors"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 bg-muted text-foreground rounded text-sm hover:bg-muted/80 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-medium text-foreground">{strategy.name}</h3>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(strategy)}
                        className="p-1 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteStrategy(strategy.id)}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{strategy.description}</p>
                  {activeStrategy?.id !== strategy.id && (
                    <button
                      onClick={() => setActiveStrategy(strategy)}
                      className="text-sm text-primary hover:underline"
                    >
                      Activate
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Active strategy indicator */}
      {activeStrategy && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Active: <span className="text-primary font-medium">{activeStrategy.name}</span>
          </p>
        </div>
      )}
    </div>
  );
}