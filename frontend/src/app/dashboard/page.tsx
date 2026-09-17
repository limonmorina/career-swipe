import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DEMO_PROFILE } from '@/lib/demo-profile';
import { getProfile } from '@/lib/profile';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard | CareerSwipe',
  description: 'Review discovered jobs, tailor applications, and approve submissions.',
};

export default async function DashboardPage() {
  const userId = process.env.NEXT_PUBLIC_DEMO_USER_ID || DEMO_PROFILE.userId;
  const profile = (await getProfile(userId)) ?? DEMO_PROFILE;

  return <DashboardShell profile={profile} />;
}
