/* ============================================================
   FLOOR'S LEADER : interactions
   ============================================================ */
(function () {
  "use strict";

  /* ---- year ---- */
  var yr = document.getElementById("yr");
  if (yr) yr.textContent = new Date().getFullYear();

  /* ---- header scroll state ---- */
  var header = document.getElementById("header");
  function onScroll() {
    if (window.scrollY > 40) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- mobile menu ---- */
  var toggle = document.getElementById("menuToggle");
  var menu = document.getElementById("mobileMenu");
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      header.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        menu.classList.remove("open");
        header.classList.remove("menu-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ============================================================
     GALLERY: category cards open a carousel popup
     Photo lists are built from each card's data-* attributes,
     matching the copied filenames  (dir-01.ext … dir-NN.ext).
     ============================================================ */
  var lb = document.getElementById("lightbox");
  var lbImg = document.getElementById("lightboxImg");
  var lbTitle = document.getElementById("lbTitle");
  var lbCounter = document.getElementById("lbCounter");
  var lbClose = document.getElementById("lightboxClose");
  var lbPrev = document.getElementById("lbPrev");
  var lbNext = document.getElementById("lbNext");

  var imgs = [], idx = 0, title = "";

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function render() {
    lbImg.src = imgs[idx];
    lbImg.alt = title + " project photo " + (idx + 1);
    if (lbTitle) lbTitle.textContent = title;
    if (lbCounter) lbCounter.textContent = (idx + 1) + " / " + imgs.length;
  }
  function open(list, t, start) {
    imgs = list; title = t; idx = start || 0;
    list.forEach(function (s) { var im = new Image(); im.src = s; }); // preload
    render();
    lb.classList.add("open");
    lb.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function step(d) {
    if (!imgs.length) return;
    idx = (idx + d + imgs.length) % imgs.length;
    render();
  }
  function close() {
    lb.classList.remove("open");
    lb.setAttribute("aria-hidden", "true");
    lbImg.src = ""; imgs = [];
    document.body.style.overflow = "";
  }

  document.querySelectorAll(".cat-card").forEach(function (card) {
    card.addEventListener("click", function () {
      var dir = card.dataset.dir;
      var ext = card.dataset.ext || "jpg";
      var count = +card.dataset.count;
      var list = [];
      for (var i = 1; i <= count; i++) list.push(dir + "-" + pad(i) + "." + ext);
      open(list, (card.dataset.title || "").replace(/&amp;/g, "&"), 0);
    });
  });

  if (lbClose) lbClose.addEventListener("click", close);
  if (lbPrev) lbPrev.addEventListener("click", function (e) { e.stopPropagation(); step(-1); });
  if (lbNext) lbNext.addEventListener("click", function (e) { e.stopPropagation(); step(1); });
  lb.addEventListener("click", function (e) {
    if (e.target === lb || e.target.classList.contains("lb-figure") || e.target.classList.contains("lb-caption")) close();
  });
  document.addEventListener("keydown", function (e) {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });
  // swipe on touch
  var sx = 0;
  lb.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", function (e) {
    var dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* ============================================================
     BEFORE / AFTER SLIDERS
     ============================================================ */
  document.querySelectorAll("[data-ba]").forEach(function (ba) {
    var range = ba.querySelector(".ba-range");
    var beforeWrap = ba.querySelector(".ba-before-wrap");
    var handle = ba.querySelector(".ba-handle");
    function set(v) {
      beforeWrap.style.clipPath = "inset(0 " + (100 - v) + "% 0 0)";
      handle.style.left = v + "%";
    }
    range.addEventListener("input", function () { set(this.value); });
    set(range.value);
  });

  /* ============================================================
     SCROLL REVEAL
     ============================================================ */
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var reveals = document.querySelectorAll(".reveal");
  if (reduce || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.style.transitionDelay = (en.target.dataset.delay || 0) + "ms";
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    // stagger siblings within grids
    document.querySelectorAll(".value-grid, .svc-grid, .contact-list").forEach(function (grid) {
      Array.prototype.forEach.call(grid.children, function (child, i) {
        if (child.classList.contains("reveal")) child.dataset.delay = i * 80;
      });
    });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ============================================================
     CONTACT FORM — Web3Forms
     To activate: create a free access key at https://web3forms.com and
     paste it into the hidden "access_key" input in the form markup.
     Until a real key is set, the form falls back to opening the
     visitor's email app with the details pre-filled.
     ============================================================ */
  var form = document.getElementById("quoteForm");
  var note = document.getElementById("formNote");

  function setNote(text, isError) {
    if (!note) return;
    note.textContent = text;
    note.classList.toggle("error", !!isError);
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var first = form.first.value.trim();
      var email = form.email.value.trim();
      if (!first || !email) {
        setNote("Please add your name and email so we can reach you.", true);
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      var keyEl = form.querySelector('input[name="access_key"]');
      var key = keyEl ? keyEl.value.trim() : "";
      var hasRealKey = key && key.indexOf("YOUR_") === -1;

      // keep the reply-to address in sync so "Reply" in the inbox goes to the customer
      var replytoEl = form.querySelector('input[name="replyto"]');
      if (replytoEl) replytoEl.value = email;

      // No Web3Forms key yet: open the visitor's email app with the details filled in
      if (!hasRealKey) {
        var data = new FormData(form);
        var lines = [];
        data.forEach(function (v, k) {
          if (k === "access_key" || k === "subject" || k === "from_name" || k === "replyto" || k === "botcheck" || !v) return;
          lines.push(k + ": " + v);
        });
        var body = encodeURIComponent(lines.join("\n"));
        var subject = encodeURIComponent("New quote request — Floor's Leader");
        setNote("Thanks, " + first + "! Confirm sending in your email app and we'll reply within 24 hours.");
        window.location.href = "mailto:airtonogueira@gmail.com?subject=" + subject + "&body=" + body;
        return;
      }

      // Real submission via Web3Forms
      submitBtn.disabled = true;
      var original = submitBtn.textContent;
      submitBtn.textContent = "Sending…";
      fetch("https://api.web3forms.com/submit", { method: "POST", body: new FormData(form) })
        .then(function (res) { return res.json(); })
        .then(function (out) {
          if (out.success) {
            setNote("Thanks, " + first + "! Your request has been sent. We'll be in touch shortly.");
            form.reset();
          } else {
            setNote("Something went wrong. Please call us at (404) 547-4336.", true);
          }
        })
        .catch(function () {
          setNote("Network error. Please call us at (404) 547-4336.", true);
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = original;
        });
    });
  }
})();
