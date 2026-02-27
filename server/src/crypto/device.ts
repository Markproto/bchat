/**
 * Device Binding & Fingerprinting
 *
 * Each user's account is bound to specific devices. New device logins
 * require re-verification. Prevents session hijacking and account takeover.
 */

import { createHash, randomBytes } from 'crypto';

export interface DeviceBinding {
  deviceId: string;
  deviceFingerprint: string;
  userId: string;
  boundAt: Date;
  lastSeen: Date;
  trusted: boolean;
  name?: string;
}

/**
 * Generate a unique device ID.
 */
export function generateDeviceId(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create a device fingerprint from client-provided device info.
 */
export function createDeviceFingerprint(info: {
  platform: string;
  model?: string;
  osVersion?: string;
  appVersion: string;
  hardwareId?: string;
}): string {
  const data = [
    info.platform,
    info.model || 'unknown',
    info.osVersion || 'unknown',
    info.appVersion,
    info.hardwareId || 'no-hardware-binding',
  ].join('|');

  return createHash('sha256').update(data).digest('hex');
}

/**
 * Validate that a device fingerprint matches a stored binding.
 */
export function validateDeviceBinding(
  binding: DeviceBinding,
  currentFingerprint: string
): boolean {
  return binding.deviceFingerprint === currentFingerprint && binding.trusted;
}
