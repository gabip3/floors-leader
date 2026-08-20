// Pulls new articles from the Soro RSS feed and turns each into a blog page
// in the site's own design, then rebuilds the blog listing (blog/index.html)
// from blog/posts.json — the manifest of every post, manual or Soro-sourced.
//
// Runs safely with nothing configured yet: if SORO_RSS_URL isn't set, it
// logs a message and exits without touching any files. See
// .github/workflows/soro-rss-sync.yml for how this gets triggered.
//
// The feed is a standard RSS 2.0 feed with the content: and media: XML
// namespaces (same shape WordPress RSS uses): each <item> has title, link,
// pubDate, description, content:encoded (full HTML body) and usually a
// media:content or enclosure image. This was confirmed against the live,
// still-empty feed on 2026-08-20 — verify against the Action log the first
// time a real article shows up, since an empty feed can't confirm the
// exact item shape.
"use strict";
const fs = require("fs");
const path = require("path");

const RSS_URL = process.env.SORO_RSS_URL;
const SITE_URL = "https://www.floorsleader.net";
const DEFAULT_IMAGE = "../assets/flooring/flooring-14.jpg";

const BLOG_DIR = path.join(__dirname, "..", "blog");
const POSTS_JSON = path.join(BLOG_DIR, "posts.json");

function stripCdata(s) {
  if (!s) return "";
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/);
  return m ? m[1] : s;
}
function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function tag(xml, name) {
  // matches <name>text</name> or <ns:name>text</ns:name>, non-greedy, single occurrence
  const re = new RegExp(`<(?:[\\w-]+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`, "i");
  const m = xml.match(re);
  return m ? stripCdata(m[1]).trim() : "";
}
function attr(xml, tagName, attrName) {
  const re = new RegExp(`<(?:[\\w-]+:)?${tagName}[^>]*\\s${attrName}=["']([^"']+)["'][^>]*/?>`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}

function parseItems(xml) {
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const title = decodeEntities(tag(block, "title"));
    const link = tag(block, "link");
    const guid = tag(block, "guid") || link;
    const pubDate = tag(block, "pubDate");
    const description = decodeEntities(tag(block, "description"));
    const contentEncoded = tag(block, "content:encoded");
    const image = attr(block, "media:content", "url") || attr(block, "enclosure", "url") || "";
    const category = decodeEntities(tag(block, "category"));
    items.push({ title, link, guid, pubDate, description, contentEncoded, image, category });
  }
  return items;
}

function slugify(str) {
  return String(str).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function postPageHtml({ title, excerpt, category, image, slug, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Floor's Leader</title>
<meta name="description" content="${escapeHtml(excerpt)}">
<link rel="canonical" href="${SITE_URL}/blog/${slug}.html">
<link rel="icon" href="../assets/logo/favicon-new.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css?v=3">
</head>
<body>

<header class="site-header scrolled" id="header">
  <div class="wrap header-inner">
    <a class="brand" href="../index.html" aria-label="Floor's Leader home">
      <img src="../assets/logo/logo-new.png" alt="Floor's Leader" class="brand-lockup">
    </a>
    <nav class="nav" aria-label="Primary">
      <a href="../index.html#services">Services</a>
      <a href="../index.html#work">Projects</a>
      <a href="../index.html#about">About</a>
      <a href="index.html">Journal</a>
      <a href="../index.html#contact">Contact</a>
    </nav>
    <a class="btn btn-phone" href="tel:+14045474336"><span>(404)&nbsp;547-4336</span></a>
  </div>
</header>

<main class="article">
  <div class="article-wrap">
    <a href="index.html" class="article-back">← Back to the Journal</a>
    <p class="article-meta">${escapeHtml(category || "Journal")}</p>
    <h1>${escapeHtml(title)}</h1>
    <figure class="article-hero"><img src="${escapeHtml(image)}" alt="${escapeHtml(title)}"></figure>
    <div class="article-body">
      ${bodyHtml}
      <p><a href="../index.html#contact">Get a free quote</a> from Floor's Leader.</p>
    </div>
  </div>
</main>

<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-brand"><img src="../assets/logo/logo-new.png" alt="Floor's Leader" class="footer-logo"></div>
    <nav class="footer-nav" aria-label="Footer">
      <h4>Company</h4>
      <a href="../index.html#services">Services</a>
      <a href="../index.html#work">Projects</a>
      <a href="index.html">Journal</a>
      <a href="../index.html#contact">Contact</a>
    </nav>
    <div class="footer-nav">
      <h4>Contact</h4>
      <a href="tel:+14045474336">(404) 547-4336</a>
      <a href="mailto:airtonogueira@gmail.com">airtonogueira@gmail.com</a>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <span>© <span id="yr"></span> Floor's Leader. All rights reserved.</span>
  </div>
</footer>
<script>document.getElementById('yr').textContent=new Date().getFullYear();</script>
</body>
</html>
`;
}

function indexPageHtml(posts) {
  const sorted = [...posts].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const cards = sorted.map(p => `<article class="post-card">
          <a href="${p.slug}.html">
            <div class="post-thumb"><img src="${p.image}" alt="${escapeHtml(p.title)}" loading="lazy"></div>
            <div class="post-body">
              <span class="post-meta">${escapeHtml(p.category || "Journal")} · ${escapeHtml(p.readTime || "")}</span>
              <h3>${escapeHtml(p.title)}</h3>
              <p>${escapeHtml(p.excerpt || "")}</p>
              <span class="post-more">Read article →</span>
            </div>
          </a>
        </article>`).join("\n        ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Journal · Floor's Leader · Hardwood Flooring &amp; Remodeling Tips</title>
<meta name="description" content="Tips and guides on hardwood flooring, refinishing and home remodeling from Floor's Leader in Atlanta, GA.">
<link rel="canonical" href="${SITE_URL}/blog/">
<link rel="icon" href="../assets/logo/favicon-new.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css?v=3">
</head>
<body>

<header class="site-header scrolled" id="header">
  <div class="wrap header-inner">
    <a class="brand" href="../index.html" aria-label="Floor's Leader home">
      <img src="../assets/logo/logo-new.png" alt="Floor's Leader" class="brand-lockup">
    </a>
    <nav class="nav" aria-label="Primary">
      <a href="../index.html#services">Services</a>
      <a href="../index.html#work">Projects</a>
      <a href="../index.html#about">About</a>
      <a href="index.html">Journal</a>
      <a href="../index.html#contact">Contact</a>
    </nav>
    <a class="btn btn-phone" href="tel:+14045474336"><span>(404)&nbsp;547-4336</span></a>
  </div>
</header>

<main class="blog-page">
  <section class="blog-head">
    <div class="wrap">
      <p class="eyebrow" style="display:block">The Floor's Leader Journal</p>
      <h2 class="sec-title">Flooring &amp; remodeling, explained</h2>
      <p class="sec-lead">Straight-talk guides on hardwood, refinishing and home projects, from a family-owned shop in metro Atlanta.</p>
    </div>
  </section>
  <section class="blog-list">
    <div class="wrap">
      <div class="post-grid" id="postGrid">
        ${cards}
      </div>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-brand"><img src="../assets/logo/logo-new.png" alt="Floor's Leader" class="footer-logo"></div>
    <nav class="footer-nav" aria-label="Footer">
      <h4>Company</h4>
      <a href="../index.html#services">Services</a>
      <a href="../index.html#work">Projects</a>
      <a href="index.html">Journal</a>
      <a href="../index.html#contact">Contact</a>
    </nav>
    <div class="footer-nav">
      <h4>Service areas</h4>
      <a href="../areas/atlanta.html">Atlanta</a>
      <a href="../areas/kennesaw.html">Kennesaw</a>
      <a href="../areas/marietta.html">Marietta</a>
      <a href="../areas/acworth.html">Acworth</a>
      <a href="../areas/dallas.html">Dallas</a>
      <a href="../areas/douglasville.html">Douglasville</a>
    </div>
    <div class="footer-nav">
      <h4>Contact</h4>
      <a href="tel:+14045474336">(404) 547-4336</a>
      <a href="mailto:airtonogueira@gmail.com">airtonogueira@gmail.com</a>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <span>© <span id="yr"></span> Floor's Leader. All rights reserved.</span>
    <span class="footer-tag">Licensed &amp; Insured · Atlanta, GA</span>
  </div>
</footer>
<script>document.getElementById('yr').textContent=new Date().getFullYear();</script>
</body>
</html>
`;
}

function toIsoDate(pubDate) {
  const d = pubDate ? new Date(pubDate) : new Date(NaN);
  return isNaN(d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

async function main() {
  if (!RSS_URL) {
    console.log("SORO_RSS_URL not set yet — skipping (nothing to do).");
    return;
  }

  const res = await fetch(RSS_URL);
  if (!res.ok) throw new Error("RSS fetch failed: " + res.status);
  const xml = await res.text();
  const items = parseItems(xml);
  console.log(`Found ${items.length} item(s) in the RSS feed.`);

  const posts = JSON.parse(fs.readFileSync(POSTS_JSON, "utf8"));
  const bySlug = new Map(posts.map(p => [p.slug, p]));
  const seenGuids = new Set(posts.map(p => p.guid).filter(Boolean));

  let added = 0;
  for (const item of items) {
    if (!item.title || seenGuids.has(item.guid)) continue; // skip already-synced items

    const slug = slugify(item.title) || slugify(item.guid);
    const bodyHtml = item.contentEncoded || `<p>${escapeHtml(item.description)}</p>`;
    const excerpt = item.description || item.title;
    const image = item.image || DEFAULT_IMAGE;

    const html = postPageHtml({ title: item.title, excerpt, category: item.category, image, slug, bodyHtml });
    fs.writeFileSync(path.join(BLOG_DIR, `${slug}.html`), html, "utf8");
    console.log("Wrote blog/" + slug + ".html");

    bySlug.set(slug, {
      slug, title: item.title, excerpt, category: item.category,
      readTime: "", image, date: toIsoDate(item.pubDate),
      guid: item.guid, source: "soro"
    });
    seenGuids.add(item.guid);
    added++;
  }

  if (added === 0) {
    console.log("No new posts.");
    return;
  }

  const merged = Array.from(bySlug.values());
  fs.writeFileSync(POSTS_JSON, JSON.stringify(merged, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(BLOG_DIR, "index.html"), indexPageHtml(merged), "utf8");
  console.log("Rebuilt blog/index.html with " + merged.length + " post(s), " + added + " new.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
