Netlify Deploy (Frontend-only + Firebase)

Overview
- Frontend (Vite + React) is deployed on Netlify.
- Data is stored in Firebase Firestore using the browser SDK.
- Optional: enable Anonymous Auth for secure per-user scoping.

1) Firebase Console Setup
- Create a Web App in your project and copy the config (apiKey, authDomain, projectId, etc.).
- Firestore: create database (Native mode).
- Authentication (recommended): enable Anonymous sign-in provider.
- Security Rules: use the rules in `firestore.rules` (require auth), or temporarily allow open access for development only.

2) Frontend Config (Environment Variables)
Add these environment variables in Netlify Site settings → Build & deploy → Environment:
- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_AUTH_DOMAIN
- VITE_FIREBASE_PROJECT_ID
- VITE_FIREBASE_STORAGE_BUCKET (optional if not used)
- VITE_FIREBASE_MESSAGING_SENDER_ID (optional if not used)
- VITE_FIREBASE_APP_ID
- VITE_ENABLE_ANON_AUTH=true   # recommended so rules can use request.auth.uid

3) Netlify Build Settings
This repo includes `netlify.toml` with:
- base = "frontend"
- publish = "frontend/dist"
- command = "npm ci && npm run build"
It also includes SPA redirects: `frontend/public/_redirects` (/* → /index.html 200).

4) Deploy
- Push to your default branch or trigger a deploy on Netlify.
- Verify the app loads and Firestore reads/writes succeed.

5) Local Dev (optional)
- Create `frontend/.env.local` with the same VITE_FIREBASE_* keys.
- Run `npm run dev` from `frontend`.

Notes
- Do NOT use service account JSON in the frontend; only use the Web SDK config.
- If you do NOT enable auth, you must use open rules (unsafe). Anyone can read/write. Use auth even if anonymous.

