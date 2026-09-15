import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Layout, Plus, Users, Calendar, Clock, MoreVertical, Search } from 'lucide-react';
import { Button } from '../components/ui/button';
import { fetchSeatingConfigs, type SeatingConfig } from '../lib/seating-api';

export function ConfigsPage() {
  const [configs, setConfigs] = useState<SeatingConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const data = await fetchSeatingConfigs();
        setConfigs(data);
        setError(null);
      } catch (err) {
        console.error('Failed to load configs', err);
        setError('Unable to load seating configurations.');
      } finally {
        setIsLoading(false);
      }
    };

    loadConfigs();
  }, []);

  const filteredConfigs = configs.filter((config) =>
    config.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <section className="space-y-8">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
              Configuration Management
            </p>
            <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
              Seating Configurations
            </h1>
          </div>
          <Link to="/configs/arrangement">
            <Button variant="playful" size="md" className="group px-4 py-2">
              <Plus className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              Create New Config
            </Button>
          </Link>
        </div>
        <p className="max-w-3xl text-base text-muted-foreground">
          View and manage your existing seating arrangements. Create new configurations to organize
          students and seating placements for your events.
        </p>
      </header>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search configurations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Stats Summary */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
          <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-card animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10" />
              <div className="space-y-2">
                <div className="h-3 w-20 bg-muted rounded" />
                <div className="h-6 w-12 bg-muted rounded" />
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-card animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100" />
              <div className="space-y-2">
                <div className="h-3 w-24 bg-muted rounded" />
                <div className="h-6 w-16 bg-muted rounded" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
          <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Layout className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Configs</p>
                <p className="text-2xl font-bold">{configs.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Students</p>
                <p className="text-2xl font-bold">
                  {configs.reduce((sum, c) => sum + c.students.length, 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Configs List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Existing Configurations ({filteredConfigs.length})
          </h2>
        </div>

        {error && (
          <div className="text-center py-16 rounded-2xl border border-destructive/50 bg-destructive/10">
            <Layout className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Failed to load configurations</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button variant="playful" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        )}

        {!error && isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="group rounded-2xl border border-border bg-card/80 p-6 shadow-card animate-pulse"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 rounded-xl bg-muted flex-shrink-0" />
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="h-5 w-48 bg-muted rounded" />
                      <div className="flex gap-4">
                        <div className="h-4 w-24 bg-muted rounded" />
                        <div className="h-4 w-20 bg-muted rounded" />
                        <div className="h-4 w-28 bg-muted rounded" />
                      </div>
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-muted rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!error && !isLoading && filteredConfigs.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-border bg-card/50">
            <Layout className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No configurations found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? 'Try adjusting your search query'
                : 'Create your first seating configuration to get started'}
            </p>
            {!searchQuery && (
              <Link to="/configs/arrangement">
                <Button variant="playful">
                  <Plus className="w-5 h-5" />
                  Create New Config
                </Button>
              </Link>
            )}
          </div>
        ) : (
          !error &&
          !isLoading && (
            <div className="grid gap-4">
              {filteredConfigs.map((config) => (
                <div
                  key={config.id}
                  className="group rounded-2xl border border-border bg-card/80 p-6 shadow-card hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Layout className="w-6 h-6 text-primary" />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <h3 className="text-lg font-semibold truncate">{config.name}</h3>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Users className="w-4 h-4" />
                            {config.students.length} students
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Layout className="w-4 h-4" />
                            {config.seatingGrid.length * (config.seatingGrid[0]?.length || 0)} seats
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            {formatDate(config.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button className="p-2 rounded-lg hover:bg-accent/20 transition-colors">
                        <MoreVertical className="w-5 h-5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-2">
                    <button className="text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5">
                      <Layout className="w-4 h-4" />
                      View Arrangement
                    </button>
                    <button className="text-sm font-medium text-foreground hover:text-foreground/80 transition-colors flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      Edit Details
                    </button>
                    <button className="text-sm font-medium text-foreground hover:text-foreground/80 transition-colors flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      Manage Students
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </section>
  );
}
