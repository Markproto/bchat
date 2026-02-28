/**
 * Challenge-Response Signing (ed25519)
 *
 * Re-exports challenge/identity primitives from the identity module.
 * Also provides the SignedChallenge interface for typed challenge payloads.
 */

export {
  Challenge,
  Ed25519KeyPair,
  ChallengeStore,
  generateIdentityKeyPair,
  createChallenge,
  signChallenge,
  verifySignedChallenge,
} from './identity';

export interface SignedChallenge {
  challengeId: string;
  signature: string;
  publicKey: string;
}
