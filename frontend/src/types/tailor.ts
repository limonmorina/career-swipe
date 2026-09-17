export interface TailorProposal {
  id: string;
  experienceId?: string;
  originalBullet: string;
  proposedBullet: string;
  reasoning: string;
}

export interface TailorResult {
  matchScore: number;
  matchAnalysis: string;
  proposals: TailorProposal[];
  coverLetter: string;
}
