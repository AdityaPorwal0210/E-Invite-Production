# Security Checklist

Status of the security hardening pass. Code fixes are done; the items under
"Your actions" require access to your accounts and must be done by you.

## ✅ Fixed in code (ready to deploy)

- **User-search data leak (critical).** `GET /api/users/search` returned every
  user field except the password — including `resetPasswordOtp`, `otp`,
  `phoneOtp`, and `expoPushToken`. Any logged-in user could read another user's
  active password-reset code and take over the account. Now returns only
  `name, email, profileImage, phoneNumber, secondaryPhone`, and the search text
  is regex-escaped (prevents injection / ReDoS).
- **Brute-force protection on auth.** Added a strict rate limiter
  (15 requests / 15 min per IP) to `register`, `login`, `google-login`,
  `verify-otp`, `forgot-password`, `reset-password`.
- **NoSQL-injection hardening.** `login`, `forgot-password`, and
  `reset-password` now coerce `email` / `otp` / `password` to strings, so object
  payloads like `{"$ne": null}` can't manipulate the queries. Login also
  lowercases the email (fixes a case-sensitivity bug); reset enforces a 6-char
  minimum and requires a non-empty stored OTP.
- **Endpoint audit.** All `populate()` calls already whitelist safe fields
  (name/email/etc.). The remaining `.select('-password')` cases return a user's
  own record to themselves (low risk) and were left as-is to avoid breaking
  fields the app reads.

Deploy these by pushing to Render (backend only; no mobile rebuild needed).

## 🔴 Your actions — do these

### 1. Rotate the exposed secrets (highest priority)
The real Mongo password, JWT secret, Cloudinary secret, and Gmail app password
were committed to git (`backend/.env.example`) and are still valid. Rotating
makes the leaked copies useless. Full step-by-step is in `SECRETS_ROTATION.md`.
Start with the **MongoDB password** and **JWT secret**.

### 2. Purge the secrets from git history
Sanitizing the file doesn't remove the old values from past commits. Before the
repo is ever shared or made public, scrub them:
- Use `git filter-repo` or the BFG Repo-Cleaner to remove `backend/.env.example`
  from all history, then force-push. Coordinate with anyone who has a clone.

### 3. Keep the Firebase service-account file out of git
`invitoinbox-71aa6-firebase-adminsdk-*.json` is sensitive. Confirm it's
gitignored and was never committed.

### 4. Confirm production env on Render
- `PAYWALL_ACTIVE` is set as you intend (true = premium gates enforced).
- All secrets use the newly rotated values.
- Razorpay switches to live keys only when you go to production.

## Nice-to-have (later)
- Add input validation (e.g. express-validator) to more write endpoints.
- Consider shortening the 30-day JWT expiry and adding token refresh.
- Add a per-account lockout after repeated failed logins (beyond IP rate limit).
