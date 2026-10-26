# Deployment

1. Create a MongoDB Atlas cluster, database user, and network access rule for the Render service. Keep the URI private.
2. Create a Render Node web service with root directory `server`, build command `npm install && npm run build`, and start command `npm start`. Set `MONGODB_URI`, a random `JWT_SECRET` (32+ characters), `CLIENT_URL`, and optionally `GEMINI_API_KEY`, `GEMINI_MODEL`. Render supplies `PORT` automatically; the server reads it.
3. Create a Vercel Vite project with root directory `client`, build command `npm run build`, output directory `dist`, and `VITE_API_BASE_URL=https://YOUR-RENDER-HOST/api`. `client/vercel.json` rewrites client routes to the SPA entry page.
4. Set Render `CLIENT_URL` to the exact Vercel origin and redeploy. Check `https://YOUR-RENDER-HOST/api/health` and then sign in through the Vercel app.
5. Seed the first admin once using `npm run seed:admin` with `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` set in a secure shell. These credentials must not be committed or left in public deployment settings.

For a Render deployment built from the monorepo, npm workspace dependencies may require the repository root as the service root. In that case use build command `npm install && npm run build -w server` and start command `node server/dist/server.js`.

The client and server must both use HTTPS in production. Verify CORS, JWT secret, MongoDB access, receipt upload, and role-gated endpoints after deployment.
