// Scene three's lifecycle: build the cards, place them from the fitted
// geometry, map the pointer onto the timeline, and run only while on screen.
//
// Desktop: 3D arc layout with cursor projection onto the arc, front canvas figure.
// Mobile: Clean, native GPU-accelerated CSS scroll-snap carousel with IntersectionObserver.

import { createGL } from '../gl/renderer.js';
import { Chrono } from './chrono.js';
import { YEARS, timeAt } from './layout3.js';
import { T3 } from './timeline3.js';

export async function initChrono() {
  const section = document.getElementById('chrono');
  const canvas = document.getElementById('chronoStage');
  const deck = document.getElementById('chronoDeck');
  const tagsNav = document.getElementById('chronoTagsNav');
  if (!section || !canvas || !deck) return null;

  const gl = createGL(canvas);
  if (!gl) {
    section.classList.add('is-fallback');
    return null;
  }

  const frontCanvas = document.getElementById('chronoFront');
  const glFront = frontCanvas ? createGL(frontCanvas, { alpha: true }) : null;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const chrono = new Chrono(canvas, gl,
    glFront ? { canvas: frontCanvas, gl: glFront } : null);
  await chrono.load();

  const isMobile = () => window.innerWidth <= 768;

  // Track mode switches across the 768px boundary (e.g. tablet rotation or DevTools)
  let currentMode = isMobile() ? 'mobile' : 'desktop';
  window.addEventListener('resize', () => {
    const newMode = isMobile() ? 'mobile' : 'desktop';
    if (newMode !== currentMode) {
      location.reload();
    }
  }, { passive: true });

  if (isMobile()) {
    return initMobile(section, canvas, deck, tagsNav, chrono, reduced);
  } else {
    return initDesktop(section, canvas, deck, chrono, reduced);
  }
}

// ============================================================================
// MOBILE-SPECIFIC IMPLEMENTATION
// Uses native CSS scroll-snap for GPU-accelerated, jitter-free swipe navigation.
// State switching is driven purely by IntersectionObserver (zero scroll listeners).
// WebGL canvas renders atmospheric background only without touching DOM cards.
// ============================================================================
function initMobile(section, canvas, deck, tagsNav, chrono, reduced) {
  deck.innerHTML = '';
  section.classList.add('is-mobile-chrono');

  // Build the 5 project cards in a natural horizontal flow
  const cards = YEARS.map((y, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'yr' + (i === 0 ? ' is-active' : '');
    el.dataset.i = String(i);
    el.dataset.href = y.liveUrl || '';
    el.setAttribute('aria-label', `Project ${i + 1} — ${y.key}`);
    const tagline = y.tagline || y.lines[0] || '';
    const imgSrc = y.img || `public/years/${y.year}.jpg`;
    el.innerHTML =
      `<span class="yr__frame">`
      + `<img class="yr__img" src="${imgSrc}" alt="${y.key} screenshot" `
      + `loading="lazy" decoding="async">`
      + `<span class="yr__body">`
      + `<span class="yr__year">${tagline}</span>`
      + `<span class="yr__key">${y.key}</span>`
      + `<span class="yr__lines">${y.lines.map((l) => `<i>${l}</i>`).join('')}</span>`
      + `</span>`
      + `<svg class="yr__go" viewBox="0 0 16 16" aria-hidden="true">`
      + `<path d="M4 12 L12 4 M6 4 H12 V10" fill="none" stroke="currentColor" `
      + `stroke-width="1.4"/></svg>`
      + `</span>`;

    el.addEventListener('click', () => {
      const href = el.dataset.href;
      if (href) window.open(href, '_blank', 'noreferrer');
    });

    deck.appendChild(el);
    return el;
  });

  // Dedicated indicator pills (01, 02, 03, 04, 05)
  let tagButtons = [];
  if (tagsNav) {
    tagsNav.innerHTML = '';
    tagButtons = YEARS.map((y, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chrono__tag-btn' + (i === 0 ? ' is-active' : '');
      btn.textContent = String(i + 1).padStart(2, '0');
      btn.setAttribute('aria-label', `Go to project ${i + 1}: ${y.key}`);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        cards[i].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
      tagsNav.appendChild(btn);
      return btn;
    });
  }

  function setActive(idx) {
    chrono.targetU = idx;
    cards.forEach((c, ci) => c.classList.toggle('is-active', ci === idx));
    tagButtons.forEach((t, ti) => t.classList.toggle('is-active', ti === idx));
    section.dataset.year = String(YEARS[idx].year);
  }

  // IntersectionObserver determines active card during native snap scrolling
  // Only fires when a card is substantially centered (threshold: 0.55), avoiding flickering
  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
        const idx = parseInt(entry.target.dataset.i, 10);
        if (!isNaN(idx)) {
          setActive(idx);
        }
      }
    });
  }, {
    root: deck,
    threshold: [0.55],
  });

  cards.forEach((c) => cardObserver.observe(c));

  // Canvas resize for mobile
  function resizeMobile() {
    chrono.resize(window.innerWidth, window.innerHeight, 1);
  }
  resizeMobile();
  window.addEventListener('resize', resizeMobile, { passive: true });

  // Frame loop for mobile: atmospheric canvas render ONLY, ZERO DOM style mutation!
  const state = { started: 0, running: false, visible: false, raf: 0, last: 0 };
  const frame = (now) => {
    if (!state.running) return;
    const dt = Math.min(0.033, (now - state.last) / 1000 || 0.016);
    state.last = now;
    const t = reduced ? T3.live + 2 : (now - state.started) / 1000;
    const s = chrono.render(t, dt);
    if (s && s.live) section.classList.add('is-live');
    state.raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (state.running) return;
    state.running = true;
    state.last = performance.now();
    if (!state.started) state.started = performance.now();
    state.raf = requestAnimationFrame(frame);
  };
  const stop = () => { state.running = false; cancelAnimationFrame(state.raf); };

  new IntersectionObserver((entries) => {
    for (const e of entries) {
      state.visible = e.isIntersecting;
      if (e.isIntersecting) start(); else stop();
    }
  }, { threshold: 0.15 }).observe(section);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop();
    else if (state.visible) start();
  });

  window.__chrono = chrono;
  return { chrono, section, setTarget: setActive };
}

// ============================================================================
// DESKTOP-SPECIFIC IMPLEMENTATION (100% UNTOUCHED ORIGINAL LOGIC)
// Preserves the full 3D curved timeline, cursor projection onto arc,
// front canvas figure layering, and continuous time damping.
// ============================================================================
function initDesktop(section, canvas, deck, chrono, reduced) {
  deck.innerHTML = '';

  function setTarget(u) {
    chrono.targetU = Math.max(0, Math.min(YEARS.length - 1, u));
  }

  const cards = YEARS.map((y, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'yr';
    el.dataset.i = String(i);
    el.dataset.href = y.liveUrl || '';
    el.setAttribute('aria-label', `Project ${i + 1} — ${y.key}`);
    const tagline = y.tagline || y.lines[0] || '';
    const imgSrc = y.img || `public/years/${y.year}.jpg`;
    el.innerHTML =
      `<span class="yr__frame">`
      + `<img class="yr__img" src="${imgSrc}" alt="${y.key} screenshot" `
      + `loading="lazy" decoding="async">`
      + `<span class="yr__body">`
      + `<span class="yr__year">${tagline}</span>`
      + `<span class="yr__key">${y.key}</span>`
      + `<span class="yr__lines">${y.lines.map((l) => `<i>${l}</i>`).join('')}</span>`
      + `</span>`
      + `<svg class="yr__go" viewBox="0 0 16 16" aria-hidden="true">`
      + `<path d="M4 12 L12 4 M6 4 H12 V10" fill="none" stroke="currentColor" `
      + `stroke-width="1.4"/></svg>`
      + `</span>`;

    el.addEventListener('click', () => {
      setTarget(i);
      const href = el.dataset.href;
      if (href) window.open(href, '_blank', 'noreferrer');
    });
    deck.appendChild(el);
    return el;
  });

  const labels = YEARS.map((y, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'yr-tag';
    el.textContent = '';
    el.tabIndex = -1;
    el.setAttribute('aria-label', `Show project ${i + 1}: ${y.key}`);
    el.addEventListener('click', () => setTarget(i));
    el.addEventListener('pointerenter', () => setTarget(i));
    deck.appendChild(el);
    return el;
  });

  const state = { started: 0, running: false, visible: false, raf: 0, last: 0 };

  function place() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const L = chrono.resize(window.innerWidth, window.innerHeight, dpr);
    const portrait = L.portrait;

    for (let i = 0; i < cards.length; i++) {
      const c = L.cards[i];
      const el = cards[i];
      const w = portrait ? c.w : c.w * 1.62;
      el.style.width = `${w}px`;
      el.style.left = `${c.x}px`;
      el.style.top = `${c.y}px`;
      const tilt = portrait ? 0 : (L.angles[i] - L.angles[L.angles.length - 1]) * 14;
      el.style.setProperty('--tilt', `${tilt.toFixed(2)}deg`);
      el.style.setProperty('--depth', String(i));

      const n = L.nodes[i];
      labels[i].style.left = `${n[0]}px`;
      labels[i].style.top = `${n[1]}px`;
      labels[i].style.fontSize = `${Math.max(19, c.w * 0.30)}px`;
      labels[i].textContent = '';
      labels[i].tabIndex = -1;
    }
    section.classList.toggle('is-portrait', portrait);
  }
  place();

  let resizeId;
  window.addEventListener('resize', () => {
    clearTimeout(resizeId);
    resizeId = setTimeout(place, 140);
  });

  section.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    chrono.pointer.tx = (px / r.width) * 2 - 1;
    chrono.pointer.ty = (py / r.height) * 2 - 1;
    chrono.pointer.inside = true;
    const { u, dist } = timeAt(chrono.layout, px, py);
    if (dist < r.height * 0.55) setTarget(u);
  }, { passive: true });

  section.addEventListener('pointerleave', () => { chrono.pointer.inside = false; });

  cards.forEach((el, i) => {
    el.addEventListener('pointerenter', () => setTarget(i));
    el.addEventListener('focus', () => setTarget(i));
  });

  let lastActive = -1;
  const frame = (now) => {
    if (!state.running) return;
    const dt = Math.min(0.05, (now - state.last) / 1000 || 0.016);
    state.last = now;
    const t = reduced ? T3.live + 2 : (now - state.started) / 1000;
    const s = chrono.render(t, dt);

    if (s) {
      if (s.live) section.classList.add('is-live');
      for (let i = 0; i < cards.length; i++) {
        const near = 1 - Math.min(1, Math.abs(i - chrono.u));
        cards[i].style.setProperty('--in', s.cards[i].toFixed(3));
        cards[i].style.setProperty('--near', near.toFixed(3));
        labels[i].style.setProperty('--in', s.nodes[i].toFixed(3));
        labels[i].style.setProperty('--near', near.toFixed(3));
      }
      if (chrono.active !== lastActive) {
        lastActive = chrono.active;
        cards.forEach((el, i) => el.classList.toggle('is-active', i === chrono.active));
        labels.forEach((el, i) => el.classList.toggle('is-active', i === chrono.active));
        section.dataset.year = String(YEARS[chrono.active].year);
      }
    }
    state.raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (state.running) return;
    state.running = true;
    state.last = performance.now();
    if (!state.started) state.started = performance.now();
    state.raf = requestAnimationFrame(frame);
  };
  const stop = () => { state.running = false; cancelAnimationFrame(state.raf); };

  new IntersectionObserver((entries) => {
    for (const e of entries) {
      state.visible = e.isIntersecting;
      if (e.isIntersecting) start(); else stop();
    }
  }, { threshold: 0.22 }).observe(section);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop();
    else if (state.visible) start();
  });

  window.__shot3 = async (name = 'chrono', at = null) => {
    const t = at !== null ? at : (performance.now() - state.started) / 1000;
    chrono.render(t, 0.016);
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const c2 = flat.getContext('2d');
    c2.drawImage(canvas, 0, 0);
    if (chrono.front) c2.drawImage(chrono.front.canvas, 0, 0);
    const url = flat.toDataURL('image/png');
    await fetch(`/__shot?name=${encodeURIComponent(name)}`,
      { method: 'POST', body: url });
    return `${canvas.width}x${canvas.height} @ t=${t.toFixed(2)}`;
  };
  window.__chrono = chrono;

  return { chrono, section, setTarget };
}
