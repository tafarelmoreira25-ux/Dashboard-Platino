// Presentation only. Authentication, session and recovery remain in index.html.
const password = document.getElementById('login-password');
const toggle = document.getElementById('login-password-toggle');

if (password && toggle) {
  toggle.addEventListener('click', () => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
    toggle.setAttribute('aria-pressed', String(visible));
    const icon = toggle.querySelector('i');
    if (icon) icon.className = visible ? 'ph ph-eye-slash' : 'ph ph-eye';
  });
}
