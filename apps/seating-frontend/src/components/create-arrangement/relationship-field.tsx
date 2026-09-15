import { ChangeEvent, ReactNode } from 'react';
import { FormAlert } from '../job-panels';

type RelationshipFieldProps = {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  error?: string | null;
  helperText: ReactNode;
};

export function RelationshipField({
  id,
  label,
  value,
  placeholder,
  onChange,
  error,
  helperText,
}: RelationshipFieldProps) {
  return (
    <fieldset className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={onChange}
        rows={4}
        placeholder={placeholder}
        className="w-full resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-base shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {error ? (
        <FormAlert tone="warning">{error}</FormAlert>
      ) : (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </fieldset>
  );
}
