import { NextRequest, NextResponse } from 'next/server';
import {
  generateAtsPdf,
  type ApprovedProposal,
} from '@/lib/pdf';
import type { MasterProfile } from '@/types/profile';

export const runtime = 'nodejs';

type PdfRequestBody = {
  profile?: MasterProfile;
  approvedProposals?: Record<string, ApprovedProposal>;
  jobId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PdfRequestBody;
    const { profile, approvedProposals, jobId } = body;

    if (!profile || !approvedProposals || !jobId) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: profile, approvedProposals, or jobId',
        },
        { status: 400 }
      );
    }

    const publicUrl = await generateAtsPdf(profile, approvedProposals, jobId);

    return NextResponse.json({ success: true, data: { publicUrl } });
  } catch (error: unknown) {
    console.error('PDF API Route Error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
