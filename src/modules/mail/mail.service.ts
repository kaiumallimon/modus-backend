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
  <title>Welcome to Pharmbrew</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
    .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #cbd5e1; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .brand { font-size: 22px; font-weight: 800; color: #0284c7; letter-spacing: -0.5px; margin-bottom: 20px; }
    .greeting { font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
    .desc { font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 24px; }
    .credentials { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin-bottom: 24px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .label { font-weight: 600; color: #64748b; }
    .value { font-family: ui-monospace, Menlo, Monaco, Consolas, monospace; font-weight: 700; color: #0f172a; font-size: 15px; }
    .notice { font-size: 13px; color: #b45309; background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; padding: 12px; line-height: 1.5; margin-bottom: 24px; }
    .footer { font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Pharmbrew Workspace</div>
    <div class="greeting">Hello ${firstName},</div>
    <div class="desc">
      Your administrative account has been successfully provisioned. You can now access your Pharmbrew dashboard using the credentials below:
    </div>

    <div class="credentials">
      <div class="row">
        <span class="label">Email Address:</span>
        <span class="value">${to}</span>
      </div>
      <div class="row">
        <span class="label">Temporary Password:</span>
        <span class="value">${temporaryPassword}</span>
      </div>
    </div>

    <div class="notice">
      &#9888; <strong>Security Reminder:</strong> This temporary password is for initial access. Please change your password immediately after signing in.
    </div>

    <div class="footer">
      &copy; ${new Date().getFullYear()} Pharmbrew Platform. All rights reserved.<br>
      This is an automated administrative notification. Please do not reply directly to this message.
    </div>
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
