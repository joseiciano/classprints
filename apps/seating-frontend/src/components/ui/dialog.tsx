import { ReactNode, useEffect, useId, useRef } from 'react';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

const focusableSelector = [
  'button',
  '[href]',
  'input',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Dialog({ open, onOpenChange, title, description, children, footer }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusableElements = () => {
      if (!dialogRef.current) return [] as HTMLElement[];
      return Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) =>
          !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
      );
    };

    const elements = focusableElements();
    (elements[0] ?? dialogRef.current)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChangeRef.current(false);
        return;
      }

      if (event.key === 'Tab') {
        const items = focusableElements();
        if (items.length === 0) {
          event.preventDefault();
          dialogRef.current?.focus();
          return;
        }

        const first = items[0];
        const last = items[items.length - 1];
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 py-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChangeRef.current(false);
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? 'Dialog' : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-y-auto rounded-[12px] border border-border bg-card shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {(title || description) && (
          <header className="border-b border-border px-5 py-4 sm:px-6">
            {title && (
              <h2 id={titleId} className="font-display text-xl font-medium text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            )}
          </header>
        )}
        <div className="px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <footer className="border-t border-border bg-muted/25 px-5 py-4 sm:px-6">{footer}</footer>
        )}
      </div>
    </div>
  );
}
