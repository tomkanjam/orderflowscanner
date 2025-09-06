import React, { useState, useEffect } from 'react';
import { EmailAuthModalProps } from '../../types/auth.types';
import { useAuth } from '../../hooks/useAuth';
import Modal from '../../../components/Modal';

export const EmailAuthModal: React.FC<EmailAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  pendingPrompt,
}) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const { signInWithEmail, error: authError, clearError } = useAuth();

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setLocalError(null);
      setIsSuccess(false);
      clearError();
    }
  }, [isOpen, clearError]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      setLocalError('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setLocalError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);

    try {
      await signInWithEmail(email);
      setIsSuccess(true);
      
      // Store pending prompt if exists
      if (pendingPrompt) {
        localStorage.setItem('pendingScreenerPrompt', pendingPrompt);
      }
    } catch (err) {
      // Error is handled in context, but we can show it locally too
      setLocalError('Failed to send magic link. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = localError || authError;

  // Success content
  if (isSuccess) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="✨ Check Your Email">
        <div className="text-center py-8">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--tm-success)]/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--tm-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-[var(--tm-text-primary)] mb-2">
              Magic Link Sent!
            </h3>
            <p className="text-[var(--tm-text-secondary)] mb-1">
              We've sent a magic link to:
            </p>
            <p className="text-[var(--tm-accent)] font-medium text-lg mb-4">
              {email}
            </p>
            <p className="text-[var(--tm-text-muted)] text-sm">
              Click the link in your email to sign in and run your AI screener.
            </p>
          </div>
          <button
            onClick={onClose}
            className="tm-btn tm-btn-secondary px-6 py-2"
          >
            Got it
          </button>
        </div>
      </Modal>
    );
  }

  // Main form content
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🔐 Sign In to Continue">
      <div className="py-4">
        {pendingPrompt && (
          <div className="mb-6 p-4 bg-[var(--tm-bg-tertiary)] rounded-lg border border-[var(--tm-border-light)]">
            <p className="text-sm text-[var(--tm-text-secondary)] mb-2">
              Your AI screener is ready to run:
            </p>
            <p className="text-sm text-[var(--tm-accent)] italic">
              "{pendingPrompt}"
            </p>
          </div>
        )}
        
        <p className="text-[var(--tm-text-secondary)] mb-6">
          Sign in with your email to access AI-powered crypto screening features.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--tm-text-secondary)] mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full tm-input"
              disabled={isSubmitting}
              autoFocus
              required
            />
          </div>

          {displayError && (
            <div className="p-3 bg-[var(--tm-error)]/10 border border-[var(--tm-error)] rounded-lg">
              <p className="text-sm text-[var(--tm-error)]">{displayError}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 tm-btn tm-btn-primary py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--tm-text-inverse)] mr-2"></span>
                  Sending...
                </>
              ) : (
                'Send Magic Link'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="tm-btn tm-btn-secondary px-6 py-2.5"
            >
              Cancel
            </button>
          </div>
        </form>

        <p className="text-xs text-[var(--tm-text-muted)] text-center mt-6">
          We'll email you a magic link for a password-free sign in.
        </p>
      </div>
    </Modal>
  );
};