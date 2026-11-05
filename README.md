# Attachly — Firebase Internship Management System

Attachly is a responsive internship / industrial attachment management system for universities and colleges. The React + Vite interface is hosted on Vercel. Authentication, application data and private file storage are handled by Firebase:

- **Firebase Authentication** — email/password sign-in and account provisioning.
- **Cloud Firestore** — users, profiles, placements, lecturer assignments, assessments, logbooks, results, notifications, audit entries and academic configuration.
- **Cloud Functions (Node.js 20)** — authenticated API, role-based access, business rules, reports and privileged account creation.
- **Cloud Storage** — private placement letters, logbook attachments and profile images.
- **Vercel** — frontend hosting only; no Django server or relational database is required.

## What is included

- **Student workspace:** placement registration and approval tracking, assessment calendar, weekly logbook drafts/submissions, revision history, lecturer feedback, notifications and published results.
- **Lecturer workspace:** assigned student list, assessment scheduling and reschedule requests, logbook review/feedback, draft/final marks and placement results.
- **Coordinator workspace:** account and profile management, placement approvals, period-specific lecturer assignments, academic setup, assessment weightings and grading bands, result finalization/publication, CSV/PDF exports and audit history.
- **Security:** Firebase ID-token verification in Cloud Functions; server-side role and record scoping; Firestore and Storage client rules deny direct browser access. The Admin SDK is used by the trusted API.
- **UI:** responsive blue-and-white dashboard with role-aware navigation, charts, tables, status tags, calendars, modals and mobile layouts.

## Project structure

```text
internship-management-system/
├── frontend/
│   ├── src/components/       # Shared shell and UI primitives
│   ├── src/pages/            # Student, lecturer and coordinator workflows
│   ├── src/lib/api.js        # Firebase-authenticated API client
│   ├── src/lib/firebase.js   # Firebase web app and Authentication setup
│   ├── .env.example
│   └── vercel.json           # SPA routing fallback
├── functions/
│   ├── src/index.js          # Node.js API backed by Firestore and Storage
│   ├── scripts/create-admin.js
│   └── package.json
├── firebase.json
├── firestore.rules
└── storage.rules
```

## 1. Create and configure the Firebase project

1. Create a Firebase project in the Firebase Console.
2. Add a **Web App** in Project settings and copy its configuration values.
3. Under **Authentication → Sign-in method**, enable **Email/Password**.
4. Under **Authentication → Settings → Authorized domains**, ensure your Vercel production domain (and any preview domain you use) is listed.
5. Create a **Cloud Firestore** database. Choose a location close to your expected users.
6. Enable **Firebase Storage** and create the default Storage bucket.
7. In Project settings, note the project ID and Storage bucket name. A bucket may look like `your-project-id.firebasestorage.app` or `your-project-id.appspot.com`; use the exact value displayed in your console.

The application uses Firestore through the Cloud Functions Admin SDK. Do not enable public read/write access in the Firestore or Storage rules.

## 2. Configure the local project

Install Node.js 20 or later, npm and the Firebase CLI. From the project root:

```bash
npm install -g firebase-tools
firebase login
cp .firebaserc.example .firebaserc
```

Edit `.firebaserc` and replace `your-firebase-project-id` with your real Firebase project ID. Then configure the frontend:

```bash
cd frontend
npm install
cp .env.example .env
```

Fill in the Firebase Web App values in `frontend/.env` and set the API URL:

```env
VITE_FIREBASE_API_KEY=your-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-exact-storage-bucket-name
VITE_FIREBASE_APP_ID=your-web-app-id
VITE_FIREBASE_API_URL=https://us-central1-your-project-id.cloudfunctions.net/api
```

The function is configured for `us-central1`. Keep the API URL aligned with the region used in `functions/src/index.js` if you change it.

Install backend function dependencies and configure the Storage bucket for the Admin SDK:

```bash
cd ../functions
npm install
cp .env.example .env
```

Edit `functions/.env` and set `FIREBASE_STORAGE_BUCKET` to the exact bucket name from Firebase Console. This file contains environment configuration and must not be committed with private credentials.

## 3. Deploy Firebase services

From the project root:

```bash
firebase use your-firebase-project-id
firebase deploy --only firestore:rules,storage
firebase deploy --only functions
```

The deployment creates the `api` HTTPS Cloud Function. Its default URL is:

```text
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api
```

Set that exact URL as `VITE_FIREBASE_API_URL` in your Vercel project.

Cloud Functions deployment and Cloud Storage usage may require a billing-enabled Firebase/Google Cloud project. Review the billing and quotas shown in your Firebase Console before deploying.

## 4. Create the first administrator

The web application deliberately does not allow public sign-up or self-assigned administrator roles. Provision the first coordinator/admin from a trusted local machine.

Create a Firebase service account key in **Firebase Console → Project settings → Service accounts** and save it outside this repository. Set Application Default Credentials and the account details in your terminal. Do not commit or upload the key.

Linux/macOS example:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json"
export FIREBASE_PROJECT_ID="your-project-id"
export FIREBASE_STORAGE_BUCKET="your-exact-storage-bucket-name"
export ADMIN_EMAIL="coordinator@example.com"
export ADMIN_PASSWORD="Use-a-strong-temporary-password"
export ADMIN_FIRST_NAME="System"
export ADMIN_LAST_NAME="Administrator"

cd functions
npm run create-admin
```

PowerShell example:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\secure\service-account.json"
$env:FIREBASE_PROJECT_ID="your-project-id"
$env:FIREBASE_STORAGE_BUCKET="your-exact-storage-bucket-name"
$env:ADMIN_EMAIL="coordinator@example.com"
$env:ADMIN_PASSWORD="Use-a-strong-temporary-password"
$env:ADMIN_FIRST_NAME="System"
$env:ADMIN_LAST_NAME="Administrator"

cd functions
npm run create-admin
```

The script creates the Firebase Authentication user and the matching Firestore user profile with the `admin` role. Sign in to Attachly using that **email address** and password. Once logged in, use **Users & students** to create student and lecturer accounts. Creating a user there creates the Firebase Authentication account and matching Firestore user record; the associated academic profile is then saved through the same secured API.

## 5. Run the frontend locally

```bash
cd frontend
npm run dev
```

Open the local Vite URL printed in the terminal. The API calls are sent to the deployed Firebase Function configured in `VITE_FIREBASE_API_URL`. To build the production frontend:

```bash
npm run build
```

## 6. Deploy the frontend to Vercel

1. Push this project to GitHub.
2. In Vercel, import the repository.
3. Set **Root Directory** to `frontend`.
4. Keep the build command as `npm run build` and output directory as `dist`.
5. Add all six `VITE_...` variables from `frontend/.env.example` under Vercel **Project → Settings → Environment Variables**. Use the real Firebase web app configuration and deployed Cloud Function URL.
6. Redeploy after adding or changing environment variables.

The included `frontend/vercel.json` routes application paths back to `index.html`, so React Router pages such as `/dashboard` and `/login` work on refresh.

## Authentication and data flow

- Users sign in with Firebase Authentication using **email and password**. Firebase manages password hashing, ID-token issuance, token refresh and session persistence.
- The frontend attaches the signed-in user's Firebase ID token to each API request.
- The Cloud Function verifies the ID token, loads the user's role/profile from Firestore, applies the corresponding permissions and performs the data operation.
- Account creation and password changes use the Firebase Admin SDK in the trusted Cloud Function.
- Application records are stored in Firestore collections. File uploads go to private Storage paths and downloads pass through the authenticated API.
- Browser Firestore and Storage access is denied by the included rules. Do not relax these rules to make the application work; use the secured API.

## Firestore collections

The API creates collections as records are added. Main collections include:

`users`, `student_profiles`, `lecturer_profiles`, `departments`, `programmes`, `academic_years`, `attachment_periods`, `placements`, `assignments`, `assessments`, `logbooks`, `logbook_feedback`, `assessment_categories`, `assessment_criteria`, `grading_scales`, `assessment_marks`, `final_results`, `notifications`, `documents` and `audit_logs`.

A small `_counters` collection allocates numeric IDs to preserve compatibility with the existing React form values and record relationships.

## Important migration notes

- The former Django/PostgreSQL backend has been removed from this Firebase edition. There is no Django ORM, PostgreSQL connection string, JWT endpoint or Django Admin dependency in this project.
- Existing PostgreSQL/SQLite records are **not automatically copied** into Firestore. This archive contains the application conversion, not a data migration from a live database. Export and map any existing records separately before switching a live institution to this version.
- Existing Django passwords cannot be transferred as plaintext. Users must be provisioned in Firebase Authentication and issued new passwords. The first admin is created with the bootstrap script.
- Only the account profile and records in Firebase are used after conversion. Do not put Firebase service-account JSON files, private keys or production `.env` files in GitHub or Vercel source.
- For production, configure Firebase Authentication authorized domains, restrict API access as appropriate for your institution, monitor Cloud Function logs, configure backup/export schedules for Firestore, and review Storage retention and costs.

## Assessment scoring rules

An administrator configures active assessment criteria with maximum marks and weightings. For each criterion, final marks are normalized against the maximum mark and averaged where more than one final mark exists. The criterion weighting is then applied. Active criteria must total exactly 100%, and every required criterion must have a final mark before finalization. The resulting score is rounded to two decimal places and matched to an active grading band. A result is visible to a student only after an administrator publishes it.

The values configured in a new Firebase project are not populated with institution-specific grading policy. The coordinator must add the institution's approved departments, programmes, academic years, attachment periods, assessment criteria and grading scales.
