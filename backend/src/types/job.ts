export interface ScrapedJob {
  jobId: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  isEasyApply: boolean;
  postedAt: string;
}

export interface SearchOptions {
  keywords: string;
  location: string;
  easyApplyOnly: boolean;
  limit: number;
}

/** @deprecated Use SearchOptions */
export type JobSearchOptions = Partial<SearchOptions> &
  Pick<SearchOptions, 'keywords' | 'location'>;
