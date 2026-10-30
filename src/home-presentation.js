// The viewer and remaining page images are loaded only after explicit activation.
const opener = document.getElementById('open-presentation');
let viewer;
opener?.addEventListener('click', async () => {
  if (opener.disabled) return;
  opener.disabled = true;
  try {
    const { mountPresentation } = await import('./presentation-viewer.js');
    viewer ??= mountPresentation();
    viewer.open(opener);
  } catch {
    let error = document.getElementById('presentation-load-error');
    if (!error) {
      error = document.createElement('p');
      error.id = 'presentation-load-error';
      error.setAttribute('role', 'alert');
      document.querySelector('.home-presentation-actions').after(error);
    }
    error.textContent = 'Não foi possível abrir a apresentação. Tente novamente ou abra o PDF original.';
  } finally { opener.disabled = false; }
});

// Sidebar buttons retain ownership of navigation and permissions.
document.querySelectorAll('[data-home-route]').forEach(link => {
  const target = document.getElementById(`nav-${link.dataset.homeRoute}`);
  const sync = () => { link.hidden = !target || target.hidden || target.classList.contains('hidden') || target.disabled; };
  sync();
  if (target) new MutationObserver(sync).observe(target, { attributes: true, attributeFilter: ['class', 'hidden', 'disabled'] });
  link.addEventListener('click', event => {
    event.preventDefault(); sync();
    if (link.hidden) return;
    target.click();
    const heading = document.querySelector(`#section-${link.dataset.homeRoute} h2, #section-${link.dataset.homeRoute} h3`);
    if (heading) { heading.tabIndex = -1; heading.focus(); }
  });
});
document.querySelector('#sidebar .nav-active')?.setAttribute('aria-current', 'page');
