export interface WorkExperience {
  id: string;
  company: string;
  role: string;
  startDate: string; // YYYY-MM
  endDate: string | 'Present';
  location: string;
  bullets: string[];
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string;
  graduationYear: string;
}

export interface ExtendedPreferences {
  workAuthorization: string; // e.g., "Kosovo citizen"
  requiresVisaSponsorship: boolean;
  visaSponsorshipExplanation: string; // e.g., "Not authorized in EU/US yet, but willing to cover visa sponsorship costs."
  salaryExpectationMin: number;
  salaryExpectationTarget: number;
  currency: string; // e.g., "USD", "EUR"
  willingToRelocate: boolean;
  relocationPreferences: string; // e.g., "Open to EU/UK relocation"
  noticePeriodDays: number;
  preferredWorkType: 'Remote' | 'Hybrid' | 'Onsite' | 'Any';
}

export interface MasterProfile {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  summary: string;
  skills: string[];
  experiences: WorkExperience[];
  education: Education[];
  extendedPreferences: ExtendedPreferences;
  createdAt: string;
  updatedAt: string;
}
