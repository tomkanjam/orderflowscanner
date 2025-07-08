import React from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export function AdminDebug() {
  const { user } = useAuthContext();
  const { profile, refreshSubscription, loading, error } = useSubscription();

  const handleRefresh = async () => {
    await refreshSubscription();
    // Force a hard refresh after data is updated
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  return (
    <div className="fixed bottom-4 right-4 p-4 bg-[var(--tm-bg-secondary)] border border-[var(--tm-border)] rounded-lg shadow-lg max-w-sm">
      <h3 className="text-sm font-semibold text-[var(--tm-text-primary)] mb-2">
        Admin Debug Panel
      </h3>
      
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[var(--tm-text-secondary)]">User ID:</span>
          <span className="text-[var(--tm-text-primary)] font-mono">
            {user?.id ? user.id.slice(0, 8) + '...' : 'Not logged in'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-[var(--tm-text-secondary)]">Email:</span>
          <span className="text-[var(--tm-text-primary)]">
            {user?.email || 'Not logged in'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-[var(--tm-text-secondary)]">Admin Status:</span>
          {loading ? (
            <span className="text-[var(--tm-text-muted)]">Loading...</span>
          ) : profile?.is_admin ? (
            <span className="flex items-center gap-1 text-[var(--tm-success)]">
              <CheckCircle className="w-3 h-3" /> Admin
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[var(--tm-error)]">
              <XCircle className="w-3 h-3" /> Not Admin
            </span>
          )}
        </div>
        
        {error && (
          <div className="flex items-center gap-1 text-[var(--tm-error)]">
            <AlertCircle className="w-3 h-3" />
            <span>{error}</span>
          </div>
        )}
      </div>
      
      <div className="mt-3 space-y-2">
        <button
          onClick={handleRefresh}
          className="w-full px-3 py-1.5 bg-[var(--tm-accent)] hover:bg-[var(--tm-accent-dark)] text-[var(--tm-bg-primary)] rounded text-xs font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh Profile & Reload
        </button>
        
        {profile?.is_admin && (
          <a
            href="/admin"
            className="block w-full px-3 py-1.5 bg-[var(--tm-bg-primary)] hover:bg-[var(--tm-bg-hover)] text-[var(--tm-accent)] border border-[var(--tm-accent)] rounded text-xs font-medium text-center transition-colors"
          >
            Go to Admin Dashboard
          </a>
        )}
      </div>
      
      <div className="mt-3 pt-3 border-t border-[var(--tm-border)] text-xs text-[var(--tm-text-muted)]">
        If admin status shows correctly but you still can't access /admin, click "Refresh Profile & Reload"
      </div>
    </div>
  );
}