import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

/**
 * Dev transport points at Mailhog (docker-compose service) so
 * verify/reset/invite emails can be inspected at http://localhost:8025
 * instead of hitting a real provider. Swap for SES/Resend in
 * notification-service once that ships — identity keeps its own minimal
 * mailer for now since account emails are
 * security-critical and shouldn't depend on another service being up.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transport!: Transporter;
  private from!: string;
  private webUrl!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.transport = createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: this.config.get<number>('SMTP_PORT', 1025),
      secure: false,
      ignoreTLS: true,
    });
    this.from = this.config.get<string>(
      'SMTP_FROM',
      'Ecomiq <no-reply@ecomiq.dev>',
    );
    this.webUrl = this.config.get<string>(
      'APP_WEB_URL',
      'http://localhost:4200',
    );
  }

  private async send(to: string, subject: string, html: string) {
    try {
      await this.transport.sendMail({ from: this.from, to, subject, html });
    } catch (err) {
      this.logger.error(`Failed sending "${subject}" to ${to}`, err as Error);
    }
  }

  async sendPasswordReset(email: string, token: string) {
    const link = `${this.webUrl}/auth/reset-password?token=${token}`;
    await this.send(
      email,
      'Reset your Ecomiq password',
      `<p>Someone requested a password reset for this account.</p>
       <p><a href="${link}">Reset your password</a> (expires in 1 hour).</p>
       <p>If this wasn't you, you can safely ignore this email.</p>`,
    );
  }

  async sendInvitation(
    email: string,
    storeName: string,
    inviterName: string,
    token: string,
  ) {
    const link = `${this.webUrl}/auth/accept-invite?token=${token}`;
    await this.send(
      email,
      `${inviterName} invited you to join ${storeName} on Ecomiq`,
      `<p>${inviterName} invited you to join <strong>${storeName}</strong> on Ecomiq.</p>
       <p><a href="${link}">Accept invitation</a> (expires in 7 days).</p>`,
    );
  }
}
