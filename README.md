# Maru House Search

GitHub-ready Node.js app with Google sign-in and a shared Google Sheets backend. No Apps Script-hosted interface or Apps Script banner. Source is in `public/` and `src/`; tests are in `test/`.

## Finish setup

1. Put this **repository folder only** in a GitHub repository. Do not upload the separate private-import data or PRIVATE-SETUP.txt to a public repository.
2. Import the supplied Google Sheets template from the earlier app bundle into Google Sheets, or use the tracker you already installed. Share it with both Google accounts as Editors. Copy its spreadsheet ID from its URL.
3. Create a Google Cloud project, enable **Google Sheets API**, and configure Google OAuth consent. Add both accounts as test users if the consent configuration is in Testing.
4. Create an OAuth **Web application** client. Save its client ID and client secret in the hosting environment, not source code.
5. On Render, create a Node Web Service from the GitHub repository. Build: `npm ci`. Start: `npm start`. Keep **one running instance**. The supplied `render.yaml` describes the service configuration; use your chosen hosting plan rather than assuming a particular plan is free.
6. Set these environment variables:

   - `APP_URL`: the final HTTPS app URL, without a trailing slash.
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: from Google Cloud.
   - `GOOGLE_SHEET_ID`: your shared tracker ID.
   - `SESSION_SECRET`: at least 32 random characters; Render can generate it.
   - `RU_EMAIL` and `MARA_EMAIL`: supplied in the separate PRIVATE-SETUP.txt.
   - `NODE_ENV=production`.

7. In the OAuth client, add the exact redirect URI `https://YOUR-APP-HOST/auth/callback`. Deploy and sign in with each account.
8. Test one change from each account, confirm the values in the sheet, and test one Sorting autosave before relying on it.

If you use the old Apps Script sheet helpers, disable them or update their scoring logic: they use the old formula. This hosted app computes the new score whenever it reads a listing and persists calculated values when saving listings/preferences. Additional columns are appended automatically; existing IDs, notes, history and legacy neighbour/Lime fields are preserved. Direct sheet edits are visible after Refresh, but their stored score cells may remain stale until the next app save. Do not use both app versions to edit simultaneously.

## Current features

- Darker page body, light header, no title logo.
- Verified Ru/Mara display in the corner; history attribution is server-controlled.
- Property and Sorting thumbnails from cached listing metadata.
- Site favicons in Searches, with letter fallbacks if a site blocks its icon.
- Searches defaults to browsing; Edit reveals add/edit/remove controls.
- Scrollable listing pop-up with Details, Ratings and History tabs.
- Borough dropdown, adjacent open-plan/kitchen-size fields, consolidated neighbours dropdown.
- Emoji category labels and 0–10 sliders, with Unknown/Clear distinct from a genuine zero.
- Separate personal overall ratings; each account edits its own rating.
- Both personal ratings contribute to the weighted overall score. Their default weights are 10 each and are editable in Preferences.
- General score explanation pop-up. Formula: `fit × (0.5 + 0.5 × assessed fraction)`. At 10% assessed, maximum overall is 55/100; at 50%, 75/100. No assessments means no score.
- Conflict checks, queued app writes, audited changes and retry-safe mutation IDs.

## Local preview

Requires Node 22 or newer. Run `npm ci`. Copy the separate `private-import/tracker.json` into `private-data/tracker.json`, then run `npm run demo`. Open `http://127.0.0.1:3000`.

Preview is localhost-only, memory-only, and can switch between Ru and Mara from the user menu. It never connects to Google Sheets and resets when restarted. Production does not enable the preview route. The private data directory is ignored by Git and is never served as a static file.

## Authentication and permissions

Only the two configured, verified Google email addresses can sign in. Each account uses its own Google Sheets permission. Access/refresh tokens are held in authenticated-encrypted, HTTP-only cookies; they are not sent to browser JavaScript or stored in the repository. Writes require the app origin and a CSRF token. Session cookies use Secure on HTTPS.

This is a single-server app: its write queue serializes app writes within one running Node instance. Do not deploy it as a multi-instance/serverless app without adding a shared transaction/locking mechanism. Google Sheets cannot atomically coordinate a human sorting/editing rows outside the app with a simultaneous app save; avoid doing those together. App-to-app edits have stale-version checks and atomic property/history batches.

## Verification and remaining checks

15 local backend tests pass, covering scoring ceilings, personal-score influence, missing/zero values, units, boroughs, migration, permissions, stale writes, idempotent retries, search management, task imports and sign-in protections. A short browser smoke check covers the new interface. Real Google OAuth consent, live Sheets requests, schema migration on a real sheet, and hosting deployment still need testing after you supply credentials. The app has not been deployed and no GitHub repository has been created.

## Scheduled tasks

The existing export/import observation workflow remains in Preferences. Imports append dated history, never overwrite personal ratings or current rent. Fully automatic task writes still require a separately tested connection to the sheet; this bundle does not configure or change an existing ChatGPT task.

## References

- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google authentication library](https://docs.cloud.google.com/nodejs/docs/reference/google-auth-library/latest)
- [Google Sheets API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)
- [Render Node deployment](https://render.com/docs/deploy-node-express-app)
