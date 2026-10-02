// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DocumentProcessingResponse,
  ProcessingCounts,
  ProcessingPageItem,
  RetranscribeDocumentBody,
} from '@classprints/assignment-reader-shared';

import { ProcessingDetailView } from '../src/components/assignment-reader/processing-detail-view';
import {
  formatElapsed,
  isDocumentSettled,
} from '../src/components/assignment-reader/processing-detail';
import { processingRefetchInterval } from '../src/hooks/use-processing-poll';
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

function makeCounts(overrides: Partial<ProcessingCounts> = {}): ProcessingCounts {
  const counts: ProcessingCounts = {
    uploading: 0,
    queued: 0,
    transcribing: 0,
    completed: 0,
    failed: 0,
    total: 0,
    ...overrides,
  };
  counts.total =
    counts.uploading + counts.queued + counts.transcribing + counts.completed + counts.failed;
  return counts;
}

function makePage(overrides: Partial<ProcessingPageItem> = {}): ProcessingPageItem {
  return {
    id: 'page-1',
    documentType: 'submission',
    documentId: 'document-1',
    position: 1,
    label: 'Maya Rodriguez · Page 1',
    processingState: 'completed',
    attemptCount: 1,
    queuedAt: '2026-09-28T09:00:00.000Z',
    startedAt: '2026-09-28T09:00:01.000Z',
    completedAt: '2026-09-28T09:00:12.000Z',
    uploadedAt: '2026-09-28T08:59:00.000Z',
    failure: null,
    draftAvailable: true,
    pageRevision: 1,
    contentRevision: 1,
    reviewedContentRevision: null,
    editedByTeacher: false,
    teacherEditCount: 0,
    elapsedFromQueuedMs: 11_000,
    workspacePath: '/documents/submission/document-1/pages/page-1',
    ...overrides,
  };
}

function makeResponse(
  pages: ProcessingPageItem[],
  processingState: DocumentProcessingResponse['processingState'],
  processingCounts: ProcessingCounts,
): DocumentProcessingResponse {
  return {
    data: pages,
    pagination: {
      page: 1,
      pageSize: 10,
      totalItems: pages.length,
      totalPages: pages.length === 0 ? 0 : 1,
    },
    documentType: 'submission',
    documentId: 'document-1',
    documentRevision: 7,
    processingState,
    processingCounts,
    reviewState: null,
  };
}


const mixedPages: ProcessingPageItem[] = [
  makePage({ id: 'page-completed', label: 'Maya Rodriguez · Page 1' }),
  makePage({
    id: 'page-failed',
    position: 2,
    label: 'Maya Rodriguez · Page 2',
    processingState: 'failed',
    completedAt: null,
    failure: {
      code: 'provider_timeout',
      message: 'Transcription timed out. Retry this page.',
      retryAllowed: true,
      replacementRecommended: false,
    },
    draftAvailable: false,
    elapsedFromQueuedMs: null,
    workspacePath: null,
  }),
];

const mixedResponse = makeResponse(
  mixedPages,
  'failed',
  makeCounts({ completed: 1, failed: 1 }),
);


function renderDetail(
  response: DocumentProcessingResponse,
  controls: {
    hasTeacherEdits: boolean;
    hasQuestionJudgments: boolean;
    documentRevision: number;
  },
  overrides: Partial<{
    onRetryPage: (pageId: string) => void;
    onRetranscribe: (body: RetranscribeDocumentBody) => void;
  }> = {},
): HTMLDivElement {
  const baseProps = {
    response,
    readOnly: false,
    onReviewPage: vi.fn(),
    onRetryPage: vi.fn(),
    onReplacePage: vi.fn(),
    onRetranscribe: vi.fn(),
    onRetryConfirmDelivery: vi.fn(),
    retryPendingPageId: null,
    replacePendingPageId: null,
    retranscribeControls: controls,
    ...overrides,
  };

  return render(<ProcessingDetailView {...baseProps} />);
}

function buttonsMatching(container: HTMLDivElement, pattern: RegExp): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) =>
    pattern.test(`${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`),
  );
}

function checkboxLabel(input: HTMLInputElement): string {
  return `${input.getAttribute('aria-label') ?? ''} ${input.closest('label')?.textContent ?? ''}`;
}

function openRetranscriptionControls(container: HTMLDivElement): void {
  const trigger = buttonsMatching(container, /retranscrib/i).find((button) => !button.disabled);
  if (trigger) {
    act(() => {
      trigger.click();
    });
  }
}

describe('processing helpers', () => {
  it.each([
    ['empty document', makeCounts(), true],
    ['completed pages only', makeCounts({ completed: 2 }), true],
    ['failed pages only', makeCounts({ failed: 1 }), true],
    ['uploading takes precedence over terminal pages', makeCounts({ uploading: 1, completed: 3 }), false],
    ['queued takes precedence over terminal pages', makeCounts({ queued: 1, completed: 3 }), false],
    ['transcribing takes precedence over terminal pages', makeCounts({ transcribing: 1, completed: 3 }), false],
    [
      'any active state keeps document unsettled',
      makeCounts({ uploading: 1, queued: 1, transcribing: 1, completed: 4, failed: 2 }),
      false,
    ],
  ])('reports settled state for %s', (_name, counts, expected) => {
    expect(isDocumentSettled(counts)).toBe(expected);
  });

  it.each([
    [0, '0:00'],
    [999, '0:00'],
    [59_999, '0:59'],
    [60_000, '1:00'],
    [3_599_000, '59:59'],
    [3_600_000, '1:00:00'],
    [3_661_000, '1:01:01'],
  ])('formats %s milliseconds as %s', (milliseconds, expected) => {
    expect(formatElapsed(milliseconds)).toBe(expected);
  });
});
describe('processingRefetchInterval', () => {
  it.each([
    ['visible with unsettled pages', mixedResponse, 'visible', 3_000],
    ['hidden with unsettled pages', mixedResponse, 'hidden', false],
    [
      'visible with settled pages',
      makeResponse(
        [makePage({ id: 'page-completed', label: 'Maya Rodriguez · Page 1' })],
        'completed',
        makeCounts({ completed: 1 }),
      ),
      'visible',
      false,
    ],
    ['visible without response data', undefined, 'visible', false],
  ] as const)('returns expected refetch interval for %s', (_name, response, visibility, expected) => {
    expect(processingRefetchInterval(response, visibility)).toBe(expected);
  });
});
describe('ProcessingDetailView recovery contract', () => {
  it('offers retry only for failed pages, never for completed pages', () => {
    const onRetryPage = vi.fn();
    const container = renderDetail(
      mixedResponse,
      {
        hasTeacherEdits: false,
        hasQuestionJudgments: false,
        documentRevision: mixedResponse.documentRevision,
      },
      { onRetryPage },
    );
    const retryButtons = buttonsMatching(container, /retry page/i);
    expect(retryButtons).toHaveLength(1);

    act(() => {
      retryButtons[0]!.click();
    });
    expect(onRetryPage).toHaveBeenCalledWith('page-failed');
  });

  it('keeps retranscription disabled until every applicable consent is checked', () => {
    const onRetranscribe = vi.fn();
    const container = renderDetail(
      mixedResponse,
      {
        hasTeacherEdits: true,
        hasQuestionJudgments: true,
        documentRevision: mixedResponse.documentRevision,
      },
      { onRetranscribe },
    );

    openRetranscriptionControls(container);

    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(checkboxes).toHaveLength(3);
    const confirmation = checkboxes.find((input) => /confirm/i.test(checkboxLabel(input)));
    const teacherEdits = checkboxes.find((input) => /teacher edit/i.test(checkboxLabel(input)));
    const questionJudgments = checkboxes.find((input) => /question judgment/i.test(checkboxLabel(input)));
    expect(confirmation).toBeDefined();
    expect(teacherEdits).toBeDefined();
    expect(questionJudgments).toBeDefined();

    const submit = buttonsMatching(container, /retranscrib/i).at(-1);
    expect(submit).toBeDefined();
    expect(submit!.disabled).toBe(true);

    act(() => {
      confirmation!.click();
    });
    expect(submit!.disabled).toBe(true);

    act(() => {
      teacherEdits!.click();
    });
    expect(submit!.disabled).toBe(true);

    act(() => {
      questionJudgments!.click();
    });
    expect(submit!.disabled).toBe(false);

    act(() => {
      submit!.click();
    });
    expect(onRetranscribe).toHaveBeenCalledWith({
      expectedDocumentRevision: mixedResponse.documentRevision,
      confirmed: true,
      overwriteTeacherEdits: true,
      resetQuestionJudgments: true,
    });
  });

  it('disables overwrite-teacher-edits consent when no page has teacher edits', () => {
    const response = makeResponse(
      [makePage({ id: 'page-completed', label: 'Maya Rodriguez · Page 1' })],
      'completed',
      makeCounts({ completed: 1 }),
    );
    const onRetranscribe = vi.fn();
    const container = renderDetail(
      response,
      {
        hasTeacherEdits: false,
        hasQuestionJudgments: false,
        documentRevision: response.documentRevision,
      },
      { onRetranscribe },
    );

    openRetranscriptionControls(container);

    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    const confirmation = checkboxes.find((input) => /confirm/i.test(checkboxLabel(input)));
    const teacherEdits = checkboxes.find((input) => /teacher edit/i.test(checkboxLabel(input)));
    const questionJudgments = checkboxes.find((input) => /question judgment/i.test(checkboxLabel(input)));
    expect(confirmation).toBeDefined();
    expect(teacherEdits).toBeDefined();
    expect(questionJudgments).toBeDefined();
    expect(teacherEdits!.disabled).toBe(true);
    expect(teacherEdits!.checked).toBe(false);
    expect(questionJudgments!.disabled).toBe(true);
    expect(questionJudgments!.checked).toBe(false);

    const submit = buttonsMatching(container, /retranscrib/i).at(-1);
    expect(submit).toBeDefined();
    expect(submit!.disabled).toBe(true);

    act(() => {
      confirmation!.click();
    });
    expect(submit!.disabled).toBe(false);

    act(() => {
      submit!.click();
    });
    expect(onRetranscribe).toHaveBeenCalledWith({
      expectedDocumentRevision: response.documentRevision,
      confirmed: true,
      overwriteTeacherEdits: false,
      resetQuestionJudgments: false,
    });
  });
});
