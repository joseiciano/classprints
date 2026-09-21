import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAuth } from '../providers/auth-provider';

const columns = ['1', '2', '3', '4', '5', '6', '7'];
const sampleSeats = [
  [
    { initials: 'AV', name: 'Avery' },
    null,
    null,
    { initials: 'JM', name: 'Jordan' },
    { initials: 'RS', name: 'Riley' },
    null,
    null,
  ],
  [
    null,
    { initials: 'KL', name: 'Kai' },
    { initials: 'TB', name: 'Taylor', needsReview: true },
    null,
    null,
    null,
    null,
  ],
  [
    { initials: 'MD', name: 'Morgan' },
    null,
    null,
    null,
    null,
    { initials: 'LP', name: 'Logan' },
    null,
  ],
  [null, null, null, { initials: 'JC', name: 'Jamie', needsReview: true }, null, null, null],
  [
    null,
    { initials: 'EW', name: 'Emerson' },
    null,
    null,
    null,
    null,
    { initials: 'NO', name: 'Noah' },
  ],
] as const;

const features = [
  {
    index: '01',
    title: 'Classroom dynamics, accounted for',
    description:
      'Separate students who distract one another, place supportive peers together, and factor in individual seating needs.',
  },
  {
    index: '02',
    title: 'Multiple ways to build',
    description:
      'Choose the arrangement method that fits your classroom while accounting for every relationship, preference, and constraint that matters.',
  },
  {
    index: '03',
    title: 'Compare, choose, export',
    description:
      'Generate up to five candidate layouts, compare their scores, and export the best fit as CSV.',
  },
];

const SAMPLE_OCCUPIED_COUNT = sampleSeats.reduce(
  (total, row) => total + row.filter((seat) => seat !== null).length,
  0,
);

export function OverviewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSignedIn = Boolean(user);

  return (
    <div className="w-full text-foreground">
      <section className="mx-auto grid w-full max-w-[1120px] items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:py-24">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-primary">
            Smarter classroom seating
          </p>
          <h1 className="mt-4 max-w-[700px] font-display text-[clamp(2.625rem,5.4vw,4rem)] font-medium leading-[1.04] tracking-[-0.02em]">
            Every student, in the <em className="text-primary">right</em> seat.
          </h1>
          <p className="mt-6 max-w-[48ch] text-lg leading-8 text-muted-foreground">
            ClassPrints turns your class roster, classroom dynamics, and room layout into an
            optimized seating chart—algorithmic or AI-assisted—in seconds.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              size="md"
              className="min-h-11 justify-center rounded-full px-5"
              onClick={() => navigate({ to: isSignedIn ? '/create-arrangement' : '/sign-up' })}
            >
              {isSignedIn ? 'Create a new chart' : 'Create your first chart'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="md"
              className="min-h-11 justify-center rounded-full px-5"
              onClick={() => navigate({ to: '/pricing' })}
            >
              See pricing
            </Button>
          </div>
          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Start free today · Need more? See{' '}
            <Link
              to="/pricing"
              className="text-primary underline decoration-border underline-offset-4 hover:decoration-primary"
            >
              premium plans
            </Link>
          </p>
        </div>

        <figure className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <figcaption className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Sample · Classroom 204
            </span>
            <span className="rounded-full bg-secondary px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-secondary-foreground">
              Ready
            </span>
          </figcaption>
          <div className="overflow-x-auto pb-2">
            <div
              className="mx-auto grid w-max grid-cols-[20px_repeat(7,44px)] gap-1.5"
              role="img"
              aria-label={`Sample five-row by seven-column classroom seating chart. ${SAMPLE_OCCUPIED_COUNT} seats are occupied and two occupied seats need review.`}
            >
              <span aria-hidden="true" />
              {columns.map((column) => (
                <span
                  key={column}
                  aria-hidden="true"
                  className="grid h-5 place-items-center font-mono text-[9px] text-muted-foreground"
                >
                  {column}
                </span>
              ))}
              {sampleSeats.flatMap((row, rowIndex) => [
                <span
                  key={`row-${rowIndex}`}
                  aria-hidden="true"
                  className="grid h-10 place-items-center font-mono text-[9px] text-muted-foreground"
                >
                  {String.fromCharCode(65 + rowIndex)}
                </span>,
                ...row.map((seat, columnIndex) => {
                  const needsReview =
                    seat !== null && 'needsReview' in seat ? Boolean(seat.needsReview) : false;
                  return (
                    <span
                      key={`${rowIndex}-${columnIndex}`}
                      aria-hidden="true"
                      title={seat?.name}
                      className={`grid h-10 w-11 place-items-center rounded-lg border text-[11px] font-semibold ${
                        needsReview
                          ? 'border-destructive bg-destructive/10 text-destructive'
                          : seat
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-dashed border-border bg-background text-muted-foreground'
                      }`}
                    >
                      {seat?.initials ?? '—'}
                    </span>
                  );
                }),
              ])}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden="true" /> Occupied
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm border border-destructive bg-destructive/10"
                aria-hidden="true"
              />{' '}
              Needs review
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm border border-dashed border-border"
                aria-hidden="true"
              />{' '}
              Open seat
            </span>
          </div>
        </figure>
      </section>

      <section className="border-y border-border" aria-labelledby="landing-features">
        <div className="mx-auto grid w-full max-w-[1120px] px-4 py-8 sm:px-6 sm:py-12 md:grid-cols-3">
          <h2 id="landing-features" className="sr-only">
            Why teachers use ClassPrints
          </h2>
          {features.map((feature, index) => (
            <article
              key={feature.index}
              className={`py-7 md:px-8 md:py-4 ${
                index > 0 ? 'border-t border-border md:border-l md:border-t-0' : ''
              } ${index === 0 ? 'md:pl-0' : ''}`}
            >
              <p className="font-mono text-[11px] tracking-[0.1em] text-primary">{feature.index}</p>
              <h3 className="mt-4 font-display text-xl font-medium">{feature.title}</h3>
              <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
