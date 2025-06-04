import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // GCM recommended IV length is 12, but 16 is also common and crypto.randomBytes(16) is convenient.
const AUTH_TAG_LENGTH = 16;

// Ensure your encryption key is securely managed and is the correct length (e.g., 32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.USER_API_KEY_ENCRYPTION_SECRET;

if (!ENCRYPTION_KEY) {
  throw new Error('USER_API_KEY_ENCRYPTION_SECRET is not set in environment variables.');
}

// The key from env is likely hex, convert it to a Buffer
const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
if (keyBuffer.length !== 32) {
    throw new Error('USER_API_KEY_ENCRYPTION_SECRET must be a 32-byte hex string (64 characters).');
}

interface EncryptedData {
  iv: string; // hex encoded
  encryptedText: string; // hex encoded
  authTag: string; // hex encoded
}

export function encrypt(text: string): EncryptedData {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('Encryption input must be a non-empty string.');
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv, { authTagLength: AUTH_TAG_LENGTH });
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    encryptedText: encrypted,
    authTag: authTag.toString('hex'),
  };
}

export function decrypt(encryptedData: EncryptedData): string {
  if (!encryptedData || !encryptedData.iv || !encryptedData.encryptedText || !encryptedData.authTag) {
    throw new Error('Invalid encrypted data object provided for decryption.');
  }
  try {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    // It's crucial to not leak specific error details that might help attackers (e.g., differentiating padding errors from auth tag errors)
    // For a production system, you might log the detailed error securely on the server but return a generic error to the caller.
    throw new Error("Decryption failed. The data may be corrupted or the key incorrect.");
  }
} 