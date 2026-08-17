// Pulls "Published" articles from the Notion database Soro writes to, turns
// each into a blog page in the site's own design, and rebuilds the blog
// listing (blog/index.html) from blog/posts.json — the manifest of every
// post, manual or Notion-sourced.
//
// Runs safely with nothing configured yet: if NOTION_TOKEN or
// NOTION_DATABASE_ID aren't set, it logs a message and exits without
// touching any files. See .github/workflows/notion-blog-sync.yml for how
// this gets triggered.
//
// ⚠️  PROPERTY NAMES BELOW ARE A REASONABLE GUESS, NOT CONFIRMED.
// Once Soro is actually connected to a real Notion database, open that
// database and check the exact property names it created — then update
// the PROPS constants below to match exactly (Notion property names are
// case-sensitive). A mismatch here just means 0 posts get picked up; it
// won't crash anything.
"use strict";
const fs = require("fs");
const path = require("path");

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_VERSION = "2022-06-28";
const SITE_URL = "https://www.floorsleader.net";

// ---- adjust these to match the real Notion database schema ----
const PROPS = {
  title: "Title",        // Notion "title" property
  slug: "Slug",          // rich_text property; falls back to a slugified title if missing/empty
  excerpt: "Excerpt",     // rich_text property
  category: "Category",   // select property
  status: "Status",       // select property
  statusPublishedValue: "Published",
  cover: "Cover Image"     // files/url property; falls back to the page cover, then a default photo
};
const DEFAULT_IMAGE = "../assets/flooring/flooring-14.jpg";
// ------------------------------------------------------------------

const BLOG_DIR = path.join(__dirname, "..", "blog");
const POSTS_JSON = path.join(BLOG_DIR, "posts.json");

function apiHeaders() {
  return {
    Authorization: "Bearer " + NOTION_TOKEN,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
  };
}

async function queryDatabase() {
  const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      filter: { property: PROPS.status, select: { equals: PROPS.statusPublishedValue } }
    })
  });
  if (!res.ok) throw new Error("Notion database query failed: " + res.status + " " + (await res.text()));
  const data = await res.json();
  return data.results || [];
}

async function fetchBlocks(blockId, blocks = [], cursor) {
  const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
  url.searchParams.set("page_size", "100");
  if (cursor) url.searchParams.set("start_cursor", cursor);
  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) throw new Error("Notion blocks fetch failed: " + res.status);
  const data = await res.json();
  blocks.push(...data.results);
  if (data.has_more) return fetchBlocks(blockId, blocks, data.next_cursor);
  return blocks;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function richTextToHtml(richText) {
  if (!richText || !richText.length) return "";
  return richText.map(rt => {
    let text = escapeHtml(rt.plain_text || "");
    const a = rt.annotations || {};
    if (a.code) text = `<code>${text}</code>`;
    if (a.bold) text = `<strong>${text}</strong>`;
    if (a.italic) text = `<em>${text}</em>`;
    if (rt.href) text = `<a href="${escapeHtml(rt.href)}">${text}</a>`;
    return text;
  }).join("");
}

// Converts a flat list of Notion blocks into HTML matching .article-body's
// existing styles (h2, p, a — see css/style.css). Unsupported block types
// are skipped rather than breaking the run.
function blocksToHtml(blocks) {
  let html = "";
  let listBuffer = null; // { tag: 'ul'|'ol', items: [] }
  function flushList() {
    if (!listBuffer) return;
    const items = listBuffer.items.map(i => `<li>${i}</li>`).join("");
    html += `<${listBuffer.tag}>${items}</${listBuffer.tag}>`;
    listBuffer = null;
  }
  for (const block of blocks) {
    const t = block.type;
    const data = block[t] || {};
    if (t === "paragraph") {
      flushList();
      const text = richTextToHtml(data.rich_text);
      if (text.trim()) html += `<p>${text}</p>`;
    } else if (t === "heading_1" || t === "heading_2") {
      flushList();
      html += `<h2>${richTextToHtml(data.rich_text)}</h2>`;
    } else if (t === "heading_3") {
      flushList();
      html += `<h2 style="font-size:1.25rem">${richTextToHtml(data.rich_text)}</h2>`;
    } else if (t === "bulleted_list_item") {
      if (!listBuffer || listBuffer.tag !== "ul") { flushList(); listBuffer = { tag: "ul", items: [] }; }
      listBuffer.items.push(richTextToHtml(data.rich_text));
    } else if (t === "numbered_list_item") {
      if (!listBuffer || listBuffer.tag !== "ol") { flushList(); listBuffer = { tag: "ol", items: [] }; }
      listBuffer.items.push(richTextToHtml(data.rich_text));
    } else if (t === "quote") {
      flushList();
      html += `<p style="border-left:3px solid var(--cyan); padding-left:1rem; font-style:italic">${richTextToHtml(data.rich_text)}</p>`;
    } else if (t === "image") {
      flushList();
      const src = data.type === "external" ? data.external.url : data.file.url;
      html += `<figure class="article-hero" style="margin:2rem 0"><img src="${escapeHtml(src)}" alt=""></figure>`;
    } else if (t === "divider") {
      flushList();
      html += `<hr style="border:0;border-top:1px solid var(--line);margin:2rem 0">`;
    }
    // other block types (tables, embeds, etc.) are intentionally skipped
  }
  flushList();
  return html;
}

function slugify(str) {
  return String(str).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getProp(page, name) {
  return page.properties && page.properties[name];
}
function getTitle(page) {
  const p = getProp(page, PROPS.title);
  return p && p.title ? p.title.map(t => t.plain_text).join("") : "Untitled";
}
function getRichText(page, name) {
  const p = getProp(page, name);
  return p && p.rich_text ? p.rich_text.map(t => t.plain_text).join("") : "";
}
function getSelect(page, name) {
  const p = getProp(page, name);
  return p && p.select ? p.select.name : "";
}
function getImage(page) {
  const p = getProp(page, PROPS.cover);
  if (p) {
    if (p.url) return p.url;
    if (p.files && p.files[0]) return p.files[0].external ? p.files[0].external.url : p.files[0].file.url;
  }
  if (page.cover) return page.cover.external ? page.cover.external.url : page.cover.file.url;
  return DEFAULT_IMAGE;
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

async function main() {
  if (!NOTION_TOKEN || !DATABASE_ID) {
    console.log("NOTION_TOKEN / NOTION_DATABASE_ID not set yet — skipping (nothing to do).");
    return;
  }

  const posts = JSON.parse(fs.readFileSync(POSTS_JSON, "utf8"));
  const bySlug = new Map(posts.map(p => [p.slug, p]));

  const pages = await queryDatabase();
  console.log(`Found ${pages.length} published page(s) in Notion.`);

  for (const page of pages) {
    const title = getTitle(page);
    let slug = getRichText(page, PROPS.slug) || slugify(title);
    const excerpt = getRichText(page, PROPS.excerpt);
    const category = getSelect(page, PROPS.category);
    const image = getImage(page);

    const blocks = await fetchBlocks(page.id);
    const bodyHtml = blocksToHtml(blocks);

    const html = postPageHtml({ title, excerpt, category, image, slug, bodyHtml });
    fs.writeFileSync(path.join(BLOG_DIR, `${slug}.html`), html, "utf8");
    console.log("Wrote blog/" + slug + ".html");

    bySlug.set(slug, {
      slug, title, excerpt, category,
      readTime: "", image: image.startsWith("http") ? image : "../" + image,
      date: page.last_edited_time ? page.last_edited_time.slice(0, 10) : new Date().toISOString().slice(0, 10),
      source: "notion"
    });
  }

  const merged = Array.from(bySlug.values());
  fs.writeFileSync(POSTS_JSON, JSON.stringify(merged, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(BLOG_DIR, "index.html"), indexPageHtml(merged), "utf8");
  console.log("Rebuilt blog/index.html with " + merged.length + " post(s).");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
