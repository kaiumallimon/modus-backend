import {
  BadGatewayException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host =
      this.configService.get<string>('smtp.host') || 'smtp.gmail.com';
    const port = this.configService.get<number>('smtp.port') || 465;
    const secure = this.configService.get<boolean>('smtp.secure') ?? true;
    const user = this.configService.get<string>('smtp.user');
    const pass = this.configService.get<string>('smtp.pass');

    if (!user || !pass) {
      this.logger.warn(
        'SMTP credentials not fully configured in environment (SMTP_USER / SMTP_PASS).',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.transporter) {
      try {
        await this.transporter.verify();
        this.logger.log('SMTP transporter verified and ready to dispatch emails');
      } catch (err: any) {
        this.logger.error(`SMTP verification failed: ${err.message}`);
      }
    }
  }

  private getFromAddress(): string {
    const smtpUser = this.configService.get<string>('smtp.user');
    const configuredFrom = this.configService.get<string>('smtp.from');
    const fromName = 'Pharmbrew';

    return smtpUser && smtpUser.includes('@gmail.com')
      ? `"${fromName}" <${smtpUser}>`
      : configuredFrom || `"${fromName}" <${smtpUser}>`;
  }

  async sendWelcomeCredentials(
    to: string,
    firstName: string,
    temporaryPassword: string,
    humanId?: string,
  ): Promise<boolean> {
    const from = this.getFromAddress();
    const replyTo = 'no-reply@pharmbrew.com';
    const subject = 'Your Pharmbrew Account Credentials';

    const textContent = `Hello ${firstName},

Welcome to Pharmbrew. An account has been created for you.

Your sign-in credentials:
${humanId ? `User ID: ${humanId}\n` : ''}Email: ${to}
Temporary Password: ${temporaryPassword}

Important: For security compliance, please log in and change your password immediately upon your first sign-in.

Best regards,
The Pharmbrew Team`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #111827; margin: 0; padding: 20px 0;">
  <div style="max-width: 560px; margin: 0 auto; padding: 0 16px;">
    <p style="margin-bottom: 16px;">Hello ${firstName},</p>

    <p style="margin-bottom: 16px;">
      An account has been created for you on the Pharmbrew platform. You can sign in using either your User ID or email address with the temporary credentials below:
    </p>

    <div style="margin: 24px 0; padding: 12px 16px; background-color: #f9fafb; border-left: 3px solid #0284c7; font-size: 15px; line-height: 1.8;">
      ${humanId ? `<div><strong>User ID:</strong> <code style="font-family: Consolas, monospace; font-size: 15px; font-weight: 700; color: #0f172a; background-color: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${humanId}</code></div>` : ''}
      <div><strong>Email:</strong> ${to}</div>
      <div><strong>Temporary Password:</strong> <code style="font-family: Consolas, monospace; font-size: 15px; font-weight: 700; color: #0f172a; background-color: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${temporaryPassword}</code></div>
    </div>

    <p style="margin-bottom: 16px; color: #4b5563; font-size: 14px;">
      For security compliance, please sign in and update your password immediately upon your first login.
    </p>

    <p style="margin-top: 24px; margin-bottom: 4px;">Best regards,</p>
    <p style="margin-top: 0; font-weight: 600; color: #0284c7;">The Pharmbrew Team</p>
  </div>
</body>
</html>`;

    if (!this.transporter) {
      const isTest = process.env.NODE_ENV === 'test';
      if (isTest) {
        return true;
      }
      this.logger.error(
        'Attempted to send credentials email but SMTP transporter is not initialized.',
      );
      throw new ServiceUnavailableException(
        'Email service is not configured. Please ensure SMTP credentials are set in environment variables.',
      );
    }

    try {
      const info = await this.transporter.sendMail({
        from,
        to,
        replyTo,
        subject,
        text: textContent,
        html: htmlContent,
        headers: {
          'X-Entity-Ref-ID': `${Date.now()}-${to}`,
          'X-Mailer': 'Pharmbrew Auth Mailer',
        },
      });

      this.logger.log(
        `Credentials email dispatched to ${to} (MessageId: ${info.messageId})`,
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed to send email to ${to}: ${error?.message || error}`,
        error?.stack,
      );
      throw new BadGatewayException(
        `Failed to deliver credentials email via SMTP: ${error?.message || 'Mail transport error'}`,
      );
    }
  }

  async sendPasswordResetEmail(
    to: string,
    firstName: string,
    token: string,
  ): Promise<boolean> {
    const from = this.getFromAddress();
    const replyTo = 'no-reply@pharmbrew.com';
    const subject = 'Password Reset Request - Pharmbrew';

    const textContent = `Hello ${firstName},

We received a request to reset your password for your Pharmbrew account.

Your password reset token is:
${token}

This token is valid for 15 minutes and can only be used once.

If you did not request this password reset, please ignore this email or contact your administrator.

Best regards,
The Pharmbrew Team`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #111827; margin: 0; padding: 20px 0;">
  <div style="max-width: 560px; margin: 0 auto; padding: 0 16px;">
    <p style="margin-bottom: 16px;">Hello ${firstName},</p>

    <p style="margin-bottom: 16px;">
      We received a request to reset the password for your Pharmbrew account. Use the one-time token below to complete your password reset:
    </p>

    <div style="margin: 24px 0; padding: 12px 16px; background-color: #f9fafb; border-left: 3px solid #0284c7; font-size: 15px; line-height: 1.8;">
      <div><strong>One-Time Reset Token:</strong></div>
      <div style="margin-top: 6px;"><code style="font-family: Consolas, monospace; font-size: 15px; font-weight: 700; color: #0f172a; background-color: #e5e7eb; padding: 6px 10px; border-radius: 4px; word-break: break-all; display: inline-block;">${token}</code></div>
    </div>

    <p style="margin-bottom: 16px; color: #4b5563; font-size: 14px;">
      This token is valid for <strong>15 minutes</strong> and will expire immediately once used. If you did not request this, you can safely ignore this email.
    </p>

    <p style="margin-top: 24px; margin-bottom: 4px;">Best regards,</p>
    <p style="margin-top: 0; font-weight: 600; color: #0284c7;">The Pharmbrew Team</p>
  </div>
</body>
</html>`;

    if (!this.transporter) {
      const isTest = process.env.NODE_ENV === 'test';
      if (isTest) {
        return true;
      }
      this.logger.error(
        'Attempted to send password reset email but SMTP transporter is not initialized.',
      );
      throw new ServiceUnavailableException(
        'Email service is not configured. Please ensure SMTP credentials are set in environment variables.',
      );
    }

    try {
      const info = await this.transporter.sendMail({
        from,
        to,
        replyTo,
        subject,
        text: textContent,
        html: htmlContent,
        headers: {
          'X-Entity-Ref-ID': `${Date.now()}-${to}`,
          'X-Mailer': 'Pharmbrew Auth Mailer',
        },
      });

      this.logger.log(
        `Password reset email dispatched to ${to} (MessageId: ${info.messageId})`,
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed to send password reset email to ${to}: ${error?.message || error}`,
        error?.stack,
      );
      throw new BadGatewayException(
        `Failed to deliver password reset email via SMTP: ${error?.message || 'Mail transport error'}`,
      );
    }
  }
}
