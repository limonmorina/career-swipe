'use client';

import { useState } from 'react';
import type { DiscoveredJob } from '@/types/job';
import type { MasterProfile } from '@/types/profile';
import type { TailorProposal } from '@/types/tailor';

type ProposalWorkbenchProps = {
  job: DiscoveredJob;
  profile: MasterProfile;
  proposals: TailorProposal[];
  onApproved: (jobId: string) => void;
};

export function ProposalWorkbench({
  job,
  profile,
  proposals,
  onApproved,
}: ProposalWorkbenchProps) {
  const [accepted, setAccepted] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(proposals.map((p) => [p.id, true]))
  );
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>(
    {}
  );
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [approving, setApproving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleAccepted(id: string) {
    setAccepted((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleReasoning(id: string) {
    setExpandedReasoning((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleGeneratePdf() {
    setGeneratingPdf(true);
    setError(null);
    setMessage(null);

    const approvedProposals = Object.fromEntries(
      proposals.map((proposal) => [
        proposal.id,
        {
          originalBullet: proposal.originalBullet,
          proposedBullet: proposal.proposedBullet,
          accepted: Boolean(accepted[proposal.id]),
        },
      ])
    );

    try {
      const response = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          approvedProposals,
          jobId: job.jobId,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to generate PDF');
      }

      setPdfUrl(payload.data.publicUrl as string);
      setMessage('ATS PDF preview ready.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF generation failed');
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/jobs/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: job.id,
          queueApplication: true,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to approve job');
      }

      setMessage(
        payload.data.queued
          ? 'Approved and queued for Easy Apply automation.'
          : 'Job approved for application.'
      );
      onApproved(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setApproving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">
          Proposal Workbench
        </h3>
        <p className="mt-1 text-sm text-zinc-600">
          Accept or reject each suggested bullet before generating your ATS PDF.
        </p>
      </div>

      {proposals.length === 0 ? (
        <div className="rounded-xl bg-white p-4 text-sm text-zinc-600 ring-1 ring-zinc-200">
          No bullet proposals were returned for this role.
        </div>
      ) : (
        <ul className="space-y-3">
          {proposals.map((proposal) => {
            const isAccepted = Boolean(accepted[proposal.id]);
            const showReasoning = Boolean(expandedReasoning[proposal.id]);
            return (
              <li
                key={proposal.id}
                className="rounded-xl bg-white p-4 ring-1 ring-zinc-200"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                    Bullet edit
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleAccepted(proposal.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      isAccepted
                        ? 'bg-emerald-700 text-white'
                        : 'bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    {isAccepted ? 'Accept Edit' : 'Keep Original'}
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 line-through decoration-rose-300">
                    {proposal.originalBullet}
                  </p>
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950">
                    {proposal.proposedBullet}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleReasoning(proposal.id)}
                  className="mt-3 text-xs font-medium text-teal-800 hover:underline"
                >
                  {showReasoning ? 'Hide reasoning' : 'Show reasoning'}
                </button>
                {showReasoning && (
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {proposal.reasoning}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={handleGeneratePdf}
          disabled={generatingPdf}
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {generatingPdf ? 'Generating PDF…' : 'Generate PDF Preview'}
        </button>
        <button
          type="button"
          onClick={handleApprove}
          disabled={approving}
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
        >
          {approving ? 'Approving…' : 'Approve & Queue Application'}
        </button>
      </div>

      {message && <p className="text-sm text-emerald-800">{message}</p>}
      {error && (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}

      {pdfUrl && (
        <div className="overflow-hidden rounded-xl ring-1 ring-zinc-200">
          <div className="flex items-center justify-between bg-white px-3 py-2">
            <p className="text-xs font-medium text-zinc-600">PDF Preview</p>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-teal-800 hover:underline"
            >
              Open in new tab
            </a>
          </div>
          <iframe
            title="ATS resume PDF preview"
            src={pdfUrl}
            className="h-[28rem] w-full bg-white"
          />
        </div>
      )}
    </section>
  );
}
