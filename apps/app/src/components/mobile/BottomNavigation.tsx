import React from 'react';
import { BarChart3, List, PlusCircle, Activity } from 'lucide-react';

export type MobileTab = 'chart' | 'signals' | 'create' | 'activity';

interface BottomNavigationProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  signalCount?: number;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  onTabChange,
  signalCount = 0
}) => {
  const tabs = [
    {
      id: 'chart' as MobileTab,
      label: 'Chart',
      icon: BarChart3,
      color: 'text-cyan-500'
    },
    {
      id: 'signals' as MobileTab,
      label: 'Signals',
      icon: List,
      color: 'text-lime-500',
      badge: signalCount > 0 ? signalCount : undefined
    },
    {
      id: 'create' as MobileTab,
      label: 'Create',
      icon: PlusCircle,
      color: 'text-purple-500'
    },
    {
      id: 'activity' as MobileTab,
      label: 'Activity',
      icon: Activity,
      color: 'text-amber-500'
    }
  ];

  return (
    <nav className="h-16 bg-background border-t border-border flex items-center justify-around px-2 flex-shrink-0">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-lg
              transition-all duration-200 min-w-[64px] relative
              ${isActive
                ? 'bg-accent scale-105'
                : 'hover:bg-accent/50 active:scale-95'
              }
            `}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <div className="relative">
              <Icon
                className={`w-6 h-6 ${isActive ? tab.color : 'text-muted-foreground'}`}
                strokeWidth={isActive ? 2.5 : 2}
              />

              {/* Badge for signal count */}
              {tab.badge && (
                <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center px-1">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </div>
              )}
            </div>

            <span
              className={`text-xs font-medium ${
                isActive ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
