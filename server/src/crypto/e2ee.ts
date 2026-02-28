/**
 * End-to-End Encryption (E2EE) using libsodium sealed boxes and secret boxes.
 *
 * - Sealed boxes (crypto_box_seal): encrypt a message for a recipient using
 *   only their public key. Sender is anonymous. Used for initial key exchange.
 * - Secret boxes (crypto_secretbox): symmetric encryption for message streams
 *   after key agreement. Uses XChaCha20-Poly1305.
 * - Key exchange: X25519 Diffie-Hellman for shared secret derivation.
 *
 * The server never sees plaintext — only encrypted blobs are relayed.
 */

import sodium from 'sodium-native';

export interface X25519KeyPair {
  publicKey: Buffer;
  secretKey: Buffer;
}

export interface EncryptedMessage {
  nonce: string;
  ciphertext: string;
}

export interface SealedMessage {
  ciphertext: string;
}

/**
 * Generate an X25519 keypair for Diffie-Hellman key exchange.
 */
export function generateX25519KeyPair(): X25519KeyPair {
  const publicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
  const secretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
  sodium.crypto_box_keypair(publicKey, secretKey);
  return { publicKey, secretKey };
}

/**
 * Derive a shared secret from our secret key and their public key.
 * Both parties derive the same shared secret independently.
 */
export function deriveSharedSecret(ourSecretKey: Buffer, theirPublicKey: Buffer): Buffer {
  const sharedSecret = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
  sodium.crypto_scalarmult(sharedSecret, ourSecretKey, theirPublicKey);

  // Hash the raw shared secret for use as symmetric key
  const key = Buffer.alloc(sodium.crypto_secretbox_KEYBYTES);
  sodium.crypto_generichash(key, sharedSecret);
  return key;
}

/**
 * Encrypt a message with a symmetric key (after DH key agreement).
 * Uses XChaCha20-Poly1305 (crypto_secretbox).
 */
export function encryptMessage(plaintext: string, sharedKey: Buffer): EncryptedMessage {
  const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
  sodium.randombytes_buf(nonce);

  const message = Buffer.from(plaintext, 'utf-8');
  const ciphertext = Buffer.alloc(message.length + sodium.crypto_secretbox_MACBYTES);
  sodium.crypto_secretbox_easy(ciphertext, message, nonce, sharedKey);

  return {
    nonce: nonce.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };
}

/**
 * Decrypt a message with a symmetric key.
 */
export function decryptMessage(encrypted: EncryptedMessage, sharedKey: Buffer): string {
  const nonce = Buffer.from(encrypted.nonce, 'hex');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'hex');
  const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_secretbox_MACBYTES);

  const success = sodium.crypto_secretbox_open_easy(plaintext, ciphertext, nonce, sharedKey);
  if (!success) {
    throw new Error('Decryption failed — message tampered or wrong key');
  }
  return plaintext.toString('utf-8');
}

/**
 * Seal a message for a recipient (anonymous sender).
 * Used for initial key exchange messages.
 */
export function sealMessage(plaintext: string, recipientPublicKey: Buffer): SealedMessage {
  const message = Buffer.from(plaintext, 'utf-8');
  const ciphertext = Buffer.alloc(message.length + sodium.crypto_box_SEALBYTES);
  sodium.crypto_box_seal(ciphertext, message, recipientPublicKey);
  return { ciphertext: ciphertext.toString('hex') };
}

/**
 * Open a sealed message (recipient only).
 */
export function openSealedMessage(sealed: SealedMessage, recipientPublicKey: Buffer, recipientSecretKey: Buffer): string {
  const ciphertext = Buffer.from(sealed.ciphertext, 'hex');
  const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_box_SEALBYTES);

  const success = sodium.crypto_box_seal_open(plaintext, ciphertext, recipientPublicKey, recipientSecretKey);
  if (!success) {
    throw new Error('Failed to open sealed message');
  }
  return plaintext.toString('utf-8');
}

/**
 * Generate a random symmetric key for group messaging.
 */
export function generateGroupKey(): Buffer {
  const key = Buffer.alloc(sodium.crypto_secretbox_KEYBYTES);
  sodium.randombytes_buf(key);
  return key;
}

/**
 * Encrypt a group key for a specific member (using sealed box).
 */
export function encryptGroupKeyForMember(groupKey: Buffer, memberPublicKey: Buffer): SealedMessage {
  return sealMessage(groupKey.toString('hex'), memberPublicKey);
}

/**
 * Decrypt a group key (member opens sealed message to get the key).
 */
export function decryptGroupKey(sealed: SealedMessage, memberPublicKey: Buffer, memberSecretKey: Buffer): Buffer {
  const keyHex = openSealedMessage(sealed, memberPublicKey, memberSecretKey);
  return Buffer.from(keyHex, 'hex');
}
