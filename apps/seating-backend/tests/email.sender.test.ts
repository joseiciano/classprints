import { describe, expect, it } from 'vitest';
import { EmailSender } from '@classprints/server/email';

type SendEmailBuilder = {
  from: {
    email: string;
    name: string;
  };
  to: string;
  subject: string;
  html: string;
  text: string;
};

interface SendEmailBinding {
  send(builder: SendEmailBuilder): Promise<void>;
}

class InMemorySendEmailBinding implements SendEmailBinding {
  readonly sent: SendEmailBuilder[] = [];

  async send(builder: SendEmailBuilder): Promise<void> {
    this.sent.push(builder);
  }
}

describe('EmailSender', () => {
  it('forwards message content and named sender to SendEmail binding', async () => {
    const binding = new InMemorySendEmailBinding();
    const sender = new EmailSender(binding, 'noreply@classprints.app', 'ClassPrints');

    await sender.send({
      to: 'recipient@example.com',
      subject: 'Verify your email',
      html: '<p>Verify your email</p>',
      text: 'Verify your email',
    });

    expect(binding.sent).toEqual([
      {
        from: { email: 'noreply@classprints.app', name: 'ClassPrints' },
        to: 'recipient@example.com',
        subject: 'Verify your email',
        html: '<p>Verify your email</p>',
        text: 'Verify your email',
      },
    ]);
  });
});
