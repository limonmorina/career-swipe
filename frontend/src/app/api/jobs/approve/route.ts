import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

type ApproveBody = {
  id?: string;
  jobId?: string;
  queueApplication?: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ApproveBody;
    const { id, jobId, queueApplication = true } = body;

    if (!id && !jobId) {
      return NextResponse.json(
        { error: 'Missing required field: id or jobId' },
        { status: 400 }
      );
    }

    let query = supabase.from('jobs').update({ status: 'approved' });

    if (id) {
      query = query.eq('id', id);
    } else {
      query = query.eq('job_id', jobId!);
    }

    const { data, error } = await query.select('*').maybeSingle();

    if (error) {
      console.error('Failed to approve job', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Placeholder hook for Playwright Easy Apply worker enqueue
    if (queueApplication && data.is_easy_apply) {
      console.log('Queued Easy Apply automation (stub)', {
        id: data.id,
        jobId: data.job_id,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        jobId: data.job_id,
        status: data.status,
        queued: Boolean(queueApplication && data.is_easy_apply),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
