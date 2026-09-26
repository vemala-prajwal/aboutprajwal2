// Scene three's lifecycle: build the cards, place them from the fitted
// geometry, map the pointer onto the timeline, and run only while on screen.
//
// The pointer mapping is the heart of this section. Cursor-x alone would be
// wrong: the timeline descends across the frame, so the same x means different
// years depending on how high the pointer is. Instead the cursor is projected
// onto the polyline through the card centres, giving a continuous position
// along the timeline that the clock hand reads directly.

import { createGL } from '../gl/renderer.js';
import { Chrono } from './chrono.js';
import { YEARS, timeAt } from './layout3.js';
import { T3 } from './timeline3.js';

export async function initChrono() {
  const section = document.getElementById('chrono');
  const canvas = document.getElementById('chronoStage');
  const deck = document.getElementById('chronoDeck');
  if (!section || !canvas || !deck) return null;

  const gl = createGL(canvas);
  if (!gl) {
    section.classList.add('is-fallback');
    return null;
  }

  // The figure's layer: a second, transparent context on the canvas stacked
  // over the card deck, so he stands in front of the timeline. Optional — if
  // the browser refuses another context he simply draws behind, as before.
  const frontCanvas = document.getElementById('chronoFront');
  const glFront = frontCanvas ? createGL(frontCanvas, { alpha: true }) : null;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // read LIVE, not captured at boot: a convertible flips this when it folds,
  // and a page restored under touch emulation would otherwise stay locked out
  const coarseMQ = matchMedia('(pointer: coarse)');
  const chrono = new Chrono(canvas, gl,
    glFront ? { canvas: frontCanvas, gl: glFront } : null);
  await chrono.load();

  function setTarget(u) {
    chrono.targetU = Math.max(0, Math.min(YEARS.length - 1, u));
  }

  // ---- cards -------------------------------------------------------------
  const cards = YEARS.map((y, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'yr';
    el.dataset.i = String(i);
    el.dataset.href = y.liveUrl || '';
    el.setAttribute('aria-label', `Project ${i + 1} — ${y.key}`);
    // Tagline pulled from the projects page: first bullet or explicit tagline
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

    // Track touch swipes so swiping between cards doesn't trigger open-link
    let lastSwipedAt = 0;
    el.addEventListener('click', (e) => {
      if (performance.now() - lastSwipedAt < 350) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      setTarget(i);
      const href = el.dataset.href;
      if (href) {
        window.open(href, '_blank', 'noreferrer');
      }
    });
    deck.appendChild(el);
    return el;
  });

  // Touch swipe support on deck for mobile
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoved = false;

  deck.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchMoved = false;
    }
  }, { passive: true });

  deck.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - touchStartX;
      if (Math.abs(dx) > 12) touchMoved = true;
    }
  }, { passive: true });

  deck.addEventListener('touchend', (e) => {
    if (!touchMoved) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const dx = touchEndX - touchStartX;
    const dy = touchEndY - touchStartY;
    if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      lastSwipedAt = performance.now();
      if (dx < 0) {
        setTarget(chrono.targetU + 1);
      } else {
        setTarget(chrono.targetU - 1);
      }
    }
  }, { passive: true });

  // The arc nodes are the tap targets on a phone. Year numerals are suppressed
  // (empty text) since this section is now a projects showcase, not a timeline.
  const labels = YEARS.map((y, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'yr-tag';
    el.textContent = '';          // no year numeral — content-only suppression
    el.tabIndex = -1;             // the cards already carry the tab order
    el.setAttribute('aria-label', `Show project ${i + 1}: ${y.key}`);
    el.addEventListener('click', () => setTarget(i));
    el.addEventListener('pointerenter', () => { if (!coarseMQ.matches) setTarget(i); });
    deck.appendChild(el);
    return el;
  });

  const state = { started: 0, running: false, visible: false, raf: 0, last: 0 };

  // ---- placement ---------------------------------------------------------
  function place() {
    const dpr = coarseMQ.matches ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const L = chrono.resize(window.innerWidth, window.innerHeight, dpr);
    const portrait = L.portrait;

    for (let i = 0; i < cards.length; i++) {
      const c = L.cards[i];
      const el = cards[i];
      // The reference's cards are ~8-12% of frame width — faithful, but at
      // that size the body copy is unreadable on a real screen (it needed a 3x
      // zoom to read in the poster itself). They are scaled up just enough to
      // be legible while keeping the measured progression and spacing, so the
      // composition still reads as the reference.
      const w = portrait ? c.w : c.w * 1.62;
      el.style.width = `${w}px`;
      el.style.left = `${c.x}px`;
      el.style.top = `${c.y}px`;
      // cards lean with the rail; the tangent at 2021 is steep and at 2026
      // almost flat, which is exactly the lean the reference has
      const tilt = portrait ? 0 : (L.angles[i] - L.angles[L.angles.length - 1]) * 14;
      el.style.setProperty('--tilt', `${tilt.toFixed(2)}deg`);
      el.style.setProperty('--depth', String(i));

      const n = L.nodes[i];
      labels[i].style.left = `${n[0]}px`;
      labels[i].style.top = `${n[1]}px`;
      labels[i].style.fontSize = portrait ? '' : `${Math.max(19, c.w * 0.30)}px`;
      // portrait: visible 01–0N tap targets; landscape stays numeral-free
      labels[i].textContent = portrait ? String(i + 1).padStart(2, '0') : '';
      labels[i].tabIndex = portrait ? 0 : -1;
    }
    section.classList.toggle('is-portrait', portrait);
  }
  place();

  let resizeId;
  window.addEventListener('resize', () => {
    clearTimeout(resizeId);
    resizeId = setTimeout(place, 140);
  });

  // ---- pointer -> time ---------------------------------------------------
  section.addEventListener('pointermove', (e) => {
    if (coarseMQ.matches) return;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    chrono.pointer.tx = (px / r.width) * 2 - 1;
    chrono.pointer.ty = (py / r.height) * 2 - 1;
    chrono.pointer.inside = true;
    const { u, dist } = timeAt(chrono.layout, px, py);
    // far from the rail the visitor is not aiming at anything; hold the last
    // year rather than swinging the hand at stray movement
    if (dist < r.height * 0.55) setTarget(u);
  }, { passive: true });

  section.addEventListener('pointerleave', () => { chrono.pointer.inside = false; });

  let swipeY = null;
  section.addEventListener('pointerdown', (e) => {
    if (!coarseMQ.matches) return;
    swipeY = e.clientY;
  }, { passive: true });
  section.addEventListener('pointerup', (e) => {
    if (!coarseMQ.matches || swipeY == null) return;
    const dy = e.clientY - swipeY;
    swipeY = null;
    if (Math.abs(dy) < 36) return;
    setTarget(chrono.active + (dy > 0 ? -1 : 1));
  }, { passive: true });

  // touch and keyboard: a card is a real button, so both come almost free
  cards.forEach((el, i) => {
    el.addEventListener('pointerenter', () => { if (!coarseMQ.matches) setTarget(i); });
    el.addEventListener('focus', () => setTarget(i));
  });

  // ---- frame -------------------------------------------------------------
  let lastActive = -1;
  const frame = (now) => {
    if (!state.running) return;
    if (coarseMQ.matches && now - state.last < 33) {
      state.raf = requestAnimationFrame(frame);
      return;
    }
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

  // review hook, same contract as the other two scenes
  window.__shot3 = async (name = 'chrono', at = null) => {
    const t = at !== null ? at : (performance.now() - state.started) / 1000;
    chrono.render(t, 0.016);
    // flatten both layers, back canvas then front, exactly as stacked
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
