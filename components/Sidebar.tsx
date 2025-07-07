
import React, { useState, useRef, useEffect } from 'react';
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

interface SidebarProps {
  onSelectedTraderChange?: (traderId: string | null) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  onSelectedTraderChange,
}) => {
  const { user, signOut } = useAuthContext();
  const { currentTier } = useSubscription();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTrader, setEditingTrader] = useState<Trader | null>(null);
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  // Check if user is admin
  const isAdmin = user?.email === 'tom@tomk.ca';

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
    <aside className="w-full md:w-1/3 xl:w-1/4 bg-[var(--tm-bg-secondary)] p-4 md:p-6 flex flex-col border-r border-[var(--tm-border)] h-screen overflow-y-auto relative">
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--tm-accent)] to-[var(--tm-accent-dark)]"></div>
      <h2 className="text-2xl font-bold mb-4 tm-heading-lg">
        <span className="text-[var(--tm-accent)]">Trading</span> <span className="text-[var(--tm-text-primary)]">Dashboard</span>
      </h2>
      
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
          
          {/* Portfolio Metrics */}
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
          
          {/* Admin Link - Only visible to authorized user */}
          {isAdmin && (
            <div className="mt-6 pt-6 border-t border-[var(--tm-border)]">
              <a
                href="/admin"
                className="flex items-center gap-2 px-4 py-2 bg-[var(--tm-bg-primary)] hover:bg-[var(--tm-accent)]/10 text-[var(--tm-text-secondary)] hover:text-[var(--tm-accent)] rounded-lg transition-all duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="font-medium">Admin Dashboard</span>
              </a>
            </div>
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
                    <a
                      href="/account"
                      className="flex items-center gap-3 px-4 py-3 text-[var(--tm-text-secondary)] hover:text-[var(--tm-accent)] hover:bg-[var(--tm-bg-hover)] transition-all duration-200"
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
    </aside>
  );
};

export default Sidebar;
