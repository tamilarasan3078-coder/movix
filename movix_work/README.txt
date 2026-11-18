MOVIX WEBSITE SOURCE
====================

This is the editable MOVIX website project (HTML, CSS and JavaScript).

HOW TO OPEN
1. Download and extract MOVIX-Website.zip.
2. Open the MOVIX-Website folder.
3. Double-click index.html. It should open in Chrome or Edge.
4. Enter any 10-digit mobile number and click Continue.
5. The preview OTP appears on the page. Enter the 6-digit code and click Verify & Enter.
6. Use Change number to edit the mobile number, or Resend code after the 30-second countdown.
7. Use the left navigation to open Home, Movies, Series, Continue Watching and My List.
8. Click the M profile button to open Subscription and Log out.

HOW TO EDIT
- index.html: page structure and labels.
- css/style.css: colours, fonts, spacing and responsive layout.
- js/movies.js: sample movie catalogue.
- js/app.js: login preview and page navigation.

IMPORTANT
This is a complete editable FRONTEND website project, not a production streaming service yet.
- OTP is simulated locally; no SMS is sent.
- No real user accounts or database are connected.
- Subscription prices are sample display values; payment is not active.
- Movie cards use sample image URLs. Do not upload or stream copyrighted films without permission.
- Production launch requires backend authentication, database, licensed video content, video storage/CDN, security, and payment integration.

The display font is Bebas Neue and the body font is Inter. Subscription and Log out are inside the profile menu at the top-right. Internet access is needed to load Google Fonts and the sample image URLs. The layout and navigation still work if those external assets do not load.

PROFILE MENU
At the top-right, click the round M profile button. Subscription and Log out are inside that menu.


STEP 1 UPDATE — PAGES & NAVIGATION QUALITY CHECK
- Confirmed Home, Movies, Series, Continue Watching, My List and Subscription page routes.
- Subscription and Log out remain inside the top-right profile menu.
- Improved keyboard accessibility: Escape closes the profile menu or movie details dialog.
- Improved navigation accessibility with current-page state.
- Hardened saved My List data so invalid or duplicate local entries are ignored.
- This remains a frontend preview. OTP is demo-only; real SMS login, payments and video streaming need backend services.


STEP 2 UPDATE — OTP LOGIN EXPERIENCE
- Added a dedicated OTP entry state with 6-digit numeric validation.
- Added Change number and Resend code controls with a 30-second cooldown.
- Logout now resets the complete login flow.
- This is still a local preview code, not a real SMS OTP. To enable real SMS delivery, MOVIX needs a backend/auth provider project and an SMS provider account with credentials. No provider keys were supplied, so live SMS cannot be activated from this ZIP alone.

STEP 3 UPDATE — REAL SMS AUTHENTICATION INTEGRATION
- Added an optional Supabase Phone OTP integration using Supabase Auth.
- Added js/config.js for the Supabase Project URL and anon/public key.
- When valid settings are present and the Supabase SDK loads, Continue sends an SMS OTP through Supabase Auth and Verify checks it with Supabase.
- Supabase sessions persist between reloads; Log out signs out the Supabase session.
- When configuration is blank, the website safely stays in demo OTP mode.

TO CONNECT REAL SMS (SETUP STILL REQUIRED)
1. Create a Supabase project at https://supabase.com/ (free tier availability and limits may change).
2. In the Supabase dashboard, open Project Settings / API and copy the Project URL and anon/public key.
3. Open MOVIX-Website/js/config.js and paste those two values into url and anonKey.
4. In Supabase Authentication settings, enable Phone sign-in and configure a supported SMS provider with its credentials. SMS delivery is not free by default; provider charges and country delivery rules apply.
5. Add your deployed MOVIX website URL to the allowed redirect/site URL settings if requested by the provider.
6. Host MOVIX over HTTPS for public use. Do not use a Supabase service_role key or SMS-provider secret in browser code.

SECURITY NOTES
- The anon/public key is intended for browser use; never expose service_role or SMS provider secrets.
- Apply database Row Level Security policies before storing user-specific profiles, watchlists or billing records.
- This integration handles authentication only. It does not add a database, payment processing, licensed movie catalogue or video streaming.
- The project cannot send real SMS until a Supabase project and SMS provider are configured by the site owner.

STAGE 1 UPDATE — DATABASE SCHEMA & SECURE AUTH FOUNDATION
- Added supabase/migrations/0001_init_schema.sql: the full database schema for the whole platform (profiles, admin_users, genres, movies, series, seasons, episodes, playback_progress, my_list, subscription_plans, user_subscriptions, payments) with Row Level Security enabled and policies on every table.
- Added a database trigger that auto-creates a profiles row the moment a user verifies OTP, server-side, so it cannot be bypassed from the browser.
- Added js/supabaseClient.js: one shared Supabase client + session/profile/admin helpers, used by app.js and by every later stage instead of each page creating its own connection.
- The movie/series catalogue, My List and Continue Watching still run on the local sample data and localStorage from Steps 1-2 — Stage 2 moves them to the real database tables created here.
- See SETUP.md for the one-time Supabase steps required to activate this (run the migration, confirm phone auth, optionally mark yourself as an admin ahead of Stage 5).
