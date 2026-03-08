"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
var crypto_1 = require("crypto");
var ALGORITHM = 'aes-256-cbc';
// ENCRYPTION_KEY accessed lazily inside functions to support late env loading
var IV_LENGTH = 16; // AES block size
function encrypt(text) {
    var ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be exactly 32 characters long. Set it in .env');
    }
    var iv = crypto_1.default.randomBytes(IV_LENGTH);
    var cipher = crypto_1.default.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    var encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}
function decrypt(text) {
    var ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be exactly 32 characters long. Set it in .env');
    }
    var parts = text.split(':');
    if (parts.length < 2) {
        // In case format is different or corrupted
        throw new Error('Invalid encrypted format');
    }
    var ivHex = parts.shift();
    var encryptedHex = parts.join(':');
    var iv = Buffer.from(ivHex, 'hex');
    var encryptedText = Buffer.from(encryptedHex, 'hex');
    var decipher = crypto_1.default.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    var decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString();
}
