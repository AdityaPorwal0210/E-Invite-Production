# QA Checklist — deploy verification

Run through this after deploying (backend → Render, web → Vercel, mobile → new EAS build for scanning). Tick each; note anything that fails.

Setup: you'll need **two accounts** — a **Host** and a **Guest** — and ideally a second phone/browser so you can act as both. IDs and premium features need a **premium event** (₹419 upgrade) unless `PAYWALL_ACTIVE=false`.

## 0. Deploy sanity
- [ ] Render shows a successful deploy (build ran `npm install`, no crash in logs).
- [ ] `https://invitoinbox.onrender.com/` returns `{"message":"API is running..."}`.
- [ ] Vercel deployed; web app loads and login works.
- [ ] Mobile app opens without the `ExpoCamera` crash (new build installed for scanning).

## 1. Guest lists
- [ ] Create a list ("Reception"). Add a guest with salutation `Mr. & Mrs.`, name, suffix `& Family`, expected count 4.
- [ ] Preview reads "Dear Mr. & Mrs. Sharma & Family".
- [ ] Add the same person again → blocked as duplicate.
- [ ] Mobile: "Select multiple from Contacts" adds several at once; contacts that are app users link (app badge).
- [ ] Export CSV downloads with the right columns.
- [ ] Duplicate a list; delete a list.

## 2. Inviting
- [ ] From an event, Invite → pick the guest list → send. Guests receive email/inbox invite with correct greeting (salutation + suffix).
- [ ] Send the same list again → "skipped N already invited", no duplicate emails.
- [ ] Invite an individual and a group still work.

## 3. Headcount
- [ ] Event roster shows Invited / Going / Pending / Declined and expected totals.
- [ ] Edit a guest's expected count; totals update.

## 4. Tags + ID collection (premium event)
- [ ] Tag a guest "Needs hotel" (preset) and a custom tag.
- [ ] Request ID from that guest (or bulk "Needs hotel").
- [ ] As the Guest: open the event → "host requested your ID" → tick consent → upload photo. Host row shows "ID submitted".
- [ ] Host taps the submitted ID → opens via a short-lived signed link (not a public URL).
- [ ] Cancel an ID request (before upload) → request clears.
- [ ] With `PAYWALL_ACTIVE=false`, ID actions work on a non-premium event; with `true`, a free event shows "Premium feature".

## 5. QR check-in
- [ ] As the Guest: event view shows a QR "entry pass".
- [ ] As the Host (mobile, new build): Manage guests → Scan check-in → scan the guest's QR → green ✓ + live "X / Y arrived".
- [ ] Scan the same code again → "already checked in".
- [ ] Web host page: Scan QR (Chrome/Android) or manual "Check in" button; Arrived filter shows checked-in guests.
- [ ] Guest's pass collapses to "✓ Checked in" after check-in.

## 6. RSVP + reminders
- [ ] Guest RSVPs Going / Can't Go; host stats update.
- [ ] Attending tab badge count matches the number of unopened invites shown (no phantom badge).
- [ ] Unopened invite shows a NEW badge; opening it clears the badge.
- [ ] Host "Remind non-responders" sends to pending guests; repeat within 6h is blocked.

## 7. Broadcast
- [ ] Host "Message guests" → choose audience (Everyone/Going/Not responded) → send. Matching guests get push + email "Update: <event>".

## 8. Security (quick)
- [ ] `GET /api/users/search?query=<someone>` (as a logged-in user) returns only name/email/phone/profileImage — no otp/token fields.
- [ ] Rapid wrong logins get rate-limited ("Too many attempts").

## 9. Regression (things we touched)
- [ ] Cover-photo edit on an event still works (mobile edit photos).
- [ ] Dashboard/inbox load fast on revisit (caching); no full-page reloads on web logout.
- [ ] Google login still works on mobile.
