import { useState, type FormEvent } from 'react';
import { addToWaitlist } from '../lib/supabase';

export default function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      setMessage('Please enter a valid email address');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      await addToWaitlist(email);
      setStatus('success');
      setMessage('🎉 You\'re on the list! Check your email for updates.');
      setEmail('');
      
      // Track conversion if analytics is available
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'waitlist_signup', {
          event_category: 'engagement',
          event_label: 'landing_page',
        });
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Something went wrong. Please try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="tm-input flex-1"
          disabled={status === 'loading' || status === 'success'}
          required
        />
        <button
          type="submit"
          className="tm-btn tm-btn-primary"
          disabled={status === 'loading' || status === 'success'}
        >
          {status === 'loading' ? 'Joining...' : 'Join Waitlist →'}
        </button>
      </div>
      
      {message && (
        <p className={`mt-3 text-sm ${
          status === 'error' ? 'text-red-500' : 'text-green-500'
        }`}>
          {message}
        </p>
      )}
    </form>
  );
}