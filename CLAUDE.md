# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A static portfolio site (SynapseX) with cinematic scroll-scrubbed video experiences, plus a **Firebase-backed CMS** (admin panel) for editing site content without touching code. No build system, no package manager, no test framework — pure static HTML/CSS/JS.

## Development Commands

```bash
# Start dev server (port 5599, HTTP Range-enabled — REQUIRED for video scrubbing)
python serve.py 5599
```

Then open http://localhost:5599/synapsex.html (main), /web_experiences_page.html, /cinematic_ads_page.html, or /admin/login.html (admin panel).

**Note:** `serve.py` implements Range/206 responses and threading; a plain `python -m http.server` breaks video seeking. The Browser-pane launch config uses `serve.py`.

## Repository Structure

```
├── synapsex.html              # Main page: hero, sec2 scroll-scrub film, WE cards, contact
├── web_experiences_page.html  # Showcase sub-page (SITES builder + SITE_DATA wiring)
├── cinematic_ads_page.html    # Showcase sub-page (same + "View project" zoom feature)
├── site-data.js               # ES module: embedded defaults + Firestore fetch (2s timeout) → window.SITE_DATA
├── firebase-config.js         # Public-by-design config: Firebase web config, Cloudinary unsigned preset, ADMIN_EMAIL
├── firestore.rules            # Canonical security rules — paste into Firebase Console
├── admin/
│   ├── login.html             # Firebase Auth email/password login
│   ├── dashboard.html         # 4 sections: Site Text / Tags / Templates / Teasers
│   ├── admin.css              # Neon-green (#2ce06d) on black, plain CSS
│   └── admin.js               # Auth guard, Firestore CRUD, Cloudinary XHR upload, seed button
├── serve.py                   # Dev server (Range support, threaded, port 5599)
└── *.mp4                      # All-intra H.264 videos for scroll-scrubbing
```

## CMS Architecture

- **Fallback-first contract**: `window.SITE_DATA.ready` (in site-data.js) ALWAYS resolves within 2s. Firestore data wins; empty collection/timeout/offline → embedded defaults. Pages also guard `window.SITE_DATA &&` so a missing module never breaks them.
- **Collections** (Firestore): `siteContent/main` (flat text keys), `templates` (showcase cards → SITES), `teasers` (WE cards → WE_DATA), `tags`. All sorted client-side by `order`, filtered by `published !== false`.
- **Text wiring**: public pages use `data-key` attributes (`hero_name1`, `sec2_text1`, `contact_github_label`, …). `applySiteContent()` writes Firestore values into `data-text`/textContent **before** the entrance scramble runs (`startEntrance()` is gated on `SITE_DATA.ready` with a 3.2s safety timer).
- **Card builders are idempotent**: sub-page `buildSites(list)` reuses the existing `.site-stage`, binds scroll/zoom listeners once (`sitesBuilt`/`zoomWired` flags, `sitesUpdate` indirection). synapsex `buildWePages()` guards with `weBuilt`.
- **Admin**: first run → click "Initialize with current site content" (seed button) in dashboard. Writes are allowed only for `ADMIN_EMAIL` (see firestore.rules; tighten with `email_verified` after verifying).
- **Adding a dynamic text section later**: add a key to `SITE_TEXT_KEYS` in admin/admin.js + a `data-key` attribute in the HTML. Nothing else.
- **Cloudinary**: unsigned preset `portfolio_unsigned`, folder `portfolio/`. The API Secret never appears client-side. Media can also be pasted as a URL (existing CloudFront assets stay where they are).

## Key Technical Details

- Video scrubbing (hero mouse-scrub, sec2 pin-scrub) requires all-intra encoded videos (`-g 1 -keyint_min 1`) — see encode command below.
- Neon button `.nbtn`: conic-gradient edge, `@property --flow` traveling highlight, 9 lightning-bolt hover animation, `border-radius: 26px`, `--nb: #2ce06d`.
- Tailwind Play CDN + Lenis + Google Fonts (Space Mono/Anton SC) + Bootstrap Icons, all via CDN. Admin pages deliberately avoid Tailwind (plain admin.css).

## Common Tasks

| Task | Approach |
|------|----------|
| Change CMS text keys/labels | `SITE_TEXT_KEYS` in [admin/admin.js](admin/admin.js) + `data-key` in HTML |
| Adjust hero entrance timing | `startEntrance()` / safety timer in synapsex.html inline script |
| Video encode for scrubbing | `ffmpeg -i in.mp4 -an -c:v libx264 -preset slow -crf 15 -g 1 -keyint_min 1 -sc_threshold 0 -pix_fmt yuv420p -movflags +faststart out.mp4` |
| Update security rules | Edit [firestore.rules](firestore.rules), paste into Firebase Console → Rules → Publish |
| Deployment | Pure static — push to GitHub, import on Vercel/Netlify (no env vars), then add the production domain in Firebase → Authentication → Settings → Authorized domains |

## No Build/Lint/Test

Pure static project — changes visible on refresh. Dev server: `python serve.py 5599`.
