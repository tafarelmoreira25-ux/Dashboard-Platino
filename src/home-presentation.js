// Pages rendered directly from the official PDF, in its original order.
// The original homepage carousel advanced every eight seconds.
export function mountPresentation(root) {
  const image = root.querySelector('[data-presentation-image]');
  const counter = root.querySelector('[data-presentation-counter]');
  const toggle = root.querySelector('[data-presentation-toggle]');
  const error = root.querySelector('[data-presentation-error]');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const cache = new Map();
  let page = 0;
  let paused = motion.matches;
  let visible = false;
  let timer;
  let request = 0;

  function load(index) {
    if (!cache.has(index)) {
      const pending = new Image();
      pending.decoding = 'async';
      const promise = new Promise((resolve, reject) => {
        pending.onload = () => resolve(pending.src);
        pending.onerror = () => { cache.delete(index); reject(new Error('Page unavailable')); };
      });
      pending.src = new URL(`../assets/platino-os/page-${index + 1}.webp`, import.meta.url).href;
      cache.set(index, promise);
    }
    return cache.get(index);
  }

  function schedule() {
    clearTimeout(timer);
    toggle.textContent = paused ? 'Reproduzir' : 'Pausar';
    toggle.setAttribute('aria-pressed', String(paused));
    counter.setAttribute('aria-live', paused ? 'polite' : 'off');
    if (visible && !document.hidden && !paused) {
      timer = setTimeout(() => show(page + 1), 8000);
    }
  }

  async function show(index) {
    clearTimeout(timer);
    const ticket = ++request;
    const next = (index + 7) % 7;
    try {
      const src = await load(next);
      if (ticket !== request) return;
      page = next;
      image.classList.remove('is-changing');
      image.src = src;
      image.alt = `Platino OS — página ${page + 1} de 7`;
      counter.textContent = `${page + 1} / 7`;
      error.hidden = true;
      if (!motion.matches) {
        void image.offsetWidth;
        image.classList.add('is-changing');
      }
      // Fetch only the next page; the PDF itself is downloaded on demand.
      if (visible) load((page + 1) % 7).catch(() => {});
    } catch {
      if (ticket !== request) return;
      error.hidden = false;
      paused = true;
    }
    schedule();
  }

  root.querySelector('[data-presentation-prev]').addEventListener('click', () => { paused = true; show(page - 1); });
  root.querySelector('[data-presentation-next]').addEventListener('click', () => { paused = true; show(page + 1); });
  toggle.addEventListener('click', () => { paused = !paused; if (!image.getAttribute('src')) show(page); else schedule(); });
  motion.addEventListener('change', () => { if (motion.matches) paused = true; schedule(); });
  document.addEventListener('visibilitychange', schedule);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible && !image.getAttribute('src')) show(page);
    else schedule();
  }, { threshold: 0.15 }).observe(root);
  schedule();
}

const root = document.getElementById('home-presentation');
if (root) mountPresentation(root);
