# Secret Rotation Checklist

`backend/.env.example` was committed to git with **real** production secrets. The
file is now sanitized, but the old values still live in git history — anyone who
ever had the repo may have them. **Every secret below must be regenerated at its
source.** Changing the file alone does not undo the exposure.

After rotating each one, update the real value in **three places**:
1. `backend/.env` on your machine (local dev)
2. Render → your backend service → Environment (production)
3. Anywhere else the value is duplicated (see notes per item)

---

## 1. MongoDB Atlas password  🔴 highest priority
Exposed user: `invitoinboxofficial_db_user`
- Go to MongoDB Atlas → Database Access → Edit that user → **Edit Password** →
  Autogenerate → update.
- Update `MONGO_URI` with the new password in `backend/.env` and Render.
- While there, check Network Access — restrict IP allow-list if it's `0.0.0.0/0`.

## 2. JWT secret  🔴 highest priority
Exposed value signed all auth tokens; anyone with it can forge logins as any user.
- Generate a new long random string, e.g. in PowerShell:
  `[Convert]::ToBase64String((1..48 | % {Get-Random -Max 256}))`
- Set new `JWT_SECRET` in `backend/.env` and Render.
- Note: rotating this **logs out all existing users** (their tokens become invalid).
  That's expected and desired here.

## 3. Cloudinary API secret  🟠
- Cloudinary Console → Settings → Security → **Access Keys** → generate a new key
  pair (or roll the secret), then disable the old one.
- Update `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` in `backend/.env` and Render.

## 4. Gmail app password  🟠
Exposed: the app password for `invitoinbox.official.noreply@gmail.com`.
- Google Account → Security → App passwords → **delete** the exposed one → create new.
- Update `EMAIL_PASS` in `backend/.env` and Render.
- (If email now runs only through Brevo, you may be able to drop this entirely.)

## 5. Brevo API key  🟠
The committed value was a placeholder, but rotate the live key if the real one was
ever committed elsewhere.
- Brevo → SMTP & API → API Keys → create new, delete old.
- Update `BREVO_API_KEY` in `backend/.env` and Render.

---

## Google / Razorpay — review, not necessarily rotate
- **Google client IDs** (`GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`) are not
  secrets — client IDs are public by design. No rotation needed.
- **Razorpay** is in test mode (`rzp_test_...`). The *key secret* is sensitive, but
  the test values weren't in the committed `.env.example`. Rotate the live secret
  only when you go to production keys.

---

## Optional but recommended: scrub git history
Rotating makes the old secrets useless, which is the important part. If you also
want the values gone from history entirely (e.g. before making the repo public):
- Use `git filter-repo` or the BFG Repo-Cleaner to purge `backend/.env.example`
  from all past commits, then force-push. Coordinate with anyone else who has a
  clone, as this rewrites history.

---

_Generated during laptop-migration cleanup. Delete this file once rotation is done._
