export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface EmailBindingMessage extends SendEmailOptions {
  from: {
    email: string;
    name: string;
  };
}

export interface EmailBinding {
  send(message: EmailBindingMessage): Promise<unknown>;
}

/** Cloudflare Email Service-backed transactional email sender. */
export class EmailSender {
  constructor(
    private readonly binding: EmailBinding,
    private readonly fromEmail: string,
    private readonly fromName: string,
  ) {}

  async send(options: SendEmailOptions): Promise<void> {
    await this.binding.send({
      from: { email: this.fromEmail, name: this.fromName },
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  }
}
