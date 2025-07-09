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
    <div className="bg-[#0d1421] border border-[#1a2332] rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-[#8efbba]">Trading Strategies</h2>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="px-3 py-1 bg-[#8efbba] text-[#0d1421] rounded hover:bg-[#7ce3a8] transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Strategy
          </button>
        )}
      </div>

      {/* Add new strategy form */}
      {isAdding && (
        <div className="mb-4 p-3 bg-[#1a2332] rounded-lg">
          <input
            type="text"
            placeholder="Strategy Name"
            value={newStrategy.name}
            onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
            className="w-full px-3 py-2 bg-[#0d1421] border border-[#2a3441] rounded text-[#e2e8f0] mb-2"
          />
          <textarea
            placeholder="Strategy Description (e.g., 'Buy when RSI is oversold and price bounces off support')"
            value={newStrategy.description}
            onChange={(e) => setNewStrategy({ ...newStrategy, description: e.target.value })}
            className="w-full px-3 py-2 bg-[#0d1421] border border-[#2a3441] rounded text-[#e2e8f0] mb-2 h-20 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="px-3 py-1 bg-[#8efbba] text-[#0d1421] rounded hover:bg-[#7ce3a8] transition-colors flex items-center gap-1"
            >
              <Check className="h-4 w-4" />
              Save
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewStrategy({ name: '', description: '' });
              }}
              className="px-3 py-1 bg-[#2a3441] text-[#e2e8f0] rounded hover:bg-[#3a4451] transition-colors flex items-center gap-1"
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
          <p className="text-[#64748b] text-center py-4">No strategies yet. Create your first strategy!</p>
        ) : (
          strategies.map((strategy) => (
            <div
              key={strategy.id}
              className={`p-3 rounded-lg border transition-all ${
                activeStrategy?.id === strategy.id
                  ? 'bg-[#1a2332] border-[#8efbba]'
                  : 'bg-[#0d1421] border-[#1a2332] hover:border-[#2a3441]'
              }`}
            >
              {editingId === strategy.id ? (
                // Edit mode
                <div>
                  <input
                    type="text"
                    value={editStrategy.name}
                    onChange={(e) => setEditStrategy({ ...editStrategy, name: e.target.value })}
                    className="w-full px-2 py-1 bg-[#0d1421] border border-[#2a3441] rounded text-[#e2e8f0] mb-2"
                  />
                  <textarea
                    value={editStrategy.description}
                    onChange={(e) => setEditStrategy({ ...editStrategy, description: e.target.value })}
                    className="w-full px-2 py-1 bg-[#0d1421] border border-[#2a3441] rounded text-[#e2e8f0] mb-2 h-16 resize-none text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(strategy.id)}
                      className="px-2 py-1 bg-[#8efbba] text-[#0d1421] rounded text-sm hover:bg-[#7ce3a8] transition-colors"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 bg-[#2a3441] text-[#e2e8f0] rounded text-sm hover:bg-[#3a4451] transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-medium text-[#e2e8f0]">{strategy.name}</h3>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(strategy)}
                        className="p-1 text-[#64748b] hover:text-[#8efbba] transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteStrategy(strategy.id)}
                        className="p-1 text-[#64748b] hover:text-[#ef4444] transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-[#64748b] mb-2">{strategy.description}</p>
                  {activeStrategy?.id !== strategy.id && (
                    <button
                      onClick={() => setActiveStrategy(strategy)}
                      className="text-sm text-[#8efbba] hover:underline"
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
        <div className="mt-4 pt-4 border-t border-[#1a2332]">
          <p className="text-sm text-[#64748b]">
            Active: <span className="text-[#8efbba] font-medium">{activeStrategy.name}</span>
          </p>
        </div>
      )}
    </div>
  );
}