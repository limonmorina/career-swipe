import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createClient } from '@supabase/supabase-js';
import {
  closeAuthenticatedContext,
  createAuthenticatedContext,
  verifyLinkedInSession,
} from '../scrapers/linkedinClient.js';
import { scrapeJobSearchResults } from '../scrapers/linkedinScraper.js';
import type { ScrapedJob, SearchOptions } from '../types/job.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const QUEUE_NAME = 'job-discovery';

export type DiscoveryJobPayload = {
  keywords: string;
  location: string;
  limit?: number;
  easyApplyOnly?: boolean;
  headless?: boolean;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing. Set it in the root .env file.`);
  }
  return value;
}

function getRedisConnection(): Redis {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error(
      'REDIS_URL is missing. BullMQ needs a Redis TCP URL (e.g. rediss://...). Upstash REST URL is not supported.'
    );
  }

  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });
}

function getSupabaseAdmin() {
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

const connection = getRedisConnection();

export const jobDiscoveryQueue = new Queue<DiscoveryJobPayload>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 2,
    backoff: { type: 'exponential', delay: 5_000 },
  },
});

async function persistScrapedJobs(jobs: ScrapedJob[]): Promise<{
  inserted: number;
  skipped: number;
}> {
  if (jobs.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  const supabase = getSupabaseAdmin();
  const jobIds = jobs.map((job) => job.jobId);

  const { data: existing, error: existingError } = await supabase
    .from('jobs')
    .select('job_id')
    .in('job_id', jobIds);

  if (existingError) {
    throw existingError;
  }

  const existingIds = new Set((existing ?? []).map((row) => row.job_id as string));
  const freshJobs = jobs.filter((job) => !existingIds.has(job.jobId));

  if (freshJobs.length === 0) {
    return { inserted: 0, skipped: jobs.length };
  }

  const payload = freshJobs.map((job) => ({
    job_id: job.jobId,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    description: job.description,
    is_easy_apply: job.isEasyApply,
    status: 'discovered',
  }));

  const { error: insertError } = await supabase.from('jobs').insert(payload);

  if (insertError) {
    // Unique race: treat conflicts as skipped duplicates
    if (insertError.code === '23505') {
      console.warn('Duplicate job_id conflict during insert; treating as skipped', insertError);
      return { inserted: 0, skipped: jobs.length };
    }
    throw insertError;
  }

  return {
    inserted: freshJobs.length,
    skipped: jobs.length - freshJobs.length,
  };
}

export async function processDiscoveryJob(
  job: Job<DiscoveryJobPayload>
): Promise<{ scraped: number; inserted: number; skipped: number }> {
  const {
    keywords,
    location,
    limit = 10,
    easyApplyOnly = true,
    headless = true,
  } = job.data;

  console.log('Processing job-discovery', {
    jobId: job.id,
    keywords,
    location,
    limit,
    easyApplyOnly,
  });

  const session = await createAuthenticatedContext({ headless });

  try {
    const isValid = await verifyLinkedInSession(session.page);
    if (!isValid) {
      throw new Error('LinkedIn session is invalid. Refresh LINKEDIN_SESSION_COOKIE.');
    }

    const searchOptions: SearchOptions = {
      keywords,
      location,
      easyApplyOnly,
      limit,
    };

    const scraped = await scrapeJobSearchResults(session.page, searchOptions, limit);
    const { inserted, skipped } = await persistScrapedJobs(scraped);

    console.log('job-discovery complete', {
      jobId: job.id,
      scraped: scraped.length,
      inserted,
      skipped,
    });

    return { scraped: scraped.length, inserted, skipped };
  } finally {
    await closeAuthenticatedContext(session);
  }
}

export const jobDiscoveryWorker = new Worker<DiscoveryJobPayload>(
  QUEUE_NAME,
  async (job) => processDiscoveryJob(job),
  { connection, concurrency: 1 }
);

jobDiscoveryWorker.on('completed', (job, result) => {
  console.log('Worker completed', { id: job.id, result });
});

jobDiscoveryWorker.on('failed', (job, error) => {
  console.error('Worker failed', { id: job?.id, error });
});

export async function enqueueJobDiscovery(
  payload: DiscoveryJobPayload
): Promise<string | undefined> {
  // Touch env early so misconfig fails before enqueue
  requireEnv('LINKEDIN_SESSION_COOKIE');

  const job = await jobDiscoveryQueue.add('discover', payload);
  return job.id;
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  console.log('job-discovery worker listening...');

  const maybeSeed = process.env.SEED_DISCOVERY_ON_START === 'true';
  if (maybeSeed) {
    enqueueJobDiscovery({
      keywords: process.env.SEED_KEYWORDS || 'Software Engineer',
      location: process.env.SEED_LOCATION || 'Remote',
      limit: Number(process.env.SEED_LIMIT || 5),
      easyApplyOnly: true,
      headless: true,
    })
      .then((id) => console.log('Seeded discovery job', id))
      .catch((error) => console.error('Failed to seed discovery job', error));
  }
}
