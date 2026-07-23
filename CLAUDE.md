# InvitoInbox (E_invite_production)

Digital event invitation platform ("Invito Inbox"). Hosts create event invites, share them to individuals/groups/saved guest lists, track RSVPs, manage a full attendee roster (tags, expected headcount, ID collection, QR check-in, reminders, broadcasts), with premium upgrades via Razorpay.

## Monorepo layout

| Folder | Stack | Deploy target |
|---|---|---|
| `backend/` | Node.js + Express 5, MongoDB Atlas (Mongoose 9), Socket.io, JWT auth | Render — https://invitoinbox.onrender.com |
| `frontend/` | React 19 + Vite 8, Tailwind 4, axios, socket.io-client | Vercel — https://invitoinnbox.vercel.app |
| `host-mobile-app/` | Expo 54 (expo-router), React Native 0.81, TypeScript | EAS builds (Android configured) |

## Backend architecture

- Entry: `backend/server.js` — helmet, global rate limit (300 req/15min on `/api`), CORS (localhost:5173 + Vercel domain), Socket.io via `app.set('io', io)`. Three background crons start here: `reminderCron` (24-hr event reminders), `idPurgeCron` (deletes collected IDs `ID_RETENTION_DAYS` after the event, default 7), `rsvpNudgeCron` (auto-nudges non-responders `RSVP_NUDGE_AFTER_DAYS` after invite, default 3).
- Route mounts: `/api/users`, `/api/invitations`, `/api/groups`, `/api/upload`, `/api/payments`, `/api/guest-lists`. Paywall kill switch: `GET /api/config/paywall` (`PAYWALL_ACTIVE` env, free guest limit 50).
- Auth: JWT Bearer (`generateToken`, 30d expiry), `protect` middleware (`middleware/authMiddleware.js`). Auth/OTP routes have a strict 15/15-min `authLimiter`. Google sign-in via google-auth-library.

### Models (`backend/models/`)
- `User` — email+password (bcrypt) with OTP verification, Google login, primary/secondary phone with OTP sync, `expoPushToken`, reset-password OTP.
- `Invitation` — host, delegates/co-hosts, attendees, `isPremium` + Razorpay ids, `reminderSent`. Indexed on user/host/sharedGroups/attendees.user/(eventDate,reminderSent).
- `Group` — members, admins, join requests/links, permissions. Indexed on members/admins/owner/inviteCode.
- `ReceivedInvitation` — per-recipient record. Fields: rsvpStatus, isRead, isSaved, `salutation`/`suffix`, `expectedCount` (host-only headcount), `tags[]`, `idRequest{requested,requestedAt,note}`, `idConsent`, `idDocuments[{publicId,format,label}]` (Cloudinary authenticated), `checkedIn`/`checkedInAt`, `ticketId` (QR), `lastNudgeAt`/`nudgeCount`. Indexed for inbox, guest lists, and (invitation,ticketId) check-in lookup.
- `GuestList` — reusable, host-owned, event-independent. `guests[]` entries hold name, salutation, suffix, email, phone, linked `user`, `expectedCount`, notes. Auto-links entries to registered users by email/phone (last-10-digit match) and de-dupes.

### Controllers (`backend/controllers/`)
- `invitationController` — create/share/update/delete invites, RSVP, guest list read (`getEventGuestList` returns `stats` {invited/accepted/declined/pending/expectedTotal/expectedAttending/arrived}, `isPremium`, `idCollectionEnabled`), expected-count edit. `shareInvitationLater` expands `guestListIds` into recipients (carrying salutation/suffix/expected), skips already-invited guests (no duplicate email/push).
- `guestListController` — CRUD, add/edit/remove guests (dedupe by user/email/phone, name fallback), duplicate, CSV export.
- `guestManagementController` — per-guest tags, ID request/cancel/request-by-tag, guest ID consent+upload (`uploadPrivateDocument`), signed view (`getSignedDocumentUrl`, 5-min), delete. Premium-gated via `idCollectionEnabled` (respects `PAYWALL_ACTIVE`).
- `checkinController` — `my-ticket` (generates ticketId + QR data-URL), `checkin` (by ticketId or guestId, dedupes), `checkin/undo`.
- `rsvpReminderController` — `remind-pending` (manual nudge to non-responders) + shared `nudgeGuests` used by the cron.
- `broadcastController` — `broadcast` a host message (push+email) to an audience (all / going / pending / `tag:X`).
- `paymentController` — Razorpay ₹419 premium upgrade per event, HMAC signature verification.
- `userController` — auth, OTP, Google login, profile, phone sync, `searchUsers` (whitelisted fields only), notification counts.

### Services / utils
- Cloudinary: public uploads (`uploadOnCloudinary`) for media; **authenticated** uploads (`uploadPrivateDocument`) + signed URLs (`getSignedDocumentUrl`) for guest IDs — never public.
- Brevo API (email/OTPs), Expo push (`utils/pushNotification.js`), `qrcode` (server-side QR image generation).

## Frontend (web)

- SPA in `frontend/src/App.jsx`; auth in `context/AuthContext.jsx`; API client `utils/api.js`. Caching hook: `utils/useCachedGet.js` (stale-while-revalidate).
- Routes: `/` dashboard, `/create-event`, `/inbox`, `/saved`, `/invitation/:id` (+`/guests` = host roster), `/groups`, `/group/:id`, `/guest-lists` (+`/:id`), `/share/:id` (public), `/profile`.
- Key components: `GuestLists`/`GuestListDetail` (manage lists), `HostGuestList` (roster: headcount dashboard, tap-to-manage rows, check-in + webcam scan via `CheckinScanner`, remind, broadcast), `GuestIdUpload` + `GuestTicket` (guest-side ID upload + QR pass, rendered in `InvitationDetail`).

## Mobile app (hosts + guests)

- expo-router screens in `host-mobile-app/app/`: `dashboard`, `event/[id]` (decluttered host view: stats, Manage-guests button, combined Invite/Share menus), `roster/[id]` (separate attendee roster: search/filter, tap-a-guest sheet, scan/remind/broadcast), `scan/[id]` (expo-camera QR scanner, guarded require), `guest-lists` (+`/[id]`), `invite/[id]`, `groups`, `profile`, `edit/[id]`.
- Components: `GuestIdUpload`, `GuestTicket` (guest ID upload + QR pass, shown on their event view).
- Images use `expo-image` (disk cache). `EXPO_PUBLIC_API_URL` points at the production backend by default.
- **Native modules requiring an EAS rebuild:** `expo-camera` (QR scanner). The scan screen guards the require so older builds degrade gracefully instead of crashing.

## Run locally

```bash
# Backend (port 5000) — needs backend/.env; run `npm install` (adds qrcode)
cd backend && npm install && npm run dev

# Frontend (port 5173) — set VITE_API_URL=http://localhost:5000/api for local backend
cd frontend && npm install && npm run dev

# Mobile — run `npx expo install expo-camera` then eas build for the scanner
cd host-mobile-app && npm install && npx expo start
```

- MongoDB is Atlas (cloud) — internet required. The `.env` MONGO_URI uses the direct (non-SRV) shard connection to avoid DNS-SRV issues on some networks.

## Security

See `SECURITY_CHECKLIST.md`. Code fixes done: user-search field leak, auth rate limiting, NoSQL-injection coercion on login/reset. **Outstanding (owner action):** rotate the exposed secrets in `SECRETS_ROTATION.md` (Mongo pw, JWT secret, Cloudinary, Gmail) and purge them from git history.

## Known issues / TODO

- Rotate + purge the committed secrets (see above) — highest priority.
- Two ~100 MB `application-*.tar.gz` archives are committed — remove from history / git-lfs.
- `backend/utils/cache.ts` is a stray TS file; duplicate `auth.middleware.js` vs `authMiddleware.js`.
- Razorpay is in TEST mode (`rzp_test_...`).
- Web host event page (`InvitationDetail`) invite/share not consolidated like mobile (mobile-only cleanup so far).

## Recent work

Guest lists per function (reusable, salutations/suffixes, dedupe, contact sync/picker, CSV export, select-to-invite), expected headcount + dashboard, guest tags, premium ID collection (private storage, consent, signed links, auto-purge), QR check-in (guest ticket + host camera/webcam scanner + live arrived count), RSVP follow-up (manual + auto cron), broadcast to guests, host-UI declutter (separate roster, tap-to-manage), mobile perf, security hardening pass.
