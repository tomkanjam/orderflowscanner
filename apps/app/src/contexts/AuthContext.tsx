import React, { createContext, useState, useEffect, useCallback } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, getAppUrl } from '../config/supabase';
import { AuthContextType, AuthState } from '../types/auth.types';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  // Initialize auth state
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAuthState({ user: null, loading: false, error: null });
      return;
    }

    // Check active sessions and sets the user
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase!.auth.getSession();
        setAuthState({
          user: session?.user ?? null,
          loading: false,
          error: null,
        });
      } catch (error) {
        console.error('Error loading user session:', error);
        setAuthState({
          user: null,
          loading: false,
          error: 'Failed to load user session',
        });
      }
    };

    initializeAuth();

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: authListener } = supabase!.auth.onAuthStateChange((_event, session) => {
      setAuthState(prev => ({
        ...prev,
        user: session?.user ?? null,
        loading: false,
      }));
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!isSupabaseConfigured()) {
      setAuthState(prev => ({
        ...prev,
        error: 'Authentication is not configured',
      }));
      return;
    }

    setAuthState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const { error } = await supabase!.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${getAppUrl()}`,
        },
      });

      if (error) throw error;

      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: null,
      }));
    } catch (error) {
      const authError = error as AuthError;
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: authError.message || 'Failed to send magic link',
      }));
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    setAuthState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const { error } = await supabase!.auth.signOut();
      if (error) throw error;

      setAuthState({
        user: null,
        loading: false,
        error: null,
      });
    } catch (error) {
      const authError = error as AuthError;
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: authError.message || 'Failed to sign out',
      }));
      throw error;
    }
  }, []);

  const clearError = useCallback(() => {
    setAuthState(prev => ({ ...prev, error: null }));
  }, []);

  const contextValue: AuthContextType = {
    ...authState,
    signInWithEmail,
    signOut,
    clearError,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;