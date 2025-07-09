// Simple encryption service for API keys
// In production, use a more secure method like AWS KMS or HashiCorp Vault

const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || 'demo-encryption-key-change-in-production';

// Basic XOR encryption (NOT SECURE - for demo purposes only)
// In production, use proper AES encryption or a key management service
export function encrypt(text: string): string {
  if (!text) return '';
  
  // In demo mode, just return a placeholder
  if (ENCRYPTION_KEY === 'demo-encryption-key-change-in-production') {
    return `encrypted_${btoa(text)}`;
  }
  
  // Simple XOR encryption
  let encrypted = '';
  for (let i = 0; i < text.length; i++) {
    encrypted += String.fromCharCode(
      text.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
    );
  }
  
  return btoa(encrypted); // Base64 encode
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  
  // Handle demo mode placeholder
  if (encryptedText.startsWith('encrypted_')) {
    return atob(encryptedText.replace('encrypted_', ''));
  }
  
  // Decode from base64
  const encrypted = atob(encryptedText);
  
  // Simple XOR decryption (same as encryption)
  let decrypted = '';
  for (let i = 0; i < encrypted.length; i++) {
    decrypted += String.fromCharCode(
      encrypted.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
    );
  }
  
  return decrypted;
}

// Generate a secure encryption key
export function generateEncryptionKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Warning message for production use
export function checkEncryptionSecurity(): boolean {
  if (ENCRYPTION_KEY === 'demo-encryption-key-change-in-production') {
    console.warn(
      '⚠️ WARNING: Using demo encryption key. For production use:\n' +
      '1. Generate a secure key: generateEncryptionKey()\n' +
      '2. Set VITE_ENCRYPTION_KEY in your .env.local file\n' +
      '3. Consider using a proper key management service'
    );
    return false;
  }
  return true;
}