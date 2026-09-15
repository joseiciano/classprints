import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../providers/auth-provider';
import { Button } from '../components/ui/button';
import { Layout, Users, Wand2, ArrowRight, Zap, Layers, Calendar } from 'lucide-react';
import { APPLICATION_NAME } from '../lib/constants';

const content = {
  hero: {
    badge: 'Custom Done Quick',
    heading: {
      part1: 'Seating Charts,',
      part2: 'done quick.',
    },
    description:
      'Manage complex seat allocations with ease. Our optimization engine handles the constraints so you can focus on the experience.',
    buttons: {
      primary: 'Get Started',
      secondary: 'Sign In',
    },
  },
  features: {
    heading: {
      part1: 'Why use',
      highlight: APPLICATION_NAME,
      part2: '',
    },
    subheading: 'We simplify the tedious work for you.',
    items: [
      {
        icon: Wand2,
        title: 'Smart Optimization',
        description:
          'Our optimization tools uses sophisticated fine-tuned algorithsm to generate the best arrangements for you.',
        color: 'bg-primary',
      },
      {
        icon: Zap,
        title: 'Advanced Features',
        description:
          'Premium members get access to advanced Quality-of-life features, such as saved configs, CSV exporting, and emails.',
        color: 'bg-accent',
      },
      {
        icon: Layers,
        title: 'Operator Console',
        description: 'Comprehensive overview of all seating jobs and arrangement states.',
        color: 'bg-tertiary',
      },
    ],
  },
  cta: {
    heading: 'Get Started Today',
    description: 'Create an account today and let us take care of the extra work for you.',
    buttons: {
      primary: 'Create Arrangement',
      secondary: 'Sign In',
    },
  },
};

export function OverviewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSignedIn = !!user;

  return (
    <div className="relative min-h-screen bg-background overflow-hidden pb-24">
      {/* Hero Section */}
      <section className="relative z-10 px-6 pt-32 pb-16 md:pt-40 md:pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1 text-center lg:text-left">
              {/* <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-6 animate-fade-in">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">{content.hero.badge}</span>
              </div> */}
              <h1 className="text-4xl md:text-6xl font-display font-bold mb-6 animate-fade-in">
                {content.hero.heading.part1}{' '}
                <span className="text-primary">{content.hero.heading.part2}</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-xl animate-fade-in">
                {content.hero.description}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start animate-fade-in">
                <Button
                  variant="playful"
                  size="lg"
                  className="group"
                  onClick={() => navigate({ to: isSignedIn ? '/create-arrangement' : '/sign-up' })}
                >
                  {isSignedIn ? 'Create Arrangement' : content.hero.buttons.primary}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button variant="mint" size="lg" onClick={() => navigate({ to: '/charts' })}>
                  <Layout className="w-5 h-5" />
                  {content.hero.buttons.secondary}
                </Button>
              </div>
            </div>

            {/* Hero Illustration */}
            <div className="flex-1 relative">
              <div className="relative w-72 h-72 md:w-96 md:h-96 mx-auto">
                {/* Main seating icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-40 h-40 md:w-56 md:h-56 bg-primary rounded-3xl shadow-2xl flex items-center justify-center rotate-6 hover:rotate-0 transition-transform duration-500">
                    <Users className="w-20 h-20 md:w-28 md:h-28 text-primary-foreground" />
                  </div>
                </div>
                {/* Floating elements */}
                <div className="absolute top-4 left-4 w-12 h-12 bg-tertiary rounded-xl flex items-center justify-center shadow-soft animate-bounce">
                  <Wand2 className="w-6 h-6 text-tertiary-foreground" />
                </div>
                <div className="absolute top-12 right-8 w-10 h-10 bg-secondary rounded-full flex items-center justify-center shadow-soft animate-bounce delay-150">
                  <Zap className="w-5 h-5 text-secondary-foreground" />
                </div>
                <div className="absolute bottom-12 left-8 w-14 h-14 bg-accent rounded-2xl flex items-center justify-center shadow-soft animate-bounce delay-300">
                  <Calendar className="w-7 h-7 text-accent-foreground" />
                </div>
                <div className="absolute bottom-4 right-4 w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center shadow-soft animate-bounce delay-500">
                  <Layers className="w-5 h-5 text-primary" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 px-6 py-24 bg-card">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-center mb-4">
            {content.features.heading.part1}{' '}
            <span className="text-primary underline decoration-double">
              {content.features.heading.highlight}
            </span>{' '}
            {content.features.heading.part2}
          </h2>
          <p className="text-muted-foreground text-center mb-16 max-w-2xl mx-auto">
            {content.features.subheading}
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {content.features.items.map((feature) => (
              <div
                key={feature.title}
                className="group p-8 bg-background rounded-3xl shadow-soft hover:shadow-lg transition-all duration-300 hover:-translate-y-2"
              >
                <div
                  className={`w-16 h-16 ${feature.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}
                >
                  <feature.icon className="w-8 h-8 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-display font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 px-6 py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="p-12 bg-background rounded-[3rem] border border-border shadow-soft">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              {content.cta.heading}
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              {content.cta.description}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isSignedIn ? (
                <Button
                  variant="playful"
                  size="lg"
                  onClick={() => navigate({ to: '/create-arrangement' })}
                >
                  {content.cta.buttons.primary}
                </Button>
              ) : (
                <>
                  <Button variant="playful" size="lg" onClick={() => navigate({ to: '/sign-up' })}>
                    Create Account
                  </Button>
                  <Button variant="ghost" size="lg" onClick={() => navigate({ to: '/sign-in' })}>
                    {content.cta.buttons.secondary}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
