# Floor's Leader Website

Hardwood flooring & remodeling company in the Atlanta metro area.
Static website (HTML / CSS / vanilla JS): fast, mobile-first, and SEO-ready.

**Live preview:** https://gabip3.github.io/floors-leader/

## Sections
- Hero with brand video background
- Value proposition (experienced team, price, reviews, licensed & insured)
- About + before/after sliders (drag to reveal)
- Services
- Projects gallery by category, opens a photo carousel popup
- Reviews (embed-ready placeholder)
- Contact form + local business info

## Run locally
```bash
node server.js
```
Then open http://localhost:5533

## Structure
```
index.html        · page markup
css/style.css     · styles (brand palette + Bricolage/Hanken/Restore fonts)
js/main.js        · gallery carousel, before/after sliders, scroll reveal
assets/           · logo, brand font, hero video, project photos
server.js         · tiny local static server (dev only)
```

## Next phase (optional)
Port to Next.js + Firebase to add a blog with an admin panel, per-city landing
pages, and Soro auto-publishing support, reusing this exact design.
