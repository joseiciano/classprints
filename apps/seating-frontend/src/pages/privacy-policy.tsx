import { Link } from '@tanstack/react-router';
import { SUPPORT_EMAIL } from '../lib/constants';

const lastUpdated = 'September 20, 2026';

const contents = [
  ['privacy-collect', 'What we collect'],
  ['privacy-use', 'How we use it'],
  ['privacy-ai', 'AI-assisted mode'],
  ['privacy-share', 'When we share'],
  ['privacy-students', 'Student information'],
  ['privacy-retention', 'Retention and security'],
  ['privacy-rights', 'Your choices'],
  ['privacy-changes', 'Changes and contact'],
] as const;

const sectionClass = 'scroll-mt-24 border-t border-border py-7';
const headingClass = 'font-display text-2xl font-medium tracking-[-0.01em] text-foreground';
const copyClass = 'mt-3 text-[15px] leading-7 text-muted-foreground';
const linkClass =
  'text-primary underline decoration-border underline-offset-4 hover:decoration-primary';

export function PrivacyPolicyPage() {
  return (
    <div className="mx-auto grid w-full max-w-[1000px] items-start gap-8 px-4 py-10 text-foreground sm:px-6 sm:py-14 md:grid-cols-[210px_minmax(0,680px)] md:gap-[72px] lg:py-16">
      <aside className="md:sticky md:top-24" aria-label="Privacy Policy contents">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          On this page
        </p>
        <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-2 md:flex-col md:gap-1">
          {contents.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="text-sm text-muted-foreground underline decoration-border underline-offset-4 transition hover:text-foreground md:border-l md:border-border md:py-1 md:pl-3 md:no-underline md:hover:border-primary"
            >
              {label}
            </a>
          ))}
        </nav>
      </aside>

      <article className="min-w-0">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-primary">Legal</p>
          <h1 className="mt-3 font-display text-[clamp(2.5rem,5vw,3.5rem)] font-medium leading-[1.06] tracking-[-0.02em]">
            Privacy Policy
          </h1>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            This Policy explains what ClassPrints collects, why we use it, when it is shared, and
            the choices available to educators.
          </p>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Last updated · {lastUpdated}
          </p>
        </header>

        <section
          className="my-8 rounded-[12px] border border-primary/25 bg-secondary p-5 sm:p-6"
          aria-labelledby="privacy-summary"
        >
          <h2 id="privacy-summary" className="font-display text-xl font-medium">
            The short version
          </h2>
          <ul className="mt-3 grid gap-2 text-[15px] leading-6 text-muted-foreground">
            <li className="before:mr-2 before:text-primary before:content-['—']">
              We collect account details and the classroom information needed to build seating
              charts.
            </li>
            <li className="before:mr-2 before:text-primary before:content-['—']">
              We do not sell personal information or student information.
            </li>
            <li className="before:mr-2 before:text-primary before:content-['—']">
              AI-assisted mode sends relevant classroom inputs to external AI providers.
            </li>
            <li className="before:mr-2 before:text-primary before:content-['—']">
              Account deletion disables access, but associated classroom records may require a
              separate support request.
            </li>
          </ul>
        </section>

        <section id="privacy-collect" className={`${sectionClass} mt-7`}>
          <h2 className={headingClass}>1. What we collect</h2>
          <p className={copyClass}>We collect the categories needed to run ClassPrints:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-7 text-muted-foreground">
            <li>
              <strong className="font-semibold text-foreground">Account information:</strong> your
              email address, authentication details, and notification preferences.
            </li>
            <li>
              <strong className="font-semibold text-foreground">Classroom content:</strong> student
              names, relationship and seating preferences, classroom layouts, saved profiles,
              arrangement jobs, and generated results.
            </li>
            <li>
              <strong className="font-semibold text-foreground">Technical information:</strong> IP
              address, browser and device details, request times, errors, security events, and
              essential cookies used for sign-in and preferences. Worker diagnostic logs may include
              generated seating arrangements and student names.
            </li>
            <li>
              <strong className="font-semibold text-foreground">Billing information:</strong>{' '}
              subscription plan, customer and subscription identifiers, and billing status. Stripe
              handles payment-card details; ClassPrints does not receive or store your full card
              number.
            </li>
            <li>
              <strong className="font-semibold text-foreground">Support messages:</strong>{' '}
              information you include when contacting us.
            </li>
          </ul>
        </section>

        <section id="privacy-use" className={sectionClass}>
          <h2 className={headingClass}>2. How we use information</h2>
          <p className={copyClass}>
            We use information to create and store seating arrangements, manage accounts and
            subscriptions, send requested notifications, provide support, enforce plan limits,
            prevent abuse, troubleshoot errors, secure the service, and comply with legal
            obligations.
          </p>
          <p className={copyClass}>
            We do not sell personal information or student information. We do not use classroom
            content to build advertising profiles.
          </p>
        </section>

        <section id="privacy-ai" className={sectionClass}>
          <h2 className={headingClass}>3. AI-assisted mode</h2>
          <p className={copyClass}>
            If you select AI-assisted generation, ClassPrints sends the student names, classroom
            layout, relationship mappings, and seating constraints needed for that request to
            OpenRouter and the selected model provider. They process that information to return an
            arrangement.
          </p>
          <div className="mt-5 rounded-r-[9px] border-l-4 border-accent-foreground bg-accent px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">You have a non-AI option</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Programmatic generation uses the ClassPrints optimization engine and does not send the
              roster to the external AI provider. Use AI-assisted mode only when your school permits
              that processing. Review{' '}
              <a
                href="https://openrouter.ai/privacy"
                target="_blank"
                rel="noreferrer"
                className={linkClass}
              >
                OpenRouter’s privacy policy
              </a>{' '}
              for more information.
            </p>
          </div>
        </section>

        <section id="privacy-share" className={sectionClass}>
          <h2 className={headingClass}>4. When we share information</h2>
          <p className={copyClass}>
            We disclose what is needed to providers that help operate ClassPrints, including cloud
            hosting and databases, authentication, email delivery, payment processing, and—only when
            you choose AI-assisted generation—AI processing. These providers handle information
            under their own terms and applicable agreements.
          </p>
          <p className={copyClass}>
            We may also disclose information when required by law, to protect the service or its
            users, with your direction, or as part of a merger, financing, or sale where the
            recipient agrees to protect the information. We do not sell personal information.
          </p>
        </section>

        <section id="privacy-students" className={sectionClass}>
          <h2 className={headingClass}>5. Student information</h2>
          <p className={copyClass}>
            ClassPrints is intended for educators and authorized school staff, not for students to
            create accounts. Educators and schools are responsible for confirming that they may
            provide student information and for following applicable privacy laws and district or
            school policies. ClassPrints does not claim FERPA or COPPA certification.
          </p>
          <p className={copyClass}>
            Use the minimum information necessary. Do not enter grades, medical information,
            diagnoses, IEP contents, disciplinary records, or the reason for a seating constraint.
            ClassPrints generally needs only a student name and the seating relationship or position
            to consider.
          </p>
        </section>

        <section id="privacy-retention" className={sectionClass}>
          <h2 className={headingClass}>6. Retention and security</h2>
          <p className={copyClass}>
            We keep account and classroom information while your account is active and as needed to
            provide the service. A plan may limit how long results remain visible; that visibility
            period is not necessarily a deletion period. Account deletion soft-deletes the user
            profile and cancels an active subscription, but does not automatically purge every
            classroom job or saved profile. Contact support to request deletion of associated
            classroom data. We may retain records needed for billing, security, legal obligations,
            or limited backups.
          </p>
          <p className={copyClass}>
            We use reasonable administrative and technical safeguards designed to protect
            information. No online service can guarantee absolute security, so protect your account
            credentials and contact us if you suspect unauthorized access.
          </p>
        </section>

        <section id="privacy-rights" className={sectionClass}>
          <h2 className={headingClass}>7. Your choices and rights</h2>
          <p className={copyClass}>
            You can update account settings, change email-notification preferences, delete your
            account, and export eligible arrangement results through available product controls. You
            may also ask us to access, correct, export, or delete personal information associated
            with your account.
          </p>
          <p className={copyClass}>
            Depending on where you live, privacy law may provide additional rights, such as
            objecting to processing or filing a complaint with a regulator. We may need to verify
            your identity before completing a request.
          </p>
        </section>

        <section id="privacy-changes" className={sectionClass}>
          <h2 className={headingClass}>8. Changes and contact</h2>
          <p className={copyClass}>
            We may update this Policy as the service, providers, or applicable law changes. We will
            update the date above and provide reasonable notice if a change materially affects your
            privacy rights.
          </p>
          <p className={copyClass}>
            For privacy questions or requests, email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
              {SUPPORT_EMAIL}
            </a>
            . Review the{' '}
            <Link to="/terms-of-service" className={linkClass}>
              Terms of Service
            </Link>{' '}
            for the rules governing use of ClassPrints.
          </p>
        </section>
      </article>
    </div>
  );
}
