import React from 'react';
import { AlertCircle, Server, Zap, Database } from 'lucide-react';

interface MigrationNoticeProps {
  isVisible: boolean;
  onClose?: () => void;
}

export function MigrationNotice({ isVisible, onClose }: MigrationNoticeProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--nt-card-bg)] rounded-xl p-6 max-w-2xl w-full border border-[var(--nt-border-primary)]">
        <div className="flex items-center gap-3 mb-4">
          <Server className="h-6 w-6 text-[var(--nt-accent-lime)]" />
          <h2 className="text-xl font-bold text-[var(--nt-text-primary)]">
            Architecture Migration in Progress
          </h2>
        </div>

        <div className="space-y-4 text-[var(--nt-text-secondary)]">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-500">Migration Status</p>
                <p className="text-sm mt-1">
                  We're migrating to a server-side architecture for improved performance and scalability.
                  The app currently uses browser-based execution which will be replaced soon.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium text-[var(--nt-text-primary)] flex items-center gap-2">
              <Zap className="h-4 w-4" />
              What's Changing
            </h3>

            <div className="grid gap-3 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center mt-0.5">
                  <span className="text-green-500 text-xs">✓</span>
                </div>
                <div>
                  <p className="font-medium">Centralized Data Collection</p>
                  <p className="text-xs opacity-70">Real-time market data aggregated on dedicated servers</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center mt-0.5">
                  <span className="text-green-500 text-xs">✓</span>
                </div>
                <div>
                  <p className="font-medium">Edge Function Execution</p>
                  <p className="text-xs opacity-70">Traders run on Supabase Edge Functions at candle close</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5">
                  <span className="text-blue-500 text-xs">→</span>
                </div>
                <div>
                  <p className="font-medium">Frontend Migration</p>
                  <p className="text-xs opacity-70">Removing browser workers, integrating with server APIs</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium text-[var(--nt-text-primary)] flex items-center gap-2">
              <Database className="h-4 w-4" />
              Benefits
            </h3>

            <ul className="text-sm space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-[var(--nt-accent-lime)]">•</span>
                <span>460x reduction in execution frequency (runs at candle close, not every second)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--nt-accent-lime)]">•</span>
                <span>95% cost reduction vs VM-based architecture</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--nt-accent-lime)]">•</span>
                <span>Signals persist across sessions and devices</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--nt-accent-lime)]">•</span>
                <span>Real-time updates via Supabase Realtime</span>
              </li>
            </ul>
          </div>

          <div className="bg-[var(--nt-bg-secondary)] rounded-lg p-4">
            <p className="text-xs text-[var(--nt-text-tertiary)]">
              <strong>Note:</strong> During migration, some features may be temporarily unavailable.
              The current browser-based execution will continue to work until the migration is complete.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[var(--nt-accent-lime)] text-[var(--nt-bg-primary)] rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Got it
            </button>
          )}
        </div>
      </div>
    </div>
  );
}