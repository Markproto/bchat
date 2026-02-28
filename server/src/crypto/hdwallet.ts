/**
 * BIP39/BIP32 HD Wallet Key Management
 *
 * Master key holder generates child addresses (BIP32 derivation).
 * Public master key (xpub) can be shared so others can:
 *   - VERIFY that an address belongs to the master key holder
 *   - GENERATE the same public addresses (for address matching/authentication)
 *   - NOT generate private keys or sign on behalf of the master key holder
 *
 * This answers the Grok question: with the public master key, others can
 * identify addresses created by the private key but cannot generate their own
 * spending keys — only the same public addresses for verification.
 */

import * as bip39 from 'bip39';
import { BIP32Factory, BIP32Interface } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { createHash } from 'crypto';

const bip32 = BIP32Factory(ecc);

// Derivation path for bchat identity keys: m/44'/0'/0'/0/index
// Using purpose 44 (BIP44), coin_type 0, account 0
const DERIVATION_BASE = "m/44'/0'/0'";

export interface WalletKeyPair {
  index: number;
  publicKey: string;
  privateKey: string;
  address: string;
}

export interface PublicAddressInfo {
  index: number;
  publicKey: string;
  address: string;
}

/**
 * Generate a new BIP39 mnemonic (24 words = 256 bits of entropy)
 */
export function generateMnemonic(): string {
  return bip39.generateMnemonic(256);
}

/**
 * Validate a BIP39 mnemonic phrase
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic);
}

/**
 * Derive the master node from a mnemonic phrase
 */
export async function masterNodeFromMnemonic(mnemonic: string, passphrase?: string): Promise<BIP32Interface> {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }
  const seed = await bip39.mnemonicToSeed(mnemonic, passphrase);
  return bip32.fromSeed(seed);
}

/**
 * Get the extended public key (xpub) that can be shared with others.
 * Recipients can derive public child keys but NOT private keys.
 */
export function getExtendedPublicKey(masterNode: BIP32Interface): string {
  const accountNode = masterNode.derivePath(DERIVATION_BASE);
  return accountNode.neutered().toBase58();
}

/**
 * Get the extended private key (xprv) — NEVER share this.
 */
export function getExtendedPrivateKey(masterNode: BIP32Interface): string {
  const accountNode = masterNode.derivePath(DERIVATION_BASE);
  return accountNode.toBase58();
}

/**
 * Derive a child key pair at a given index (master key holder only).
 * Returns both private and public keys.
 */
export function deriveKeyPair(masterNode: BIP32Interface, index: number): WalletKeyPair {
  const child = masterNode.derivePath(`${DERIVATION_BASE}/0/${index}`);
  if (!child.privateKey) {
    throw new Error('Cannot derive private key from public-only node');
  }
  return {
    index,
    publicKey: child.publicKey.toString('hex'),
    privateKey: child.privateKey.toString('hex'),
    address: pubkeyToAddress(child.publicKey),
  };
}

/**
 * From an xpub, derive the public address at a given index.
 * This is what app users get — they can verify addresses but not sign.
 */
export function derivePublicAddress(xpub: string, index: number): PublicAddressInfo {
  const node = bip32.fromBase58(xpub);
  const child = node.derive(0).derive(index);
  return {
    index,
    publicKey: child.publicKey.toString('hex'),
    address: pubkeyToAddress(child.publicKey),
  };
}

/**
 * Verify that a given address was derived from a specific xpub.
 * Checks indices 0..maxIndex to find a match.
 */
export function verifyAddressBelongsToMaster(xpub: string, targetAddress: string, maxIndex: number = 1000): { found: boolean; index?: number } {
  for (let i = 0; i <= maxIndex; i++) {
    const derived = derivePublicAddress(xpub, i);
    if (derived.address === targetAddress) {
      return { found: true, index: i };
    }
  }
  return { found: false };
}

/**
 * Convert a compressed public key to a bchat address.
 * Uses SHA-256 then RIPEMD-160 (same as Bitcoin address derivation first steps).
 */
function pubkeyToAddress(publicKey: Buffer): string {
  const sha = createHash('sha256').update(publicKey).digest();
  const ripe = createHash('ripemd160').update(sha).digest();
  return 'bc1' + ripe.toString('hex'); // bchat address prefix
}

/**
 * BIP38-style encryption for private key storage at rest.
 * Uses Argon2id key derivation + NaCl secretbox.
 * This protects the mnemonic/private keys with a passphrase.
 */
export async function encryptPrivateKey(privateKeyHex: string, passphrase: string): Promise<string> {
  const sodium = require('sodium-native');

  const key = Buffer.alloc(32);
  const salt = Buffer.alloc(sodium.crypto_pwhash_SALTBYTES);
  sodium.randombytes_buf(salt);

  sodium.crypto_pwhash(
    key, Buffer.from(passphrase), salt,
    sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    sodium.crypto_pwhash_MEMLIMIT_MODERATE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );

  const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
  sodium.randombytes_buf(nonce);

  const plaintext = Buffer.from(privateKeyHex, 'hex');
  const ciphertext = Buffer.alloc(plaintext.length + sodium.crypto_secretbox_MACBYTES);
  sodium.crypto_secretbox_easy(ciphertext, plaintext, nonce, key);

  // Format: salt || nonce || ciphertext (all hex-encoded)
  return salt.toString('hex') + nonce.toString('hex') + ciphertext.toString('hex');
}

/**
 * Decrypt a BIP38-style encrypted private key.
 */
export async function decryptPrivateKey(encrypted: string, passphrase: string): Promise<string> {
  const sodium = require('sodium-native');

  const saltLen = sodium.crypto_pwhash_SALTBYTES * 2; // hex
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES * 2;

  const salt = Buffer.from(encrypted.slice(0, saltLen), 'hex');
  const nonce = Buffer.from(encrypted.slice(saltLen, saltLen + nonceLen), 'hex');
  const ciphertext = Buffer.from(encrypted.slice(saltLen + nonceLen), 'hex');

  const key = Buffer.alloc(32);
  sodium.crypto_pwhash(
    key, Buffer.from(passphrase), salt,
    sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    sodium.crypto_pwhash_MEMLIMIT_MODERATE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );

  const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_secretbox_MACBYTES);
  const ok = sodium.crypto_secretbox_open_easy(plaintext, ciphertext, nonce, key);
  if (!ok) {
    throw new Error('Decryption failed — wrong passphrase or corrupted data');
  }
  return plaintext.toString('hex');
}
