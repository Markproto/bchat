/**
 * Wallet / Key Management API Routes
 *
 * These routes handle BIP39/BIP32 address generation and verification.
 *
 * POST /api/wallet/verify-address  — Verify an address belongs to the master xpub
 * GET  /api/wallet/xpub            — Get the master extended public key
 * GET  /api/wallet/address/:index  — Derive a public address at a given index
 */

import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { derivePublicAddress, verifyAddressBelongsToMaster } from '../crypto/hdwallet';

const router = Router();

// The master xpub — set via env or generated on server startup
let masterXpub: string | null = process.env.MASTER_XPUB || null;

/**
 * Set the master xpub (called during server initialization).
 */
export function setMasterXpub(xpub: string): void {
  masterXpub = xpub;
}

router.use(authenticate);

/**
 * GET /api/wallet/xpub
 * Return the master extended public key.
 * Users' apps use this to verify addresses belong to the master key holder.
 */
router.get('/xpub', (_req, res) => {
  if (!masterXpub) {
    return res.status(500).json({ error: 'Master xpub not configured' });
  }
  res.json({ xpub: masterXpub });
});

/**
 * GET /api/wallet/address/:index
 * Derive the public address at a given BIP32 index.
 */
router.get('/address/:index', (req, res) => {
  if (!masterXpub) {
    return res.status(500).json({ error: 'Master xpub not configured' });
  }
  const index = parseInt(req.params.index, 10);
  if (isNaN(index) || index < 0) {
    return res.status(400).json({ error: 'Invalid index' });
  }
  const addressInfo = derivePublicAddress(masterXpub, index);
  res.json(addressInfo);
});

/**
 * POST /api/wallet/verify-address
 * Verify that a given address was derived from the master key.
 * This is what allows users to authenticate addresses — they can confirm
 * an address belongs to you (the master key holder) without having the
 * private key themselves.
 */
router.post('/verify-address', (req, res) => {
  if (!masterXpub) {
    return res.status(500).json({ error: 'Master xpub not configured' });
  }
  const { address, maxIndex } = req.body;
  if (!address) {
    return res.status(400).json({ error: 'address required' });
  }
  const result = verifyAddressBelongsToMaster(masterXpub, address, maxIndex || 1000);
  res.json({
    verified: result.found,
    index: result.index,
    message: result.found
      ? `Address verified at derivation index ${result.index}`
      : 'Address not found in first ' + (maxIndex || 1000) + ' derivations',
  });
});

export default router;
