/**
 * Vercel entrypoint for the existing Express application.
 *
 * This file defines NO routes. It re-exports the one app built in `server.ts`,
 * which is the same app `npm run dev` serves on localhost:3000. Adding a route
 * means adding it to server.ts, exactly as before.
 *
 * Vercel maps `api/index.ts` to `/api`.
 */
import app from '../server';

export default app;
