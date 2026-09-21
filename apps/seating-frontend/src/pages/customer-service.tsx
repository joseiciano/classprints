import { ArrowUpRight, Bug, CreditCard, LifeBuoy, Mail, MessageSquare } from 'lucide-react';
import { APPLICATION_NAME, SUPPORT_EMAIL, SUPPORT_FORM_URL } from '../lib/constants';

const supportTopics = [
  {
    icon: Bug,
    title: 'Technical issues',
    description:
      'Tell us what you were doing, what you expected, and what happened. Screenshots and chart details can help us investigate.',
  },
  {
    icon: LifeBuoy,
    title: 'Using ClassPrints',
    description:
      'Ask about rosters, classroom constraints, saved profiles, generation methods, or working with a completed arrangement.',
  },
  {
    icon: CreditCard,
    title: 'Account and billing',
    description:
      'Get help with sign-in, email verification, plan limits, subscriptions, or the billing portal.',
  },
  {
    icon: MessageSquare,
    title: 'Product feedback',
    description:
      'Share a classroom workflow that could be clearer or an improvement that would make planning easier.',
  },
];

export function CustomerServicePage() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-10 text-foreground sm:px-6 sm:py-14 lg:py-16">
      <header className="grid items-end gap-8 border-b border-border pb-10 md:grid-cols-[1fr_300px]">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
            Classroom support
          </p>
          <h1 className="mt-3 max-w-xl font-display text-[clamp(2.5rem,5vw,3.5rem)] font-medium leading-[1.06] tracking-[-0.02em]">
            Help when the plan needs a second look.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
            Send us a question about {APPLICATION_NAME}, your account, billing, or a seating chart.
            Include only the classroom information needed to explain the issue.
          </p>
        </div>
        <p className="font-mono text-[11px] uppercase leading-5 tracking-[0.08em] text-muted-foreground md:text-right">
          Please do not send grades, diagnoses, IEP contents, or other sensitive student records.
        </p>
      </header>

      <section
        className="grid gap-5 py-10 md:grid-cols-2"
        aria-labelledby="support-contact-heading"
      >
        <h2 id="support-contact-heading" className="sr-only">
          Contact ClassPrints support
        </h2>
        <a
          href={SUPPORT_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-[12px] border border-border bg-card p-6 shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:p-7"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-secondary-foreground">
              <LifeBuoy className="h-5 w-5" aria-hidden="true" />
            </span>
            <ArrowUpRight
              className="h-5 w-5 text-muted-foreground transition group-hover:text-primary"
              aria-hidden="true"
            />
          </div>
          <h3 className="mt-8 font-display text-2xl font-medium">Submit a support request</h3>
          <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
            Use the request form for troubleshooting, account questions, and detailed product
            feedback.
          </p>
          <span className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Open request form
          </span>
        </a>

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="group rounded-[12px] border border-border bg-card p-6 shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:p-7"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Mail className="h-5 w-5" aria-hidden="true" />
            </span>
            <ArrowUpRight
              className="h-5 w-5 text-muted-foreground transition group-hover:text-primary"
              aria-hidden="true"
            />
          </div>
          <h3 className="mt-8 font-display text-2xl font-medium">Email support</h3>
          <p className="mt-2 break-words text-[15px] leading-6 text-muted-foreground">
            Prefer email? Write to <span className="text-foreground">{SUPPORT_EMAIL}</span> with a
            clear subject and the details we need to help.
          </p>
          <span className="mt-6 inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold text-foreground">
            Compose email
          </span>
        </a>
      </section>

      <section className="border-t border-border pt-10" aria-labelledby="support-topics-heading">
        <div className="grid gap-5 md:grid-cols-[240px_1fr] md:gap-12">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              Common requests
            </p>
            <h2 id="support-topics-heading" className="mt-3 font-display text-3xl font-medium">
              What we can help with
            </h2>
          </div>
          <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
            {supportTopics.map((topic) => {
              const Icon = topic.icon;
              return (
                <article key={topic.title}>
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-3 font-display text-lg font-medium">{topic.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {topic.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
