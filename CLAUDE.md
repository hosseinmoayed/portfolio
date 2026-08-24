# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a static portfolio/demo repository containing HTML landing pages with advanced CSS animations, video backgrounds, and interactive effects. No build system, package manager, or test framework — just static HTML/CSS/JS served via Python's http.server.

## Development Commands

```bash
# Start local dev server (port 5599)
python -m http.server 5599

# Or use the launch config
python -m http.server 5599
```

Then open http://localhost:5599/synapsex.html or http://localhost:5599/freebuff-landing.html

## Repository Structure

```
├── synapsex.html          # Main SynapseX landing page (complex CSS/JS)
├── freebuff-landing.html  # Freebuff landing page
├── button.png             # Reference button design
├── lion_hero_scrub.mp4    # Hero video (all-intra encoded for scrubbing)
├── lion_page2_new_hd.mp4  # Page 2 background video (4K→1080p)
└── lion_hero.mp4          # Original hero video
```

## Key Technical Details

**synapsex.html** is a single-file, self-contained landing page featuring:
- Video backgrounds with scroll-scrubbing (hero) and pin-scroll-scrubbing (page 2)
- Conic-gradient neon edge with white-hot top-left/bottom-right corners
- CSS @property animation for traveling edge highlight ("current on edge")
- 9-layer hover electricity effect: edge flow, flash, 9 lightning bolts (4 edge, 3 across face, 2 extra)
- ScrambleIn entrance animation + ScrambleText hover on nav links
- Inner frame layer (2px inset) + neon bracket notches with outward glow
- Conic-gradient edge lighting (brightest at top-left & bottom-right)
- All videos pre-encoded as all-intra H.264 for smooth seeking

**Key CSS variables:**
- `--nb: #2ce06d` (neon green)
- `--flow` (CSS @property for traveling edge animation)
- `border-radius: 26px` on `.nbtn`

**No external dependencies** — everything inlined in synapsex.html (Tailwind via CDN, Lenis via CDN, Google Fonts).

## Common Tasks

| Task | Approach |
|------|----------|
| Modify button neon edge | Edit `.nbtn::before` conic-gradient / radial-gradients |
| Adjust hover electricity | Edit `@keyframes zapA-I`, `.nbtn:hover .nbtn-bolt.*` animations |
| Change video scrub behavior | Edit JS in `<script>` (hero mouse-scrub, page 2 pin-scroll) |
| Modify neon notches | Edit `.nbtn-notch` SVG paths, `filter: drop-shadow()` |
| Tweak 3D convex effect | Adjust `.nbtn` box-shadow (inset highlights + drop shadow) |

## Video Encoding (for smooth scrubbing)

```bash
# All-intra H.264 for smooth seeking
ffmpeg -i input.mp4 -an -c:v libx264 -preset slow -crf 15 -g 1 -keyint_min 1 -sc_threshold 0 -pix_fmt yuv420p -movflags +faststart output.mp4
```

## No Build/Lint/Test

This is a pure static project — no package.json, no build step, no linter, no tests. Changes are visible immediately on refresh.