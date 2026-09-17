'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type AnalyticsData = {
  totalApplicationsSent: number;
  totalJobs: number;
  failureRate: number;
  appliedToday: number;
  maxDaily: number;
  averageMatchApplied: number | null;
  averageMatchSkipped: number | null;
  dailyVelocity: { date: string; count: number; cap: number }[];
  statusBreakdown: {
    discovered: number;
    tailored: number;
    approved: number;
    applied: number;
    failed: number;
  };
};

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch('/api/analytics');
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || 'Failed to load analytics');
        }
        if (!cancelled) setData(payload.data as AnalyticsData);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const maxBar = Math.max(
    ...(data?.dailyVelocity.map((d) => Math.max(d.count, d.cap)) ?? [1]),
    1
  );

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_#dff3ef_0%,_#f7f5f1_42%,_#efeae2_100%)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-800">
              CareerSwipe
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
              Application Analytics
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600">
              Track submissions, failure rate, match-score trends, and daily velocity
              against your safety cap.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Back to Job Feed
          </Link>
        </header>

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-xl bg-white/80 ring-1 ring-zinc-200"
              />
            ))}
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-100">
            {error}
          </p>
        )}

        {data && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Applications Sent"
                value={String(data.totalApplicationsSent)}
                hint={`${data.totalJobs} jobs in pipeline`}
              />
              <MetricCard
                label="Applied Today"
                value={`${data.appliedToday}/${data.maxDaily}`}
                hint="Daily rate-limit safety cap"
              />
              <MetricCard
                label="Failure Rate"
                value={`${data.failureRate}%`}
                hint="Failed ÷ (applied + failed)"
              />
              <MetricCard
                label="Avg Match (Applied)"
                value={
                  data.averageMatchApplied != null
                    ? `${data.averageMatchApplied}%`
                    : '—'
                }
                hint={
                  data.averageMatchSkipped != null
                    ? `Skipped/pipeline avg: ${data.averageMatchSkipped}%`
                    : 'No skipped match scores yet'
                }
              />
            </div>

            <section className="rounded-2xl bg-white/70 p-5 ring-1 ring-zinc-200">
              <h2 className="text-sm font-semibold text-zinc-900">
                Daily Submission Velocity (7 days)
              </h2>
              <div className="mt-5 flex items-end gap-3 overflow-x-auto pb-2">
                {data.dailyVelocity.map((day) => {
                  const height = Math.max(8, Math.round((day.count / maxBar) * 140));
                  const capHeight = Math.max(8, Math.round((day.cap / maxBar) * 140));
                  return (
                    <div
                      key={day.date}
                      className="flex min-w-[3.25rem] flex-col items-center gap-2"
                    >
                      <div className="relative flex h-[150px] w-8 items-end justify-center">
                        <div
                          className="absolute bottom-0 w-8 rounded-sm bg-teal-100"
                          style={{ height: capHeight }}
                          title={`Cap ${day.cap}`}
                        />
                        <div
                          className="relative z-10 w-5 rounded-sm bg-teal-700"
                          style={{ height }}
                          title={`${day.count} applied`}
                        />
                      </div>
                      <p className="text-[10px] font-medium text-zinc-600">
                        {day.date.slice(5)}
                      </p>
                      <p className="text-xs font-semibold text-zinc-900">{day.count}</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Teal bars = applications sent. Light band = daily cap (
                {data.maxDaily}).
              </p>
            </section>

            <section className="rounded-2xl bg-white/70 p-5 ring-1 ring-zinc-200">
              <h2 className="text-sm font-semibold text-zinc-900">Status Breakdown</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-5">
                {Object.entries(data.statusBreakdown).map(([status, count]) => (
                  <div
                    key={status}
                    className="rounded-lg bg-white px-3 py-3 text-center ring-1 ring-zinc-200"
                  >
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      {status}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-zinc-900">{count}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
