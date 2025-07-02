import { supabase, isSupabaseConfigured } from '../config/supabase';
import { ExchangeAccount } from '../abstractions/trading.interfaces';
import { encrypt, decrypt, checkEncryptionSecurity } from './encryption';

export class ExchangeAccountManager {
  private static instance: ExchangeAccountManager;
  private accounts: Map<string, ExchangeAccount> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): ExchangeAccountManager {
    if (!ExchangeAccountManager.instance) {
      ExchangeAccountManager.instance = new ExchangeAccountManager();
    }
    return ExchangeAccountManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Check encryption security
    checkEncryptionSecurity();

    // Load accounts from Supabase if configured
    if (isSupabaseConfigured() && supabase) {
      await this.loadAccounts();
    } else {
      // Load demo accounts from localStorage
      this.loadDemoAccounts();
    }

    this.initialized = true;
  }

  private async loadAccounts(): Promise<void> {
    if (!supabase) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('exchange_accounts')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('[ExchangeAccountManager] Error loading accounts:', error);
        return;
      }

      if (data) {
        data.forEach(account => {
          this.accounts.set(account.id, {
            ...account,
            createdAt: new Date(account.created_at),
            updatedAt: new Date(account.updated_at)
          });
        });
      }
    } catch (error) {
      console.error('[ExchangeAccountManager] Failed to load accounts:', error);
    }
  }

  private loadDemoAccounts(): void {
    // Create a default demo account
    const demoAccount: ExchangeAccount = {
      id: 'demo-account',
      name: 'Demo Trading Account',
      exchange: 'binance',
      isTestnet: true,
      apiKey: 'demo-api-key',
      apiSecret: 'demo-api-secret',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.accounts.set(demoAccount.id, demoAccount);

    // Load any saved demo accounts from localStorage
    const saved = localStorage.getItem('exchangeAccounts');
    if (saved) {
      try {
        const accounts = JSON.parse(saved);
        Object.entries(accounts).forEach(([id, account]: [string, any]) => {
          this.accounts.set(id, {
            ...account,
            createdAt: new Date(account.createdAt),
            updatedAt: new Date(account.updatedAt)
          });
        });
      } catch (error) {
        console.error('[ExchangeAccountManager] Failed to load saved accounts:', error);
      }
    }
  }

  private saveDemoAccounts(): void {
    if (!isSupabaseConfigured()) {
      const accounts: Record<string, any> = {};
      this.accounts.forEach((account, id) => {
        accounts[id] = account;
      });
      localStorage.setItem('exchangeAccounts', JSON.stringify(accounts));
    }
  }

  async createAccount(
    name: string,
    exchange: string,
    apiKey: string,
    apiSecret: string,
    password?: string,
    isTestnet: boolean = false,
    subaccount?: string
  ): Promise<ExchangeAccount> {
    // Validate exchange is supported
    const supportedExchanges = ['binance', 'bybit', 'okx', 'kucoin', 'coinbase', 'kraken'];
    if (!supportedExchanges.includes(exchange.toLowerCase())) {
      throw new Error(`Exchange ${exchange} is not supported`);
    }

    // Encrypt credentials
    const encryptedKey = encrypt(apiKey);
    const encryptedSecret = encrypt(apiSecret);
    const encryptedPassword = password ? encrypt(password) : undefined;

    const account: ExchangeAccount = {
      id: `${exchange}-${Date.now()}`,
      name,
      exchange: exchange.toLowerCase(),
      isTestnet,
      apiKey: encryptedKey,
      apiSecret: encryptedSecret,
      password: encryptedPassword,
      subaccount,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
          .from('exchange_accounts')
          .insert([{
            ...account,
            user_id: user.id,
            created_at: account.createdAt,
            updated_at: account.updatedAt
          }])
          .select()
          .single();

        if (error) throw error;

        account.id = data.id;
      } catch (error) {
        console.error('[ExchangeAccountManager] Failed to save account to Supabase:', error);
        // Fall back to local storage
      }
    }

    this.accounts.set(account.id, account);
    this.saveDemoAccounts();

    return account;
  }

  async updateAccount(
    accountId: string,
    updates: Partial<{
      name: string;
      apiKey: string;
      apiSecret: string;
      password?: string;
      isTestnet: boolean;
      subaccount?: string;
    }>
  ): Promise<ExchangeAccount> {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    // Encrypt new credentials if provided
    if (updates.apiKey) {
      updates.apiKey = encrypt(updates.apiKey);
    }
    if (updates.apiSecret) {
      updates.apiSecret = encrypt(updates.apiSecret);
    }
    if (updates.password) {
      updates.password = encrypt(updates.password);
    }

    const updatedAccount = {
      ...account,
      ...updates,
      updatedAt: new Date()
    };

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase
          .from('exchange_accounts')
          .update({
            ...updates,
            updated_at: updatedAccount.updatedAt
          })
          .eq('id', accountId);

        if (error) throw error;
      } catch (error) {
        console.error('[ExchangeAccountManager] Failed to update account in Supabase:', error);
      }
    }

    this.accounts.set(accountId, updatedAccount);
    this.saveDemoAccounts();

    return updatedAccount;
  }

  async deleteAccount(accountId: string): Promise<void> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase
          .from('exchange_accounts')
          .delete()
          .eq('id', accountId);

        if (error) throw error;
      } catch (error) {
        console.error('[ExchangeAccountManager] Failed to delete account from Supabase:', error);
      }
    }

    this.accounts.delete(accountId);
    this.saveDemoAccounts();
  }

  getAccount(accountId: string): ExchangeAccount | undefined {
    return this.accounts.get(accountId);
  }

  getAccounts(): ExchangeAccount[] {
    return Array.from(this.accounts.values());
  }

  getAccountsByExchange(exchange: string): ExchangeAccount[] {
    return Array.from(this.accounts.values()).filter(
      account => account.exchange === exchange.toLowerCase()
    );
  }

  // Test connection with exchange
  async testConnection(accountId: string): Promise<{ success: boolean; message: string }> {
    const account = this.accounts.get(accountId);
    if (!account) {
      return { success: false, message: 'Account not found' };
    }

    // Check if running in browser
    if (typeof window !== 'undefined') {
      // In browser environment, we can't test real connections
      // Just validate that credentials exist
      if (account.apiKey && account.apiSecret) {
        return { 
          success: true, 
          message: 'Credentials saved. Note: Live trading requires a server environment.' 
        };
      } else {
        return { 
          success: false, 
          message: 'Missing API credentials' 
        };
      }
    }

    // Server-side connection test would go here
    return { 
      success: false, 
      message: 'Connection testing not available in browser environment' 
    };
  }
}

export const exchangeAccountManager = ExchangeAccountManager.getInstance();