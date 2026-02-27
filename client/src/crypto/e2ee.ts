// =============================================================
// bchat Phase 8: Client-Side E2EE Crypto Helper
// client/src/crypto/e2ee.ts
//
// This file runs on the CLIENT (browser or mobile app).
// The server NEVER imports this — it handles all encrypt/decrypt.
//
// Dependencies:
//   npm install tweetnacl tweetnacl-util
//
// Flow:
//   SENDING:
//     1. Fetch recipient's encryption_public_key from server
//     2. encryptMessage(plaintext, recipientPubKey, mySecretKey)
//     3. POST envelope { ciphertext, nonce, sender_public_key } to server
//
//   RECEIVING:
//     1. GET encrypted messages from server
//     2. decryptMessage(ciphertext, nonce, senderPubKey, mySecretKey)
//     3. Display plaintext
//
//   KEY DERIVATION:
//     User's ed25519 signing keypair (from BIP39 Phase 2) is
//     converted to curve25519 for encryption using
//     nacl.box.keyPair.fromSecretKey(ed25519ToX25519(signingKey))
// =============================================================

import nacl from "tweetnacl";
import {
  encodeBase64,
  decodeBase64,
  encodeUTF8,
  decodeUTF8,
} from "tweetnacl-util";

// ===================== TYPES =====================

export interface E2EEKeyPair {
  publicKey: Uint8Array;    // curve25519 public key (32 bytes)
  secretKey: Uint8Array;    // curve25519 secret key (32 bytes)
}

export interface EncryptedPayload {
  ciphertext: string;       // Base64
  nonce: string;            // Base64
  senderPublicKey: string;  // Base64
}

// ===================== KEY DERIVATION =====================

/**
 * Derive a curve25519 encryption keypair from an ed25519 signing keypair.
 *
 * This is how we go from the Phase 2 signing identity to encryption:
 *   ed25519 (signing) → curve25519 (encryption)
 *
 * The ed25519 secret key is 64 bytes (seed + public).
 * We use the first 32 bytes (seed) to derive the curve25519 key.
 */
export function deriveEncryptionKeyPair(
  ed25519SecretKey: Uint8Array
): E2EEKeyPair {
  // ed25519 secret key is 64 bytes: first 32 = seed
  const seed = ed25519SecretKey.slice(0, 32);

  // Hash the seed the same way NaCl does internally for ed25519→curve25519
  // tweetnacl's box.keyPair.fromSecretKey expects a 32-byte scalar
  const encryptionKeyPair = nacl.box.keyPair.fromSecretKey(
    nacl.hash(seed).slice(0, 32)
  );

  return {
    publicKey: encryptionKeyPair.publicKey,
    secretKey: encryptionKeyPair.secretKey,
  };
}

/**
 * Get the base64-encoded public encryption key to register with the server.
 * Call this during onboarding (Phase 2) and send to POST /api/messages/keys/register
 */
export function getPublicKeyBase64(keyPair: E2EEKeyPair): string {
  return encodeBase64(keyPair.publicKey);
}

// ===================== ENCRYPT =====================

/**
 * Encrypt a plaintext message for a specific recipient.
 *
 * @param plaintext      - The message text
 * @param recipientPubKey - Recipient's curve25519 public key (base64 from server)
 * @param senderKeyPair   - Your curve25519 keypair
 * @returns EncryptedPayload ready to POST to /api/messages/send
 */
export function encryptMessage(
  plaintext: string,
  recipientPubKey: string,
  senderKeyPair: E2EEKeyPair
): EncryptedPayload {
  const messageBytes = decodeUTF8(plaintext);
  const recipientKey = decodeBase64(recipientPubKey);

  // Generate random 24-byte nonce
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  // Encrypt: nacl.box(message, nonce, recipientPubKey, senderSecretKey)
  const encrypted = nacl.box(
    messageBytes,
    nonce,
    recipientKey,
    senderKeyPair.secretKey
  );

  if (!encrypted) {
    throw new Error("Encryption failed");
  }

  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
    senderPublicKey: encodeBase64(senderKeyPair.publicKey),
  };
}

// ===================== DECRYPT =====================

/**
 * Decrypt a message received from the server.
 *
 * @param ciphertext     - Base64 ciphertext from server
 * @param nonce          - Base64 nonce from server
 * @param senderPubKey   - Base64 sender's curve25519 public key from server
 * @param recipientKeyPair - Your curve25519 keypair
 * @returns Decrypted plaintext string, or null if decryption fails
 */
export function decryptMessage(
  ciphertext: string,
  nonce: string,
  senderPubKey: string,
  recipientKeyPair: E2EEKeyPair
): string | null {
  try {
    const ciphertextBytes = decodeBase64(ciphertext);
    const nonceBytes = decodeBase64(nonce);
    const senderKey = decodeBase64(senderPubKey);

    // Decrypt: nacl.box.open(ciphertext, nonce, senderPubKey, recipientSecretKey)
    const decrypted = nacl.box.open(
      ciphertextBytes,
      nonceBytes,
      senderKey,
      recipientKeyPair.secretKey
    );

    if (!decrypted) {
      // Decryption failed — wrong key or tampered message
      return null;
    }

    return encodeUTF8(decrypted);
  } catch {
    return null;
  }
}
