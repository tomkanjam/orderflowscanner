
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './src/contexts/AuthContext';
import { StrategyProvider } from './src/contexts/StrategyContext';
import { AppRouter } from './src/routes/AppRouter';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <StrategyProvider>
        <AppRouter />
      </StrategyProvider>
    </AuthProvider>
  </React.StrictMode>
);
