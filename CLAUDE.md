# InvitoInbox (E_invite_production)

Digital event invitation platform ("Invito Inbox"). Hosts create event invites (cover image, attachments, video, maps link), share them to individuals or groups, track RSVPs and guest lists, with premium upgrades via Razorpay.

## Monorepo layout

| Folder | Stack | Deploy target |
|---|---|---|
| `backend/` | Node.js + Express 5, MongoDB Atlas (Mongoose 9), Socket.io, JWT auth | Render — https://invitoinbox.onrender.com |
| `frontend/` | React 19 + Vite 8, Tailwind 4, axios, socket.io-client | Vercel — https://invitoinnbox.vercel.app |
| `host-mobile-app/` | Expo 54 (expo-router), React Native 0.81, TypeScript | EAS builds (Android configured) |

## Backend architecture

- Entry: `backend/server.js` — helmet, global rate limit (300 req/15min on `/api`), CORS (localhost:5173 + Vercel domain), Socket.io attached via `app.set('io', io)`, hourly cron for 24-hour event reminders (`utils/reminderCron.js`).
- Routes mounted at `/api/users`, `/api/invitations`, `/api/groups`, `/api/upload`, `/api/payments`. Paywall kill switch: `GET /api/config/paywall` (driven by `PAYWALL_ACTIVE` env, free guest limit 50).
- Models: `User` (email+password with OTP verification, Google login, primary/secondary phone with OTP sync, expoPushToken), `Invitation` (host, delegates/co-hosts, attendees with RSVP + ticketId, isPremium + Razorpay orderId/paymentId), `Group` (members, admins, join requests, join links, permissions), `ReceivedInvitation` (per-recipient inbox record: read/saved/RSVP state).
- Services: Cloudinary (image/attachment uploads via multer), Brevo API (transactional email, OTPs), Expo push notifications, Razorpay (₹419 premium upgrade per event, HMAC signature verification in `paymentController.js`).
- Auth: JWT Bearer tokens, `protect` middleware; Google sign-in via google-auth-library.

## Frontend (web)

- SPA in `frontend/src/App.jsx`; state via `context/AuthContext.jsx`; API client `utils/api.js` (axios, `VITE_API_URL`, Bearer token from localStorage).
- Key routes: `/` dashboard, `/create-event`, `/inbox`, `/saved`, `/invitation/:id` (+`/guests`), `/groups`, `/group/:id`, `/share/:id` (public invite), `/group/join/:id`, `/profile`.
- Public/teaser invite pages work without login; `InviteBridge`/`SmartAppBanner` deep-link into the mobile app.

## Mobile app (hosts)

- expo-router screens in `host-mobile-app/app/` mirroring web features; Razorpay via react-native-razorpay; push notifications via expo-notifications; contact sync via expo-contacts; Google sign-in native.
- `EXPO_PUBLIC_API_URL` points at the production backend by default.

## Run locally

```bash
# Backend (port 5000) — needs backend/.env (already present)
cd backend && npm install && npm run dev

# Frontend (port 5173) — for local dev, point VITE_API_URL at http://localhost:5000
cd frontend && npm install && npm run dev

# Mobile
cd host-mobile-app && npm install && npx expo start
```

- `frontend/.env` currently targets the production Render backend. To develop against local backend, set `VITE_API_URL=http://localhost:5000` (api.js appends nothing; backend routes live under `/api` — note web api.js default is `http://localhost:5000/api`, so match that shape).
- Backend CORS only allows `localhost:5173` and the Vercel domain — add origins in `server.js` if the dev host/port differs.
- MongoDB is Atlas (cloud) — internet required; no local DB setup needed.

## Known issues / TODO

- **SECURITY: `backend/.env.example` is committed to git with REAL credentials** (Mongo password, JWT secret, Cloudinary secret, Gmail app password). Rotate all of these and replace the file with placeholders. `invitoinbox-71aa6-firebase-adminsdk-fbsvc-*.json` (Firebase service account) sits untracked in repo root — keep it out of git.
- Two ~100 MB `application-*.tar.gz` build archives are committed to git — should be removed (git history rewrite / git-lfs) to slim the repo.
- Branch `main` is 1 commit ahead of `origin/main`; uncommitted changes in package-locks and `PremiumUpgradeModal.tsx`.
- `backend/utils/cache.ts` is a stray TS file in a JS codebase.
- Duplicate middleware: `auth.middleware.js` vs `authMiddleware.js` — consolidate.
- Razorpay is in TEST mode (`rzp_test_...`) across web and mobile.
- `Invitation` schema lacks the `reminderSent` field that `reminderCron.js` reads/writes (works via Mongoose strict-mode pass-through? verify persistence — likely silently dropped; add to schema).

## Recent work (git log)

Razorpay premium/paywall integration (web + mobile), image optimization, 24-hr reminder cron, calendar integration, dual phone numbers, simultaneous web+mobile login.
