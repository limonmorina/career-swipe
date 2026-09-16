import {
  closeAuthenticatedContext,
  createAuthenticatedContext,
  verifyLinkedInSession,
} from './linkedinClient.js';
import { scrapeJobSearchResults } from './linkedinScraper.js';

async function main(): Promise<void> {
  const session = await createAuthenticatedContext({ headless: false });

  try {
    const isValid = await verifyLinkedInSession(session.page);
    if (!isValid) {
      throw new Error('LinkedIn session invalid. Refresh LINKEDIN_SESSION_COOKIE.');
    }

    const jobs = await scrapeJobSearchResults(
      session.page,
      {
        keywords: 'Software Engineer',
        location: 'Remote',
        easyApplyOnly: true,
        limit: 5,
      },
      5
    );

    console.log(`\nExtracted ${jobs.length} jobs:\n`);

    for (const job of jobs) {
      console.log({
        jobId: job.jobId,
        title: job.title,
        company: job.company,
        location: job.location,
        isEasyApply: job.isEasyApply,
        postedAt: job.postedAt,
        url: job.url,
        descriptionChars: job.description.length,
      });
    }
  } finally {
    await closeAuthenticatedContext(session);
  }
}

main().catch((error) => {
  console.error('test:scraper failed', error);
  process.exitCode = 1;
});
