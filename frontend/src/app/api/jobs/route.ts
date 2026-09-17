import { NextRequest, NextResponse } from 'next/server';
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
    matchScore:
      typeof row.match_score === 'number' ? (row.match_score as number) : null,
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

type PatchBody = {
  id?: string;
  jobId?: string;
  matchScore?: number;
  status?: string;
  resumeUrl?: string;
};

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as PatchBody;
    const { id, jobId, matchScore, status, resumeUrl } = body;

    if (!id && !jobId) {
      return NextResponse.json(
        { error: 'Missing required field: id or jobId' },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (typeof matchScore === 'number') updates.match_score = matchScore;
    if (status) updates.status = status;
    if (resumeUrl) updates.resume_url = resumeUrl;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    let query = supabase.from('jobs').update(updates);
    query = id ? query.eq('id', id) : query.eq('job_id', jobId!);

    const { data, error } = await query.select('*').maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
