import type { MessageBatch } from '@cloudflare/workers-types';
import type { SeatingJobQueueMessage } from '@classprints/seating-shared';
import { EmailJobStore, checkEmailDeliveryEligibility } from './db/queries';
import { buildEmailContent } from './email/formatter';
import { EmailSender } from './email/sender';
import type { EmailWorkerBindings, JobRecord, SeatingResult } from './types';
import { buildArrangementGridLog } from './utils/arrangement-log';
import { Metrics } from './utils/metrics';
import { createDb, type Sql } from './lib/db';

export default {
  async queue(batch: MessageBatch<SeatingJobQueueMessage>, env: EmailWorkerBindings) {
    const sql = createDb(env);
    const store = new EmailJobStore(sql);
    const sender = new EmailSender(env.RESEND_API_KEY, env.RESEND_FROM_EMAIL);
    const metrics = new Metrics(env.ANALYTICS);

    for (const message of batch.messages) {
      try {
        await processEmailMessage(message.body, store, sender, metrics, sql);
        message.ack();
      } catch (error) {
        console.error('Email worker failed', error);
        await message.retry();
      }
    }
  },
};

const processEmailMessage = async (
  body: SeatingJobQueueMessage,
  store: EmailJobStore,
  sender: EmailSender,
  metrics: Metrics,
  sql: Sql,
): Promise<void> => {
  if (!body?.jobId) return;
  const job = await store.getJob(body.jobId);
  if (!job) return;
  if (job.status !== 'completed' && job.status !== 'failed') return;
  if (job.emailSentAt) return;

  const eligibility = await checkEmailDeliveryEligibility(sql, job.userId);
  if (eligibility !== 'eligible') {
    console.log('Email delivery skipped due to eligibility check', {
      jobId: job.id,
      email: job.email,
      reason: eligibility,
    });
    await store.markEmailSent(job.id);
    return;
  }

  const results = await store.getResults(job.id);

  console.log('Job finished — configuration summary before sending email', {
    jobId: job.id,
    email: job.email,
    studentCount: job.students.length,
    conflictCount: Object.values(job.conflicts).reduce((sum, c) => sum + c.length, 0),
    worksWellCount:
      Object.values(job.worksWellWithSoft).reduce((sum, c) => sum + c.length, 0) +
      Object.values(job.worksWellWithStrong).reduce((sum, c) => sum + c.length, 0),
    gridDimensions: `${job.seatingGrid.length}x${job.seatingGrid[0]?.length ?? 0}`,
    maxResults: job.maxResults,
    status: job.status,
    statusMetadata: job.statusMetadata,
    resultsCount: results.length,
  });

  logFinalArrangements(job, results);

  const email = buildEmailContent(job, results);

  try {
    await sender.send({ to: job.email, subject: email.subject, html: email.html });
    await store.markEmailSent(job.id);
    metrics.trackEmailSent(job.id, true);
  } catch (error) {
    metrics.trackEmailSent(job.id, false);
    throw error;
  }
};

const logFinalArrangements = (job: JobRecord, results: SeatingResult[]) => {
  const arrangements = results.map((result, index) => ({
    option: index + 1,
    fitnessScore: result.fitnessScore,
    grid: buildArrangementGridLog(job.seatingGrid, result.arrangement),
  }));

  console.log(
    'Job finished — seating grids prepared for email delivery',
    JSON.stringify(
      {
        jobId: job.id,
        arrangements,
      },
      null,
      2,
    ),
  );
};
