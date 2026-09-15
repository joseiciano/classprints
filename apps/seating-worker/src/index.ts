import type { MessageBatch } from '@cloudflare/workers-types';
import type { SeatingJobQueueMessage } from '@classprints/seating-shared';
import type { SeatingGrid } from '@classprints/seating-shared';
import { runGeneticAlgorithm, buildAlgorithmContext } from './genetic-algorithm/algorithm';
import {
  MAX_GENERATIONS,
  MAX_PROCESSING_TIME_MS,
  RELAXED_FITNESS_THRESHOLD,
  RELAXED_FITNESS_WEIGHTS,
  STRICT_FITNESS_THRESHOLD,
  STRICT_FITNESS_WEIGHTS,
  STAGNATION_GENERATION_LIMIT,
} from './genetic-algorithm/settings';
import { decodePopulation, JobStore } from './db/queries';
import type {
  AlgorithmRunMode,
  JobStatusMetadata,
  SeatingWorkerBindings,
  JobRecord,
} from './types';
import { buildArrangementGridLog } from './utils/arrangement-log';
import { Metrics } from './utils/metrics';
import { createDb } from './lib/db';
import type { Sql } from './lib/db';
import { generateLlmArrangement } from './llm/seating-llm';
import { checkEmailDeliveryEligibility } from './db/queries';

export default {
  async queue(batch: MessageBatch<SeatingJobQueueMessage>, env: SeatingWorkerBindings) {
    const sql = createDb(env);
    const store = new JobStore(sql);
    const metrics = new Metrics(env.ANALYTICS);
    const queueName = getQueueName(batch);
    const isDeadLetterQueue = queueName === DEAD_LETTER_QUEUE_NAME;

    for (const message of batch.messages) {
      const start = Date.now();
      if (isDeadLetterQueue) {
        try {
          await handleDeadLetterMessage(message.body, store, metrics);
          message.ack();
        } catch (error) {
          console.error('Seating worker DLQ handler failed', message.body, error);
          await message.retry();
        }
        continue;
      }

      try {
        const generation = await processJobMessage(message.body, store, env, metrics, sql);
        message.ack();
      } catch (error) {
        console.error('Seating worker failed', message.body, error);
        await recordProviderError(store, message.body?.jobId, error);
        await message.retry();
      }
    }
  },
};

const DEAD_LETTER_QUEUE_NAME = 'seating-jobs-dlq';

const getQueueName = (batch: MessageBatch<SeatingJobQueueMessage>): string | undefined =>
  (batch as MessageBatch<SeatingJobQueueMessage> & { queue?: string }).queue;

const processJobMessage = async (
  body: SeatingJobQueueMessage,
  store: JobStore,
  env: SeatingWorkerBindings,
  metrics: Metrics,
  sql: Sql,
): Promise<number | null> => {
  if (!body?.jobId) {
    return null;
  }
  const record = await store.getJobWithState(body.jobId);
  if (!record) {
    return null;
  }
  if (record.job.status !== 'pending') {
    return record.state?.currentGeneration ?? null;
  }

  if (record.job.algorithm === 'llm') {
    return await processLlmJob(record.job, store, env, metrics);
  }

  const invocationStart = Date.now();
  const context = buildAlgorithmContext(record.job);
  const storedState = record.state
    ? {
        population: decodePopulation(record.state.population, record.job.students.length),
        generation: record.state.currentGeneration,
        bestFitness: record.state.bestFitness,
        reseeds: record.state.reseeds,
        stagnantGenerations: record.state.stagnantGenerations,
      }
    : undefined;
  let activeMode: AlgorithmRunMode = record.state?.mode ?? 'strict';
  let strictResult: ReturnType<typeof runGeneticAlgorithm> | null = null;
  let relaxedResult: ReturnType<typeof runGeneticAlgorithm> | null = null;
  let currentResults = record.job.resultsCount;
  let relaxationReason: 'stagnation' | undefined =
    activeMode === 'relaxed' ? 'stagnation' : undefined;

  const timeBudget = () => Math.max(5_000, MAX_PROCESSING_TIME_MS - (Date.now() - invocationStart));

  if (activeMode === 'strict') {
    const availableStrictResults = Math.max(1, record.job.maxResults - currentResults);
    strictResult = runGeneticAlgorithm({
      context,
      state: storedState,
      maxProcessingTimeMs: timeBudget(),
      maxCandidates: availableStrictResults,
      existingResults: currentResults,
      fitnessThreshold: STRICT_FITNESS_THRESHOLD,
      fitnessWeights: STRICT_FITNESS_WEIGHTS,
      stagnationLimit: STAGNATION_GENERATION_LIMIT,
    });
    currentResults = await applyCandidates(
      store,
      metrics,
      record.job.id,
      strictResult.candidates,
      currentResults,
      record.job.maxResults,
    );

    if (strictResult.stagnationHit && currentResults < record.job.maxResults) {
      activeMode = 'relaxed';
      relaxationReason = 'stagnation';
      console.log('Switching to relaxed seating search due to stagnation', {
        jobId: record.job.id,
        currentResults,
        requestedResults: record.job.maxResults,
        bestFitness: strictResult.bestFitness,
      });
      const remainingResults = Math.max(1, record.job.maxResults - currentResults);
      relaxedResult = runGeneticAlgorithm({
        context,
        state: undefined,
        maxProcessingTimeMs: timeBudget(),
        maxCandidates: remainingResults,
        existingResults: currentResults,
        fitnessThreshold: RELAXED_FITNESS_THRESHOLD,
        fitnessWeights: RELAXED_FITNESS_WEIGHTS,
      });
      currentResults = await applyCandidates(
        store,
        metrics,
        record.job.id,
        relaxedResult.candidates,
        currentResults,
        record.job.maxResults,
      );
    }
  } else {
    const relaxedResultsNeeded = Math.max(1, record.job.maxResults - currentResults);
    relaxedResult = runGeneticAlgorithm({
      context,
      state: storedState,
      maxProcessingTimeMs: timeBudget(),
      maxCandidates: relaxedResultsNeeded,
      existingResults: currentResults,
      fitnessThreshold: RELAXED_FITNESS_THRESHOLD,
      fitnessWeights: RELAXED_FITNESS_WEIGHTS,
    });
    currentResults = await applyCandidates(
      store,
      metrics,
      record.job.id,
      relaxedResult.candidates,
      currentResults,
      record.job.maxResults,
    );
  }

  await store.updateJob(record.job.id, { resultsCount: currentResults });

  const finalResult =
    (activeMode === 'relaxed' ? relaxedResult ?? strictResult : strictResult ?? relaxedResult) ??
    null;
  if (!finalResult) {
    return null;
  }

  const shouldComplete = currentResults >= record.job.maxResults || finalResult.hitGenerationCap;

  if (shouldComplete) {
    const completionReason = determineCompletionReason(
      currentResults,
      record.job.maxResults,
      finalResult.hitGenerationCap,
    );
    const statusMetadata: JobStatusMetadata = {
      generationReached: finalResult.generation,
      maxGenerations: MAX_GENERATIONS,
      resultsDelivered: currentResults,
      resultsRequested: record.job.maxResults,
      completionReason,
      relaxed: activeMode === 'relaxed',
      relaxationReason,
    };

    console.log('Job finished — configuration summary', {
      jobId: record.job.id,
      email: record.job.email,
      studentCount: record.job.students.length,
      conflictCount: Object.values(record.job.conflicts).reduce((sum, c) => sum + c.length, 0),
      worksWellCount:
        Object.values(record.job.worksWellWithSoft).reduce((sum, c) => sum + c.length, 0) +
        Object.values(record.job.worksWellWithStrong).reduce((sum, c) => sum + c.length, 0),
      gridDimensions: `${record.job.seatingGrid.length}x${record.job.seatingGrid[0]?.length ?? 0}`,
      maxResults: record.job.maxResults,
      statusMetadata,
    });

    const finalResults = await store.getResults(record.job.id);
    logFinalArrangements(record.job.id, record.job.seatingGrid, finalResults);

    if (completionReason === 'failed_no_results') {
      await store.updateJob(record.job.id, {
        status: 'failed',
        errorMessage: 'Unable to generate a seating arrangement after 800 generations',
        statusMetadata,
        resultsCount: currentResults,
      });
      await store.deleteJobState(record.job.id);
      metrics.trackJobCompleted(
        record.job.id,
        'failed',
        Date.now() - record.job.createdAt,
        currentResults,
      );
      return finalResult.generation;
    }

    await store.updateJob(record.job.id, {
      status: 'completed',
      statusMetadata,
      resultsCount: currentResults,
    });
    await store.deleteJobState(record.job.id);
    if (env.EMAIL_RESULTS_ENABLED === 'true') {
      const eligibility = await checkEmailDeliveryEligibility(sql, record.job.userId);
      if (eligibility === 'eligible') {
        await env.EMAIL_JOBS.send({ jobId: record.job.id });
      } else {
        console.log('Email dispatch skipped due to eligibility check', {
          jobId: record.job.id,
          email: record.job.email,
          reason: eligibility,
        });
      }
    } else {
      console.log('Email dispatch disabled; skipping email queue send', {
        jobId: record.job.id,
      });
    }
    metrics.trackJobCompleted(
      record.job.id,
      'completed',
      Date.now() - record.job.createdAt,
      currentResults,
    );
    return finalResult.generation;
  }

  await store.saveJobState(record.job.id, activeMode, {
    population: finalResult.population,
    generation: finalResult.generation,
    bestFitness: finalResult.bestFitness,
    reseeds: finalResult.reseeds,
    stagnantGenerations: finalResult.stagnantGenerations,
  });

  return finalResult.generation;
};

const handleDeadLetterMessage = async (
  body: SeatingJobQueueMessage,
  store: JobStore,
  metrics: Metrics,
): Promise<void> => {
  if (!body?.jobId) {
    return;
  }
  const record = await store.getJobWithState(body.jobId);
  if (!record) {
    return;
  }
  if (record.job.status !== 'pending') {
    return;
  }

  const statusMetadata: JobStatusMetadata = {
    generationReached: record.state?.currentGeneration ?? 0,
    maxGenerations: MAX_GENERATIONS,
    resultsDelivered: record.job.resultsCount,
    resultsRequested: record.job.maxResults,
    completionReason: 'dropped_from_queue',
  };

  await store.updateJob(record.job.id, {
    status: 'failed',
    errorMessage: record.job.errorMessage ?? 'Dropped from queue',
    statusMetadata,
    resultsCount: record.job.resultsCount,
  });
  await store.deleteJobState(record.job.id);
  metrics.trackJobCompleted(
    record.job.id,
    'failed',
    Date.now() - record.job.createdAt,
    record.job.resultsCount,
  );
};

const recordProviderError = async (
  store: JobStore,
  jobId: string | undefined,
  error: unknown,
): Promise<void> => {
  if (!jobId) {
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  const errorMessage = message ? `Provider error: ${message}` : 'Provider error';
  try {
    await store.updateJob(jobId, { errorMessage });
  } catch (updateError) {
    console.warn('Unable to persist job error message before retry', updateError);
  }
};

const processLlmJob = async (
  job: JobRecord,
  store: JobStore,
  env: SeatingWorkerBindings,
  metrics: Metrics,
): Promise<number | null> => {
  if (!env.LLM_API_KEY) {
    await store.updateJob(job.id, {
      status: 'failed',
      errorMessage: 'LLM_API_KEY not configured',
    });
    metrics.trackJobCompleted(job.id, 'failed', Date.now() - job.createdAt, 0);
    return null;
  }

  console.log(`Starting LLM job processing for job ${job.id}`);

  const maxResults = Math.max(1, job.maxResults);
  let resultsCount = job.resultsCount;
  const start = Date.now();
  const CONCURRENCY_LIMIT = 3;

  // We loop until we have enough results or run out of time
  // Each iteration processes a batch of concurrent requests
  while (resultsCount < maxResults) {
    const timeSpent = Date.now() - start;
    // Check if we have enough time for a full timeout duration + buffer
    if (timeSpent + 16000 > MAX_PROCESSING_TIME_MS) {
      console.log(`Time budget exhausted for job ${job.id}, yielding...`);
      break;
    }

    const remainingNeeded = maxResults - resultsCount;
    const batchSize = Math.min(remainingNeeded, CONCURRENCY_LIMIT);
    console.log(`Starting batch of ${batchSize} LLM requests for job ${job.id}`);

    const tasks = Array.from({ length: batchSize }).map(() =>
      generateLlmArrangement(job, { apiKey: env.LLM_API_KEY! }, 3),
    );

    const outcomes = await Promise.allSettled(tasks);
    let batchSuccesses = 0;

    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') {
        const arrangement = outcome.value;
        const inserted = await store.saveArrangement(job.id, arrangement, 1);
        metrics.trackArrangementSaved(job.id, 1, !inserted);
        if (inserted) {
          batchSuccesses += 1;
          resultsCount += 1;
        }
      } else {
        const errorMessage =
          outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        console.warn(`One LLM request in batch failed for job ${job.id}:`, errorMessage);
        // We log warnings but don't fail the whole job yet, unless we end up with 0 results total
      }
    }

    // If the entire batch failed, we might want to stop early to avoid wasting resources on guaranteed failures
    // (e.g. invalid API key or persistent 400s).
    // However, transient network issues might affect one batch and not the next.
    // For now, we continue unless we've made NO progress and hit specific fatal errors?
    // Actually, simply checking if batchSuccesses === 0 could be a signal, but with temperature > 0, retries might work.
    // Given the time budget check at the top, we will naturally stop when time runs out.

    // Optimization: If we got 0 successes in a batch of 3, maybe we should break to avoid spin-looping?
    // Let's assume if ALL failed, it's bad.
    if (batchSuccesses === 0 && batchSize > 0) {
      console.error(`Entire batch of ${batchSize} failed for job ${job.id}. Stopping processing.`);
      break;
    }
  }

  if (resultsCount === 0) {
    // If we finished (or timed out) with 0 results, mark failed
    await store.updateJob(job.id, {
      status: 'failed',
      errorMessage: 'Unable to generate a valid LLM arrangement after attempts',
      resultsCount,
    });
    metrics.trackJobCompleted(job.id, 'failed', Date.now() - start, resultsCount);
    return null;
  }

  await store.updateJob(job.id, {
    status: 'completed',
    resultsCount,
    errorMessage:
      resultsCount < maxResults
        ? `Generated ${resultsCount} of ${maxResults} requested arrangements`
        : null,
  });
  metrics.trackJobCompleted(job.id, 'completed', Date.now() - start, resultsCount);
  return 0;
};

const determineCompletionReason = (
  delivered: number,
  requested: number,
  hitGenerationCap: boolean,
): JobStatusMetadata['completionReason'] => {
  if (delivered >= requested) return 'target_met';
  if (hitGenerationCap && delivered === 0) return 'failed_no_results';
  return 'max_generations';
};

const logFinalArrangements = (
  jobId: string,
  seatingGrid: SeatingGrid,
  results: { arrangement: (string | null)[][]; fitnessScore: number }[],
) => {
  const arrangements = results.map((result, index) => ({
    option: index + 1,
    fitnessScore: result.fitnessScore,
    grid: buildArrangementGridLog(seatingGrid, result.arrangement),
  }));

  console.log(
    'Job finished — seating grids stored for email processing',
    JSON.stringify(
      {
        jobId,
        arrangements,
      },
      null,
      2,
    ),
  );
};

const applyCandidates = async (
  store: JobStore,
  metrics: Metrics,
  jobId: string,
  candidates: Array<{ arrangement: (string | null)[][]; fitnessScore: number }>,
  currentResults: number,
  maxResults: number,
): Promise<number> => {
  let updatedResults = currentResults;
  for (const candidate of candidates) {
    const inserted = await store.saveArrangement(
      jobId,
      candidate.arrangement,
      candidate.fitnessScore,
    );
    metrics.trackArrangementSaved(jobId, candidate.fitnessScore, !inserted);
    if (inserted) {
      updatedResults += 1;
      if (updatedResults >= maxResults) {
        break;
      }
    }
  }
  return updatedResults;
};
