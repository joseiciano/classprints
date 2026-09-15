export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export class EmailSender {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly fromEmail: string,
  ) {}

  async send(options: SendEmailOptions): Promise<void> {
    if (!this.apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: [options.to],
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API error: ${response.status} ${errorText}`);
    }
  }
}
