import React, { useState, useEffect } from 'react';
import { Play, Pause, Shield, Zap, AlertCircle, CheckCircle, X } from 'lucide-react';
import { tradingManager } from '../services/tradingManager';
import { exchangeAccountManager } from '../services/exchangeAccountManager';
import { ExchangeAccount } from '../abstractions/trading.interfaces';

interface TradingModeSelectorProps {
  onModeChange?: (mode: 'demo' | 'live') => void;
}

export function TradingModeSelector({ onModeChange }: TradingModeSelectorProps) {
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [autoExecute, setAutoExecute] = useState(false);
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // New account form
  const [newAccount, setNewAccount] = useState({
    name: '',
    exchange: 'binance',
    apiKey: '',
    apiSecret: '',
    password: '',
    isTestnet: true
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      // Load accounts
      await exchangeAccountManager.initialize();
      const allAccounts = exchangeAccountManager.getAccounts();
      setAccounts(allAccounts);

      // Load trading config
      const config = tradingManager.getConfig();
      setMode(config.mode);
      setAutoExecute(config.autoExecute);
      
      if (config.accountId) {
        setSelectedAccountId(config.accountId);
      } else if (allAccounts.length > 0) {
        setSelectedAccountId(allAccounts[0].id);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const handleModeChange = async (newMode: 'demo' | 'live') => {
    if (newMode === 'live' && !selectedAccountId) {
      setError('Please select or create an exchange account for live trading');
      setShowAccountDialog(true);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await tradingManager.switchMode(newMode, selectedAccountId);
      setMode(newMode);
      onModeChange?.(newMode);
    } catch (error: any) {
      setError(error.message || 'Failed to switch trading mode');
      console.error('Mode switch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoExecuteToggle = async () => {
    try {
      await tradingManager.setAutoExecute(!autoExecute);
      setAutoExecute(!autoExecute);
    } catch (error) {
      console.error('Failed to toggle auto-execute:', error);
    }
  };

  const handleCreateAccount = async () => {
    setError('');
    setIsLoading(true);

    try {
      const account = await exchangeAccountManager.createAccount(
        newAccount.name,
        newAccount.exchange,
        newAccount.apiKey,
        newAccount.apiSecret,
        newAccount.password || undefined,
        newAccount.isTestnet
      );

      // Test connection
      const testResult = await exchangeAccountManager.testConnection(account.id);
      if (!testResult.success) {
        throw new Error(`Connection test failed: ${testResult.message}`);
      }

      setAccounts([...accounts, account]);
      setSelectedAccountId(account.id);
      setShowAccountDialog(false);
      
      // Reset form
      setNewAccount({
        name: '',
        exchange: 'binance',
        apiKey: '',
        apiSecret: '',
        password: '',
        isTestnet: true
      });
    } catch (error: any) {
      setError(error.message || 'Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="nt-card p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--nt-text-primary)]">Trading Mode</h3>
        <div className="flex items-center gap-2">
          {mode === 'demo' ? (
            <Shield className="w-4 h-4 text-cyan-500" />
          ) : (
            <Zap className="w-4 h-4 text-orange-500" />
          )}
          <span className="text-xs text-[var(--nt-text-muted)]">
            {mode === 'demo' ? 'Demo Trading' : 'Live Trading'}
          </span>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => handleModeChange('demo')}
          disabled={isLoading}
          className={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
            mode === 'demo'
              ? 'bg-cyan-500 text-white'
              : 'bg-[var(--nt-bg-hover)] text-[var(--nt-text-secondary)] hover:bg-[var(--nt-bg-elevated)]'
          }`}
        >
          Demo
        </button>
        <button
          onClick={() => handleModeChange('live')}
          disabled={isLoading}
          className={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
            mode === 'live'
              ? 'bg-orange-500 text-white'
              : 'bg-[var(--nt-bg-hover)] text-[var(--nt-text-secondary)] hover:bg-[var(--nt-bg-elevated)]'
          }`}
        >
          Live
        </button>
      </div>

      {/* Auto Execute Toggle */}
      <div className="flex items-center justify-between mb-3 p-2 bg-[var(--nt-bg-hover)] rounded-md">
        <div className="flex items-center gap-2">
          {autoExecute ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          <span className="text-sm text-[var(--nt-text-secondary)]">Auto-Execute Signals</span>
        </div>
        <button
          onClick={handleAutoExecuteToggle}
          className={`w-12 h-6 rounded-full transition-colors ${
            autoExecute ? 'bg-green-500' : 'bg-[var(--nt-bg-elevated)]'
          }`}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full transition-transform ${
              autoExecute ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Live Mode Account Selection */}
      {mode === 'live' && (
        <div className="mb-3">
          <label className="text-xs text-[var(--nt-text-muted)] mb-1 block">Exchange Account</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full nt-input text-sm"
          >
            <option value="">Select Account</option>
            {accounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.exchange} - {account.isTestnet ? 'Testnet' : 'Mainnet'})
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowAccountDialog(true)}
            className="mt-2 text-xs text-[var(--nt-accent-lime)] hover:text-[var(--nt-accent-lime)]"
          >
            + Add Exchange Account
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500 rounded-md text-sm text-red-500">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Warning for Demo Mode */}
      {mode === 'demo' && (
        <div className="text-xs text-[var(--nt-text-muted)] mt-2">
          Trading with simulated $10,000 USDT balance
        </div>
      )}

      {/* Warning for Live Mode */}
      {mode === 'live' && (
        <div className="flex items-start gap-2 p-2 bg-orange-500/10 border border-orange-500/30 rounded-md text-xs text-orange-500 mt-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Live Trading Active</strong>
            <br />
            Real money at risk. Ensure you understand the risks.
          </div>
        </div>
      )}

      {/* Account Creation Dialog */}
      {showAccountDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--nt-bg-primary)] p-6 rounded-lg max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Exchange Account</h3>
              <button
                onClick={() => setShowAccountDialog(false)}
                className="text-[var(--nt-text-muted)] hover:text-[var(--nt-text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm text-[var(--nt-text-secondary)] mb-1 block">Account Name</label>
                <input
                  type="text"
                  value={newAccount.name}
                  onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                  placeholder="My Trading Account"
                  className="w-full nt-input"
                />
              </div>

              <div>
                <label className="text-sm text-[var(--nt-text-secondary)] mb-1 block">Exchange</label>
                <select
                  value={newAccount.exchange}
                  onChange={(e) => setNewAccount({ ...newAccount, exchange: e.target.value })}
                  className="w-full nt-input"
                >
                  <option value="binance">Binance</option>
                  <option value="bybit">Bybit</option>
                  <option value="okx">OKX</option>
                  <option value="kucoin">KuCoin</option>
                  <option value="coinbase">Coinbase</option>
                  <option value="kraken">Kraken</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-[var(--nt-text-secondary)] mb-1 block">API Key</label>
                <input
                  type="text"
                  value={newAccount.apiKey}
                  onChange={(e) => setNewAccount({ ...newAccount, apiKey: e.target.value })}
                  placeholder="Your API Key"
                  className="w-full nt-input font-mono text-sm"
                />
              </div>

              <div>
                <label className="text-sm text-[var(--nt-text-secondary)] mb-1 block">API Secret</label>
                <input
                  type="password"
                  value={newAccount.apiSecret}
                  onChange={(e) => setNewAccount({ ...newAccount, apiSecret: e.target.value })}
                  placeholder="Your API Secret"
                  className="w-full nt-input font-mono text-sm"
                />
              </div>

              {newAccount.exchange === 'kucoin' && (
                <div>
                  <label className="text-sm text-[var(--nt-text-secondary)] mb-1 block">API Password</label>
                  <input
                    type="password"
                    value={newAccount.password}
                    onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
                    placeholder="Your API Password (if required)"
                    className="w-full nt-input font-mono text-sm"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="testnet"
                  checked={newAccount.isTestnet}
                  onChange={(e) => setNewAccount({ ...newAccount, isTestnet: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="testnet" className="text-sm text-[var(--nt-text-secondary)]">
                  Use Testnet (Recommended for testing)
                </label>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500 rounded-md text-sm text-red-500">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setShowAccountDialog(false)}
                  disabled={isLoading}
                  className="flex-1 tm-btn"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAccount}
                  disabled={isLoading || !newAccount.name || !newAccount.apiKey || !newAccount.apiSecret}
                  className="flex-1 tm-btn tm-btn-primary"
                >
                  {isLoading ? 'Testing Connection...' : 'Create Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}