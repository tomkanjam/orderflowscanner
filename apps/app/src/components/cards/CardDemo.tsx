import React from 'react';
import { ActivityIndicator } from './ActivityIndicator';
import { CardExpandable } from './CardExpandable';
import { TriggerHistory, TriggerRecord } from './TriggerHistory';
import { useCardExpansion } from '../../hooks/useCardExpansion';
import { FEATURES } from '../../config/features';
import '../../components/SignalCard.css';
import './CardExpandable.css';

/**
 * Demo component showing the new card standardization features
 * This demonstrates how the new components work together
 */
export const CardDemo: React.FC = () => {
  // Only render if feature flag is enabled
  if (!FEATURES.ENABLE_CARD_EXPANSION) {
    return null;
  }

  const { toggleExpand, isExpanded } = useCardExpansion();

  // Demo data for trigger history
  const demoTriggers: TriggerRecord[] = [
    { symbol: 'BTCUSDT', timestamp: Date.now() - 2 * 60 * 1000, price: 67234.50, changePercent: 2.4 },
    { symbol: 'ETHUSDT', timestamp: Date.now() - 5 * 60 * 1000, price: 3421.25, changePercent: 1.8 },
    { symbol: 'SOLUSDT', timestamp: Date.now() - 8 * 60 * 1000, price: 142.50, changePercent: 3.2 },
    { symbol: 'BNBUSDT', timestamp: Date.now() - 12 * 60 * 1000, price: 589.30, changePercent: -1.1 },
    { symbol: 'ADAUSDT', timestamp: Date.now() - 18 * 60 * 1000, price: 0.6234, changePercent: 2.7 },
  ];

  const cardId = 'demo-card-1';
  const expanded = isExpanded(cardId);

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-200 mb-4">Card Standardization Demo</h2>
      
      {/* Demo Card */}
      <div
        className={`
          signal-card
          ${expanded ? 'signal-card--expanded' : ''}
        `}
        data-expanded={expanded}
        data-variant="signal"
        data-activity="recent"
      >
        {/* Card Header */}
        <div className="signal-card__header">
          <div className="flex items-center gap-2">
            <ActivityIndicator 
              triggered={false}
              isActive={true}
              size="medium"
            />
            <h3 className="signal-card__title">Momentum Breakout Signal</h3>
          </div>
          
          <div className="signal-card__actions">
            <button className="text-gray-400 hover:text-yellow-400">
              ⭐
            </button>
            <button className="text-gray-400 hover:text-gray-200">
              ⋮
            </button>
          </div>
        </div>

        {/* Card Metrics */}
        <div className="signal-card__metrics">
          <div className="signal-card__metric">
            <span className="signal-card__metric-label">Triggered:</span>
            <span className="signal-card__metric-value">12 today</span>
          </div>
          <div className="signal-card__metric">
            <span className="signal-card__metric-label">Total:</span>
            <span className="signal-card__metric-value">47</span>
          </div>
          <div className="signal-card__metric">
            <span className="signal-card__metric-value">15m</span>
          </div>
        </div>

        {/* Last Activity */}
        <div className="signal-card__activity">
          <span className="signal-card__symbol">BTCUSDT</span>
          <span className="signal-card__time">2m ago</span>
          <span className="signal-card__change signal-card__change--positive">
            +2.4%
          </span>
        </div>

        {/* Expandable Content */}
        <CardExpandable
          expanded={expanded}
          onToggle={() => toggleExpand(cardId)}
          variant="signal"
          showIcon={true}
        >
          <TriggerHistory 
            triggers={demoTriggers}
            onViewAll={() => console.log('View all clicked')}
          />
          
          {/* Action Buttons */}
          <div className="flex gap-2 mt-4 pt-4 border-t border-gray-800">
            <button className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm">
              📊 Chart
            </button>
            <button className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm">
              ⚙️ Edit
            </button>
            <button className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm">
              📋 Clone
            </button>
            <button className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm text-red-400">
              🗑️ Delete
            </button>
          </div>
        </CardExpandable>
      </div>

      {/* Feature Flag Status */}
      <div className="mt-8 p-4 bg-gray-800 rounded">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Feature Flags</h3>
        <div className="space-y-1 text-xs">
          <div>
            Card Expansion: 
            <span className={`ml-2 ${FEATURES.ENABLE_CARD_EXPANSION ? 'text-green-400' : 'text-red-400'}`}>
              {FEATURES.ENABLE_CARD_EXPANSION ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div>
            Virtual Scrolling: 
            <span className={`ml-2 ${FEATURES.ENABLE_VIRTUAL_SCROLLING ? 'text-green-400' : 'text-red-400'}`}>
              {FEATURES.ENABLE_VIRTUAL_SCROLLING ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardDemo;