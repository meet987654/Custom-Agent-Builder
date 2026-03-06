import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
// ENCRYPTION_KEY accessed lazily inside functions to support late env loading
const IV_LENGTH = 16; // AES block size

export function encrypt(text: string): string {
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be exactly 32 characters long. Set it in .env');
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be exactly 32 characters long. Set it in .env');
    }
    const parts = text.split(':');
    if (parts.length < 2) {
        // In case format is different or corrupted
        throw new Error('Invalid encrypted format');
    }
    const ivHex = parts.shift()!;
    const encryptedHex = parts.join(':');

    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString();
}
