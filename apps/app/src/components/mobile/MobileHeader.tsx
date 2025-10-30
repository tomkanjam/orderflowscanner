import React, { useState, useRef, useEffect } from 'react';
import { Menu, Wifi, WifiOff, User, LogOut, LogIn, Settings } from 'lucide-react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { getTierDisplayName, getTierColor } from '../../utils/tierAccess';

interface MobileHeaderProps {
  onMenuClick: () => void;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  onMenuClick,
  connectionStatus
}) => {
  const { user, signOut } = useAuthContext();
  const { currentTier, profile } = useSubscription();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Get connection icon and color
  const connectionConfig = {
    connected: {
      icon: Wifi,
      color: 'text-green-500'
    },
    reconnecting: {
      icon: Wifi,
      color: 'text-yellow-500'
    },
    disconnected: {
      icon: WifiOff,
      color: 'text-red-500'
    }
  };

  const config = connectionConfig[connectionStatus];
  const ConnectionIcon = config.icon;

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-14 bg-background border-b border-border flex items-center justify-between px-4 flex-shrink-0">
      {/* Left: Hamburger Menu Button */}
      <button
        onClick={onMenuClick}
        className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-accent transition-colors active:scale-95"
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Center: Logo and Connection Status */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary-foreground">
            <path d="M13 12L20 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M4 5L8 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M8 15L4 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="font-semibold text-base">vyx</span>
        <ConnectionIcon className={`w-4 h-4 ${config.color}`} />
      </div>

      {/* Right: User Menu */}
      <div className="relative" ref={userMenuRef}>
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-accent transition-colors active:scale-95"
          aria-label="User menu"
        >
          <User className="w-5 h-5" />
        </button>

        {/* User Menu Dropdown */}
        {showUserMenu && (
          <div className="absolute top-full right-0 mt-2 w-56 bg-background border border-border rounded-lg shadow-lg overflow-hidden z-50">
            {user ? (
              <>
                {/* User Info */}
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-medium truncate">{user.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className={getTierColor(currentTier)}>
                      {getTierDisplayName(currentTier)}
                    </span>
                    {profile?.is_admin && (
                      <span className="ml-2 text-amber-500">(Admin)</span>
                    )}
                  </p>
                </div>

                {/* Menu Items */}
                <div className="py-1">
                  <button
                    className="w-full px-4 py-2 text-sm text-left hover:bg-accent flex items-center gap-2"
                    onClick={() => {
                      /* TODO: Implement settings */
                      setShowUserMenu(false);
                    }}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </button>
                  <button
                    className="w-full px-4 py-2 text-sm text-left hover:bg-accent flex items-center gap-2 text-red-500"
                    onClick={() => {
                      signOut();
                      setShowUserMenu(false);
                    }}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="py-1">
                <button
                  className="w-full px-4 py-2 text-sm text-left hover:bg-accent flex items-center gap-2"
                  onClick={() => {
                    /* TODO: Implement sign in */
                    setShowUserMenu(false);
                  }}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
