import { Link } from '@tanstack/react-router';
import { SUPPORT_EMAIL } from '../lib/constants';

const lastUpdated = 'September 20, 2026';

const contents = [
  ['terms-eligibility', 'Who can use ClassPrints'],
  ['terms-service', 'The service'],
  ['terms-data', 'Classroom data'],
  ['terms-use', 'Acceptable use'],
  ['terms-billing', 'Plans and billing'],
  ['terms-ownership', 'Ownership'],
  ['terms-ending', 'Ending use'],
  ['terms-liability', 'Disclaimers'],
  ['terms-changes', 'Changes and contact'],
] as const;

const sectionClass = 'scroll-mt-24 border-t border-border py-7';
const headingClass = 'font-display text-2xl font-medium tracking-[-0.01em] text-foreground';
const copyClass = 'mt-3 text-[15px] leading-7 text-muted-foreground';
const linkClass =
  'text-primary underline decoration-border underline-offset-4 hover:decoration-primary';

export function TermsOfServicePage() {
  return (
    <div className="mx-auto grid w-full max-w-[1000px] items-start gap-8 px-4 py-10 text-foreground sm:px-6 sm:py-14 md:grid-cols-[210px_minmax(0,680px)] md:gap-[72px] lg:py-16">
      <aside className="md:sticky md:top-24" aria-label="Terms of Service contents">
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
            Terms of Service
          </h1>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            These Terms explain the rules for using ClassPrints. By creating an account, starting a
            subscription, or using the service, you agree to them.
          </p>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Last updated · {lastUpdated}
          </p>
        </header>

        <section
          className="my-8 rounded-[12px] border border-primary/25 bg-secondary p-5 sm:p-6"
          aria-labelledby="terms-summary"
        >
          <h2 id="terms-summary" className="font-display text-xl font-medium">
            The short version
          </h2>
          <ul className="mt-3 grid gap-2 text-[15px] leading-6 text-muted-foreground">
            <li className="before:mr-2 before:text-primary before:content-['—']">
              ClassPrints is intended for adult educators and authorized school staff.
            </li>
            <li className="before:mr-2 before:text-primary before:content-['—']">
              You keep ownership of the classroom information you provide.
            </li>
            <li className="before:mr-2 before:text-primary before:content-['—']">
              Generated arrangements are suggestions; review them before classroom use.
            </li>
            <li className="before:mr-2 before:text-primary before:content-['—']">
              Paid subscriptions renew until you cancel them.
            </li>
          </ul>
        </section>

        <section id="terms-eligibility" className={`${sectionClass} mt-7`}>
          <h2 className={headingClass}>1. Who can use ClassPrints</h2>
          <p className={copyClass}>
            You must be at least 18 years old, or the age of legal majority where you live, and able
            to enter into a binding agreement. ClassPrints is designed for educators and authorized
            school staff; it is not intended for students to create or manage accounts.
          </p>
          <p className={copyClass}>
            If you use ClassPrints for a school or district, you confirm that you are authorized to
            act for that organization and to provide the classroom information you enter. Keep your
            account details accurate and protect your login credentials.
          </p>
        </section>

        <section id="terms-service" className={sectionClass}>
          <h2 className={headingClass}>2. The service</h2>
          <p className={copyClass}>
            ClassPrints creates seating arrangements from the class roster, room layout,
            relationship preferences, and seating constraints you provide. You are responsible for
            reviewing every result and deciding whether it is appropriate for your classroom.
          </p>
          <p className={copyClass}>
            We may add, change, or remove features and may temporarily interrupt the service for
            maintenance, security, or reasons outside our control. We do not guarantee that every
            arrangement will be optimal or satisfy every preference.
          </p>
        </section>

        <section id="terms-data" className={sectionClass}>
          <h2 className={headingClass}>3. Your classroom data</h2>
          <p className={copyClass}>
            You keep ownership of student names, relationship mappings, seating preferences,
            classroom layouts, saved profiles, and other content you provide. You give ClassPrints a
            limited right to host, process, and display that content only as needed to operate,
            secure, and support the service.
          </p>
          <p className={copyClass}>
            You must have permission to provide the data you enter. Submit only what is needed for
            seating arrangements. Do not enter grades, diagnoses, medical details, IEP contents,
            disciplinary records, or other sensitive information; a name and the required seating
            constraint are enough.
          </p>
          <div className="mt-5 rounded-r-[9px] border-l-4 border-accent-foreground bg-accent px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">AI-assisted arrangements</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              If you choose AI-assisted generation, student names, the classroom layout,
              relationships, and seating constraints needed for the request are sent to OpenRouter
              and the selected model provider. Programmatic generation does not use that external AI
              provider. See the{' '}
              <Link to="/privacy-policy" className={linkClass}>
                Privacy Policy
              </Link>{' '}
              for details.
            </p>
          </div>
        </section>

        <section id="terms-use" className={sectionClass}>
          <h2 className={headingClass}>4. Acceptable use</h2>
          <p className={copyClass}>
            Use ClassPrints lawfully and only with data you are authorized to manage. You may not:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-7 text-muted-foreground">
            <li>access another user’s account or classroom information without permission;</li>
            <li>upload harmful code or interfere with the service or its security;</li>
            <li>
              scrape, resell, reverse engineer, or use the service to build a competing product,
              except where law expressly permits it; or
            </li>
            <li>
              use ClassPrints to discriminate, harass, or make decisions unrelated to classroom
              seating.
            </li>
          </ul>
        </section>

        <section id="terms-billing" className={sectionClass}>
          <h2 className={headingClass}>5. Plans and billing</h2>
          <p className={copyClass}>
            ClassPrints offers free and paid plans. Prices, billing periods, and included features
            are shown before purchase. Paid subscriptions renew automatically at the selected
            interval until canceled through the billing portal.
          </p>
          <p className={copyClass}>
            Cancellation takes effect at the end of the current paid period. Fees already paid are
            non-refundable unless required by law or stated otherwise at purchase. Stripe handles
            payment-card details; ClassPrints receives subscription and customer identifiers and
            billing status. If prices change, the new price will apply no earlier than your next
            renewal after notice.
          </p>
        </section>

        <section id="terms-ownership" className={sectionClass}>
          <h2 className={headingClass}>6. Ownership</h2>
          <p className={copyClass}>
            ClassPrints and its licensors own the application, software, branding, and
            documentation. These Terms give you a limited, non-exclusive, non-transferable right to
            use the service while your account is active. They do not transfer ownership of the
            service or its source code to you.
          </p>
          <p className={copyClass}>
            If you send product feedback, you allow us to use it to improve ClassPrints without
            payment or restriction. This does not give us ownership of your classroom data.
          </p>
        </section>

        <section id="terms-ending" className={sectionClass}>
          <h2 className={headingClass}>7. Suspension and ending use</h2>
          <p className={copyClass}>
            You may stop using ClassPrints or delete your account at any time. We may suspend or
            terminate access for non-payment, misuse, a security threat, or a material violation of
            these Terms. Where practical, we will provide notice and an opportunity to correct the
            issue.
          </p>
          <p className={copyClass}>
            Deleting an account disables access and cancels an active subscription, but it does not
            automatically purge every classroom job or saved profile. Contact support to request
            deletion of associated classroom data; retention is described in the Privacy Policy.
          </p>
        </section>

        <section id="terms-liability" className={sectionClass}>
          <h2 className={headingClass}>8. Disclaimers and liability</h2>
          <p className={copyClass}>
            ClassPrints is provided “as is” and “as available.” Generated seating arrangements are
            classroom-planning aids, not a substitute for an educator’s professional judgment. We do
            not promise uninterrupted service, error-free results, or that data will never be lost.
          </p>
          <p className={copyClass}>
            To the extent permitted by law, ClassPrints is not liable for indirect, incidental,
            special, or consequential damages. Our total liability relating to the service will not
            exceed the amount you paid ClassPrints during the 12 months before the event giving rise
            to the claim. Nothing here limits rights or liabilities that cannot legally be limited.
          </p>
        </section>

        <section id="terms-changes" className={sectionClass}>
          <h2 className={headingClass}>9. Changes and contact</h2>
          <p className={copyClass}>
            We may update these Terms as the service or applicable law changes. We will post the new
            date here and provide reasonable notice of material changes. Continued use after the
            effective date means you accept the revised Terms.
          </p>
          <p className={copyClass}>
            Questions? Email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
              {SUPPORT_EMAIL}
            </a>
            . Our{' '}
            <Link to="/privacy-policy" className={linkClass}>
              Privacy Policy
            </Link>{' '}
            explains how we handle personal information.
          </p>
        </section>
      </article>
    </div>
  );
}
