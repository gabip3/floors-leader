# Floor's Leader

Hardwood flooring & remodeling company website, metro Atlanta, GA.
Static site (HTML / CSS / vanilla JS), no build step.

**Live:** https://www.floorsleader.net

## Structure

```
index.html            homepage
areas/*.html           local pages per service area (Atlanta, Kennesaw, Marietta, Acworth, Dallas, Douglasville)
blog/                  articles (Journal); auto-synced from the Soro RSS feed
admin.html             internal photo-upload demo (noindex)
css/style.css          styles
js/main.js             gallery, before/after sliders, contact form
assets/                images, fonts, logo
scripts/sync-rss-blog.js   pulls new articles from the Soro RSS feed into blog/
.github/workflows/     scheduled job that runs the sync above
```

## Contact form

Submits via [Web3Forms](https://web3forms.com). The access key in the form
markup is meant to be public (client-side by design); if it ever needs to be
rotated, generate a new one in the Web3Forms dashboard and update the
`access_key` hidden input across `index.html` and `areas/*.html`.

## Blog automation

`scripts/sync-rss-blog.js` runs hourly via GitHub Actions
(`.github/workflows/soro-rss-sync.yml`), reads the Soro RSS feed URL from
the `SORO_RSS_URL` repository secret, and publishes any new article as a
page in `blog/`.
