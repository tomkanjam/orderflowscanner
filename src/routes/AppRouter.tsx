import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from '../../App';
import { AdminLayout } from '../components/admin/AdminLayout';
import { PromptManager } from '../components/admin/PromptManager';
import { useAuthContext } from '../contexts/AuthContext';

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
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }
  
  const isAuthorized = user?.email === 'tom@tomk.ca';
  
  if (!isAuthorized) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Main app route */}
        <Route path="/" element={<App />} />
        
        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedAdminRoute>
              <AdminLayout />
            </ProtectedAdminRoute>
          }
        >
          <Route index element={<Navigate to="/admin/prompts" replace />} />
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