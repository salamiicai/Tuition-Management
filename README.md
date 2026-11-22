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
