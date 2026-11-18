# MOVIX — Backend Setup Guide

This file collects the setup steps for every stage as they're built, so you
always have one place to check what's live and what still needs your
credentials. Stage 1 covers the sections below marked **STAGE 1**.

## What's real right now (Stage 1)

- A full Postgres schema for the entire platform (catalogue, playback,
  lists, subscriptions, payments, admin) with Row Level Security on
  every table.
- Real phone-OTP authentication via Supabase Auth (this already existed
  from your previous step and is unchanged).
- A database trigger that automatically creates a `profiles` row the
  moment someone verifies their OTP — no client-side code can be used
  to fake this, since it runs server-side as part of the insert into
  Supabase's own `auth.users` table.
- A single shared Supabase client (`js/supabaseClient.js`) that every
  later page (Movies, Series, My List, Subscription, Admin) will use,
  instead of each page reinventing its own connection.

## What is NOT real yet

- The movie/series catalogue is still the sample local array in
  `js/movies.js`. Stage 2 replaces it with real queries against the
  `movies` / `series` / `seasons` / `episodes` tables created in this
  migration.
- My List and Continue Watching still use `localStorage` on this
  machine only — Stage 2 moves them to the `my_list` and
  `playback_progress` tables so they sync across devices.
- Video playback, the subscription checkout, the Razorpay webhook and
  the Admin Dashboard don't exist yet — Stages 3, 4 and 5.

---

## STAGE 1 — One-time Supabase setup

You need a Supabase project before any of this can go live. If you
already created one for the OTP step, reuse it — just run the new
migration below.

1. **Create a project** (skip if you already have one): go to
   https://supabase.com/ → New project. Note the project's Region
   (pick one close to India, e.g. Singapore, for lower latency).

2. **Run the schema migration.**
   - Open your project → **SQL Editor** → New query.
   - Paste the entire contents of
     `supabase/migrations/0001_init_schema.sql` and click **Run**.
   - This creates every table, the auto-profile trigger, Row Level
     Security policies, and seeds the `genres` table and the
     `subscription_plans` table (Free / Monthly ₹149 / Yearly ₹999 —
     matching what's already shown on the Subscription page).
   - (If you prefer the CLI instead of pasting SQL: `supabase link`
     then `supabase db push` from this project folder.)

3. **Confirm phone auth is still configured** (from your previous
   step): Authentication → Providers → Phone, with your SMS provider's
   credentials saved there. `js/config.js` should already have your
   Project URL and anon key — nothing changes there in Stage 1.

4. **Make yourself an admin** (needed starting Stage 5, safe to do now).
   Log in to MOVIX once with your real phone number so a profile row
   exists, then in the SQL Editor run:
   ```sql
   insert into public.admin_users (user_id)
   values ('<your-auth-user-id>');
   ```
   Find `<your-auth-user-id>` under Authentication → Users in the
   Supabase dashboard (copy the UUID of your row), or run
   `select id, phone from auth.users;` in the SQL Editor.

5. **Verify it worked.** After logging in through the website, go to
   Supabase → Table Editor → `profiles`. You should see one row with
   your phone number. If you added yourself to `admin_users` in step 4,
   that table should show your row too.

### Nothing to configure here if you're still in preview/demo mode
If `js/config.js` is left blank, the site keeps working exactly as
before (local preview OTP, no database). The schema above simply sits
ready in Supabase for when you add real credentials — it does not
force you to connect anything before you're ready.

---

## How to run the site locally
Nothing has changed here: open `index.html` directly in a browser, or
serve the folder with any static file server. No build step, no
`npm install` — this project is plain HTML/CSS/JS by design so it keeps
working with zero tooling.

## Security notes carried forward
- Only the `anon`/public key ever goes in `js/config.js`. Never put a
  `service_role` key or SMS/Razorpay secret in any file shipped to the
  browser.
- `user_subscriptions` and `payments` intentionally have **no**
  client-write policy for normal users — only an admin (via the
  dashboard, Stage 5) or the service-role key (via the Razorpay
  webhook, Stage 4) can write to them. This is what stops a user from
  granting themselves a paid plan by calling the API directly.
- `admin_users` has no insert policy at all for any authenticated
  role — the only way to create an admin is the SQL statement in step
  4 above, run by you as the project owner.

## Stage 1 frontend update (2026-11-18)

The current frontend update adds catalogue search across title/genre/year, genre filters generated from the available sample catalogue, a Profile page reachable from the profile menu, safer text rendering for catalogue values, and persistent browser-local watchlist state. Existing Supabase phone OTP wiring is retained when `js/config.js` contains a valid project URL and anon key.

### Current limitations — do not treat these as production features

- When Supabase is not configured, the OTP shown in the login screen is a local preview code. It does not send an SMS and is not secure authentication.
- The sample catalogue in `js/movies.js` is demonstration data, not a licensed content feed.
- My List and the preview profile are stored in this browser only. They do not sync between devices or users.
- Continue Watching currently displays sample progress values from the catalogue. There is no connected video player writing playback progress yet.
- Subscription prices are display examples. Checkout buttons do not charge users; Razorpay is not integrated.
- There is no production video playback source, admin dashboard, or production deployment configuration in this stage.

Before a public launch, implement and test the remaining backend, playback, payments, admin controls, content rights, security and load capacity. Do not advertise this ZIP as a production-ready OTT service.
