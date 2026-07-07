/* Premium Site template JS — identical across all templates.
   Hooks: #nav, .nav-burger, .nav-links, .reveal, .tilt, [data-depth],
   .marquee-track > .marquee-group, .stat-num[data-count], #year, body.menu-open */
(() => {
  'use strict';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  /* Nav background once the page scrolls */
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* Mobile menu */
  const burger = document.querySelector('.nav-burger');
  if (burger) {
    burger.addEventListener('click', () => {
      const open = document.body.classList.toggle('menu-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.querySelectorAll('.nav-links a').forEach(link =>
      link.addEventListener('click', () => {
        document.body.classList.remove('menu-open');
        burger.setAttribute('aria-expanded', 'false');
      }));
  }

  /* Marquee: the HTML holds ONE authored .marquee-group; clone it until
     the track is wide enough for a seamless -100% loop on any screen */
  document.querySelectorAll('.marquee-track').forEach(track => {
    const group = track.querySelector('.marquee-group');
    if (!group) return;
    const width = Math.max(group.scrollWidth, 1);
    const needed = Math.max(2, Math.ceil((window.innerWidth * 2) / width) + 1);
    for (let i = 1; i < needed; i++) {
      const clone = group.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    }
  });

  /* Scroll reveal, staggered within each parent block.
     Stagger uses the --stagger custom property (read only by the
     .reveal transitions) so it never delays .tilt hover easing. */
  const reveals = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(el => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(el => {
      const group = Array.from(el.parentElement.children)
        .filter(c => c.classList.contains('reveal'));
      el.style.setProperty('--stagger', `${Math.min(group.indexOf(el), 5) * 90}ms`);
      io.observe(el);
    });
  }

  /* 3D tilt cards with glare (CSS reads --rx/--ry/--mx/--my) */
  if (!reduceMotion && !isTouch) {
    document.querySelectorAll('.tilt').forEach(card => {
      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--rx', `${(0.5 - py) * 10}deg`);
        card.style.setProperty('--ry', `${(px - 0.5) * 12}deg`);
        card.style.setProperty('--mx', `${px * 100}%`);
        card.style.setProperty('--my', `${py * 100}%`);
      });
      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* Hero mouse parallax — JS moves the [data-depth] wrapper only;
     the CSS bob animation lives on the inner element so they never fight */
  const floats = document.querySelectorAll('[data-depth]');
  if (floats.length && !reduceMotion && !isTouch) {
    let tx = 0, ty = 0, cx = 0, cy = 0, running = false;
    const loop = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      floats.forEach(el => {
        const depth = parseFloat(el.dataset.depth) || 20;
        el.style.transform =
          `translate3d(${(cx * depth).toFixed(2)}px, ${(cy * depth).toFixed(2)}px, 0)`;
      });
      requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', e => {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
      if (!running) { running = true; loop(); }
    }, { passive: true });
  }

  /* Count-up stats. The HTML ships with the final value as static text
     (the no-JS fallback); zero it just before animating. */
  const nums = document.querySelectorAll('.stat-num');
  const render = (el, value) => {
    const dec = parseInt(el.dataset.decimals || '0', 10);
    const suffix = el.dataset.suffix || '';
    el.textContent = (dec
      ? value.toFixed(dec)
      : Math.round(value).toLocaleString('en-GB')) + suffix;
  };
  const countUp = el => {
    const target = parseFloat(el.dataset.count) || 0;
    const duration = 1600;
    const start = performance.now();
    const step = now => {
      const p = Math.min((now - start) / duration, 1);
      render(el, target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if (reduceMotion || !('IntersectionObserver' in window)) {
    nums.forEach(el => render(el, parseFloat(el.dataset.count) || 0));
  } else if (nums.length) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          countUp(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    nums.forEach(el => { render(el, 0); io.observe(el); });
  }

  /* Footer year (static 2026 in the HTML is the no-JS fallback) */
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
