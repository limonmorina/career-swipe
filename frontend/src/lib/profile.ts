import { createClient } from '@supabase/supabase-js';
import type {
  Education,
  ExtendedPreferences,
  MasterProfile,
  WorkExperience,
} from '@/types/profile';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function getProfile(userId: string): Promise<MasterProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error('Error fetching profile:', error);
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    fullName: data.full_name,
    email: data.email,
    phone: data.phone || '',
    location: data.location || '',
    linkedinUrl: data.linkedin_url || '',
    githubUrl: data.github_url || '',
    portfolioUrl: data.portfolio_url || '',
    summary: data.summary || '',
    skills: (data.skills || []) as string[],
    experiences: (data.experiences || []) as WorkExperience[],
    education: (data.education || []) as Education[],
    extendedPreferences: (data.extended_preferences || {}) as ExtendedPreferences,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function upsertProfile(
  profile: Partial<MasterProfile> & { userId: string }
): Promise<boolean> {
  const payload = {
    user_id: profile.userId,
    full_name: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    linkedin_url: profile.linkedinUrl,
    github_url: profile.githubUrl,
    portfolio_url: profile.portfolioUrl,
    summary: profile.summary,
    skills: profile.skills,
    experiences: profile.experiences,
    education: profile.education,
    extended_preferences: profile.extendedPreferences,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    console.error('Error upserting profile:', error);
    return false;
  }

  return true;
}
