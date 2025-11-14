import React from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { Users, FileText, Search, BarChart3, ArrowLeft, Server } from 'lucide-react';

export const AdminLayout: React.FC = () => {
  const { user } = useAuthContext();
  const { profile } = useSubscription();

  // Check if user is authorized admin
  const isAuthorized = profile?.is_admin === true;

  if (!isAuthorized) {
    return <Navigate to="/" replace />;
  }

  const navItems = [
    { path: '/admin/users', label: 'User Management', icon: Users },
    { path: '/admin/fly-apps', label: 'Fly Apps', icon: Server },
    { path: '/admin/prompts', label: 'Prompt Manager', icon: FileText },
    { path: '/admin/evaluation', label: 'Prompt Evaluation', icon: Search },
    { path: '/admin/trader-stats', label: 'Trader Stats', icon: BarChart3 },
  ];

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Admin Navigation Sidebar */}
      <nav className="w-64 bg-gray-800 border-r border-gray-700">
        <div className="p-4">
          <div className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            ))}
          </div>

          <div className="absolute bottom-4 left-4 right-4">
            <div className="bg-gray-700 rounded-lg p-3">
              <p className="text-sm text-gray-400">Logged in as:</p>
              <p className="text-sm font-medium text-gray-200">{user?.email}</p>
            </div>
            
            <NavLink
              to="/"
              className="mt-3 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to App</span>
            </NavLink>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};