# College CP Leaderboard

A full-stack competitive programming leaderboard for college students.
Students link their Codeforces and LeetCode accounts, sync solved problems, and compete on overall and weekly rankings.

## Live Demo

- App: https://cp-leaderboard-pi.vercel.app

## Why This Project

Most college CP groups track progress manually in spreadsheets.
This project turns that process into a real-time web app with automated scoring, profile tracking, and an admin control panel.

## Showcase Highlights

- Clean student onboarding: register, login, password reset, and profile setup.
- Account linking for Codeforces and LeetCode.
- Automated per-user sync pipeline from platform APIs into Supabase.
- Unified scoring engine across platforms.
- Overall leaderboard plus weekly leaderboard.
- Coder of the Week flag updated from weekly ranking.
- Dedicated admin dashboard with semester filters, search, and student submission drill-down.

## Student Experience

- Sign up from the landing page.
- Add semester and SAP ID.
- Link Codeforces and/or LeetCode handle.
- Trigger sync to pull latest solved submissions.
- View personal points by platform.
- View total points and solved problem counts.
- Browse detailed solved problem history by platform.
- Appear on overall and weekly rankings.

## Admin Experience

- Admin login from the main auth modal.
- View student overview with semester filter.
- Search by name, SAP ID, or handle.
- Track combined points and weekly points.
- Click any student row to inspect recent Codeforces and LeetCode submissions.

## Scoring System

Codeforces rating to points:
- rating < 900: 100
- 900 <= rating <= 1000: 200
- rating > 1000: 400

LeetCode difficulty to points:
- Easy: 100
- Medium: 200
- Hard: 400

## Architecture At A Glance

- Frontend: static multi-page app built with HTML, CSS, and vanilla JavaScript.
- Backend: Supabase Auth, Postgres, and Edge Functions.
- Deployment: Vercel for frontend and Supabase for database/functions.

Main browser-invoked edge functions:
- sync-codeforces
- sync-leetcode
- sync-weekly-leaderboard
- get-leaderboard
- get-weekly-leaderboard
- admin-login
- admin-students-overview
- admin-user-submissions

## Project Structure

- frontend: pages, shared app shell, Supabase client integration
- supabase/functions: sync, leaderboard, and admin edge functions
- supabase/migrations: schema evolution and auth/admin setup
- vercel.json: frontend static deployment config

## Run Locally

Quick frontend run (using currently configured hosted Supabase backend):

1. Install dependencies:

   npm install

2. Start a static server:

   cd frontend
   python -m http.server 3000

3. Open:

   http://localhost:3000/index.html

For fully local backend testing, run Supabase locally and point frontend/lib/supabase.js to your local project URL and anon key.

## Current Status

This project is actively working for student and admin flows.
Known improvement areas:

- Align schema.sql with latest migration/runtime shape.
- Fix monthly sync write field mismatch in sync-monthly-leaderboard.
- Add scheduled sync jobs and automated tests.

## Roadmap

- Add charts and trend analytics per student.
- Add batch sync scheduling with retries.
- Add role-based admin controls and audit logs.
- Add CI checks for migration and function contracts.

## Author

Built as a college CP community product to make rankings transparent, automated, and easy to maintain.
