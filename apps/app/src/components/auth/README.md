# Authentication Components

## EmailAuthModal

A modal component for email-based magic link authentication using Supabase.

### Features
- Clean, TradeMind-styled UI
- Email validation
- Success state with instructions
- Error handling
- Stores pending prompts for execution after auth

### Usage

```tsx
import { EmailAuthModal } from './src/components/auth/EmailAuthModal';

const [showAuthModal, setShowAuthModal] = useState(false);
const [pendingPrompt, setPendingPrompt] = useState('');

// In your component
<EmailAuthModal
  isOpen={showAuthModal}
  onClose={() => setShowAuthModal(false)}
  onAuthSuccess={() => {
    setShowAuthModal(false);
    // Optional: Handle successful auth
  }}
  pendingPrompt={pendingPrompt} // Optional: Shows what will run after auth
/>
```

### Flow
1. User enters email
2. Magic link sent to email
3. Success screen shown
4. User clicks link in email
5. Redirected back to app, authenticated
6. Pending actions execute automatically