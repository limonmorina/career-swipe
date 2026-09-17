import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  closeAuthenticatedContext,
  createAuthenticatedContext,
  verifyLinkedInSession,
} from '../scrapers/linkedinClient.js';
import { runEasyApply } from '../scrapers/easyApplyEngine.js';
import type {
  Education,
  ExtendedPreferences,
  MasterProfile,
  WorkExperience,
} from '../types/profile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const QUEUE_NAME = 'apply-job';
const ERROR_DIR = path.resolve(__dirname, '../../logs/errors');

export type ApplyJobPayload = {
  jobId: string;
  userId: string;
  headless?: boolean;
  dryRun?: boolean;
};

function getRedisConnection(): Redis {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error(
      'REDIS_URL is missing. BullMQ needs a Redis TCP URL (e.g. rediss://...).'
    );
  }

  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });
}

function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function mapProfile(row: Record<string, unknown>): MasterProfile {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    fullName: String(row.full_name ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    location: String(row.location ?? ''),
    linkedinUrl: (row.linkedin_url as string) || '',
    githubUrl: (row.github_url as string) || '',
    portfolioUrl: (row.portfolio_url as string) || '',
    summary: String(row.summary ?? ''),
    skills: (row.skills as string[]) || [],
    experiences: (row.experiences as WorkExperience[]) || [],
    education: (row.education as Education[]) || [],
    extendedPreferences: (row.extended_preferences as ExtendedPreferences) || {
      workAuthorization: '',
      requiresVisaSponsorship: false,
      visaSponsorshipExplanation: '',
      salaryExpectationMin: 0,
      salaryExpectationTarget: 0,
      currency: 'USD',
      willingToRelocate: false,
      relocationPreferences: '',
      noticePeriodDays: 14,
      preferredWorkType: 'Any',
    },
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

async function resolveResumeUrl(
  supabase: SupabaseClient,
  userId: string,
  linkedInJobId: string,
  storedUrl?: string | null
): Promise<string | null> {
  if (storedUrl) return storedUrl;

  const fileName = `${userId}/${linkedInJobId}_resume.pdf`;
  const { data } = supabase.storage.from('resumes').getPublicUrl(fileName);
  return data.publicUrl || null;
}

async function saveErrorScreenshot(
  pageScreenshot: () => Promise<Buffer>,
  linkedInJobId: string
): Promise<string> {
  await fs.mkdir(ERROR_DIR, { recursive: true });
  const screenshotPath = path.join(
    ERROR_DIR,
    `${linkedInJobId}-${Date.now()}.png`
  );
  const buffer = await pageScreenshot();
  await fs.writeFile(screenshotPath, buffer);
  return screenshotPath;
}

const connection = getRedisConnection();

export const applyJobQueue = new Queue<ApplyJobPayload>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 2,
    backoff: { type: 'exponential', delay: 8_000 },
  },
});

export async function processApplyJob(
  job: Job<ApplyJobPayload>
): Promise<{ status: string; submitted: boolean; dryRun: boolean }> {
  const {
    jobId: linkedInJobId,
    userId,
    headless = true,
    dryRun,
  } = job.data;

  const supabase = getSupabaseAdmin();

  const { data: jobRow, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('job_id', linkedInJobId)
    .maybeSingle();

  if (jobError) throw jobError;
  if (!jobRow) {
    throw new Error(`Job not found for job_id=${linkedInJobId}`);
  }

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profileRow) {
    throw new Error(`Profile not found for user_id=${userId}`);
  }

  const profile = mapProfile(profileRow as Record<string, unknown>);
  const resumeUrl = await resolveResumeUrl(
    supabase,
    userId,
    linkedInJobId,
    (jobRow.resume_url as string) || null
  );

  const session = await createAuthenticatedContext({ headless });

  try {
    const valid = await verifyLinkedInSession(session.page);
    if (!valid) {
      throw new Error('LinkedIn session invalid. Refresh LINKEDIN_SESSION_COOKIE.');
    }

    const result = await runEasyApply(session.page, {
      jobId: linkedInJobId,
      profile,
      resumeUrl,
      jobTitle: String(jobRow.title ?? ''),
      company: String(jobRow.company ?? ''),
      jobDescription: String(jobRow.description ?? ''),
      dryRun,
    });

    if (result.submitted) {
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          status: 'applied',
          applied_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('job_id', linkedInJobId);

      if (updateError) throw updateError;
    } else if (result.dryRun) {
      console.log('Dry-run apply finished without submission', {
        linkedInJobId,
        screenshotPath: result.screenshotPath,
      });
    }

    return {
      status: result.submitted ? 'applied' : 'approved',
      submitted: result.submitted,
      dryRun: result.dryRun,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('apply-job failed', { linkedInJobId, userId, message });

    let screenshotPath: string | undefined;
    try {
      screenshotPath = await saveErrorScreenshot(
        () => session.page.screenshot({ fullPage: true }),
        linkedInJobId
      );
      console.error('Saved apply error screenshot', { screenshotPath });
    } catch (screenshotError) {
      console.error('Failed to capture apply error screenshot', screenshotError);
    }

    await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error_message: message.slice(0, 2000),
        last_error_at: new Date().toISOString(),
      })
      .eq('job_id', linkedInJobId);

    throw error;
  } finally {
    await closeAuthenticatedContext(session);
  }
}

export const applyJobWorker = new Worker<ApplyJobPayload>(
  QUEUE_NAME,
  async (job) => processApplyJob(job),
  { connection, concurrency: 1 }
);

applyJobWorker.on('completed', (job, result) => {
  console.log('apply-job completed', { id: job.id, result });
});

applyJobWorker.on('failed', (job, error) => {
  console.error('apply-job worker failed', { id: job?.id, error });
});

export async function enqueueApplyJob(
  payload: ApplyJobPayload
): Promise<string | undefined> {
  const job = await applyJobQueue.add('apply', payload);
  return job.id;
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  console.log('apply-job worker listening...');
  console.log(
    `DRY_RUN=${String(process.env.DRY_RUN || 'true')} (set DRY_RUN=false to submit)`
  );
}
