// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { AssignmentFormDialog } from '../src/components/assignment-reader/assignment-form-dialog';
import { ClassFormDialog } from '../src/components/assignment-reader/class-form-dialog';
import { RosterPanelView } from '../src/components/assignment-reader/roster-panel-view';
import { SavedChartPanelView } from '../src/components/assignment-reader/saved-chart-panel-view';
import type { SavedSeatingChart, StudentRecord } from '@classprints/assignment-reader-shared';

// React's act() requires an explicit environment declaration outside a
// testing-library setup.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
});

function render(ui: ReactElement): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(ui);
  });
  return host;
}

function inputAt(container: HTMLDivElement, index: number): HTMLInputElement {
  const input = container.querySelectorAll('input')[index];
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected input at index ${index}`);
  }
  return input;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function submit(container: HTMLDivElement): void {
  const form = container.querySelector('form');
  if (!(form instanceof HTMLFormElement)) {
    throw new Error('Expected dialog form');
  }
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('ClassFormDialog hierarchy contract', () => {
  it('trims a valid class name before submitting it', () => {
    const submitted: string[] = [];
    const container = render(
      <ClassFormDialog
        open
        onOpenChange={() => undefined}
        mode="create"
        onSubmit={(name) => {
          submitted.push(name);
        }}
      />,
    );

    setInputValue(inputAt(container, 0), '  Grade 3 · Room 12  ');
    submit(container);

    expect(submitted).toEqual(['Grade 3 · Room 12']);
  });

  it('blocks blank and whitespace-only class names', () => {
    const submitted: string[] = [];
    const container = render(
      <ClassFormDialog
        open
        onOpenChange={() => undefined}
        mode="rename"
        initialName="Existing class"
        onSubmit={(name) => {
          submitted.push(name);
        }}
      />,
    );

    setInputValue(inputAt(container, 0), '   ');
    submit(container);

    expect(submitted).toEqual([]);
  });
});

describe('AssignmentFormDialog hierarchy contract', () => {
  it('submits null when optional maximum score is blank', () => {
    const submitted: Array<{ name: string; maxScore: number | null }> = [];
    const container = render(
      <AssignmentFormDialog
        open
        onOpenChange={() => undefined}
        mode="create"
        onSubmit={(value) => {
          submitted.push(value);
        }}
      />,
    );

    setInputValue(inputAt(container, 0), ' Fractions worksheet ');
    setInputValue(inputAt(container, 1), '');
    submit(container);

    expect(submitted).toEqual([{ name: 'Fractions worksheet', maxScore: null }]);
  });

  it.each([
    { label: 'negative maximum score', value: '-1' },
    { label: 'maximum score with more than two decimals', value: '10.001' },
  ])('rejects $label', ({ value }) => {
    const submitted: Array<{ name: string; maxScore: number | null }> = [];
    const container = render(
      <AssignmentFormDialog
        open
        onOpenChange={() => undefined}
        mode="rename"
        initialName="Fractions worksheet"
        onSubmit={(formValue) => {
          submitted.push(formValue);
        }}
      />,
    );

    setInputValue(inputAt(container, 0), 'Fractions worksheet');
    setInputValue(inputAt(container, 1), value);
    submit(container);

    expect(submitted).toEqual([]);
  });

  it.each([
    { label: 'blank', value: '   ' },
    { label: 'longer than 200 characters', value: 'a'.repeat(201) },
  ])('rejects a $label required assignment name', ({ value }) => {
    const submitted: Array<{ name: string; maxScore: number | null }> = [];
    const container = render(
      <AssignmentFormDialog
        open
        onOpenChange={() => undefined}
        mode="create"
        onSubmit={(formValue) => {
          submitted.push(formValue);
        }}
      />,
    );

    setInputValue(inputAt(container, 0), value);
    setInputValue(inputAt(container, 1), '10');
    submit(container);

    expect(submitted).toEqual([]);
  });
});

const savedChart: SavedSeatingChart = {
  id: 'chart-1',
  classId: 'class-1',
  className: 'Grade 3 · Room 12',
  sourceJobExternalId: 'job-seating-42',
  sourceResultId: 7,
  grid: [
    ['Maya Rodriguez', null],
    ['Jack Thompson', 'Priya Shah'],
  ],
  studentCount: 3,
  createdAt: '2026-09-27T12:00:00.000Z',
};

describe('SavedChartPanelView hierarchy contract', () => {
  it('exposes source job id and every seat, including an empty seat, accessibly', () => {
    const container = render(
      <SavedChartPanelView
        open
        onOpenChange={() => undefined}
        chart={savedChart}
        loading={false}
        error={null}
      />,
    );

    expect(container.textContent).toContain(savedChart.sourceJobExternalId);

    const seatLabels = Array.from(container.querySelectorAll<HTMLElement>('[aria-label]'))
      .map((element) => element.getAttribute('aria-label') ?? '')
      .filter((label) => /\bseat\b|\brow\b/i.test(label));

    expect(seatLabels).toHaveLength(savedChart.grid.flat().length);
    for (const name of savedChart.grid.flat().filter((seat): seat is string => seat !== null)) {
      expect(seatLabels.some((label) => label.includes(name))).toBe(true);
    }
    expect(seatLabels.filter((label) => /empty|unassigned|available|no (student|name)/i.test(label))).toHaveLength(1);
  });
});

const rosterStudents: StudentRecord[] = [
  {
    id: 'student-1',
    classId: 'class-1',
    name: 'Maya Rodriguez',
    status: 'active',
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
    removedAt: null,
  },
];

describe('RosterPanelView archived/read-only contract', () => {
  it('exposes no enabled Add, Rename, Remove, or Delete-data controls when read-only', () => {
    const container = render(
      <RosterPanelView students={rosterStudents} readOnly />,
    );

    const mutationControlPattern = /add|rename|remove|delete(?:\s|-)?data/i;
    const enabledMutationControls = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button, [role="button"]'),
    ).filter((control) => {
      const label = `${control.textContent ?? ''} ${control.getAttribute('aria-label') ?? ''}`;
      return (
        !control.hasAttribute('disabled') &&
        control.getAttribute('aria-disabled') !== 'true' &&
        mutationControlPattern.test(label)
      );
    });

    expect(enabledMutationControls).toEqual([]);
  });
});
