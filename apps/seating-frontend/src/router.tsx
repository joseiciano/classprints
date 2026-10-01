import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  useLocation,
} from '@tanstack/react-router';
import {
  BookOpen,
  CreditCard,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Settings,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { FooterBar } from './components/ui/footer-bar';
import { LoadingScreen } from './components/ui/loading-screen';
import { Logo } from './components/ui/logo';
import { ThemeToggle } from './components/ui/theme-toggle';
import { AuthCallbackPage } from './pages/auth-callback';
import {
  AssignmentDetailPage,
} from './pages/assignment-reader/assignment-detail';
import {
  ClassDashboardPage,
  classDashboardTabDefaults,
  type ClassDashboardSearch,
  type ClassDashboardTab,
} from './pages/assignment-reader/class-dashboard';
import { ClassesPage, defaultClassesSearch, type ClassesSearch } from './pages/assignment-reader/classes';
import { DocumentProcessingPage } from './pages/assignment-reader/document-processing';
import { DocumentUploadPage } from './pages/assignment-reader/document-upload';
import { DocumentWorkspacePage } from './pages/assignment-reader/document-workspace';
import { defaultSubmissionsSearch, type SubmissionsSearch } from './components/assignment-reader/submissions-panel';
import { ConfigsArrangementPage } from './pages/configs-arrangement';
import { ConfigsPage } from './pages/configs';
import { CreateArrangementPage } from './pages/create-arrangement';
import { CustomerServicePage } from './pages/customer-service';
import { JobDetailPage } from './pages/job-detail';
import { JobsPage } from './pages/jobs-list';
import { OverviewPage } from './pages/overview';
import { PricingPage } from './pages/pricing';
import { PrivacyPolicyPage } from './pages/privacy-policy';
import { SettingsPage } from './pages/settings';
import { SignInPage } from './pages/sign-in';
import { SignOutPage } from './pages/sign-out';
import { SignUpPage } from './pages/sign-up';
import { TermsOfServicePage } from './pages/terms-of-service';
import { VerifyEmailPage } from './pages/verify-email';
import { useSubscription } from './hooks/use-subscription';
import { APPLICATION_NAME } from './lib/constants';
import { useAuth } from './providers/auth-provider';
import type { AuthUser } from '@classprints/shared';
import type { DocumentType } from '@classprints/assignment-reader-shared';

const APP_LINKS = [
  { label: 'Classes', to: '/classes', icon: BookOpen, exact: false, section: undefined },
  { label: 'Charts', to: '/charts', icon: LayoutGrid, exact: false, section: undefined },
  { label: 'Configs', to: '/configs', icon: SlidersHorizontal, exact: true, section: undefined },
  { label: 'New chart', to: '/create-arrangement', icon: Plus, exact: true, section: 'Create' },
  { label: 'Settings', to: '/settings', icon: Settings, exact: true, section: 'Account' },
  { label: 'Pricing', to: '/pricing', icon: CreditCard, exact: true, section: undefined },
] as const;

type AuthSnapshot = { user: AuthUser | null; initializing: boolean };

const rootRoute = createRootRouteWithContext<{ auth: AuthSnapshot }>()({
  component: RootLayout,
});

const publicLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_public',
  component: PublicLayout,
});

const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_auth',
  component: PublicLayout,
});

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  component: AuthenticatedLayout,
  beforeLoad: ({ context, location }) => {
    if (context.auth.initializing) {
      return;
    }
    if (!context.auth.user) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: location.pathname },
      });
    }
    if (!context.auth.user.emailVerified) {
      throw redirect({
        to: '/verify-email',
        search: {
          email: context.auth.user.email ?? undefined,
          redirect: location.pathname,
        },
      });
    }
  },
});

const indexRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/',
  component: OverviewPage,
  beforeLoad: ({ context }) => {
    if (context.auth.initializing) {
      return;
    }
    if (context.auth.user) {
      throw redirect({ to: '/charts' });
    }
  },
});

const pricingRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/pricing',
  component: PricingPage,
});

const termsOfServiceRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/terms-of-service',
  component: TermsOfServicePage,
});

const privacyPolicyRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/privacy-policy',
  component: PrivacyPolicyPage,
});

const customerServiceRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/customer-service',
  component: CustomerServicePage,
});

const signInRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/sign-in',
  component: SignInPage,
  validateSearch: (search: Record<string, unknown>): { redirect?: string; verified?: boolean } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    verified: search.verified === true || search.verified === 'true' ? true : undefined,
  }),
});

const signUpRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/sign-up',
  component: SignUpPage,
});

const verifyEmailRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/verify-email',
  component: VerifyEmailPage,
  validateSearch: (search: Record<string, unknown>): { email?: string; redirect?: string } => ({
    email: typeof search.email === 'string' ? search.email : undefined,
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
});

const authCallbackRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/auth/callback',
  component: AuthCallbackPage,
});

const createArrangementRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/create-arrangement',
  component: CreateArrangementPage,
});

const configsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/configs',
  component: ConfigsPage,
});

const configsArrangementRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/configs/arrangement',
  component: ConfigsArrangementPage,
});

const jobsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/charts',
  component: JobsPage,
});

const jobDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/charts/$jobId',
  component: JobDetailRouteComponent,
});

// ——— Assignment Reader: classes, assignments, and documents (TASK-019) ———————

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readDirection(value: unknown, fallback: 'asc' | 'desc'): 'asc' | 'desc' {
  return value === 'asc' || value === 'desc' ? value : fallback;
}

function readPage(value: unknown, fallback: number): number {
  const page = typeof value === 'string' ? Number(value) : value;
  return typeof page === 'number' && Number.isInteger(page) && page >= 1 ? page : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const CLASS_SORT_VALUES = ['createdAt', 'name', 'studentCount', 'assignmentCount', 'status'] as const;

function validateClassesSearch(search: Record<string, unknown>): ClassesSearch {
  const sort = CLASS_SORT_VALUES.includes(search.sort as (typeof CLASS_SORT_VALUES)[number])
    ? (search.sort as ClassesSearch['sort'])
    : defaultClassesSearch.sort;
  return {
    q: readString(search.q, ''),
    sort,
    direction: readDirection(search.direction, defaultClassesSearch.direction),
    page: readPage(search.page, defaultClassesSearch.page),
    status: search.status === 'active' || search.status === 'archived' ? search.status : undefined,
  };
}

function validateClassDashboardSearch(search: Record<string, unknown>): ClassDashboardSearch {
  const tab: ClassDashboardTab =
    search.tab === 'roster' || search.tab === 'seating-charts' ? search.tab : 'assignments';
  const defaults = classDashboardTabDefaults[tab];
  return {
    tab,
    q: readString(search.q, defaults.q),
    sort: readString(search.sort, defaults.sort),
    direction: readDirection(search.direction, defaults.direction),
    page: readPage(search.page, defaults.page),
    status: readOptionalString(search.status) ?? defaults.status,
  };
}

function validateSubmissionsSearch(search: Record<string, unknown>): SubmissionsSearch {
  return {
    q: readString(search.q, ''),
    sort: (readOptionalString(search.sort) as SubmissionsSearch['sort']) ?? defaultSubmissionsSearch.sort,
    direction: readDirection(search.direction, defaultSubmissionsSearch.direction),
    page: readPage(search.page, defaultSubmissionsSearch.page),
    status: readOptionalString(search.status) as SubmissionsSearch['status'],
  };
}

function asDocumentType(value: string): DocumentType {
  return value === 'submission' ? 'submission' : 'materials';
}

const classesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/classes',
  component: ClassesRouteComponent,
  validateSearch: validateClassesSearch,
});

const classDashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/classes/$classId',
  component: ClassDashboardRouteComponent,
  validateSearch: validateClassDashboardSearch,
});

const assignmentDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/classes/$classId/assignments/$assignmentId',
  component: AssignmentDetailRouteComponent,
  validateSearch: validateSubmissionsSearch,
});

const documentUploadRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/upload',
  component: DocumentUploadRouteComponent,
});

const documentProcessingRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/processing',
  component: DocumentProcessingRouteComponent,
});

const documentWorkspaceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/workspace',
  component: DocumentWorkspaceRouteComponent,
});

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/settings',
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>): { success?: boolean } => ({
    success: search.success === true ? true : undefined,
  }),
});

const signOutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-out',
  component: SignedInAccountFlow,
  beforeLoad: ({ context }) => {
    if (context.auth.initializing) {
      return;
    }
    if (!context.auth.user) {
      throw redirect({ to: '/sign-in', search: { redirect: '/sign-out' } });
    }
  },
});

const routeTree = rootRoute.addChildren([
  publicLayoutRoute.addChildren([
    indexRoute,
    pricingRoute,
    termsOfServiceRoute,
    privacyPolicyRoute,
    customerServiceRoute,
  ]),
  authLayoutRoute.addChildren([signInRoute, signUpRoute, verifyEmailRoute, authCallbackRoute]),
  appLayoutRoute.addChildren([
    createArrangementRoute,
    configsRoute,
    configsArrangementRoute,
    jobsRoute,
    jobDetailRoute,
    classesRoute,
    classDashboardRoute,
    assignmentDetailRoute,
    documentUploadRoute,
    documentProcessingRoute,
    documentWorkspaceRoute,
    settingsRoute,
  ]),
  signOutRoute,
]);

export const router = createRouter({
  routeTree,
  context: { auth: { user: null, initializing: true } },
  defaultPendingComponent: () => <LoadingScreen fullScreen={false} />,
});

export type SeatingRouter = typeof router;

declare module '@tanstack/react-router' {
  interface Register {
    router: SeatingRouter;
  }
}

function RootLayout() {
  const { user, initializing } = useAuth();

  useEffect(() => {
    router.update({ context: { auth: { user, initializing } } });
    if (!initializing) {
      void router.invalidate();
    }
  }, [user, initializing]);

  return <Outlet />;
}

function SignedInAccountFlow() {
  const { user, initializing } = useAuth();

  if (initializing || !user) return <LoadingScreen />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <SignOutPage />
    </div>
  );
}

function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicHeader />
      <main className="flex-1 animate-rise">
        <Outlet />
      </main>
      <FooterBar
        brand={APPLICATION_NAME}
        links={[
          { label: 'Terms', href: '/terms-of-service' },
          { label: 'Privacy', href: '/privacy-policy' },
          { label: 'Support', href: '/customer-service' },
        ]}
      />
    </div>
  );
}

function PublicHeader() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useFocusTrap(isOpen, menuRef, triggerRef, setIsOpen);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  return (
    <header className="relative z-40 w-full bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex min-h-[74px] w-full max-w-[1120px] items-center justify-between px-4 sm:px-6">
        <BrandLink />
        <nav
          aria-label="Public navigation"
          className="hidden items-center gap-5 text-sm font-medium text-muted-foreground md:flex"
        >
          <Link to="/pricing" className="transition-colors hover:text-foreground">
            Pricing
          </Link>
          {user ? (
            <Link to="/charts" className="transition-colors hover:text-foreground">
              Charts
            </Link>
          ) : (
            <Link to="/sign-in" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
          )}
          <ThemeToggle />
          <Link
            to={user ? '/create-arrangement' : '/sign-up'}
            className="inline-flex min-h-9 items-center rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-pine-ink dark:hover:bg-primary/80"
          >
            {user ? 'New chart' : 'Get started'}
          </Link>
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Link
            to={user ? '/create-arrangement' : '/sign-up'}
            className="hidden min-h-9 items-center rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground sm:inline-flex"
          >
            {user ? 'New chart' : 'Get started'}
          </Link>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            className="inline-grid h-11 w-11 place-items-center rounded-full border border-line-2 text-foreground"
            aria-expanded={isOpen}
            aria-controls="public-mobile-menu"
            aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {isOpen ? (
              <X aria-hidden="true" className="h-5 w-5" />
            ) : (
              <Menu aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
      {isOpen ? (
        <div
          id="public-mobile-menu"
          ref={menuRef}
          className="absolute inset-x-0 top-full border-y border-border bg-card px-4 py-4 shadow-card md:hidden"
        >
          <nav aria-label="Mobile navigation" className="mx-auto flex max-w-[1120px] flex-col">
            <Link
              to="/pricing"
              className="flex min-h-11 items-center rounded-lg px-3 font-medium hover:bg-muted"
            >
              Pricing
            </Link>
            <Link
              to={user ? '/charts' : '/sign-in'}
              className="flex min-h-11 items-center rounded-lg px-3 font-medium hover:bg-muted"
            >
              {user ? 'Charts' : 'Sign in'}
            </Link>
            <Link
              to={user ? '/create-arrangement' : '/sign-up'}
              className="mt-2 flex min-h-11 items-center justify-center rounded-full bg-primary px-4 font-semibold text-primary-foreground sm:hidden"
            >
              {user ? 'New chart' : 'Get started'}
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function AuthenticatedLayout() {
  const { user, initializing } = useAuth();
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(isDrawerOpen, drawerRef, triggerRef, setIsDrawerOpen);

  useEffect(() => {
    setIsDrawerOpen(false);
  }, [location.pathname]);

  if (initializing || !user) {
    // beforeLoad redirects signed-out and unverified users; render nothing until settled.
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <div className="hidden lg:block">
        <AppSidebar />
      </div>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm lg:hidden">
          <BrandLink />
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="inline-grid h-11 w-11 place-items-center rounded-full border border-line-2"
            aria-expanded={isDrawerOpen}
            aria-controls="app-navigation-drawer"
            aria-label="Open workspace navigation"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>
        <main className="mx-auto min-w-0 max-w-[1120px] animate-rise px-4 py-6 sm:px-6 lg:px-[42px] lg:py-[34px] lg:pb-[60px]">
          <Outlet />
        </main>
      </div>
      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-ink/35"
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Close workspace navigation"
          />
          <div
            id="app-navigation-drawer"
            ref={drawerRef}
            className="relative h-full w-[min(88vw,300px)] shadow-card"
          >
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              className="absolute right-3 top-3 z-10 inline-grid h-11 w-11 place-items-center rounded-full hover:bg-card"
              aria-label="Close workspace navigation"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
            <AppSidebar />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AppSidebar() {
  const { user } = useAuth();
  const { isPlus, isLoading } = useSubscription();
  const displayName = user?.displayName?.trim() || user?.email?.split('@')[0] || 'Educator';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <aside className="flex h-full min-h-screen w-full flex-col border-r border-border bg-muted px-3.5 py-5 lg:fixed lg:inset-y-0 lg:w-[232px]">
      <div className="px-2.5 pb-5">
        <BrandLink />
      </div>
      <nav aria-label="Workspace navigation" className="flex flex-col gap-0.5">
        {APP_LINKS.map(({ label, to, icon: Icon, exact, section }) => (
          <div key={to}>
            {section ? (
              <p className="px-3 pb-1 pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                {section}
              </p>
            ) : null}
            <Link
              to={to}
              activeOptions={{ exact }}
              activeProps={{ className: 'bg-card text-foreground shadow-card' }}
              inactiveProps={{
                className: 'text-muted-foreground hover:bg-primary/8 hover:text-foreground',
              }}
              className="flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors"
            >
              <Icon aria-hidden="true" className="h-[15px] w-[15px]" />
              {label}
            </Link>
          </div>
        ))}
      </nav>
      <div className="mt-auto border-t border-border px-2.5 pb-1 pt-3.5">
        <nav
          aria-label="Account links"
          className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3"
        >
          <Link to="/terms-of-service" className="hover:text-foreground hover:underline">
            Terms
          </Link>
          <Link to="/privacy-policy" className="hover:text-foreground hover:underline">
            Privacy
          </Link>
          <Link to="/customer-service" className="hover:text-foreground hover:underline">
            Support
          </Link>
          <Link
            to="/sign-out"
            className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
          >
            <LogOut aria-hidden="true" className="h-3 w-3" /> Sign out
          </Link>
        </nav>
        <div className="flex items-center gap-2.5">
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials || 'E'}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <b className="block truncate text-[13px] font-semibold">{displayName}</b>
            <span className="block truncate text-[11px] text-ink-3">{user?.email}</span>
          </span>
          <span className="rounded-full border border-amber/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-amber">
            {isLoading ? '…' : isPlus ? 'Plus' : 'Free'}
          </span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function BrandLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-2.5 rounded-lg text-foreground no-underline"
    >
      <Logo />
      <span className="font-display text-[19px] font-semibold">{APPLICATION_NAME}</span>
    </Link>
  );
}

function useFocusTrap(
  isOpen: boolean,
  containerRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
  setIsOpen: (isOpen: boolean) => void,
) {
  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousTrigger = triggerRef.current;
    document.body.style.overflow = 'hidden';
    const focusable = container?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousTrigger?.focus();
    };
  }, [containerRef, isOpen, setIsOpen, triggerRef]);
}

function JobDetailRouteComponent() {
  const { jobId } = jobDetailRoute.useParams();
  return <JobDetailPage jobId={jobId} />;
}

function ClassesRouteComponent() {
  const search = classesRoute.useSearch();
  const navigate = classesRoute.useNavigate();
  return (
    <ClassesPage
      search={search}
      onSearchChange={(next) => void navigate({ search: (prev) => ({ ...prev, ...next }) })}
    />
  );
}

function ClassDashboardRouteComponent() {
  const { classId } = classDashboardRoute.useParams();
  const search = classDashboardRoute.useSearch();
  const navigate = classDashboardRoute.useNavigate();
  return (
    <ClassDashboardPage
      classId={classId}
      search={search}
      onSearchChange={(next) => void navigate({ search: next })}
    />
  );
}

function AssignmentDetailRouteComponent() {
  const { classId, assignmentId } = assignmentDetailRoute.useParams();
  const search = assignmentDetailRoute.useSearch();
  const navigate = assignmentDetailRoute.useNavigate();
  return (
    <AssignmentDetailPage
      classId={classId}
      assignmentId={assignmentId}
      submissionsSearch={search}
      onSubmissionsSearchChange={(next) =>
        void navigate({ search: (prev) => ({ ...prev, ...next }) })
      }
    />
  );
}

function DocumentUploadRouteComponent() {
  const { classId, assignmentId, documentType, documentId } = documentUploadRoute.useParams();
  return (
    <DocumentUploadPage
      classId={classId}
      assignmentId={assignmentId}
      documentType={asDocumentType(documentType)}
      documentId={documentId}
    />
  );
}

function DocumentProcessingRouteComponent() {
  const { classId, assignmentId, documentType, documentId } = documentProcessingRoute.useParams();
  return (
    <DocumentProcessingPage
      classId={classId}
      assignmentId={assignmentId}
      documentType={asDocumentType(documentType)}
      documentId={documentId}
    />
  );
}

function DocumentWorkspaceRouteComponent() {
  const { classId, assignmentId, documentType, documentId } = documentWorkspaceRoute.useParams();
  return (
    <DocumentWorkspacePage
      classId={classId}
      assignmentId={assignmentId}
      documentType={asDocumentType(documentType)}
      documentId={documentId}
    />
  );
}
