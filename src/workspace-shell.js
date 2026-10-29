// Shared, presentation-only behavior; permissions and navigation remain in index.html.
const sidebar = document.getElementById('sidebar');
const opener = document.querySelector('[aria-controls="sidebar"]');
const mobile = window.matchMedia('(max-width: 767px)');
const isOpen = () => sidebar && !sidebar.classList.contains('-translate-x-full');

function syncDrawer() {
  if (!sidebar) return;
  sidebar.inert = mobile.matches && !isOpen();
  if (mobile.matches && isOpen()) {
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-label', 'Menu de navegação');
  } else {
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
  }
}
if (sidebar) {
  new MutationObserver(syncDrawer).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
  mobile.addEventListener('change', () => {
    if (!mobile.matches) window.toggleSidebar?.(false);
    syncDrawer();
  });
  document.addEventListener('keydown', event => {
    if (!mobile.matches || !isOpen()) return;
    const focusable = [...sidebar.querySelectorAll('button,a[href],input,select')].filter(el => el.getClientRects().length && !el.disabled);
    if (event.key === 'Escape') { window.toggleSidebar?.(false); opener?.focus(); }
    if (event.key === 'Tab' && focusable.length) {
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
  });
  opener?.addEventListener('click', () => {
    if (mobile.matches && isOpen()) sidebar.querySelector('button')?.focus();
  });
  syncDrawer();
}

function enhanceContent() {
  document.querySelectorAll('.content-section table').forEach(table => {
    if (table.closest('.table-scroll,.overflow-x-auto')) return;
    const scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', table.getAttribute('aria-label') || 'Tabela com rolagem horizontal');
    table.before(scroll);
    scroll.append(table);
  });
  document.querySelectorAll('.content-section label:not([for])').forEach(label => {
    const field = label.parentElement.querySelector('input[id],select[id],textarea[id]');
    if (field && !label.contains(field)) label.htmlFor = field.id;
  });
}
const content = document.getElementById('content-viewport');
if (content) {
  enhanceContent();
  new MutationObserver(enhanceContent).observe(content, { childList: true, subtree: true });
}
