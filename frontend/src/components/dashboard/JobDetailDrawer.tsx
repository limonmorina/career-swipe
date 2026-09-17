'use client';

import type { DiscoveredJob } from '@/types/job';
import type { MasterProfile } from '@/types/profile';
import type { TailorResult } from '@/types/tailor';
import { ProposalWorkbench } from '@/components/dashboard/ProposalWorkbench';

type JobDetailDrawerProps = {
  job: DiscoveredJob | null;
  open: boolean;
  profile: MasterProfile;
  tailorResult: TailorResult | null;
  coverLetter: string;
  analyzing: boolean;
  error: string | null;
  onClose: () => void;
  onAnalyze: () => void;
  onCoverLetterChange: (value: string) => void;
  onJobApproved: (jobId: string) => void;
};

function matchBadgeClass(score: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
  if (score >= 60) return 'bg-amber-100 text-amber-900 ring-amber-200';
  return 'bg-rose-100 text-rose-800 ring-rose-200';
}

export function JobDetailDrawer({
  job,
  open,
  profile,
  tailorResult,
  coverLetter,
  analyzing,
  error,
  onClose,
  onAnalyze,
  onCoverLetterChange,
  onJobApproved,
}: JobDetailDrawerProps) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-zinc-950/40 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-[#f7f5f1] shadow-2xl transition-transform duration-300 ease-out sm:max-w-2xl ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        {!job ? null : (
          <>
            <header className="border-b border-zinc-200 bg-white/80 px-5 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-teal-800">
                    Job detail
                  </p>
                  <h2 className="mt-1 truncate text-xl font-semibold text-zinc-900">
                    {job.title}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600">
                    {job.company}
                    {job.location ? ` · ${job.location}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100"
                >
                  Close
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {job.isEasyApply && (
                  <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 ring-1 ring-teal-100">
                    Easy Apply
                  </span>
                )}
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                  {job.status}
                </span>
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-teal-800 underline-offset-2 hover:underline"
                  >
                    Open on LinkedIn
                  </a>
                )}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <section className="mb-6">
                <h3 className="text-sm font-semibold text-zinc-900">Description</h3>
                <div className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-4 text-sm leading-6 text-zinc-700 ring-1 ring-zinc-200">
                  {job.description || 'No description available for this listing.'}
                </div>
              </section>

              <div className="mb-6">
                <button
                  type="button"
                  onClick={onAnalyze}
                  disabled={analyzing}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {analyzing ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Analyzing with Gemini…
                    </>
                  ) : (
                    'Analyze & Tailor with Gemini'
                  )}
                </button>
                {error && (
                  <p className="mt-2 text-sm text-rose-700" role="alert">
                    {error}
                  </p>
                )}
              </div>

              {analyzing && !tailorResult && (
                <div className="mb-6 space-y-3">
                  <div className="h-16 animate-pulse rounded-xl bg-white ring-1 ring-zinc-200" />
                  <div className="h-28 animate-pulse rounded-xl bg-white ring-1 ring-zinc-200" />
                  <div className="h-40 animate-pulse rounded-xl bg-white ring-1 ring-zinc-200" />
                </div>
              )}

              {tailorResult && (
                <section className="mb-8 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${matchBadgeClass(tailorResult.matchScore)}`}
                    >
                      Match Score {tailorResult.matchScore}%
                    </span>
                  </div>

                  <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
                    <h3 className="text-sm font-semibold text-zinc-900">
                      Match Analysis
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-700">
                      {tailorResult.matchAnalysis}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="cover-letter"
                      className="text-sm font-semibold text-zinc-900"
                    >
                      Cover Letter Draft
                    </label>
                    <textarea
                      id="cover-letter"
                      value={coverLetter}
                      onChange={(e) => onCoverLetterChange(e.target.value)}
                      rows={10}
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm leading-6 text-zinc-800 outline-none ring-teal-700/0 transition focus:ring-2 focus:ring-teal-700/30"
                    />
                  </div>

                  <ProposalWorkbench
                    key={`${job.id}-${tailorResult.proposals.map((p) => p.id).join('-')}`}
                    job={job}
                    profile={profile}
                    proposals={tailorResult.proposals}
                    onApproved={onJobApproved}
                  />
                </section>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
