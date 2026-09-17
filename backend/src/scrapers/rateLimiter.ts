import type { Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';

export class DailyCapReachedError extends Error {
  readonly appliedToday: number;
  readonly maxDaily: number;

  constructor(appliedToday: number, maxDaily: number) {
    super(
      `Daily application cap reached (${appliedToday}/${maxDaily}). Pausing further submissions.`
    );
    this.name = 'DailyCapReachedError';
    this.appliedToday = appliedToday;
    this.maxDaily = maxDaily;
  }
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

export function getMaxDailyApplications(): number {
  const raw = process.env.MAX_DAILY_APPLICATIONS || '15';
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
}

/**
 * Sleep for a randomized interval to emulate human pacing.
 */
export async function randomDelay(minMs = 2000, maxMs = 5000): Promise<number> {
  const min = Math.max(0, Math.min(minMs, maxMs));
  const max = Math.max(minMs, maxMs);
  const delay = Math.floor(min + Math.random() * (max - min + 1));
  await new Promise((resolve) => setTimeout(resolve, delay));
  return delay;
}

/**
 * Subtle mouse movement and non-linear scrolling before interactions.
 */
export async function simulateHumanBehavior(page: Page): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };

  try {
    const startX = Math.floor(viewport.width * (0.2 + Math.random() * 0.2));
    const startY = Math.floor(viewport.height * (0.25 + Math.random() * 0.2));
    await page.mouse.move(startX, startY, { steps: 8 + Math.floor(Math.random() * 8) });

    const midX = startX + Math.floor((Math.random() - 0.5) * 180);
    const midY = startY + Math.floor((Math.random() - 0.5) * 120);
    await page.mouse.move(midX, midY, { steps: 6 + Math.floor(Math.random() * 6) });

    const scrollDelta =
      Math.floor(120 + Math.random() * 280) * (Math.random() > 0.35 ? 1 : -1);
    await page.mouse.wheel(0, scrollDelta);
    await randomDelay(350, 900);

    if (Math.random() > 0.45) {
      await page.mouse.wheel(0, -Math.floor(scrollDelta * (0.3 + Math.random() * 0.4)));
      await randomDelay(200, 600);
    }
  } catch (error) {
    console.warn('simulateHumanBehavior skipped', {
      url: page.url(),
      error,
    });
  }
}

/**
 * Guard against exceeding the daily LinkedIn application safety cap.
 */
export async function checkDailyApplicationCap(
  userId: string,
  maxDaily = getMaxDailyApplications()
): Promise<{ appliedToday: number; maxDaily: number }> {
  const supabase = getSupabaseAdmin();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Prefer applied_at when present; fall back to created_at for older rows
  const { count, error } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'applied')
    .gte('applied_at', startOfDay.toISOString());

  if (error) {
    // Fallback if applied_at filter fails on older schemas
    console.warn('applied_at daily cap query failed; falling back', error);
    const fallback = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'applied')
      .gte('created_at', startOfDay.toISOString());

    if (fallback.error) throw fallback.error;

    const appliedToday = fallback.count ?? 0;
    if (appliedToday >= maxDaily) {
      throw new DailyCapReachedError(appliedToday, maxDaily);
    }
    return { appliedToday, maxDaily };
  }

  const appliedToday = count ?? 0;
  if (appliedToday >= maxDaily) {
    console.warn('Daily application cap reached', {
      userId,
      appliedToday,
      maxDaily,
    });
    throw new DailyCapReachedError(appliedToday, maxDaily);
  }

  return { appliedToday, maxDaily };
}

export async function pauseBeforeInteraction(page: Page): Promise<void> {
  await simulateHumanBehavior(page);
  await randomDelay();
}
