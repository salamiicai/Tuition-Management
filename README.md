# Home Tutor – fresh start (free, Firebase Spark plan)

## 1. New Firebase project (free)
console.firebase.google.com → Add project → Build → Firestore Database (production mode) → Project settings → Add web app → copy the config into `js/config.js`.

## 2. Your email
Put your Google email (lowercase) in `js/config.js` (ADMIN_EMAIL) AND in `firestore.rules`.

## 3. Sign-in
Authentication → Sign-in method → enable Google (and optionally Email link). Settings → Authorized domains → add your hosting domain.

## 4. Rules
Firestore → Rules → paste `firestore.rules` → Publish.

## 5. Host over https
Firebase Hosting, GitHub Pages or Cloudflare Pages (free).

## 6. Start
Open `login.html` → sign in → Settings → set your name → Students → add students → WhatsApp button sends each guardian a private link.

Backups: Settings → Download backup (restore with the same page).
Student links are secret tokens: share only with the guardian.
Untested against a live project: check the rules in the Rules Playground.

## Design
Modern violet/aqua theme, light + dark (auto, plus a toggle), animated progress ring, staggered cards, confetti when a month ends, bottom tab bar on phones and a side rail on desktop. Animations switch off automatically for people who prefer reduced motion. Styles live in `css/style.css`, effects in `js/fx.js`.

## What's inside
- **Join form** (`join.html`): Settings → turn on "Accept new student registrations", then Students → "Join form link". Students fill it, you review and approve under "Join requests", then send the welcome link.
- **Materials**: type (Note, Video, PDF, Exam, Link, Other), required subject (add subjects on the fly), optional description, assign with checkboxes, then send on WhatsApp. Students can filter by subject/type and search.
- **Nano** tab: Library, Add (step 1 is remembered), Bulk import (AI prompt + JSON preview + duplicate check), Exams, Routes (class → subject → chapter → topic).
- **Nano exams**: pick questions, set time, credits per correct answer (and optional penalty), assign students. Each student gets their own exam link (`exam.html`) and it shows in their Nano tab. First attempt earns credits; retakes are practice.
- **Exams** tab: offline exams (MCQ / written), enter marks, results appear in each student's Results with a progress graph, and you can WhatsApp the result.
- Every WhatsApp message ends with `Name · title` (set in Settings → profile).

## Honest limits
- No server means the answer key is inside the exam data the student's browser downloads. A determined student could find it. Nano is built for practice and engagement; use offline exams for real marks.
- Credits are stored as one create-only record per exam, capped by the exam's maximum, so they cannot be raised or repeated, but the score itself is computed in the browser.
- After the first publish, test: join form, one Nano exam end to end, and the Rules Playground.

## App icon & install
Icons are in `icons/` (atom + orbit on a violet gradient). The teacher app and each student page can be installed to the home screen (Chrome/Android: Install button in Settings or the Me tab; iPhone: Share → Add to Home Screen). Each student's installed app opens their own private page and is named after your name · title. Needs https hosting.

## Push notifications (optional, free)
Students get a notification on their phone when you add a Nano exam, a material, or publish a result.

1. Open `push-setup.html` in your browser → **Generate keys**. You get a PUBLIC and a PRIVATE key.
2. Put the PUBLIC key in `js/config.js` → `VAPID_PUBLIC_KEY`.
3. Create a free Cloudflare account → **Workers & Pages → Create → Create Worker** → name it (e.g. `hometutor-push`) → Deploy → **Edit code** → delete the sample and paste all of `worker/worker.js` → Deploy.
4. Worker → **Settings → Variables and Secrets** → add:
   - `VAPID_PRIVATE_JWK` (type **Secret**) = the PRIVATE key
   - `VAPID_PUBLIC` = the PUBLIC key
   - `VAPID_SUBJECT` = `mailto:your@email.com`
   - `FIREBASE_PROJECT_ID` = your Firebase project id
   - `ADMIN_EMAIL` = your teacher email
   - `ALLOWED_ORIGIN` = your site address, e.g. `https://yourname.web.app` (no trailing slash)
5. Copy the worker address (like `https://hometutor-push.yourname.workers.dev`) into `js/config.js` → `PUSH_WORKER_URL`.
6. Re-upload the site and re-publish `firestore.rules` (it now has a `push` rule).
7. Each student opens their dashboard → **Me** → **Turn on notifications**. On iPhone they must first add the page to the Home Screen (iOS 16.4+).

Only your teacher login can make the worker send anything. Notification addresses can only be read by you. Check Cloudflare's current free limits; a few students use a tiny fraction.
