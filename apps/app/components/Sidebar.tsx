
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TraderList } from '../src/components/TraderList';
import { TraderForm } from '../src/components/TraderForm';
import { PortfolioMetrics } from '../src/components/PortfolioMetrics';
import { TradingModeSelector } from '../src/components/TradingModeSelector';
import { PositionsPanel } from '../src/components/PositionsPanel';
import { Trader } from '../src/abstractions/trader.interfaces';
import { useAuthContext } from '../src/contexts/AuthContext';
import { User, LogOut, Settings, ChevronDown, LogIn } from 'lucide-react';
import { useSubscription } from '../src/contexts/SubscriptionContext';
import { getTierDisplayName, getTierColor } from '../src/utils/tierAccess';
import { EmailAuthModal } from '../src/components/auth/EmailAuthModal';
import { StatusBar } from '../src/components/StatusBar';
import { webSocketManager } from '../src/utils/webSocketManager';
import { useWebSocketMetrics } from '../hooks/useWebSocketMetrics';

interface SidebarProps {
  onSelectedTraderChange?: (traderId: string | null) => void;
  tickerCount?: number;
  symbolCount?: number;
  signalCount?: number;
  onDataUpdateCallback?: (callback: () => void) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  onSelectedTraderChange,
  tickerCount = 0,
  symbolCount = 0,
  signalCount = 0,
  onDataUpdateCallback
}) => {
  const { user, signOut } = useAuthContext();
  const { currentTier, canAccessTier, profile } = useSubscription();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTrader, setEditingTrader] = useState<Trader | null>(null);
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  // WebSocket connection status
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  
  // WebSocket metrics
  const { metrics, trackUpdate } = useWebSocketMetrics();
  
  // Check if user is admin
  const isAdmin = profile?.is_admin === true;

  // Handle clicks outside of user menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Track WebSocket connection status
  useEffect(() => {
    const handleStatusChange = (status: 'connected' | 'disconnected' | 'reconnecting') => {
      setConnectionStatus(status);
    };
    
    webSocketManager.addStatusListener(handleStatusChange);
    
    return () => {
      webSocketManager.removeStatusListener(handleStatusChange);
    };
  }, []);
  
  // Register the update callback with parent component
  useEffect(() => {
    if (onDataUpdateCallback) {
      onDataUpdateCallback(trackUpdate);
    }
  }, [onDataUpdateCallback, trackUpdate]);

  const handleTraderCreated = (trader: Trader) => {
    setSelectedTraderId(trader.id);
    onSelectedTraderChange?.(trader.id);
    setShowCreateForm(false);
    setEditingTrader(null);
  };

  const handleSignIn = () => {
    setShowAuthModal(true);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
  };

  return (
    <aside className="w-full md:w-1/3 xl:w-1/4 bg-[var(--tm-bg-secondary)] flex flex-col border-r border-[var(--tm-border)] h-screen">
      {/* Status Bar Header */}
      <StatusBar
        connectionStatus={connectionStatus}
        tickerCount={tickerCount}
        symbolCount={symbolCount}
        signalCount={signalCount}
        lastUpdate={metrics.lastUpdate}
        updateFrequency={metrics.updateFrequency}
      />
      
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col">
      
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
          
          {/* Portfolio Metrics - Elite tier only (hidden for now) */}
          {canAccessTier('elite') && (
            <>
              <div className="mt-6">
                <PortfolioMetrics />
              </div>
              
              {/* Trading Mode Selector */}
              <div className="mt-4">
                <TradingModeSelector />
              </div>
              
              {/* Positions Panel */}
              <div className="mt-4">
                <PositionsPanel />
              </div>
            </>
          )}
          
          {/* User Menu */}
          <div className="mt-6 pt-6 border-t border-[var(--tm-border)]">
            {user ? (
              <div className="relative" ref={userMenuRef}>
                {/* User Button */}
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="w-full flex items-center gap-3 px-4 py-2 bg-[var(--tm-bg-primary)] hover:bg-[var(--tm-bg-hover)] rounded-lg transition-all duration-200"
                >
                  <User className="w-5 h-5 text-[var(--tm-text-secondary)]" />
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-[var(--tm-text-primary)]">
                      {user.email}
                    </div>
                    <div className="text-xs" style={{ color: getTierColor(currentTier) }}>
                      {getTierDisplayName(currentTier)} Tier
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-[var(--tm-text-secondary)] transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>
                
                {/* Dropdown Menu */}
                {showUserMenu && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 bg-[var(--tm-bg-primary)] border border-[var(--tm-border)] rounded-lg shadow-lg overflow-hidden">
                    {/* Admin Dashboard - Only visible to admin users */}
                    {isAdmin && (
                      <a
                        href="/admin"
                        className="flex items-center gap-3 px-4 py-3 text-[var(--tm-text-secondary)] hover:text-[var(--tm-accent)] hover:bg-[var(--tm-bg-hover)] transition-all duration-200"
                        onClick={() => setShowUserMenu(false)}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="font-medium">Admin Dashboard</span>
                      </a>
                    )}
                    
                    {/* Account Dashboard - All users */}
                    <a
                      href="/account"
                      className={`flex items-center gap-3 px-4 py-3 text-[var(--tm-text-secondary)] hover:text-[var(--tm-accent)] hover:bg-[var(--tm-bg-hover)] transition-all duration-200 ${isAdmin ? 'border-t border-[var(--tm-border)]' : ''}`}
                      onClick={() => setShowUserMenu(false)}
                    >
                      <Settings className="w-5 h-5" />
                      <span className="font-medium">Account Dashboard</span>
                    </a>
                    <button
                      onClick={() => {
                        signOut();
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-[var(--tm-text-secondary)] hover:text-[var(--tm-error)] hover:bg-[var(--tm-error)]/10 transition-all duration-200 border-t border-[var(--tm-border)]"
                    >
                      <LogOut className="w-5 h-5" />
                      <span className="font-medium">Logout</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                className="w-full flex items-center gap-3 px-4 py-2 bg-[var(--tm-accent)] hover:bg-[var(--tm-accent-dark)] text-[var(--tm-bg-primary)] rounded-lg transition-all duration-200 font-medium"
              >
                <LogIn className="w-5 h-5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </>
      )}
      
        {/* Email Auth Modal */}
        <EmailAuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onAuthSuccess={handleAuthSuccess}
        />
      </div>
    </aside>
  );
};

export default Sidebar;
