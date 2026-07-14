import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';

/** TOTP 2FA — ADR-5 / data model `app_user.totp_secret` [GAP]. */
@Injectable()
export class TotpService {
  generateSecret(): string {
    return generateSecret();
  }

  keyUri(email: string, secret: string): string {
    return generateURI({ issuer: 'Ecomiq', label: email, secret });
  }

  async qrCodeDataUrl(otpauthUri: string): Promise<string> {
    return QRCode.toDataURL(otpauthUri);
  }

  async verify(token: string, secret: string): Promise<boolean> {
    try {
      const result = await verify({ secret, token, epochTolerance: 30 });
      return result.valid;
    } catch {
      return false;
    }
  }
}
