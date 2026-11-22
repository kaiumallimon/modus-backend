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

  async sendWelcomeCredentials(
    to: string,
    firstName: string,
    temporaryPassword: string,
  ): Promise<boolean> {
    const smtpUser = this.configService.get<string>('smtp.user');
    const configuredFrom = this.configService.get<string>('smtp.from');

    // Anti-Spam & Delivery Alignment:
    // When sending through Google SMTP (smtp.gmail.com), the 'From' header address must match
    // the authenticated account to pass SPF, DKIM, and DMARC checks. Using an unaligned domain
    // without Google Workspace SPF causes receiving servers to reject or filter into spam.
    const fromName = 'Pharmbrew';
    const from =
      smtpUser && smtpUser.includes('@gmail.com')
        ? `"${fromName}" <${smtpUser}>`
        : configuredFrom || `"${fromName}" <${smtpUser}>`;

    const replyTo = 'no-reply@pharmbrew.com';
    const subject = 'Your Pharmbrew Account Credentials';

    const textContent = `Hello ${firstName},

Welcome to Pharmbrew. An administrative account has been created for you.

Your temporary credentials are:
Email: ${to}
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
      An account has been created for you on the Pharmbrew platform. You can sign in using the temporary credentials below:
    </p>

    <div style="margin: 24px 0; padding: 12px 16px; background-color: #f9fafb; border-left: 3px solid #0284c7; font-size: 15px; line-height: 1.8;">
      <div><strong>Email:</strong> ${to}</div>
      <div><strong>Temporary Password:</strong> <code style="font-family: Consolas, 'Courier New', monospace; font-size: 16px; font-weight: 700; color: #0f172a; background-color: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${temporaryPassword}</code></div>
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
}
