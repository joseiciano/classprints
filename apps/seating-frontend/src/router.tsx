import { useEffect, useState } from 'react';
import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
  useNavigate,
} from '@tanstack/react-router';
import { Menu, X } from 'lucide-react';
import { HeaderBar } from '@classprints/shared';
import { FooterBar } from './components/ui/footer-bar';
import { Logo } from './components/ui/logo';
import { OverviewPage } from './pages/overview';
import { CreateArrangementPage } from './pages/create-arrangement';
import { ConfigsPage } from './pages/configs';
import { ConfigsArrangementPage } from './pages/configs-arrangement';
import { JobsPage } from './pages/jobs-list';
import { JobDetailPage } from './pages/job-detail';
import { SignInPage } from './pages/sign-in';
import { SignUpPage } from './pages/sign-up';
import { SignOutPage } from './pages/sign-out';
import { VerifyEmailPage } from './pages/verify-email';
import { AuthCallbackPage } from './pages/auth-callback';
import { PricingPage } from './pages/pricing';
import { SettingsPage } from './pages/settings';
import { TermsOfServicePage } from './pages/terms-of-service';
import { PrivacyPolicyPage } from './pages/privacy-policy';
import { CustomerServicePage } from './pages/customer-service';
import { useAuth } from './providers/auth-provider';
import { APPLICATION_NAME } from './lib/constants';
import { LoadingScreen } from './components/ui/loading-screen';

const NAV_LINKS = [
  { label: 'Overview', to: '/', exact: true },
  { label: 'Pricing', to: '/pricing', exact: true },
  { label: 'Configs', to: '/configs', exact: true },
  { label: 'Charts', to: '/charts', exact: false },
  { label: 'New Chart', to: '/create-arrangement', exact: true },
  { label: 'Settings', to: '/settings', exact: true },
];

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: OverviewPage,
});

const createArrangementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/create-arrangement',
  component: CreateArrangementPage,
});

const configsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/configs',
  component: ConfigsPage,
});

const configsArrangementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/configs/arrangement',
  component: ConfigsArrangementPage,
});

const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/charts',
  component: JobsPage,
});

const jobDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/charts/$jobId',
  component: JobDetailRouteComponent,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInPage,
});

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-up',
  component: SignUpPage,
});

const signOutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-out',
  component: SignOutPage,
});

const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify-email',
  component: VerifyEmailPage,
  validateSearch: (search: Record<string, unknown>): { email?: string; redirect?: string } => ({
    email: typeof search.email === 'string' ? search.email : undefined,
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
});

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: AuthCallbackPage,
});

const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pricing',
  component: PricingPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>): { success?: boolean } => ({
    success: search.success === true ? true : undefined,
  }),
});

const termsOfServiceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/terms-of-service',
  component: TermsOfServicePage,
});

const privacyPolicyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy-policy',
  component: PrivacyPolicyPage,
});

const customerServiceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/customer-service',
  component: CustomerServicePage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  createArrangementRoute,
  configsRoute,
  configsArrangementRoute,
  jobsRoute,
  jobDetailRoute,
  signInRoute,
  signUpRoute,
  signOutRoute,
  verifyEmailRoute,
  authCallbackRoute,
  pricingRoute,
  settingsRoute,
  termsOfServiceRoute,
  privacyPolicyRoute,
  customerServiceRoute,
]);

export const router = createRouter({
  routeTree,
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
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (initializing) {
      return;
    }

    if (!user) {
      const publicPaths = new Set(['/', '/sign-in', '/sign-up', '/auth/callback']);
      if (!publicPaths.has(location.pathname)) {
        void navigate({
          to: '/sign-in',
          search: { redirect: location.pathname },
          replace: true,
        });
      }
    } else if (location.pathname === '/') {
      void navigate({
        to: '/charts',
        replace: true,
      });
    }
  }, [initializing, user, location.pathname, navigate]);

  useEffect(() => {
    if (initializing || !user || user.emailVerified) {
      return;
    }

    const allowedPaths = new Set(['/verify-email', '/auth/callback', '/sign-out']);
    if (allowedPaths.has(location.pathname)) {
      return;
    }

    void navigate({
      to: '/verify-email',
      search: user.email ? { email: user.email, redirect: '/' } : { redirect: '/' },
      replace: true,
    });
  }, [initializing, location.pathname, navigate, user]);

  if (initializing) {
    return <LoadingScreen />;
  }

  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <SiteHeader isHome={isHome} />
      <main className={`flex-1 w-full ${isHome ? 'p-0' : 'mx-auto max-w-5xl px-6 py-10'}`}>
        <Outlet />
      </main>
      <FooterBar
        brand={APPLICATION_NAME}
        links={[
          { label: 'Terms of Service', href: '/terms-of-service' },
          { label: 'Privacy Policy', href: '/privacy-policy' },
          { label: 'Customer Service', href: '/customer-service' },
        ]}
      />
    </div>
  );
}

function SiteHeader({ isHome }: { isHome: boolean }) {
  const { user } = useAuth();
  const isSignedIn = !!user;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  const filteredLinks = NAV_LINKS.filter((link) => {
    if (link.to === '/') return !isSignedIn;
    if (link.to === '/pricing') return !isSignedIn;
    return isSignedIn;
  });

  return (
    <>
      <HeaderBar
        fixed={isHome}
        className={isHome ? '!bg-transparent' : ''}
        navClassName="max-w-6xl"
        left={
          <Link to="/" className="flex items-center gap-2 rounded-lg no-underline text-foreground">
            <Logo />
            <div>
              <p
                className="font-bold text-foreground text-xl"
                style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
              >
                {APPLICATION_NAME}
              </p>
            </div>
          </Link>
        }
        right={
          <>
            <div className="hidden md:flex flex-wrap items-center gap-4">
              <nav className="flex flex-wrap items-center gap-2">
                {filteredLinks.map((link) => (
                  <NavLink key={link.to} {...link} />
                ))}
              </nav>
              {isSignedIn ? (
                <Link
                  to="/sign-out"
                  className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-accent/20 text-foreground transition-colors inline-flex items-center gap-2"
                >
                  Sign out
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    to="/sign-in"
                    className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-accent/20 text-foreground transition-colors inline-flex items-center gap-2"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/sign-up"
                    className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-accent/20 text-foreground transition-colors inline-flex items-center gap-2"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>
            <button
              className="md:hidden flex items-center justify-center rounded-xl p-2 text-foreground hover:bg-accent/20 transition-colors"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </>
        }
      />

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex flex-col bg-background p-6 pt-24 overflow-y-auto">
          <nav className="flex flex-col gap-2">
            {filteredLinks.map((link) => (
              <NavLink key={link.to} {...link} className="text-lg py-4 w-full justify-between" />
            ))}
            <div className="border-t border-border mt-4 pt-4 flex flex-col gap-2">
              {isSignedIn ? (
                <Link
                  to="/sign-out"
                  className="rounded-xl px-4 py-4 text-lg font-semibold hover:bg-accent/20 text-foreground transition-colors inline-flex items-center gap-2"
                >
                  Sign out
                </Link>
              ) : (
                <>
                  <Link
                    to="/sign-in"
                    className="rounded-xl px-4 py-4 text-lg font-semibold hover:bg-accent/20 text-foreground transition-colors inline-flex items-center gap-2"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/sign-up"
                    className="rounded-xl px-4 py-4 text-lg font-semibold hover:bg-accent/20 text-foreground transition-colors inline-flex items-center gap-2"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

function NavLink({
  label,
  to,
  exact = true,
  className = '',
}: {
  label: string;
  to: string;
  exact?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      activeProps={{ className: 'bg-accent/20 text-foreground' }}
      inactiveProps={{ className: 'text-foreground hover:bg-accent/20' }}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors inline-flex items-center gap-2 ${className}`}
    >
      {label}
    </Link>
  );
}

function JobDetailRouteComponent() {
  const { jobId } = jobDetailRoute.useParams();
  return <JobDetailPage jobId={jobId} />;
}
