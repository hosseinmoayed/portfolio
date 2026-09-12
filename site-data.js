/* ============================================================
   SynapseX — public-site data loader
   ------------------------------------------------------------
   One ES module included by every public page:
     <script type="module" src="site-data.js"></script>

   Exposes:
     window.SITE_DATA.ready   → Promise<{content, templates, teasers, tags}>
     window.SITE_DATA.source  → "pending" | "firestore" | "fallback"
     window.SITE_DATA.defaults → the embedded defaults (used by the admin Seed button)

   Content is fetched from /api/data — a same-origin function that reads
   Firestore server-side. The Firebase SDK is deliberately NOT loaded in the
   browser: gstatic.com and firestore.googleapis.com are unreachable on some
   networks (notably plain Iranian IPs), which used to leave those visitors
   stuck on these embedded defaults forever.

   Contract: `ready` ALWAYS resolves (never rejects), within
   DATA_TIMEOUT_MS at the latest. On an empty collection the
   embedded defaults win. A failed/absent module means pages fall
   back to their own local arrays (each page guards
   `window.SITE_DATA &&`).
   ============================================================ */

/* ---------- Embedded defaults (current hardcoded site content) ---------- */

const SITE_CONTENT_DEFAULTS = {
  hero_name1: "I'M",
  hero_name2: "HOSSEIN",
  hero_subtitle: "AI Creative Designer",
  hero_right1: "Ideas",
  hero_right2: "into",
  hero_right3: "visuals",

  sec2_text1: "EVERY IDEA\nSTARTS\nSOMEWHERE",
  sec2_text2: "I DESIGN\nDIGITAL\nEXPERIENCES",
  sec2_text3: "FROM WEBSITES\nTO CINEMATIC\nADS",
  sec2_text4: "EXPLORE MY WORK",

  contact_title1: "GET IN",
  contact_title2: "TOUCH",
  contact_subtitle: "Have an idea in mind? Pick a channel — I reply fast.",

  contact_github_label: "Github",
  contact_github_desc: "Explore my work",
  contact_github_addr: "github.com/hosseinmoayed",
  contact_github_url: "https://github.com/hosseinmoayed",

  contact_telegram_label: "Telegram",
  contact_telegram_desc: "Fastest way to reach me",
  contact_telegram_addr: "t.me/hosseinammyd",
  contact_telegram_url: "https://t.me/hosseinammyd",

  contact_email_label: "Email",
  contact_email_desc: "For business & collabs",
  contact_email_addr: "Hossein.moayedfard@gmail.com",
  contact_email_url: "mailto:Hossein.moayedfard@gmail.com",

  footer_status: "Available for freelance",
  footer_credit: "Hossein Moayedfard © 2026",

  cv_url: "https://apps.apple.com"
};

/* Showcase cards → the SITES arrays in web-experiences.html / cinematic-ads.html.
   `page` splits them: "web" → web-experiences, "cinematic" → cinematic-ads,
   "" / missing → both (back-compat with seeded docs). */
const TEMPLATES_DEFAULT = [
  { tag: "Landing Page",    name: "NOVA",  src: "web_expreience_scrub.mp4", link: "/", page: "web",
    desc: "A cinematic product launch — scroll-scrubbed hero film, neon UI, and one decisive call to action." },
  { tag: "Creative Studio", name: "AXIOM", src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_095750_32a52ce0-2005-45c9-9093-41f03fde9530.mp4", link: "/", page: "cinematic",
    desc: "A studio's living showreel: motion-first layouts where every section performs as you scroll." },
  { tag: "Commerce",        name: "FLUX",  src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_095810_ecea3dd2-fc5e-4e41-8696-4219290b6589.mp4", link: "/", page: "cinematic",
    desc: "Storefront design tuned for conversion — fast, tactile, and unmistakably premium." },
  { tag: "Portfolio",       name: "HALO",  src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_080203_fd7f4f85-3a86-4837-8192-85e7bfe68e75.mp4", link: "/", page: "web",
    desc: "A portfolio that frames the work like film — depth, light and restraint in equal measure." }
];

/* WE cards → the WE_DATA array in index.html (sec2 "generated" cards) */
const TEASERS_DEFAULT = [
  { h: "Realtime UI",     p: "Fluid interfaces that respond in milliseconds.",            src: "web_expreience_scrub.mp4" },
  { h: "Cinematic Web",   p: "Scroll-driven stories with video-grade motion.",           src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_095750_32a52ce0-2005-45c9-9093-41f03fde9530.mp4" },
  { h: "Immersive 3D",    p: "Depth, light and shaders, straight in the browser.",       src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_095810_ecea3dd2-fc5e-4e41-8696-4219290b6589.mp4" },
  { h: "Design Systems",  p: "Scalable component architecture, end to end.",             src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_080203_fd7f4f85-3a86-4837-8192-85e7bfe68e75.mp4" },
  { h: "Storefronts",     p: "Conversion-first commerce, fast by default.",              src: "web_expreience_scrub.mp4" },
  { h: "Live Dashboards", p: "Realtime data, visualised the moment it lands.",           src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_095750_32a52ce0-2005-45c9-9093-41f03fde9530.mp4" },
  { h: "Generative UX",   p: "Interfaces that adapt to each visitor.",                   src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_095810_ecea3dd2-fc5e-4e41-8696-4219290b6589.mp4" },
  { h: "Brand Sites",     p: "Identity-driven pages with a signature feel.",             src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_080203_fd7f4f85-3a86-4837-8192-85e7bfe68e75.mp4" }
];

/* Optional link overrides for the "View project" buttons and CV download.
   The per-template `link` field always wins over the global one. */
SITE_CONTENT_DEFAULTS.view_project_url = "";

const TAGS_DEFAULT = ["Landing Page", "Creative Studio", "Commerce", "Portfolio"];

/* ---------- Loader ---------- */

const DATA_TIMEOUT_MS = 2000;

// No orderBy in the query (Firestore silently drops docs missing the field) —
// fetch everything, filter, sort client-side.
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

function normalize(raw) {
  const d = raw || {};
  return {
    content: { ...SITE_CONTENT_DEFAULTS, ...(d.content || {}) },

    templates: (d.templates || [])
      .filter(t => t.published !== false)
      .sort(byOrder)
      .map(t => ({
        tag: t.tag || "", name: t.name || "",
        src: t.src || "", desc: t.desc || "",
        link: t.link || "/",
        page: t.page || ""          // "web" | "cinematic" | "" (= both pages)
      })),

    teasers: (d.teasers || [])
      .filter(t => t.published !== false)
      .sort(byOrder)
      .map(t => ({
        h: t.title || "", p: t.desc || "",
        src: t.mediaUrl || "", type: t.type || "video"
      })),

    tags: (d.tags || []).sort(byOrder).map(t => t.name || "")
  };
}

function withDefaults(d) {
  return {
    content: { ...SITE_CONTENT_DEFAULTS, ...(d?.content || {}) },
    templates: (d?.templates?.length) ? d.templates : TEMPLATES_DEFAULT,
    teasers: (d?.teasers?.length) ? d.teasers : TEASERS_DEFAULT,
    tags: (d?.tags?.length) ? d.tags : TAGS_DEFAULT
  };
}

const defaults = withDefaults(null);

async function loadFromApi() {
  const r = await fetch("/api/data", { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error("api " + r.status);
  const raw = await r.json();
  if (raw && raw.error) throw new Error(raw.error);
  return normalize(raw);
}

async function resolve() {
  try {
    const d = await loadFromApi();
    window.SITE_DATA.source = "firestore";
    return withDefaults(d);
  } catch (err) {
    console.info("[SITE_DATA] using embedded defaults (" + (err && err.message ? err.message : err) + ")");
    window.SITE_DATA.source = "fallback";
    return defaults;
  }
}

window.SITE_DATA = { ready: null, live: null, source: "pending", defaults };

/* The timeout only races the FIRST paint: if the API is slow (a cold
   serverless start can outlast it) `ready` hands out the embedded defaults so
   the page never blocks. `live` keeps waiting and resolves with the real data
   whenever it lands, so consumers can re-render from it. Both always resolve
   and never reject. */
const live = resolve();
const ready = Promise.race([
  live,
  new Promise(res => setTimeout(() => {
    // never clobber a real result — the loser of this race still runs its
    // callback, so guard the write
    if (window.SITE_DATA.source !== "firestore") window.SITE_DATA.source = "fallback";
    res(defaults);
  }, DATA_TIMEOUT_MS))
]);

window.SITE_DATA.ready = ready;
window.SITE_DATA.live = live;