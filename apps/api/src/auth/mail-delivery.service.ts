import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

export type LifecycleMailType = 'email_verification' | 'password_reset';

export type DevelopmentMail = {
  type: LifecycleMailType;
  email: string;
  token: string;
  url: string;
  createdAt: string;
};

@Injectable()
export class DevelopmentMailOutbox {
  private readonly messages: DevelopmentMail[] = [];

  add(message: DevelopmentMail): void {
    this.messages.push(message);
    if (this.messages.length > 100) this.messages.shift();
  }

  latest(email: string, type: LifecycleMailType): DevelopmentMail | null {
    const normalizedEmail = email.trim().toLowerCase();
    return [...this.messages]
      .reverse()
      .find((message) => message.email === normalizedEmail && message.type === type) ?? null;
  }
}

@Injectable()
export class MailDeliveryService {
  constructor(
    private readonly config: ConfigService,
    private readonly outbox: DevelopmentMailOutbox,
  ) {}

  async sendVerification(email: string, token: string): Promise<void> {
    await this.deliver(
      'email_verification',
      email,
      token,
      '/verify-email',
      'Xác minh email Bếp Nhớ',
      'Xác minh email của bạn để bảo vệ tài khoản Bếp Nhớ.',
    );
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    await this.deliver(
      'password_reset',
      email,
      token,
      '/reset-password',
      'Đặt lại mật khẩu Bếp Nhớ',
      'Dùng liên kết này để đặt lại mật khẩu Bếp Nhớ. Nếu bạn không yêu cầu, hãy bỏ qua email.',
    );
  }

  private async deliver(
    type: LifecycleMailType,
    email: string,
    token: string,
    path: string,
    subject: string,
    intro: string,
  ): Promise<void> {
    const environment = this.config.get<string>('NODE_ENV', 'development');
    const transport = this.config.get<string>('MAIL_TRANSPORT', 'memory');
    const publicWebUrl = this.config.get<string>('PUBLIC_WEB_URL', 'http://localhost:3000').replace(/\/$/, '');
    const url = `${publicWebUrl}${path}?token=${encodeURIComponent(token)}`;
    const normalizedEmail = email.trim().toLowerCase();

    if (transport === 'memory') {
      if (environment === 'production') {
        throw new Error('The development mail transport is disabled in production.');
      }
      this.outbox.add({
        type,
        email: normalizedEmail,
        token,
        url,
        createdAt: new Date().toISOString(),
      });
      return;
    }

    if (transport !== 'smtp') {
      throw new Error('Mail delivery is not configured.');
    }

    const host = this.config.get<string>('MAIL_SMTP_HOST');
    const port = this.config.get<number>('MAIL_SMTP_PORT', 587);
    const from = this.config.get<string>('MAIL_FROM');
    if (!host || !from) throw new Error('SMTP host and sender are required.');

    const username = this.config.get<string>('MAIL_SMTP_USERNAME');
    const password = this.config.get<string>('MAIL_SMTP_PASSWORD');
    const smtp = nodemailer.createTransport({
      host,
      port,
      secure: this.config.get<boolean>('MAIL_SMTP_SECURE', false),
      ...(username && password ? { auth: { user: username, pass: password } } : {}),
    });
    await smtp.sendMail({
      from,
      to: normalizedEmail,
      subject,
      text: `${intro}\n\n${url}\n\nLiên kết này sẽ hết hạn và chỉ dùng được một lần.`,
    });
  }
}
