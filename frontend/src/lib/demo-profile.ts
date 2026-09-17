import type { MasterProfile } from '@/types/profile';

/** Fallback profile used when no Supabase profile row is available yet. */
export const DEMO_PROFILE: MasterProfile = {
  id: 'demo-profile',
  userId: process.env.NEXT_PUBLIC_DEMO_USER_ID || 'demo-user',
  fullName: 'Alex Candidate',
  email: 'alex@example.com',
  phone: '+1 555 0100',
  location: 'Remote',
  linkedinUrl: 'https://linkedin.com/in/example',
  githubUrl: 'https://github.com/example',
  portfolioUrl: '',
  summary:
    'Full-stack engineer with experience shipping TypeScript and Next.js products, collaborating across design and product, and improving application reliability.',
  skills: [
    'TypeScript',
    'React',
    'Next.js',
    'Node.js',
    'PostgreSQL',
    'Playwright',
    'Tailwind CSS',
  ],
  experiences: [
    {
      id: 'exp-1',
      company: 'Example Labs',
      role: 'Software Engineer',
      startDate: '2022-01',
      endDate: 'Present',
      location: 'Remote',
      bullets: [
        'Built and maintained Next.js dashboards used by internal operators.',
        'Automated regression checks with Playwright to reduce release risk.',
        'Collaborated with product to ship iterative UX improvements.',
      ],
    },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'Example University',
      degree: 'B.S.',
      fieldOfStudy: 'Computer Science',
      graduationYear: '2021',
    },
  ],
  extendedPreferences: {
    workAuthorization: 'Authorized',
    requiresVisaSponsorship: false,
    visaSponsorshipExplanation: '',
    salaryExpectationMin: 90000,
    salaryExpectationTarget: 120000,
    currency: 'USD',
    willingToRelocate: true,
    relocationPreferences: 'Open to EU/UK relocation',
    noticePeriodDays: 14,
    preferredWorkType: 'Remote',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
