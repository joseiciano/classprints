import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function getCurrentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(getCurrentTheme);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'theme') setTheme(getCurrentTheme());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    try {
      window.localStorage.setItem('theme', nextTheme);
    } catch (error) {
      console.warn('Unable to save theme preference', error);
    }
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-2 text-muted-foreground transition-colors hover:border-ink-3 hover:text-foreground ${className}`}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
    >
      {theme === 'dark' ? (
        <Sun aria-hidden="true" className="h-3.5 w-3.5" />
      ) : (
        <Moon aria-hidden="true" className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
