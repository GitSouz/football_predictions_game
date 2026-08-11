import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend never talks to the FPL API directly — all FPL access happens
// server-side in the /api/cron/sync serverless function, which writes results
// into Supabase. In local dev we still want that endpoint reachable, so Vercel
// dev (`vercel dev`) serves it. Plain `vite` serves only the SPA; use the
// "Refresh scores" button (which calls /api/cron/sync) once the app is
// deployed, or run `vercel dev` locally to exercise the sync function.
export default defineConfig({
  plugins: [react()],
});
