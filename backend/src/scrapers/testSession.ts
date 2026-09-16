import {
  closeAuthenticatedContext,
  createAuthenticatedContext,
  verifyLinkedInSession,
} from './linkedinClient.js';

async function main(): Promise<void> {
  const session = await createAuthenticatedContext({ headless: false });

  try {
    const isValid = await verifyLinkedInSession(session.page);
    if (isValid) {
      console.log('LinkedIn session is valid (logged in).');
      console.log('Current URL:', session.page.url());
    } else {
      console.error('LinkedIn session is INVALID. Refresh LINKEDIN_SESSION_COOKIE.');
      process.exitCode = 1;
    }
  } finally {
    await closeAuthenticatedContext(session);
  }
}

main().catch((error) => {
  console.error('test:session failed', error);
  process.exitCode = 1;
});
