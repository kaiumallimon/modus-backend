import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = this.configService.get<string>('smtp.host') || 'smtp.gmail.com';
    const port = this.configService.get<number>('smtp.port') || 465;
    const secure = this.configService.get<boolean>('smtp.secure') ?? true;
    const user = this.configService.get<string>('smtp.user');
    const pass = this.configService.get<string>('smtp.pass');

    if (!user || !pass) {
      this.logger.warn(
        'SMTP credentials not fully configured in environment (SMTP_USER / SMTP_PASS). Outgoing emails will be logged only.',
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

  async sendWelcomeCredentials(
    to: string,
    firstName: string,
    temporaryPassword: string,
  ): Promise<boolean> {
    const from =
      this.configService.get<string>('smtp.from') ||
      'Pharmbrew <no-reply@pharmbrew.com>';

    const subject = 'Welcome to Pharmbrew - Your Login Credentials';
    const textContent = `Hello ${firstName},

Welcome to the Pharmbrew platform. An account has been created for you.

Your temporary credentials are:
Email: ${to}
Temporary Password: ${temporaryPassword}

Please log in and update your password immediately upon your first session.

Best regards,
The Pharmbrew Team`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 12px; }
    .greeting { font-size: 16px; line-height: 1.5; margin-bottom: 16px; }
    .credentials-box { background-color: #f1f5f9; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .field { margin: 8px 0; font-size: 15px; }
    .label { font-weight: 600; color: #475569; }
    .value { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 16px; font-weight: 700; color: #1e293b; letter-spacing: 0.5px; }
    .warning { font-size: 13px; color: #64748b; line-height: 1.4; margin-top: 16px; }
    .footer { font-size: 12px; color: #94a3b8; margin-top: 32px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">Pharmbrew Workspace</div>
    <div class="greeting">Hello <strong>${firstName}</strong>,</div>
    <p>Welcome to Pharmbrew. An administrative account has been provisioned for you. Below are your temporary sign-in credentials:</p>
    
    <div class="credentials-box">
      <div class="field"><span class="label">Email:</span> <span class="value">${to}</span></div>
      <div class="field"><span class="label">Temporary Password:</span> <span class="value">${temporaryPassword}</span></div>
    </div>

    <div class="warning">
      <strong>Important:</strong> For security compliance, please sign in and change your password immediately upon your first login.
    </div>

    <div class="footer">
      &copy; ${new Date().getFullYear()} Pharmbrew. All rights reserved. Confidential communication.
    </div>
  </div>
</body>
</html>`;

    if (!this.transporter) {
      this.logger.log(
        `[MOCK EMAIL DISPATCH] Recipient: ${to} | Name: ${firstName} | Temporary Password: ${temporaryPassword}`,
      );
      return true;
    }

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject,
        text: textContent,
        html: htmlContent,
      });
      this.logger.log(`Credentials email dispatched successfully to ${to}`);
      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed to send email to ${to}: ${error?.message || error}`,
      );
      return false;
    }
  }
}
