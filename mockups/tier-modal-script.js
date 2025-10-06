// Tier Modal Interactive Mockup Script

// DOM Elements
const openModalBtn = document.getElementById('openModalBtn');
const tierModal = document.getElementById('tierModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalContent = document.querySelector('.modal-content');
const loadingState = document.getElementById('loadingState');
const guestBadge = document.getElementById('guestBadge');
const starterBadge = document.getElementById('starterBadge');

// State
let currentUserState = 'anonymous'; // 'anonymous' or 'free'
let isLoading = false;

// Open Modal
openModalBtn.addEventListener('click', () => {
  console.log('[TierModal] Opening tier selection modal');
  tierModal.classList.add('active');
  // Focus first tier card for accessibility
  setTimeout(() => {
    const firstCard = document.querySelector('.tier-card');
    if (firstCard) {
      firstCard.focus();
    }
  }, 100);
});

// Close Modal
function closeModal() {
  console.log('[TierModal] Closing tier selection modal');
  tierModal.classList.remove('active');
}

closeModalBtn.addEventListener('click', closeModal);

// Close on ESC key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && tierModal.classList.contains('active')) {
    closeModal();
  }
});

// Close on outside click
tierModal.addEventListener('click', (e) => {
  if (e.target === tierModal) {
    closeModal();
  }
});

// Tier CTA Handlers
document.querySelectorAll('.tier-cta').forEach(button => {
  button.addEventListener('click', (e) => {
    const action = button.getAttribute('data-action');
    handleTierAction(action, button);
  });
});

// Handle Tier Actions
function handleTierAction(action, button) {
  console.log(`[TierModal] Tier action triggered:`, action);

  switch (action) {
    case 'close':
      console.log('  → User chose to continue as guest');
      closeModal();
      break;

    case 'auth':
      console.log('  → User wants to sign in for Starter tier');
      console.log('  → Would open EmailAuthModal in real app');
      closeModal();
      setTimeout(() => {
        alert('In the real app, this would open the EmailAuthModal for authentication.');
      }, 300);
      break;

    case 'upgrade':
      console.log('  → User wants to upgrade to Lite tier');
      console.log('  → Payment flow not implemented yet');
      alert('Payment flow not implemented yet. This would navigate to a payment page.');
      break;

    case 'waitlist':
      console.log('  → User wants to join Pro tier waitlist');
      console.log('  → Waitlist feature not implemented yet');
      alert('Waitlist feature coming soon!');
      break;

    default:
      console.error(`[TierModal] Invalid action: ${action}`);
  }
}

// User State Functions (for testing)
function setUserState(state) {
  currentUserState = state;
  console.log(`[TierModal] User state changed to: ${state}`);

  // Update badge visibility based on state
  if (state === 'anonymous') {
    guestBadge.style.display = 'inline-block';
    starterBadge.style.display = 'none';
  } else if (state === 'free') {
    guestBadge.style.display = 'none';
    starterBadge.style.display = 'inline-block';
  }
}

// Toggle Loading State
function toggleLoading() {
  isLoading = !isLoading;
  console.log(`[TierModal] Loading state: ${isLoading}`);

  if (isLoading) {
    modalContent.style.display = 'none';
    loadingState.style.display = 'flex';
  } else {
    modalContent.style.display = 'flex';
    loadingState.style.display = 'none';
  }
}

// Keyboard Navigation for Tier Cards
document.querySelectorAll('.tier-card').forEach(card => {
  // Make cards focusable
  card.setAttribute('tabindex', '0');

  // Handle Enter/Space on card
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const button = card.querySelector('.tier-cta');
      if (button && !button.disabled) {
        button.click();
      }
    }
  });
});

// Log modal state changes
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.attributeName === 'class') {
      const isActive = tierModal.classList.contains('active');
      if (isActive) {
        console.log('[TierModal] Modal opened');
        console.log('  Current tier:', currentUserState);
      } else {
        console.log('[TierModal] Modal closed');
      }
    }
  });
});

observer.observe(tierModal, { attributes: true });

// Initialize
console.log('[TierModal] Interactive mockup initialized');
console.log('  Features:');
console.log('  - Click "Create Signal with AI" to open modal');
console.log('  - ESC key to close');
console.log('  - Click outside to close');
console.log('  - Keyboard navigation with Tab');
console.log('  - Test controls at bottom right');

// Set initial anonymous state
setUserState('anonymous');
