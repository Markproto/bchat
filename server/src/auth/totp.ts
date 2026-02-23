/**
 * TOTP (Time-based One-Time Password) for mandatory 2FA.
 *
 * On first login after Telegram verification, users must set up TOTP.
 * Uses RFC 6238 with HMAC-SHA1, 30-second periods, 6-digit codes.
 */

import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export interface TOTPSetup {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

/**
 * Generate a new TOTP secret and QR code for user enrollment.
 */
export async function generateTOTPSetup(
  userId: string,
  issuer: string = 'bchat'
): Promise<TOTPSetup> {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(userId, issuer, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
  };
}

/**
 * Verify a TOTP code against a secret.
 */
export function verifyTOTP(code: string, secret: string): boolean {
  return authenticator.verify({ token: code, secret });
}

/**
 * Generate the current TOTP code (for testing purposes).
 */
export function generateTOTPCode(secret: string): string {
  return authenticator.generate(secret);
}
