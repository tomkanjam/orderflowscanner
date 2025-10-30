
import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/styles/main.css';
import './src/styles/mobile.css';
import { AuthProvider } from './src/contexts/AuthContext';
import { StrategyProvider } from './src/contexts/StrategyContext';
import { SubscriptionProvider } from './src/contexts/SubscriptionContext';
import { AppRouter } from './src/routes/AppRouter';

// Apply dark mode by default
document.documentElement.classList.add('dark');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <SubscriptionProvider>
        <StrategyProvider>
          <AppRouter />
        </StrategyProvider>
      </SubscriptionProvider>
    </AuthProvider>
  </React.StrictMode>
);
