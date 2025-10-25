import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from '../../App';
import { AdminLayout } from '../components/admin/AdminLayout';
import { PromptManager } from '../components/admin/PromptManager';
import { UserManager } from '../components/admin/UserManager';
import { useAuthContext } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { StyleGuide } from '../pages/StyleGuide';
import { StyleGuideNeonTerminal } from '../pages/StyleGuideNeonTerminal';
import { StyleGuideLinearRobinhood } from '../pages/StyleGuideLinearRobinhood';
import { StyleGuideSupabase } from '../pages/StyleGuideSupabase';

// Placeholder components for other admin pages
const PromptEvaluation: React.FC = () => (
  <div className="p-8">
    <h2 className="text-2xl font-bold text-gray-100 mb-4">Prompt Evaluation</h2>
    <p className="text-gray-400">Coming soon: View and analyze Gemini responses for all analysis types.</p>
  </div>
);

const TraderStats: React.FC = () => (
  <div className="p-8">
    <h2 className="text-2xl font-bold text-gray-100 mb-4">Trader Statistics</h2>
    <p className="text-gray-400">Coming soon: View comprehensive statistics for all traders.</p>
  </div>
);

// Protected route wrapper
const ProtectedAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuthContext();
  const { profile, loading: profileLoading } = useSubscription();
  
  console.log('[ProtectedAdminRoute] Auth check:', {
    userId: user?.id,
    email: user?.email,
    authLoading: loading,
    profileLoading,
    profile: profile ? {
      id: profile.id,
      email: profile.email,
      is_admin: profile.is_admin
    } : null
  });
  
  // Show loading if auth is loading, profile is loading, or if user exists but profile hasn't loaded yet
  if (loading || profileLoading || (user && !profile)) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }
  
  const isAuthorized = profile?.is_admin === true;
  
  console.log('[ProtectedAdminRoute] Authorization result:', isAuthorized);
  
  if (!isAuthorized) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

export const AppRouter: React.FC = () => {
  console.log('[AppRouter] Router initialized');

  return (
    <BrowserRouter basename="/app">
      <Routes>
        {/* Main app route */}
        <Route path="/" element={<App />} />
        
        {/* Style guide routes */}
        <Route path="/style-guide" element={<StyleGuide />} />
        <Route path="/style-guide-neon" element={<StyleGuideNeonTerminal />} />
        <Route path="/style-guide-linear" element={<StyleGuideLinearRobinhood />} />
        <Route path="/style-guide-supabase" element={<StyleGuideSupabase />} />
        
        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedAdminRoute>
              <AdminLayout />
            </ProtectedAdminRoute>
          }
        >
          <Route index element={<Navigate to="/admin/users" replace />} />
          <Route path="users" element={<UserManager />} />
          <Route path="prompts" element={<PromptManager />} />
          <Route path="evaluation" element={<PromptEvaluation />} />
          <Route path="trader-stats" element={<TraderStats />} />
        </Route>
        
        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};