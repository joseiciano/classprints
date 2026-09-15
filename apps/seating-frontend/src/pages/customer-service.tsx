import { APPLICATION_NAME, SUPPORT_EMAIL, SUPPORT_FORM_URL } from '../lib/constants';

const lastUpdated = 'March 6, 2026';

const contactInfo = {
  title: "We're Here to Help",
  description:
    'If you have any questions about {APPLICATION_NAME}, our features, or need assistance with your seating arrangements, please submit a request using the form below. Our team will respond as soon as possible.',
  formUrl: SUPPORT_FORM_URL,
  formButtonText: 'Submit a Request',
  email: SUPPORT_EMAIL,
};

const supportTopics = [
  {
    title: 'Technical Issues',
    description: "Experiencing problems with the platform? Let us know what's not working.",
  },
  {
    title: 'Feature Questions',
    description: 'Want to learn more about how to use specific features or upcoming functionality?',
  },
  {
    title: 'Account Support',
    description: 'Need help with your account, subscription, or billing inquiries?',
  },
  {
    title: 'Feedback & Suggestions',
    description: "Have ideas on how we can improve {APPLICATION_NAME}? We'd love to hear from you.",
  },
];

export function CustomerServicePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="mx-auto flex w-full flex-1 flex-col px-4 pb-12 pt-6 sm:max-w-[1040px] sm:px-6 sm:pt-12">
        <section className="mt-4 flex flex-col gap-6">
          <header className="mb-2 animate-fade-in">
            <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8">
              <div className="space-y-3">
                <h1 className="text-3xl font-bold font-display text-foreground md:text-4xl">
                  Customer Service
                </h1>
                <p className="text-lg text-muted-foreground max-w-3xl">
                  {contactInfo.description.replace(/{APPLICATION_NAME}/g, APPLICATION_NAME)}
                </p>
                <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
              </div>
            </div>
          </header>

          <div
            className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 text-center animate-fade-in"
            style={{ animationDelay: '80ms' }}
          >
            <h2 className="text-2xl font-bold font-display text-foreground mb-3">
              {contactInfo.title}
            </h2>
            <p className="text-muted-foreground mb-6">
              Our support team is ready to assist you with any questions or concerns.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition duration-300 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
                href={contactInfo.formUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {contactInfo.formButtonText}
              </a>
              {contactInfo.email && (
                <a
                  className="inline-flex items-center justify-center rounded-xl bg-secondary px-6 py-3 text-base font-semibold text-secondary-foreground shadow-lg transition duration-300 hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-secondary"
                  href={`mailto:${contactInfo.email}`}
                >
                  Email Us Today
                </a>
              )}
            </div>
          </div>

          <div
            className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 animate-fade-in"
            style={{ animationDelay: '120ms' }}
          >
            <h2 className="text-2xl font-bold font-display text-foreground mb-4">
              What We Can Help With
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {supportTopics.map((topic) => (
                <div key={topic.title} className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">{topic.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {topic.description.replace(/{APPLICATION_NAME}/g, APPLICATION_NAME)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 text-center animate-fade-in"
            style={{ animationDelay: '180ms' }}
          >
            <h2 className="text-2xl font-bold font-display text-foreground mb-3">Response Time</h2>
            <p className="text-muted-foreground mb-6">
              We typically respond to all inquiries within 1-2 business days. For urgent matters,
              please include “Urgent” in your request subject.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
