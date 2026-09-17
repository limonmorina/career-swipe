'use client';

import { useEffect, useState } from 'react';
import { JobList } from '@/components/dashboard/JobList';
import { JobDetailDrawer } from '@/components/dashboard/JobDetailDrawer';
import type { DiscoveredJob, JobFeedFilter } from '@/types/job';
import type { MasterProfile } from '@/types/profile';
import type { TailorResult } from '@/types/tailor';

type DashboardShellProps = {
  profile: MasterProfile;
};

export function DashboardShell({ profile }: DashboardShellProps) {
  const [jobs, setJobs] = useState<DiscoveredJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<JobFeedFilter>('all');
  const [sortMode, setSortMode] = useState<'discovered' | 'match'>('discovered');
  const [selectedJob, setSelectedJob] = useState<DiscoveredJob | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [matchScores, setMatchScores] = useState<Record<string, number>>({});
  const [tailorByJob, setTailorByJob] = useState<Record<string, TailorResult>>({});
  const [coverLetterByJob, setCoverLetterByJob] = useState<Record<string, string>>(
    {}
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      setLoading(true);
      try {
        const response = await fetch('/api/jobs');
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || 'Failed to load jobs');
        }
        if (!cancelled) {
          const loaded = payload.data as DiscoveredJob[];
          setJobs(loaded);
          const scores: Record<string, number> = {};
          for (const job of loaded) {
            if (typeof job.matchScore === 'number') {
              scores[job.id] = job.matchScore;
            }
          }
          setMatchScores(scores);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load jobs');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadJobs();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredJobs = jobs.filter((job) => {
    if (filter === 'easy_apply') return job.isEasyApply;
    if (filter === 'reviewed') {
      return ['tailored', 'reviewed', 'approved'].includes(job.status);
    }
    return true;
  });

  const visibleJobs = [...filteredJobs].sort((a, b) => {
    if (sortMode === 'match') {
      const scoreA = matchScores[a.id] ?? -1;
      const scoreB = matchScores[b.id] ?? -1;
      if (scoreA !== scoreB) return scoreB - scoreA;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  function handleSelectJob(job: DiscoveredJob) {
    setSelectedJob(job);
    setDrawerOpen(true);
    setError(null);
  }

  function handleCloseDrawer() {
    setDrawerOpen(false);
  }

  async function handleAnalyze() {
    if (!selectedJob) return;

    setAnalyzing(true);
    setError(null);

    try {
      const response = await fetch('/api/tailor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: selectedJob.title,
          company: selectedJob.company,
          jobDescription: selectedJob.description,
          profile,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Tailor request failed');
      }

      const result = payload.data as TailorResult;
      setTailorByJob((prev) => ({ ...prev, [selectedJob.id]: result }));
      setCoverLetterByJob((prev) => ({
        ...prev,
        [selectedJob.id]: result.coverLetter || '',
      }));
      setMatchScores((prev) => ({
        ...prev,
        [selectedJob.id]: result.matchScore,
      }));
      setJobs((prev) =>
        prev.map((job) =>
          job.id === selectedJob.id
            ? {
                ...job,
                status: job.status === 'discovered' ? 'tailored' : job.status,
                matchScore: result.matchScore,
              }
            : job
        )
      );
      setSelectedJob((prev) =>
        prev && prev.id === selectedJob.id
          ? {
              ...prev,
              status: prev.status === 'discovered' ? 'tailored' : prev.status,
              matchScore: result.matchScore,
            }
          : prev
      );

      // Persist match score for analytics
      fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedJob.id,
          matchScore: result.matchScore,
          status: 'tailored',
        }),
      }).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyze failed');
    } finally {
      setAnalyzing(false);
    }
  }

  function handleJobApproved(jobRowId: string) {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobRowId ? { ...job, status: 'approved' } : job
      )
    );
    setSelectedJob((prev) =>
      prev && prev.id === jobRowId ? { ...prev, status: 'approved' } : prev
    );
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_#dff3ef_0%,_#f7f5f1_42%,_#efeae2_100%)]">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-800">
                CareerSwipe
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                Job Feed & Match Review
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
                Review discovered roles, run Gemini match analysis, accept resume edits,
                and approve applications for automation.
              </p>
            </div>
            <a
              href="/dashboard/analytics"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Analytics
            </a>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600">
            Signed in as <span className="font-medium text-zinc-900">{profile.fullName}</span>
          </p>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            Sort by
            <select
              value={sortMode}
              onChange={(e) =>
                setSortMode(e.target.value as 'discovered' | 'match')
              }
              className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-teal-700/20"
            >
              <option value="discovered">Discovery date</option>
              <option value="match">Match score</option>
            </select>
          </label>
        </div>

        {error && !drawerOpen && (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </p>
        )}

        <div className="min-h-[32rem] flex-1 rounded-2xl bg-white/50 p-4 ring-1 ring-zinc-200 backdrop-blur-sm sm:p-5">
          <JobList
            jobs={visibleJobs}
            loading={loading}
            filter={filter}
            selectedJobId={selectedJob?.id ?? null}
            matchScores={matchScores}
            onFilterChange={setFilter}
            onSelectJob={handleSelectJob}
          />
        </div>
      </div>

      <JobDetailDrawer
        job={selectedJob}
        open={drawerOpen}
        profile={profile}
        tailorResult={selectedJob ? tailorByJob[selectedJob.id] ?? null : null}
        coverLetter={
          selectedJob ? coverLetterByJob[selectedJob.id] ?? '' : ''
        }
        analyzing={analyzing}
        error={drawerOpen ? error : null}
        onClose={handleCloseDrawer}
        onAnalyze={handleAnalyze}
        onCoverLetterChange={(value) => {
          if (!selectedJob) return;
          setCoverLetterByJob((prev) => ({ ...prev, [selectedJob.id]: value }));
        }}
        onJobApproved={handleJobApproved}
      />
    </div>
  );
}
