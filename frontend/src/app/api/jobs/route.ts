import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { DiscoveredJob } from '@/types/job';

function mapJob(row: Record<string, unknown>): DiscoveredJob {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    title: String(row.title ?? ''),
    company: String(row.company ?? ''),
    location: String(row.location ?? ''),
    url: String(row.url ?? ''),
    description: String(row.description ?? ''),
    isEasyApply: Boolean(row.is_easy_apply),
    status: String(row.status ?? 'discovered'),
    createdAt: String(row.created_at ?? ''),
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch jobs', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: (data ?? []).map((row) => mapJob(row as Record<string, unknown>)),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
