// Reuse the existing pages rendered from the official PDF, in original order.
export function mountPresentation() {
  const dialog = document.createElement('dialog');
  dialog.className = 'presentation-dialog';
  dialog.setAttribute('aria-labelledby', 'presentation-dialog-title');
  dialog.innerHTML = `
    <header class="presentation-dialog-header">
      <h2 id="presentation-dialog-title">Conheça a Platino</h2>
      <button type="button" data-presentation-close autofocus aria-label="Fechar apresentação"><i class="ph ph-x" aria-hidden="true"></i></button>
    </header>
    <div class="presentation-reading-area" tabindex="0" aria-label="Página da apresentação com rolagem">
      <img width="1600" height="900" decoding="async" data-presentation-image alt="">
    </div>
    <p data-presentation-error role="alert" hidden>Não foi possível carregar esta página. Abra o PDF original ou tente outra página.</p>
    <footer class="home-presentation-controls">
      <div class="presentation-pagination">
        <button type="button" data-presentation-prev aria-label="Página anterior">Anterior</button>
        <span data-presentation-counter role="status" aria-live="polite" aria-atomic="true"></span>
        <button type="button" data-presentation-next aria-label="Próxima página">Próxima</button>
      </div>
      <a href="./assets/platino-os/platino-os.pdf" target="_blank" rel="noopener noreferrer">Abrir PDF original</a>
    </footer>`;
  document.body.append(dialog);
  const image = dialog.querySelector('[data-presentation-image]');
  const counter = dialog.querySelector('[data-presentation-counter]');
  const error = dialog.querySelector('[data-presentation-error]');
  let page = 0;
  let origin;
  function show(index) {
    page = (index + 7) % 7;
    error.hidden = true; image.hidden = false;
    image.src = new URL(`../assets/platino-os/page-${page + 1}.webp`, import.meta.url).href;
    image.alt = `Platino OS — página ${page + 1} de 7`;
    counter.textContent = `Página ${page + 1} de 7`;
    dialog.querySelector('.presentation-reading-area').scrollTo(0, 0);
  }
  image.addEventListener('error', () => { error.hidden = false; image.hidden = true; });
  dialog.querySelector('[data-presentation-prev]').addEventListener('click', () => show(page - 1));
  dialog.querySelector('[data-presentation-next]').addEventListener('click', () => show(page + 1));
  dialog.querySelector('[data-presentation-close]').addEventListener('click', () => dialog.close());
  // Native dialogs handle Escape and make the background inert.
  dialog.addEventListener('close', () => origin?.focus());
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); show(page + (event.key === 'ArrowLeft' ? -1 : 1));
    }
    if (event.key === 'Tab') {
      const items = [...dialog.querySelectorAll('button,a[href],[tabindex="0"]')].filter(el => !el.disabled);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  return { open(button) { origin = button; dialog.showModal(); show(page); } };
}
