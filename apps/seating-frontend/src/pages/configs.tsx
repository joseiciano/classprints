import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BookOpen, LayoutGrid, Plus, Search, Users } from 'lucide-react';
import { Button } from '../components/ui/button';
import { fetchSeatingConfigs } from '../lib/seating-api';

const seatingConfigsQueryKey = ['seating-configs'] as const;

export function ConfigsPage() {
  const {
    data: configs = [],
    error,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: seatingConfigsQueryKey,
    queryFn: () => fetchSeatingConfigs(),
  });
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredConfigs = configs.filter((config) =>
    config.name.toLocaleLowerCase().includes(normalizedSearch),
  );
  const totalStudents = configs.reduce((sum, config) => sum + config.students.length, 0);

  return (
    <section className="space-y-7" aria-labelledby="configs-title">
      <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Reusable classroom setup
          </p>
          <h1
            id="configs-title"
            className="mt-2 font-display text-[32px] font-medium leading-tight text-foreground"
          >
            Class profiles
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Save rosters, room layouts, and classroom dynamics so your next seating chart starts
            with the details already in place.
          </p>
        </div>
        <Link
          to="/configs/arrangement"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:w-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New class profile
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[12px] border border-border bg-card px-5 py-4 shadow-sm">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Saved profiles
          </p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <p className="font-display text-3xl font-medium tabular-nums text-foreground">
              {isLoading ? '—' : configs.length}
            </p>
            <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
        </div>
        <div className="rounded-[12px] border border-border bg-card px-5 py-4 shadow-sm">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Students across profiles
          </p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <p className="font-display text-3xl font-medium tabular-nums text-foreground">
              {isLoading ? '—' : totalStudents}
            </p>
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
        </div>
      </div>

      <section
        className="overflow-hidden rounded-[12px] border border-border bg-card shadow-sm"
        aria-labelledby="saved-profiles-title"
      >
        <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2
              id="saved-profiles-title"
              className="font-display text-lg font-medium text-foreground"
            >
              Saved profiles
            </h2>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              {isLoading ? 'Loading' : `${filteredConfigs.length} shown`}
            </p>
          </div>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Search class profiles</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search profiles"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="min-h-11 w-full rounded-full border border-border bg-background py-2 pl-9 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            />
          </label>
        </div>

        <div aria-live="polite" aria-busy={isLoading}>
          {error ? (
            <div
              role="alert"
              className="m-4 rounded-[12px] border border-destructive/30 bg-destructive/10 px-5 py-8 text-center sm:m-5"
            >
              <LayoutGrid className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
              <h3 className="mt-3 font-display text-lg font-medium text-foreground">
                We couldn’t load your profiles
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Unable to load your class profiles right now.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-5"
                onClick={() => void refetch()}
                disabled={isFetching}
                aria-busy={isFetching}
              >
                {isFetching ? 'Trying again…' : 'Try again'}
              </Button>
            </div>
          ) : isLoading ? (
            <div className="divide-y divide-border" role="status">
              <span className="sr-only">Loading class profiles</span>
              {[1, 2, 3].map((item) => (
                <div key={item} className="motion-safe:animate-pulse px-4 py-5 sm:px-5">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 shrink-0 rounded-[10px] bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-2/5 rounded bg-muted" />
                      <div className="h-3 w-3/5 rounded bg-muted" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredConfigs.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <BookOpen className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
              <h3 className="mt-4 font-display text-lg font-medium text-foreground">
                {normalizedSearch ? 'No matching profiles' : 'No class profiles yet'}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                {normalizedSearch
                  ? `No profile matches “${searchQuery.trim()}”. Try another classroom or roster name.`
                  : 'Create a reusable profile for a class roster, its room layout, and the relationships that shape good seating.'}
              </p>
              {normalizedSearch ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-5"
                  onClick={() => setSearchQuery('')}
                >
                  Clear search
                </Button>
              ) : (
                <Link
                  to="/configs/arrangement"
                  className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create a profile
                </Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredConfigs.map((config) => {
                const seatCount = config.seatingGrid.length * (config.seatingGrid[0]?.length ?? 0);

                return (
                  <li
                    key={config.id}
                    className="px-4 py-5 transition-colors hover:bg-muted/35 sm:px-5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-border bg-secondary text-secondary-foreground">
                        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-display text-[17px] font-medium text-foreground">
                          {config.name}
                        </h3>
                        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <dt className="sr-only">Students</dt>
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                            <dd className="tabular-nums">{config.students.length} students</dd>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <dt className="sr-only">Seats</dt>
                            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                            <dd className="tabular-nums">{seatCount} seats</dd>
                          </div>
                          <div>
                            <dt className="sr-only">Created</dt>
                            <dd>
                              Created{' '}
                              {new Date(config.createdAt * 1000).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </section>
  );
}
