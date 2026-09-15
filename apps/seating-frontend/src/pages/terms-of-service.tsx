import { APPLICATION_NAME, SUPPORT_EMAIL } from '../lib/constants';

const lastUpdated = 'March 6, 2026';

type Section = {
  title: string;
  summary: string;
  items: { title: string; description: string }[];
};

const keyHighlights = [
  {
    title: 'Built for Classroom Management',
    description:
      '{APPLICATION_NAME} saves teacher time by handling the difficulty of creating classroom seating charts. These terms and conditions dictate the experience of our application.',
  },
  {
    title: 'You own your data',
    description:
      'The student names, seating configurations, and arrangements you create stay yours. Providing us any names used is done of your own consent. We process this data solely for {APPLICATION_NAME} to operate.',
  },
  {
    title: 'Privacy-first foundation',
    description:
      'We only collect the data needed to provide the service, follow our Privacy Policy, and never sell personal information. Student data is handled with extra care.',
  },
  {
    title: 'A shared responsibility',
    description:
      'Keep your account secure, use data provided responsibly, and ensure you have authority to manage the classroom information you upload.',
  },
];

const responsibilities = [
  'Keep account credentials confidential and notify us immediately of unauthorized use.',
  'Use {APPLICATION_NAME} only for lawful purposes and educational scenarios.',
  'Ensure you have permission to manage student information and seating arrangements.',
  'Respect student privacy and follow applicable educational data protection laws (e.g., FERPA, COPPA).',
  "Do not interfere with the platform, attempt to access other users' data, or reverse engineer the service.",
];

const contactInfo = {
  title: 'Questions?',
  description:
    'If anything in these Terms is unclear, contact our team and we will be happy to help.',
  email: SUPPORT_EMAIL,
};

const pageMetadata = {
  headerDescription:
    'Please review these Terms carefully. They explain how {APPLICATION_NAME} works, what you can expect from us, and what we expect from every educator using the service.',
  responsibilitiesIntro:
    '{APPLICATION_NAME} works best when classroom data is handled responsibly. By using the platform, you agree to:',
};

const sections: Section[] = [
  {
    title: '1. Acceptance of Terms',
    summary:
      'These Terms of Service ("Terms") form a legally binding agreement between you and {APPLICATION_NAME}. You accept them every time you create an account, upload student data, or access the platform.',
    items: [
      {
        title: 'Updates to these Terms',
        description:
          'We may change the Terms to reflect product updates, legal requirements, or improvements. When we do, we will post the revised version with the updated date. Continued use means you agree to the new Terms.',
      },
      {
        title: 'Other referenced documents',
        description:
          'Our Privacy Policy, product guidelines, and any additional in-product notices are incorporated by reference. Please review them to understand how data is handled and how the platform should be used.',
      },
    ],
  },
  {
    title: '2. Eligibility & Accounts',
    summary:
      '{APPLICATION_NAME} is designed for educators, teachers, and school staff managing classroom seating. Users must be able to form a contract with us under local law.',
    items: [
      {
        title: 'Age and authority',
        description:
          'You must be at least 18 years old and confirm you have the authority to manage student information for classroom seating purposes. By using this service, you represent that you are an educator or have been authorized by an educational institution.',
      },
      {
        title: 'Accurate information',
        description:
          'Provide complete, up-to-date info for your account. You are responsible for all activity that happens under your login until you tell us about unusual access.',
      },
      {
        title: 'Student data responsibility',
        description:
          'You are responsible for ensuring you have proper authorization to upload and manage student names and any associated data. Only upload information you are legally permitted to process.',
      },
    ],
  },
  {
    title: '3. Use of the Service',
    summary:
      '{APPLICATION_NAME} lets you input student names, define conflicts and compatibility preferences, generate seating arrangements, and manage classroom layouts. Use these tools responsibly and within the law.',
    items: [
      {
        title: 'Acceptable use',
        description:
          "Do not upload sensitive student information beyond names, misuse the platform for non-educational purposes, or attempt to extract data about other users' classrooms. We may suspend accounts that abuse the product or violate these Terms.",
      },
      {
        title: 'Student data',
        description:
          'You retain ownership of the student names and seating data you contribute but grant {APPLICATION_NAME} a limited license to process, store, and arrange it so the service can function. Delete data at any time and it will be removed from our systems.',
      },
      {
        title: 'Algorithm results',
        description:
          'Seating arrangements are generated algorithmically based on your inputs. We do not guarantee optimal results and encourage you to review and adjust arrangements as needed for your classroom.',
      },
    ],
  },
  {
    title: '4. Payments & Premium Features',
    summary:
      'Some features may require payment or subscription in the future. We will always tell you the price, billing frequency, and cancellation terms before you complete a transaction.',
    items: [
      {
        title: 'Billing details',
        description:
          'Charges are processed by our payment partners. You agree to provide accurate billing information and authorize us to store tokens necessary to manage your subscription.',
      },
      {
        title: 'Refunds and trials',
        description:
          'If we offer trials we will describe their length and what happens afterward. Unless required by law, fees are non-refundable once the billing period begins.',
      },
    ],
  },
  {
    title: '5. Privacy & Data Security',
    summary:
      'We design {APPLICATION_NAME} with privacy in mind, especially for educational settings. Data is collected and processed according to the Privacy Policy, and we apply reasonable technical and organizational safeguards.',
    items: [
      {
        title: 'Data we process',
        description:
          'Account details, student names, conflict mappings, compatibility preferences, and seating grid configurations are used to operate the service. We do not sell personal data or student information.',
      },
      {
        title: 'Student privacy compliance',
        description:
          "While {APPLICATION_NAME} provides tools to help organize seating, you are responsible for ensuring your use complies with applicable laws such as FERPA (Family Educational Rights and Privacy Act) and COPPA (Children's Online Privacy Protection Act).",
      },
      {
        title: 'Security expectations',
        description:
          'While no service can be 100% secure, we use encryption, access controls, and monitoring. You agree to implement reasonable security practices on your own devices.',
      },
    ],
  },
  {
    title: '6. Termination, Liability & Disputes',
    summary:
      'We reserve the right to suspend or terminate accounts that violate these Terms. You may stop using {APPLICATION_NAME} at any time by deleting your account.',
    items: [
      {
        title: 'Service availability',
        description:
          '{APPLICATION_NAME} is provided "as is." We disclaim warranties of merchantability, fitness, and non-infringement to the fullest extent allowed by law.',
      },
      {
        title: 'Limitation of liability',
        description:
          'To the extent permitted, {APPLICATION_NAME}, its affiliates, and team members are not liable for indirect, incidental, or consequential damages and our total liability is limited to the amount you paid during the 12 months before the claim.',
      },
      {
        title: 'Governing law & disputes',
        description:
          'These Terms are governed by the laws of the State of California, excluding conflict-of-law principles. Disputes will be resolved in the courts located in San Francisco County, unless your local laws provide otherwise.',
      },
    ],
  },
];

export function TermsOfServicePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="mx-auto flex w-full flex-1 flex-col px-4 pb-12 pt-6 sm:max-w-[1040px] sm:px-6 sm:pt-12">
        <section className="mt-4 flex flex-col gap-6">
          <header className="mb-2 animate-fade-in">
            <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8">
              <div className="space-y-3">
                <h1 className="text-3xl font-bold font-display text-foreground md:text-4xl">
                  Terms of Service
                </h1>
                <p className="text-lg text-muted-foreground max-w-3xl">
                  {pageMetadata.headerDescription.replace(/{APPLICATION_NAME}/g, APPLICATION_NAME)}
                </p>
                <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
              </div>
            </div>
          </header>

          <div
            className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 grid gap-4 md:grid-cols-2 animate-fade-in"
            style={{ animationDelay: '80ms' }}
          >
            {keyHighlights.map((highlight) => (
              <div key={highlight.title} className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">{highlight.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {highlight.description.replace(/{APPLICATION_NAME}/g, APPLICATION_NAME)}
                </p>
              </div>
            ))}
          </div>

          <div
            className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 animate-fade-in"
            style={{ animationDelay: '120ms' }}
          >
            <h2 className="text-2xl font-bold font-display text-foreground mb-4">
              User responsibilities
            </h2>
            <p className="text-muted-foreground mb-4">
              {pageMetadata.responsibilitiesIntro.replace(/{APPLICATION_NAME}/g, APPLICATION_NAME)}
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {responsibilities.map((item) => (
                <li key={item}>{item.replace(/{APPLICATION_NAME}/g, APPLICATION_NAME)}</li>
              ))}
            </ul>
          </div>

          {sections.map((section, index) => (
            <article
              key={section.title}
              className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 space-y-4 animate-fade-in"
              style={{ animationDelay: `${160 + index * 60}ms` }}
            >
              <div>
                <h2 className="text-2xl font-bold font-display text-foreground">{section.title}</h2>
                <p className="text-muted-foreground mt-2">
                  {section.summary.replace(/{APPLICATION_NAME}/g, APPLICATION_NAME)}
                </p>
              </div>
              <div className="space-y-3">
                {section.items.map((item) => (
                  <div key={item.title}>
                    <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {item.description.replace(/{APPLICATION_NAME}/g, APPLICATION_NAME)}
                    </p>
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
              {contactInfo.title}
            </h2>
            <p className="text-muted-foreground mb-6">{contactInfo.description}</p>
            <a
              className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition duration-300 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
              href={`mailto:${contactInfo.email}`}
            >
              Email {contactInfo.email}
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
