import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_ERROR_DIR = path.resolve(__dirname, '../../logs/errors');

export interface FailureLogContext {
  jobId: string;
  error: unknown;
  selectorKey?: string;
  selector?: string;
  stage?: string;
  extra?: Record<string, unknown>;
}

export interface CapturedFailureArtifacts {
  localScreenshotPath: string;
  localHtmlPath: string;
  screenshotUrl: string | null;
  logId: string | null;
}

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function errorStack(error: unknown): string | null {
  if (error instanceof Error) return error.stack ?? null;
  return null;
}

/**
 * Capture screenshot + DOM HTML locally (and optionally upload), then log to Supabase.
 */
export async function capturePlaywrightFailure(
  page: Page,
  context: FailureLogContext
): Promise<CapturedFailureArtifacts> {
  await fs.mkdir(LOCAL_ERROR_DIR, { recursive: true });

  const timestamp = Date.now();
  const baseName = `error_${context.jobId}_${timestamp}`;
  const localScreenshotPath = path.join(LOCAL_ERROR_DIR, `${baseName}.png`);
  const localHtmlPath = path.join(LOCAL_ERROR_DIR, `${baseName}.html`);

  const screenshotBuffer = await page.screenshot({ fullPage: true });
  await fs.writeFile(localScreenshotPath, screenshotBuffer);

  const html = await page.content();
  await fs.writeFile(localHtmlPath, html, 'utf8');

  console.error('Playwright failure captured', {
    jobId: context.jobId,
    stage: context.stage,
    selectorKey: context.selectorKey,
    selector: context.selector,
    url: page.url(),
    localScreenshotPath,
    localHtmlPath,
    message: errorMessage(context.error),
    stack: errorStack(context.error),
    extra: context.extra,
  });

  let screenshotUrl: string | null = null;
  let logId: string | null = null;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const storagePath = `errors/${baseName}.png`;
      const { error: uploadError } = await supabase.storage
        .from('logs')
        .upload(storagePath, screenshotBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        console.warn('Supabase logs bucket upload failed; keeping local copy', uploadError);
      } else {
        const { data } = supabase.storage.from('logs').getPublicUrl(storagePath);
        screenshotUrl = data.publicUrl;
      }

      const { data: logRow, error: insertError } = await supabase
        .from('application_logs')
        .insert({
          job_id: context.jobId,
          error_message: [
            errorMessage(context.error),
            context.selectorKey ? `selectorKey=${context.selectorKey}` : null,
            context.selector ? `selector=${context.selector}` : null,
            context.stage ? `stage=${context.stage}` : null,
            errorStack(context.error),
          ]
            .filter(Boolean)
            .join('\n'),
          screenshot_url: screenshotUrl,
        })
        .select('id')
        .maybeSingle();

      if (insertError) {
        console.warn('Failed to insert application_logs row', insertError);
      } else {
        logId = (logRow?.id as string) || null;
      }
    } catch (remoteError) {
      console.warn('Remote failure logging skipped', remoteError);
    }
  }

  return {
    localScreenshotPath,
    localHtmlPath,
    screenshotUrl,
    logId,
  };
}

export async function logCapLimitNotice(
  jobId: string,
  message: string
): Promise<void> {
  console.warn('Rate limit notice', { jobId, message });

  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase.from('application_logs').insert({
    job_id: jobId,
    error_message: message,
    screenshot_url: null,
  });

  if (error) {
    console.warn('Failed to log cap notice', error);
  }
}
