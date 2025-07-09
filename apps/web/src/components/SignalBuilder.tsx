import { useState, type FormEvent } from 'react';
import { parseSignal, examplePrompts, type ParsedSignal } from '../lib/signalParser';
import { addToWaitlist } from '../lib/supabase';

export default function SignalBuilder() {
  const [prompt, setPrompt] = useState('');
  const [parsedSignal, setParsedSignal] = useState<ParsedSignal | null>(null);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'input' | 'preview' | 'email' | 'success'>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleParseSignal = (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const parsed = parseSignal(prompt);
    setParsedSignal(parsed);
    setStatus('preview');
    setError('');
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await addToWaitlist(email, 'signal_builder');
      setStatus('success');
      
      // Store the signal in localStorage for future use
      if (parsedSignal) {
        localStorage.setItem('userSignal', JSON.stringify(parsedSignal));
      }
      
      // Track conversion
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'signal_builder_conversion', {
          event_category: 'engagement',
          signal_complexity: parsedSignal?.complexity,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const tryExample = (example: string) => {
    setPrompt(example);
    const parsed = parseSignal(example);
    setParsedSignal(parsed);
    setStatus('preview');
  };

  const reset = () => {
    setPrompt('');
    setParsedSignal(null);
    setEmail('');
    setStatus('input');
    setError('');
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Input Phase */}
      {status === 'input' && (
        <div className="space-y-6">
          <form onSubmit={handleParseSignal} className="space-y-4">
            <div>
              <label htmlFor="signal-prompt" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Describe your perfect trading signal in plain English
              </label>
              <textarea
                id="signal-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., RSI above 70 with increasing volume and MACD crossover"
                className="tm-input w-full h-24 resize-none"
                required
              />
            </div>
            <button type="submit" className="tm-btn tm-btn-primary w-full">
              Build My Signal →
            </button>
          </form>

          <div className="space-y-3">
            <p className="text-sm text-[var(--text-muted)]">Try an example:</p>
            <div className="flex flex-wrap gap-2">
              {examplePrompts.slice(0, 3).map((example, i) => (
                <button
                  key={i}
                  onClick={() => tryExample(example)}
                  className="text-xs px-3 py-1.5 rounded-full bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:bg-[var(--tm-bg-hover)] transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Preview Phase */}
      {status === 'preview' && parsedSignal && (
        <div className="space-y-6 animate-fadeIn">
          <div className="text-center space-y-2">
            <h3 className="tm-heading-md">Your Custom Signal</h3>
            <p className="text-[var(--text-secondary)]">"{parsedSignal.originalPrompt}"</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-[var(--text-muted)]">We'll monitor these conditions 24/7:</p>
            <div className="grid gap-3">
              {parsedSignal.conditions.map((condition, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-4 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-primary)] animate-slideIn"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <span className="text-2xl">{condition.icon}</span>
                  <div className="flex-1">
                    <p className="font-medium text-[var(--text-primary)]">{condition.description}</p>
                    <p className="text-sm text-[var(--text-muted)]">
                      {condition.type === 'indicator' ? 'Technical Indicator' : 
                       condition.type === 'price' ? 'Price Action' :
                       condition.type === 'volume' ? 'Volume Analysis' : 'Pattern Recognition'}
                    </p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-pulse" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={reset} className="tm-btn tm-btn-secondary flex-1">
              ← Edit Signal
            </button>
            <button onClick={() => setStatus('email')} className="tm-btn tm-btn-primary flex-1">
              Get Notified →
            </button>
          </div>
        </div>
      )}

      {/* Email Phase */}
      {status === 'email' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="text-center space-y-2">
            <h3 className="tm-heading-md">Almost There!</h3>
            <p className="text-[var(--text-secondary)]">
              Enter your email to get notified when your signal triggers
            </p>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="tm-input w-full"
              disabled={loading}
              required
              autoFocus
            />
            
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <button
              type="submit"
              className="tm-btn tm-btn-primary w-full"
              disabled={loading}
            >
              {loading ? 'Setting up...' : 'Start Monitoring →'}
            </button>
          </form>

          <button onClick={() => setStatus('preview')} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            ← Back to signal
          </button>
        </div>
      )}

      {/* Success Phase */}
      {status === 'success' && (
        <div className="text-center space-y-6 animate-fadeIn">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--accent-green)]/10">
            <svg className="w-8 h-8 text-[var(--accent-green)]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>

          <div className="space-y-2">
            <h3 className="tm-heading-md">You're All Set! 🎉</h3>
            <p className="text-[var(--text-secondary)]">
              We'll notify you at <strong>{email}</strong> when your signal triggers
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">
              You'll be first to know when TradeMind launches in January 2025
            </p>
            <button onClick={reset} className="tm-btn tm-btn-secondary">
              Create Another Signal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
