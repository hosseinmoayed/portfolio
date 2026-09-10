/* ============================================================
   SynapseX Admin — dashboard logic
   Auth guard · Firestore CRUD · Cloudinary unsigned upload
   Plain ES module, Firebase v10 via gstatic CDN.
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs,
  addDoc, deleteDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { FIREBASE_CONFIG, CLOUDINARY } from "../firebase-config.js";

/* ---------- boot ---------- */

initializeApp(FIREBASE_CONFIG);
const auth = getAuth();
const db = getFirestore();

onAuthStateChanged(auth, (user) => {
  if (!user) { location.replace("login.html"); return; }
  document.getElementById("sideEmail").textContent = user.email;
  boot();
});

/* ---------- tiny UI helpers ---------- */

const $ = (sel) => document.querySelector(sel);

function toast(msg, kind = "ok") {
  const t = document.createElement("div");
  t.className = "toast" + (kind === "err" ? " err" : "");
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 3600);
}

function uiConfirm(msg) {
  return new Promise((resolve) => {
    const box = $("#confirmBox");
    $("#confirmMsg").textContent = msg;
    box.classList.add("show");
    const done = (v) => { box.classList.remove("show"); cleanup(); resolve(v); };
    const onYes = () => done(true);
    const onNo = () => done(false);
    const onKey = (e) => { if (e.key === "Escape") done(false); };
    function cleanup() {
      $("#confirmYes").removeEventListener("click", onYes);
      $("#confirmNo").removeEventListener("click", onNo);
      document.removeEventListener("keydown", onKey);
    }
    $("#confirmYes").addEventListener("click", onYes);
    $("#confirmNo").addEventListener("click", onNo);
    document.addEventListener("keydown", onKey);
  });
}

function setBusy(btn, busy, labelBusy = "Working…") {
  if (busy) { btn.dataset.label = btn.textContent; btn.textContent = labelBusy; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- nav ---------- */

$("#sideNav").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-nav]");
  if (!b) return;
  document.querySelectorAll("#sideNav button").forEach((x) => x.classList.toggle("active", x === b));
  document.querySelectorAll(".section").forEach((s) => s.classList.toggle("active", s.id === "sec-" + b.dataset.nav));
});

$("#logoutBtn").addEventListener("click", () => signOut(auth));

/* ============================================================
   SITE TEXT
   ============================================================ */

/* Adding a dynamic section later = one entry here + a data-key in the HTML. */
const SITE_TEXT_KEYS = [
  { group: "Hero",            key: "hero_name1",     label: "Hero line 1",            multiline: false },
  { group: "Hero",            key: "hero_name2",     label: "Hero name",              multiline: false },
  { group: "Hero",            key: "hero_subtitle",  label: "Hero subtitle",          multiline: false },
  { group: "Hero",            key: "hero_right1",    label: "Right block — word 1",   multiline: false },
  { group: "Hero",            key: "hero_right2",    label: "Right block — word 2",   multiline: false },
  { group: "Hero",            key: "hero_right3",    label: "Right block — word 3",   multiline: false },
  { group: "Section 2",       key: "sec2_text1",     label: "Headline 1",             multiline: true,  help: "Line breaks with Enter" },
  { group: "Section 2",       key: "sec2_text2",     label: "Headline 2",             multiline: true },
  { group: "Section 2",       key: "sec2_text3",     label: "Headline 3",             multiline: true },
  { group: "Section 2",       key: "sec2_text4",     label: "Headline 4",             multiline: true },
  { group: "Contact",         key: "contact_title1", label: "Title word 1",           multiline: false },
  { group: "Contact",         key: "contact_title2", label: "Title word 2",           multiline: false },
  { group: "Contact",         key: "contact_subtitle", label: "Subtitle",             multiline: true },
  { group: "Contact — Github",   key: "contact_github_label",   label: "Card title", multiline: false },
  { group: "Contact — Github",   key: "contact_github_desc",    label: "Card desc",  multiline: false },
  { group: "Contact — Github",   key: "contact_github_addr",    label: "Handle",     multiline: false },
  { group: "Contact — Github",   key: "contact_github_url",     label: "Link URL",   type: "url" },
  { group: "Contact — Telegram", key: "contact_telegram_label", label: "Card title", multiline: false },
  { group: "Contact — Telegram", key: "contact_telegram_desc",  label: "Card desc",  multiline: false },
  { group: "Contact — Telegram", key: "contact_telegram_addr",  label: "Handle",     multiline: false },
  { group: "Contact — Telegram", key: "contact_telegram_url",   label: "Link URL",   type: "url" },
  { group: "Contact — Email",    key: "contact_email_label",    label: "Card title", multiline: false },
  { group: "Contact — Email",    key: "contact_email_desc",     label: "Card desc",  multiline: false },
  { group: "Contact — Email",    key: "contact_email_addr",     label: "Handle",     multiline: false },
  { group: "Contact — Email",    key: "contact_email_url",      label: "Link URL",   type: "url" },
  { group: "Footer",          key: "footer_status",  label: "Status line",            multiline: false },
  { group: "Footer",          key: "footer_credit",  label: "Copyright",              multiline: false },
  { group: "Links",           key: "cv_url",         label: "Download CV link",       type: "url" }
];

let textDirty = false;

async function loadSiteContent() {
  const snap = await getDoc(doc(db, "siteContent", "main"));
  const saved = snap.exists() ? snap.data() : {};
  renderTextForm(saved);
}

function renderTextForm(saved) {
  const form = $("#textForm");
  let html = "";
  let group = null;
  for (const k of SITE_TEXT_KEYS) {
    if (k.group !== group) {
      if (group !== null) html += "</div>";
      html += `<div class="fgroup"><h4>${escapeHtml(k.group)}</h4>`;
      group = k.group;
    }
    const val = saved[k.key] ?? "";
    const field = k.multiline
      ? `<textarea id="tk_${k.key}" data-key="${k.key}">${escapeHtml(val)}</textarea>`
      : `<input type="${k.type || "text"}" id="tk_${k.key}" data-key="${k.key}" value="${escapeHtml(val)}">`;
    html += `<div class="frow"><label for="tk_${k.key}">${escapeHtml(k.label)}</label><div>${field}` +
            (k.help ? `<div class="fhelp">${k.help}</div>` : "") + `</div></div>`;
  }
  html += "</div>";
  form.innerHTML = html;
  textDirty = false;
  $("#saveTextsBtn").disabled = true;
  $("#textDirty").style.display = "none";
}

$("#textForm").addEventListener("input", () => {
  if (!textDirty) { textDirty = true; $("#saveTextsBtn").disabled = false; $("#textDirty").style.display = ""; }
});

$("#saveTextsBtn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const values = {};
  for (const k of SITE_TEXT_KEYS) {
    values[k.key] = document.getElementById("tk_" + k.key).value;
  }
  setBusy(btn, true, "Saving…");
  try {
    await setDoc(doc(db, "siteContent", "main"), { ...values, updated_at: serverTimestamp() }, { merge: true });
    textDirty = false;
    $("#saveTextsBtn").disabled = true;
    $("#textDirty").style.display = "none";
    toast("Site text saved.");
  } catch (err) {
    console.error(err);
    toast("Save failed: " + err.code, "err");
  } finally {
    setBusy(btn, false);
  }
});

/* ============================================================
   TAGS
   ============================================================ */

let tagsCache = [];

async function loadTags() {
  const snap = await getDocs(collection(db, "tags"));
  tagsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  renderTags();
}

function renderTags() {
  const list = $("#tagList");
  if (!tagsCache.length) {
    list.innerHTML = `<div class="empty">No tags yet. Add one above — they’re used as labels on template cards.</div>`;
    return;
  }
  list.innerHTML = tagsCache.map((t, i) => `
    <div class="row">
      <span class="badge on">${escapeHtml(t.name)}</span>
      <div class="grow"></div>
      <button class="icon-btn" data-move="-1" data-id="${t.id}" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
      <button class="icon-btn" data-move="1" data-id="${t.id}" title="Move down" ${i === tagsCache.length - 1 ? "disabled" : ""}>↓</button>
      <button class="icon-btn danger" data-del="${t.id}" data-name="${escapeHtml(t.name)}" title="Delete">✕</button>
    </div>`).join("");
}

$("#tagList").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  const move = e.target.closest("[data-move]");
  try {
    if (del) {
      if (await uiConfirm(`Delete tag “${del.dataset.name}”?`)) {
        await deleteDoc(doc(db, "tags", del.dataset.del));
        toast("Tag deleted.");
        await loadTags();
      }
    } else if (move) {
      const i = tagsCache.findIndex((t) => t.id === move.dataset.id);
      const j = i + Number(move.dataset.move);
      if (i < 0 || j < 0 || j >= tagsCache.length) return;
      const batch = writeBatch(db);
      batch.update(doc(db, "tags", tagsCache[i].id), { order: j });
      batch.update(doc(db, "tags", tagsCache[j].id), { order: i });
      await batch.commit();
      await loadTags();
    }
  } catch (err) {
    console.error(err);
    toast("Operation failed: " + err.code, "err");
  }
});

$("#addTagBtn").addEventListener("click", async () => {
  const input = $("#newTagName");
  const name = input.value.trim();
  if (!name) { toast("Type a tag name first.", "err"); return; }
  try {
    await addDoc(collection(db, "tags"), { name, order: tagsCache.length, updated_at: serverTimestamp() });
    input.value = "";
    toast("Tag added.");
    await loadTags();
  } catch (err) {
    console.error(err);
    toast("Add failed: " + err.code, "err");
  }
});

/* ============================================================
   MEDIA — Cloudinary unsigned upload (XHR for progress)
   ============================================================ */

function uploadToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    const resourceType = file.type.startsWith("video") ? "video" : "image";
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/${resourceType}/upload`;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", CLOUDINARY.uploadPreset);
    fd.append("folder", CLOUDINARY.folder);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(json.secure_url);
        else reject(new Error(json?.error?.message || "Upload failed (" + xhr.status + ")"));
      } catch { reject(new Error("Upload failed — bad response.")); }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(fd);
  });
}

/* ============================================================
   TEMPLATES & TEASERS (shared modal machinery)
   ============================================================ */

let templatesCache = [];
let teasersCache = [];

async function loadTemplates() {
  const snap = await getDocs(collection(db, "templates"));
  templatesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  renderTemplates();
}
async function loadTeasers() {
  const snap = await getDocs(collection(db, "teasers"));
  teasersCache = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  renderTeasers();
}

function mediaThumb(src, isVideo) {
  if (!src) return `<span class="thumb"></span>`;
  return isVideo
    ? `<video class="thumb" src="${escapeHtml(src)}#t=0.5" muted preload="metadata"></video>`
    : `<img class="thumb" src="${escapeHtml(src)}" alt="">`;
}

function renderTemplates() {
  const list = $("#templateList");
  if (!templatesCache.length) {
    list.innerHTML = `<div class="empty">No templates yet — the site shows its built-in placeholders.
      <br><button class="btn btn-sm" id="seedBtn2">Initialize with current site content</button></div>`;
    const b = list.querySelector("#seedBtn2");
    if (b) b.addEventListener("click", seedFirestore);
    return;
  }
  list.innerHTML = templatesCache.map((t) => `
    <div class="row">
      ${mediaThumb(t.src, (t.src || "").match(/\.(mp4|webm|mov)(\?|$)/i))}
      <div class="grow">
        <div class="r-title">${escapeHtml(t.name)} <span class="badge ${t.published !== false ? "on" : "off"}">${t.published !== false ? "live" : "hidden"}</span></div>
        <div class="r-sub">${escapeHtml(t.tag)} · ${t.page === "web" ? "Web Experiences" : t.page === "cinematic" ? "Cinematic Ads" : "Both pages"} · order ${Number(t.order ?? 0)} · ${escapeHtml(t.src)}</div>
      </div>
      <button class="btn btn-sm" data-edit="${t.id}">Edit</button>
      <button class="icon-btn danger" data-del="${t.id}" data-name="${escapeHtml(t.name)}" title="Delete">✕</button>
    </div>`).join("");
}

function renderTeasers() {
  const list = $("#teaserList");
  if (!teasersCache.length) {
    list.innerHTML = `<div class="empty">No teasers yet — the site shows its built-in placeholders.
      <br><button class="btn btn-sm" id="seedBtn3">Initialize with current site content</button></div>`;
    const b = list.querySelector("#seedBtn3");
    if (b) b.addEventListener("click", seedFirestore);
    return;
  }
  list.innerHTML = teasersCache.map((t) => `
    <div class="row">
      ${mediaThumb(t.mediaUrl, (t.mediaUrl || "").match(/\.(mp4|webm|mov)(\?|$)/i))}
      <div class="grow">
        <div class="r-title">${escapeHtml(t.title)} <span class="badge ${t.published !== false ? "on" : "off"}">${t.published !== false ? "live" : "hidden"}</span></div>
        <div class="r-sub">order ${Number(t.order ?? 0)} · ${escapeHtml(t.mediaUrl)}</div>
      </div>
      <button class="btn btn-sm" data-edit="${t.id}">Edit</button>
      <button class="icon-btn danger" data-del="${t.id}" data-name="${escapeHtml(t.title)}" title="Delete">✕</button>
    </div>`).join("");
}

async function listAction(kind, e) {
  const del = e.target.closest("[data-del]");
  const edit = e.target.closest("[data-edit]");
  try {
    if (del) {
      if (await uiConfirm(`Delete “${del.dataset.name}”? This can’t be undone.`)) {
        await deleteDoc(doc(db, kind, del.dataset.del));
        toast("Deleted.");
        kind === "templates" ? await loadTemplates() : await loadTeasers();
      }
    } else if (edit) {
      const cache = kind === "templates" ? templatesCache : teasersCache;
      const item = cache.find((x) => x.id === edit.dataset.edit);
      if (item) openItemModal(kind, item);
    }
  } catch (err) {
    console.error(err);
    toast("Operation failed: " + err.code, "err");
  }
}
$("#templateList").addEventListener("click", (e) => listAction("templates", e));
$("#teaserList").addEventListener("click", (e) => listAction("teasers", e));

/* ---------- add/edit modal ---------- */

const modal = $("#itemModal");
const backdrop = $("#modalBackdrop");

function mediaBlockHtml(kind, item) {
  const isTeaser = kind === "teasers";
  const srcField = isTeaser ? "mediaUrl" : "src";
  const src = item[srcField] || "";
  return `
    <div class="fgroup">
      <h4>Media</h4>
      <div class="media-block">
        <div class="f2" style="margin-bottom:10px;">
          <div>
            <label class="check" style="font-size:12px; color:var(--dim);">Upload to Cloudinary
              <input type="file" id="mi_file" accept="video/mp4,video/webm,video/quicktime,image/*">
            </label>
          </div>
          <div>
            <input type="text" id="mi_${srcField}" placeholder="…or paste a media URL" value="${escapeHtml(src)}">
          </div>
        </div>
        <div class="upload-progress" id="mi_prog"><div class="bar"><div class="fill"></div></div><div class="pct">0%</div></div>
        <div class="media-preview" id="mi_prev">
          <video id="mi_prevv" controls muted src="${escapeHtml(src)}"></video>
          <img id="mi_previ" alt="" src="${escapeHtml(src)}" style="display:none;">
        </div>
      </div>
    </div>`;
}

function templateBasicsHtml(item) {
  const tagOptions = tagsCache.map((t) =>
    `<option value="${escapeHtml(t.name)}" ${item.tag === t.name ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("");
  const page = item.page || "";
  const showView = page !== "cinematic";
  return `
    <div class="fgroup">
      <h4>Basics</h4>
      <div class="f2">
        <div class="frow" style="margin:0;"><label>Tag</label><div>
          <select id="mi_tag">${tagOptions || '<option value="">— no tags yet —</option>'}</select>
        </div></div>
        <div class="frow" style="margin:0;"><label>Name</label><div><input type="text" id="mi_name" value="${escapeHtml(item.name || "")}"></div></div>
      </div>
      <div class="frow" style="margin:14px 0 0;"><label>Show on page</label><div>
        <select id="mi_page">
          <option value="web" ${page === "web" ? "selected" : ""}>Web Experiences</option>
          <option value="cinematic" ${page === "cinematic" ? "selected" : ""}>Cinematic Ads</option>
          <option value="" ${page === "" ? "selected" : ""}>Both pages</option>
        </select>
      </div></div>
      <div class="frow" id="mi_viewRow" style="margin:14px 0 0; ${showView ? "" : "display:none;"}"><label>View project link</label><div>
        <input type="text" id="mi_view_link" value="${escapeHtml(item.link || "index.html")}">
        <div class="fhelp">Target of the &ldquo;View project &rarr;&rdquo; link on Web Experiences.</div>
      </div></div>
      <div class="frow" style="margin:14px 0 0;"><label>Description</label><div><textarea id="mi_desc" style="min-height:56px;">${escapeHtml(item.desc || "")}</textarea></div></div>
      <div class="f2" style="margin-top:14px;">
        <div class="frow" style="margin:0;"><label>Order</label><div><input type="number" id="mi_order" value="${Number(item.order ?? nextOrder("templates"))}"></div></div>
        <div class="frow" style="margin:0;"><label>Visible</label><div><label class="check"><input type="checkbox" id="mi_pub" ${item.published !== false ? "checked" : ""}> shown on site</label></div></div>
      </div>
    </div>`;
}

function teaserBasicsHtml(item) {
  return `
    <div class="fgroup">
      <h4>Basics</h4>
      <div class="f2">
        <div class="frow" style="margin:0;"><label>Title</label><div><input type="text" id="mi_title" value="${escapeHtml(item.title || "")}"></div></div>
        <div class="frow" style="margin:0;"><label>Type</label><div>
          <select id="mi_type">
            <option value="video" ${item.type !== "image" ? "selected" : ""}>Video</option>
            <option value="image" ${item.type === "image" ? "selected" : ""}>Image</option>
          </select>
        </div></div>
      </div>
      <div class="frow" style="margin:14px 0 0;"><label>Description</label><div><textarea id="mi_desc" style="min-height:56px;">${escapeHtml(item.desc || "")}</textarea></div></div>
      <div class="f2" style="margin-top:14px;">
        <div class="frow" style="margin:0;"><label>Order</label><div><input type="number" id="mi_order" value="${Number(item.order ?? nextOrder("teasers"))}"></div></div>
        <div class="frow" style="margin:0;"><label>Visible</label><div><label class="check"><input type="checkbox" id="mi_pub" ${item.published !== false ? "checked" : ""}> shown on site</label></div></div>
      </div>
    </div>`;
}

function openItemModal(kind, item = null) {
  const isTeaser = kind === "teasers";
  const isVideoSrc = (s) => /\.(mp4|webm|mov)(\?|$)/i.test(s || "");
  const editing = !!item;
  item = item || {};

  modal.innerHTML = `
    <h3>${editing ? "Edit" : "New"} ${isTeaser ? "teaser" : "template"}</h3>

    ${isTeaser ? teaserBasicsHtml(item) : templateBasicsHtml(item)}

    ${mediaBlockHtml(kind, item)}

    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:6px;">
      <button class="btn" id="mi_cancel">Cancel</button>
      <button class="btn btn-primary" id="mi_save">${editing ? "Save" : "Create"}</button>
    </div>`;

  backdrop.classList.add("show");

  /* preview + upload wiring */
  const fileInput = modal.querySelector("#mi_file");
  const urlInput = modal.querySelector(isTeaser ? "#mi_mediaUrl" : "#mi_src");
  const prev = modal.querySelector("#mi_prev");
  const prevv = modal.querySelector("#mi_prevv");
  const previ = modal.querySelector("#mi_previ");

  function refreshPreview(src) {
    prev.classList.toggle("show", !!src);
    if (!src) return;
    const isVid = isVideoSrc(src);
    prevv.style.display = isVid ? "" : "none";
    previ.style.display = isVid ? "none" : "";
    prevv.src = isVid ? src : "";
    previ.src = isVid ? "" : src;
  }
  refreshPreview(item.mediaUrl || item.src || "");

  urlInput.addEventListener("input", () => refreshPreview(urlInput.value.trim()));

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const prog = modal.querySelector("#mi_prog");
    const fill = prog.querySelector(".fill");
    const pct = prog.querySelector(".pct");
    prog.classList.add("show");
    try {
      const url = await uploadToCloudinary(file, (p) => { fill.style.width = p + "%"; pct.textContent = p + "%"; });
      urlInput.value = url;
      refreshPreview(url);
      toast("Upload complete.");
    } catch (err) {
      toast("Upload failed: " + err.message, "err");
    } finally {
      setTimeout(() => prog.classList.remove("show"), 600);
      fileInput.value = "";
    }
  });

  const pageSel = modal.querySelector("#mi_page");
  const viewRow = modal.querySelector("#mi_viewRow");
  if (pageSel && viewRow) {
    pageSel.addEventListener("change", () => {
      viewRow.style.display = pageSel.value === "cinematic" ? "none" : "";
    });
  }

  modal.querySelector("#mi_cancel").addEventListener("click", closeModal);
  modal.querySelector("#mi_save").addEventListener("click", () => saveItem(kind, editing ? item.id : null));
}

function closeModal() {
  backdrop.classList.remove("show");
  modal.innerHTML = "";
}
backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });

function nextOrder(kind) {
  const cache = kind === "templates" ? templatesCache : teasersCache;
  return cache.length ? Math.max(...cache.map((x) => Number(x.order ?? 0))) + 1 : 0;
}

async function saveItem(kind, id) {
  const isTeaser = kind === "teasers";
  const g = (sel) => modal.querySelector(sel)?.value.trim() ?? "";
  const data = isTeaser
    ? {
        title: g("#mi_title"), desc: g("#mi_desc"),
        mediaUrl: g("#mi_mediaUrl"), type: g("#mi_type") || "video",
        order: Number(g("#mi_order") || 0), published: modal.querySelector("#mi_pub").checked,
        updated_at: serverTimestamp()
      }
    : {
        tag: g("#mi_tag"), name: g("#mi_name"), desc: g("#mi_desc"),
        src: g("#mi_src"), link: g("#mi_view_link") || "index.html",
        page: g("#mi_page") || "",
        order: Number(g("#mi_order") || 0), published: modal.querySelector("#mi_pub").checked,
        updated_at: serverTimestamp()
      };

  const missing = isTeaser
    ? (!data.title && "title") || (!data.mediaUrl && "media")
    : (!data.name && "name") || (!data.src && "media");
  if (missing) { toast("Fill in the " + missing + " first.", "err"); return; }

  const btn = modal.querySelector("#mi_save");
  setBusy(btn, true, "Saving…");
  try {
    if (id) await setDoc(doc(db, kind, id), data, { merge: true });
    else await addDoc(collection(db, kind), data);
    closeModal();
    toast((id ? "Saved." : "Created."));
    kind === "templates" ? await loadTemplates() : await loadTeasers();
  } catch (err) {
    console.error(err);
    toast("Save failed: " + err.code, "err");
    setBusy(btn, false);
  }
}

$("#addTemplateBtn").addEventListener("click", () => openItemModal("templates"));
$("#addTeaserBtn").addEventListener("click", () => openItemModal("teasers"));

/* ============================================================
   SEED — one click initializes Firestore from shipped defaults
   ============================================================ */

async function seedFirestore() {
  const ok = await uiConfirm("Initialize Firestore with the site’s current built-in content? Existing documents are kept and missing ones are added.");
  if (!ok) return;
  try {
    const defaults = (window.SITE_DATA && await window.SITE_DATA.ready) ||
      (await import("../site-data.js")).defaults;

    await setDoc(doc(db, "siteContent", "main"), { ...defaults.content, updated_at: serverTimestamp() }, { merge: true });

    const batch = writeBatch(db);
    defaults.templates.forEach((t, i) =>
      batch.set(doc(collection(db, "templates")), { ...t, order: i, published: true, updated_at: serverTimestamp() }));
    defaults.teasers.forEach((t, i) =>
      batch.set(doc(collection(db, "teasers")), {
        title: t.h, desc: t.p, mediaUrl: t.src, type: t.type || "video",
        order: i, published: true, updated_at: serverTimestamp()
      }));
    defaults.tags.forEach((name, i) =>
      batch.set(doc(collection(db, "tags")), { name, order: i, updated_at: serverTimestamp() }));
    await batch.commit();

    toast("Firestore initialized.");
    await Promise.all([loadTags(), loadTemplates(), loadTeasers()]);
  } catch (err) {
    console.error(err);
    toast("Seed failed: " + err.message, "err");
  }
}

/* ============================================================
   BOOT — load everything
   ============================================================ */

async function boot() {
  try {
    await Promise.all([loadSiteContent(), loadTags(), loadTemplates(), loadTeasers()]);
  } catch (err) {
    console.error(err);
    toast("Couldn’t load data — check Firestore rules and connection.", "err");
  }
}
