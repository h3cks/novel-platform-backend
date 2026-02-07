import crypto from 'crypto';

/**
 * Generate a secure random token (hex).
 */
export function generateToken(length: number) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash token with SHA-256 for storing in DB.
 * This way we don't store plaintext tokens in DB.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
