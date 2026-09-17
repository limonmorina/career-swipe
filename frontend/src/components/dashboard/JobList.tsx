'use client';

import type { DiscoveredJob, JobFeedFilter } from '@/types/job';

type JobListProps = {
  jobs: DiscoveredJob[];
  loading: boolean;
  filter: JobFeedFilter;
  selectedJobId: string | null;
  matchScores: Record<string, number>;
  onFilterChange: (filter: JobFeedFilter) => void;
  onSelectJob: (job: DiscoveredJob) => void;
};

function statusLabel(status: string): string {
  if (!status) return 'Discovered';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function matchBadgeClass(score: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-800';
  if (score >= 60) return 'bg-amber-100 text-amber-900';
  return 'bg-rose-100 text-rose-800';
}

export function JobList({
  jobs,
  loading,
  filter,
  selectedJobId,
  matchScores,
  onFilterChange,
  onSelectJob,
}: JobListProps) {
  const tabs: { id: JobFeedFilter; label: string }[] = [
    { id: 'all', label: 'All Jobs' },
    { id: 'easy_apply', label: 'Easy Apply Only' },
    { id: 'reviewed', label: 'Tailored / Reviewed' },
  ];

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onFilterChange(tab.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-teal-700 text-white'
                  : 'bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl bg-white/70 ring-1 ring-zinc-200"
            />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl bg-white/80 p-8 text-center ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-600">
            No jobs match this filter yet. Run the discovery worker to populate the feed.
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {jobs.map((job) => {
            const selected = selectedJobId === job.id;
            const score = matchScores[job.id];
            return (
              <li key={job.id}>
                <button
                  type="button"
                  onClick={() => onSelectJob(job)}
                  className={`w-full rounded-xl bg-white p-4 text-left shadow-sm ring-1 transition ${
                    selected
                      ? 'ring-teal-600'
                      : 'ring-zinc-200 hover:ring-zinc-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-zinc-900">
                        {job.title}
                      </h3>
                      <p className="mt-0.5 truncate text-sm text-zinc-600">
                        {job.company}
                        {job.location ? ` · ${job.location}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {typeof score === 'number' && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${matchBadgeClass(score)}`}
                        >
                          {score}%
                        </span>
                      )}
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                        {statusLabel(job.status)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.isEasyApply && (
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-teal-100">
                        Easy Apply
                      </span>
                    )}
                    <span className="text-xs text-zinc-500">
                      Discovered{' '}
                      {job.createdAt
                        ? new Date(job.createdAt).toLocaleDateString()
                        : '—'}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
