/* Same-origin reader for the public site data.
   Visitors whose network blocks gstatic.com / firestore.googleapis.com
   (e.g. plain Iranian IPs) can't reach Firestore from the browser, so the
   read happens here on the deployment's own domain instead.

   Auth: FIREBASE_SERVICE_ACCOUNT (the service-account JSON, raw or base64)
   → RS256 JWT → OAuth access token → Bearer. The public web API key is only
   a local-dev fallback; it is referrer-restricted and 403s from a server. */

import crypto from "node:crypto";

const PROJECT_ID = "portfolio-6efc7";
const WEB_API_KEY = "AIzaSyC0j1RAadPRzXrq-HmwEPr0cndQCzUzoUs";
const SCOPE = "https://www.googleapis.com/auth/datastore";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const text = raw.trimStart().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");
  const sa = JSON.parse(text);
  if (typeof sa.private_key === "string") {
    sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  }
  return sa;
}

let cachedToken = { value: "", expiresAt: 0 };

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken.value && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT" });
  const claims = encode({
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  });
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(sa.private_key, "base64url");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`
    })
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const json = await res.json();
  cachedToken = {
    value: json.access_token,
    expiresAt: now + (Number(json.expires_in) || 3600)
  };
  return cachedToken.value;
}

async function firestoreFetch(path, params, sa) {
  const qs = new URLSearchParams(params || {});
  const headers = { accept: "application/json" };
  if (sa) headers.authorization = `Bearer ${await accessToken(sa)}`;
  else qs.set("key", WEB_API_KEY);
  return fetch(`${BASE}/${path}?${qs}`, { headers });
}

function decodeValue(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const k of Object.keys(fields)) out[k] = decodeValue(fields[k]);
  return out;
}

async function listCollection(name, sa) {
  const docs = [];
  let token = "";
  do {
    const params = { pageSize: "300" };
    if (token) params.pageToken = token;
    const res = await firestoreFetch(name, params, sa);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    const json = await res.json();
    for (const d of json.documents || []) docs.push(decodeFields(d.fields || {}));
    token = json.nextPageToken || "";
  } while (token);
  return docs;
}

async function getDoc(path, sa) {
  const res = await firestoreFetch(path, {}, sa);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return decodeFields((await res.json()).fields || {});
}

export async function fetchSiteData(sa) {
  const [content, templates, teasers, tags] = await Promise.all([
    getDoc("siteContent/main", sa),
    listCollection("templates", sa),
    listCollection("teasers", sa),
    listCollection("tags", sa)
  ]);
  return { content: content || {}, templates, teasers, tags };
}

export default async function handler(req, res) {
  try {
    const data = await fetchSiteData(readServiceAccount());
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
    res.status(200).send(JSON.stringify(data));
  } catch (err) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String((err && err.message) || err) });
  }
}