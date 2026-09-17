import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

type JobRow = {
  id: string;
  status: string | null;
  match_score: number | null;
  applied_at: string | null;
  created_at: string | null;
};

function startOfDayIso(date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function dayKey(iso: string | null): string {
  if (!iso) return 'unknown';
  return new Date(iso).toISOString().slice(0, 10);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export async function GET() {
  try {
    const maxDaily = Number(process.env.MAX_DAILY_APPLICATIONS || 15);

    const { data, error } = await supabase
      .from('jobs')
      .select('id, status, match_score, applied_at, created_at');

    if (error) {
      console.error('Failed to load analytics jobs', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const jobs = (data ?? []) as JobRow[];
    const applied = jobs.filter((j) => j.status === 'applied');
    const failed = jobs.filter((j) => j.status === 'failed');
    const skipped = jobs.filter((j) =>
      ['discovered', 'tailored', 'reviewed', 'approved'].includes(j.status || '')
    );
    const attempted = applied.length + failed.length;

    const todayStart = startOfDayIso();
    const appliedToday = applied.filter(
      (j) => (j.applied_at || j.created_at || '') >= todayStart
    ).length;

    const appliedScores = applied
      .map((j) => j.match_score)
      .filter((n): n is number => typeof n === 'number');
    const skippedScores = skipped
      .map((j) => j.match_score)
      .filter((n): n is number => typeof n === 'number');

    const velocityMap = new Map<string, number>();
    for (const job of applied) {
      const key = dayKey(job.applied_at || job.created_at);
      velocityMap.set(key, (velocityMap.get(key) || 0) + 1);
    }

    const last7: { date: string; count: number; cap: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      last7.push({
        date: key,
        count: velocityMap.get(key) || 0,
        cap: maxDaily,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        totalApplicationsSent: applied.length,
        totalJobs: jobs.length,
        failureRate:
          attempted === 0
            ? 0
            : Math.round((failed.length / attempted) * 1000) / 10,
        appliedToday,
        maxDaily,
        averageMatchApplied: average(appliedScores),
        averageMatchSkipped: average(skippedScores),
        dailyVelocity: last7,
        statusBreakdown: {
          discovered: jobs.filter((j) => j.status === 'discovered').length,
          tailored: jobs.filter((j) => j.status === 'tailored').length,
          approved: jobs.filter((j) => j.status === 'approved').length,
          applied: applied.length,
          failed: failed.length,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
