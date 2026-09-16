export interface DiscoveredJob {
  id: string;
  jobId: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  isEasyApply: boolean;
  status: string;
  createdAt: string;
}

export type JobFeedFilter = 'all' | 'easy_apply' | 'reviewed';
