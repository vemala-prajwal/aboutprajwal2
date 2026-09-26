/**
 * mobile-reveal.js
 *
 * Scroll-triggered entrance animations for mobile only.
 * Runs ONLY when the viewport is ≤ 768 px wide (checked at init and on resize).
 * Uses IntersectionObserver to add `.mob-visible` to elements carrying `.mob-reveal`.
 * Adds `.mob-reveal` to the contact panel elements at runtime so desktop markup
 * stays pristine.
 *
 * Zero effect on desktop — the media-query check plus the fact that the CSS
 * classes (.mob-reveal / .mob-visible) are only styled inside max-width: 768px
 * rules means wide viewports see no change at all.
 */

const MOB_BREAKPOINT = 768;

function isMobile() {
  return window.innerWidth <= MOB_BREAKPOINT;
}

function initReveal() {
  if (!isMobile()) return;   // bail out immediately on desktop
  if (!('IntersectionObserver' in window)) return;

  // ---- Attach .mob-reveal to contact elements at runtime -----------------
  // This avoids touching the HTML; the classes are injected only for mobile.
  const contactIntro = document.querySelector('.contact-panel__intro');
  const contactInfo  = document.querySelector('.contact-info');

  if (contactIntro) {
    contactIntro.classList.add('mob-reveal');
  }
  if (contactInfo) {
    contactInfo.classList.add('mob-reveal');
  }

  // ---- Observe all .mob-reveal elements ----------------------------------
  const targets = document.querySelectorAll('.mob-reveal');
  if (!targets.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('mob-visible');
          // Once revealed, stop watching — no need to un-reveal on scroll-up
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.14,
      rootMargin: '0px 0px -32px 0px',   // trigger slightly before fully on-screen
    }
  );

  targets.forEach((el) => observer.observe(el));
}

// Run after DOM is ready (module scripts are deferred by default)
initReveal();

// Also re-check on resize in case the user rotates their device from
// landscape to portrait mid-session. If it becomes mobile, re-init.
let _lastWasMobile = isMobile();
window.addEventListener('resize', () => {
  const nowMobile = isMobile();
  if (nowMobile && !_lastWasMobile) {
    // Switched from desktop to mobile (e.g. DevTools resize or rotation)
    _lastWasMobile = true;
    initReveal();
  } else if (!nowMobile && _lastWasMobile) {
    _lastWasMobile = false;
    // Remove the classes we added so desktop sees clean state
    document.querySelectorAll('.mob-reveal').forEach((el) => {
      el.classList.remove('mob-reveal', 'mob-visible');
    });
  }
}, { passive: true });
