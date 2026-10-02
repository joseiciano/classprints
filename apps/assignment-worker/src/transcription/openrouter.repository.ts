import type { TranscriptionUsage } from '@classprints/assignment-reader-shared';
import { buildSystemPrompt, buildUserPrompt, TRANSCRIPTION_OUTPUT_JSON_SCHEMA, TRANSCRIPTION_TIMEOUT_MS } from './prompt';
import { extractJsonObject } from './json';
import { validateModelOutput, type OutputValidation } from './output-validator';

/**
 * OpenRouter vision repository (TASK-013). Owns all provider access for
 * transcription (GUD-001): chat/completions against the configured
 * primary/fallback model sequence with an AbortController timeout. Text is
 * sent first, then the bounded base64 JPEG data URL (functional-spec §6).
 *
 * Two response paths per REQ-024/DEP-004:
 *  - native structured outputs: `response_format: { type: 'json_schema' }`
 *    plus `provider.require_parameters: true` when the operator-declared
 *    endpoint advertises structured-output support;
 *  - validated-JSON fallback: plain `json_object` response format (Response
 *    Healing on OpenRouter), then the same local validator.
 *
 * The local validator is the enforcement boundary either way. Raw student
 * responses and provider payloads are never logged (SEC-003); callers receive
 * classification and compact validation issues only.
 */

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Per-model provider attempts inside one accepted worker execution; these
 * never increment the page's attemptCount (functional-spec §5). */
const VALIDATION_RETRY_ATTEMPTS_PER_MODEL = 2;

export interface OpenRouterAttemptFailure {
  /** REQ-014 terminal classification for the whole execution. */
  code: 'provider_timeout' | 'provider_rejected' | 'invalid_output';
  /** Compact, content-free description safe for audit rows. */
  message: string;
}

export type OpenRouterAttemptResult =
  | {
      outcome: 'completed';
      output: OutputValidation & { ok: true };
      usage: TranscriptionUsage | null;
      model: string;
    }
  | {
      outcome: 'failed';
      failure: OpenRouterAttemptFailure;
      usage: TranscriptionUsage | null;
      model: string;
    };

export interface OpenRouterDeps {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
}

const readUsage = (usage: ChatUsage | undefined): TranscriptionUsage | null => {
  if (!usage) return null;
  const out: TranscriptionUsage = {};
  if (typeof usage.prompt_tokens === 'number') out.promptTokens = usage.prompt_tokens;
  if (typeof usage.completion_tokens === 'number') out.completionTokens = usage.completion_tokens;
  if (typeof usage.total_tokens === 'number') out.totalTokens = usage.total_tokens;
  if (typeof usage.cost === 'number') out.costUsd = usage.cost;
  return Object.keys(out).length > 0 ? out : null;
};

export class OpenRouterRepository {
  constructor(
    private readonly deps: OpenRouterDeps,
    private readonly models: { primaryModel: string; fallbackModels: string[] },
    /** Whether the configured endpoint advertises structured-output support
     * (operator-verified per REQ-024; see provider-privacy-evidence.md §3). */
    private readonly structuredOutputsSupported: boolean,
  ) {}

  /**
   * Runs the configured model sequence. Validation issues from one attempt
   * feed the next prompt (REQ-012); a non-validation terminal failure stops
   * the sequence immediately. Per-model retries apply only to invalid output.
   */
  async transcribe(input: {
    documentType: 'materials' | 'submission';
    /** Bounded (≤2048 px) JPEG bytes from the Images binding. */
    imageJpeg: Uint8Array;
    isRetry: boolean;
  }): Promise<OpenRouterAttemptResult> {
    const models = [this.models.primaryModel, ...this.models.fallbackModels];
    let lastValidationIssues: string[] = [];
    let lastFailure: OpenRouterAttemptFailure | null = null;
    let lastUsage: TranscriptionUsage | null = null;
    let lastModel = models[0] ?? '';

    for (const model of models) {
      lastModel = model;
      for (let attempt = 1; attempt <= VALIDATION_RETRY_ATTEMPTS_PER_MODEL; attempt += 1) {
        const result = await this.requestOnce({
          model,
          documentType: input.documentType,
          imageJpeg: input.imageJpeg,
          isRetry: input.isRetry,
          validationIssues: lastValidationIssues,
        });
        lastUsage = result.usage ?? lastUsage;
        if (result.kind === 'terminal') {
          // Timeout/rejection aborts the whole sequence: retrying the next
          // model with the same image only re-bills the same failure class.
          return {
            outcome: 'failed',
            failure: result.terminal,
            usage: lastUsage,
            model,
          };
        }
        if (result.kind === 'parse_failure') {
          lastValidationIssues = [result.parseFailure];
          lastFailure = { code: 'invalid_output', message: result.parseFailure };
          continue;
        }
        const validation = validateModelOutput(result.parsed);
        if (validation.ok) {
          return {
            outcome: 'completed',
            output: validation as OutputValidation & { ok: true },
            usage: result.usage ?? lastUsage,
            model,
          };
        }
        lastValidationIssues = validation.issues;
        lastFailure = { code: 'invalid_output', message: 'Model output failed schema validation' };
      }
    }
    return {
      outcome: 'failed',
      failure: lastFailure ?? { code: 'invalid_output', message: 'All configured models failed' },
      usage: lastUsage,
      model: lastModel,
    };
  }

  private async requestOnce(input: {
    model: string;
    documentType: 'materials' | 'submission';
    imageJpeg: Uint8Array;
    isRetry: boolean;
    validationIssues: string[];
  }): Promise<
    | { kind: 'terminal'; terminal: OpenRouterAttemptFailure; usage: TranscriptionUsage | null }
    | { kind: 'parse_failure'; parseFailure: string; usage: TranscriptionUsage | null }
    | { kind: 'parsed'; parsed: unknown; usage: TranscriptionUsage | null }
  > {
    const base64 = arrayBufferToBase64(input.imageJpeg);
    const responseFormat: Record<string, unknown> = this.structuredOutputsSupported
      ? {
          type: 'json_schema',
          json_schema: {
            name: 'transcription_output',
            strict: true,
            schema: TRANSCRIPTION_OUTPUT_JSON_SCHEMA,
          },
        }
      : { type: 'json_object' };

    const payload = {
      model: input.model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        {
          role: 'user',
          content: [
            // OpenRouter documented ordering preference: text first, then the
            // image part (functional-spec §6).
            { type: 'text', text: buildUserPrompt(input.documentType, input.validationIssues) },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
          ],
        },
      ],
      response_format: responseFormat,
      provider: this.structuredOutputsSupported
        ? { require_parameters: true }
        : undefined,
      temperature: 0,
      include_reasoning: false,
    };

    const fetchImpl = this.deps.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);
    try {
      const response = await fetchImpl(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.deps.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          kind: 'terminal',
          terminal: {
            code: response.status === 408 || response.status >= 500 ? 'provider_timeout' : 'provider_rejected',
            message: `Provider responded ${response.status}`,
          },
          usage: null,
        };
      }
      const data = (await response.json().catch(() => null)) as
        | { choices?: Array<{ message?: { content?: string | null } }>; usage?: ChatUsage }
        | null;
      const usage = readUsage(data?.usage);
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        return { kind: 'parse_failure', parseFailure: 'Provider returned no content', usage };
      }
      let parsed: unknown;
      try {
        parsed = extractJsonObject(content);
      } catch {
        return { kind: 'parse_failure', parseFailure: 'Provider content was not valid JSON', usage };
      }
      return { kind: 'parsed', parsed, usage };
    } catch (error) {
      const aborted =
        error instanceof Error && (error.name === 'AbortError' || controller.signal.aborted);
      return {
        kind: 'terminal',
        terminal: aborted
          ? { code: 'provider_timeout', message: `Timed out after ${TRANSCRIPTION_TIMEOUT_MS}ms` }
          : { code: 'provider_rejected', message: 'Provider request failed' },
        usage: null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

const arrayBufferToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};
