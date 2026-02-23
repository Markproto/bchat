/**
 * Device Binding
 *
 * Each user's account is bound to specific devices. New device logins
 * require re-verification (TOTP + Telegram confirm). Prevents session
 * hijacking and account takeover.
 *
 * In production, use Secure Enclave (iOS) or StrongBox (Android) for
 * hardware-bound keys. This module handles the server-side binding logic.
 */

import { createHash, randomBytes } from 'crypto';

export interface DeviceBinding {
  deviceId: string;
  deviceFingerprint: string;
  userId: string;
  boundAt: Date;
  lastSeen: Date;
  trusted: boolean;
  name?: string; // e.g., "iPhone 15 Pro", "Pixel 8"
}

/**
 * Generate a unique device ID.
 */
export function generateDeviceId(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create a device fingerprint from client-provided device info.
 * This is a hash of hardware/software identifiers.
 */
export function createDeviceFingerprint(info: {
  platform: string;    // ios, android, web
  model?: string;      // device model
  osVersion?: string;  // OS version
  appVersion: string;  // bchat app version
  hardwareId?: string; // Secure Enclave / StrongBox derived key
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
 * Returns false if the device appears to have changed.
 */
export function validateDeviceBinding(
  binding: DeviceBinding,
  currentFingerprint: string
): boolean {
  return binding.deviceFingerprint === currentFingerprint && binding.trusted;
}
