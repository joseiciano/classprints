import { SUPPORT_EMAIL } from '../lib/constants';

const lastReviewed = 'January 15, 2025';

const sections = [
  {
    title: 'Information We Collect',
    summary:
      'We collect the information you provide when you create an account and use classroom seating tools. This includes account credentials handled by our authentication provider, student names, seating preferences, saved configurations, and limited activity logs.',
    items: [
      {
        title: 'You control classroom data',
        description:
          'You decide which student names, relationship preferences, and seating arrangements to provide. We process that information only to deliver the service and never sell or publish it.',
      },
      {
        title: 'Operational data',
        description:
          'Saved configurations, arrangement jobs, notification preferences, and limited event records help us generate seating charts, deliver updates, and maintain the service.',
      },
      {
        title: 'Support communications',
        description: `If you email ${SUPPORT_EMAIL} we retain that conversation history to respond and improve the product.`,
      },
    ],
  },
  {
    title: 'How We Use Information',
    summary:
      'Data is used solely to provide optimal generated layouts for our users and to provide a smooth experience on our service.',
    items: [
      {
        title: 'Service delivery',
        description:
          'Row level security guarantees data is only accessible by the account owner for whom the data belongs to. We serve as minimal data as we can when we can.',
      },
      {
        title: 'Communication and notifications',
        description:
          'Your notification preferences record whether you receive service emails. We only email you about account activity, seating jobs, or important product updates.',
      },
      {
        title: 'Product safety',
        description:
          'We monitor aggregated usage and job activity to detect abuse, investigate errors, and maintain rate limits.',
      },
    ],
  },
  {
    title: 'How We Share Information',
    summary:
      'We do not sell personal data. Information is shared only with service providers that operate ClassPrints or when required by law.',
    items: [
      {
        title: 'Infrastructure partners',
        description:
          'Hosting, database, authentication, and email delivery providers process the limited information needed to run ClassPrints and send transactional messages.',
      },
    ],
  },
  {
    title: 'Security & Data Retention',
    summary:
      'Security is layered into our schema and application code. We remove or anonymize data when it is no longer needed.',
    items: [
      {
        title: 'Built-in safeguards',
        description:
          'We use access controls, least-privilege policies, encryption at rest and in transit, and isolated cloud environments to protect stored data.',
      },
      {
        title: 'Incident response',
        description:
          'We maintain operational logs and backups through our service providers. If we detect unauthorized access, we will investigate, notify affected users when required, and take protective action.',
      },
    ],
  },
  {
    title: 'Your Rights & Choices',
    summary:
      'Data provided is ultimately yours at the end of the day. We provide easily accessible ways to modify and delete existing data.',
    items: [
      {
        title: 'Account controls',
        description:
          'You can update existing account and configuration details within your account. On request, we can delete user data assuming their consent.',
      },
      {
        title: 'Data export or deletion',
        description: `Contact ${SUPPORT_EMAIL} if you would like a copy of your data or need assistance deleting an account. We will verify ownership before fulfilling the request.`,
      },
      {
        title: 'Regional rights',
        description:
          'If applicable laws provide additional rights (for example GDPR or CCPA) we will honor those protections. Reach out to clarify any request and we will respond promptly.',
      },
    ],
  },
];

export function PrivacyPolicyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="mx-auto flex w-full flex-1 flex-col px-4 pb-12 pt-6 sm:max-w-[1040px] sm:px-6 sm:pt-12">
        <section className="mt-4 flex flex-col gap-6">
          <header className="mb-2 animate-fade-in">
            <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  Legal
                </p>
                <h1 className="text-3xl font-bold font-display text-foreground md:text-4xl">
                  Privacy Policy
                </h1>
                <p className="text-lg text-muted-foreground max-w-3xl">
                  This Privacy Policy explains what information we collect, how we use it, and the
                  choices you have. It also describes the safeguards we apply while operating
                  ClassPrints.
                </p>
                <p className="text-sm text-muted-foreground">Last reviewed: {lastReviewed}</p>
              </div>
            </div>
          </header>

          {sections.map((section, index) => (
            <article
              key={section.title}
              className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 space-y-4 animate-fade-in"
              style={{ animationDelay: `${160 + index * 60}ms` }}
            >
              <div>
                <h2 className="text-2xl font-bold font-display text-foreground">{section.title}</h2>
                <p className="text-muted-foreground mt-2">{section.summary}</p>
              </div>
              <div className="space-y-3">
                {section.items.map((item) => (
                  <div key={item.title}>
                    <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}

          <div
            className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 text-center animate-fade-in"
            style={{ animationDelay: `${160 + sections.length * 60}ms` }}
          >
            <h2 className="text-2xl font-bold font-display text-foreground mb-3">
              Questions or requests?
            </h2>
            <p className="text-muted-foreground mb-6">
              Email {SUPPORT_EMAIL} with privacy questions, export requests, or account removal
              inquiries. We answer every message.
            </p>
            <a
              className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition duration-300 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              Contact Support
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
