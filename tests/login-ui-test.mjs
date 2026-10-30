import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/login-ui.js', import.meta.url), 'utf8');
const createNode = () => {
  const classes = new Set();
  return {
    value: '', textContent: '', disabled: false, attributes: {}, events: {},
    classList: { add: (...values) => values.forEach(value => classes.add(value)), remove: (...values) => values.forEach(value => classes.delete(value)), contains: value => classes.has(value) },
    setAttribute(key, value) { this.attributes[key] = value; },
    removeAttribute(key) { delete this.attributes[key]; },
    addEventListener(event, handler) { this.events[event] = handler; }
  };
};

// Exercise the real password toggle: no value loss, no form submission.
const password = { ...createNode(), type: 'password', value: 'senha de teste' };
const toggle = createNode();
const icon = { className: 'ph ph-eye' };
toggle.querySelector = () => icon;
vm.runInNewContext(ui, { document: { getElementById: id => id === 'login-password' ? password : toggle } });
toggle.events.click();
assert.equal(password.type, 'text');
assert.equal(password.value, 'senha de teste');
assert.equal(toggle.attributes['aria-pressed'], 'true');
assert.equal(toggle.attributes['aria-label'], 'Ocultar senha');
assert.equal(icon.className, 'ph ph-eye-slash');
toggle.events.click();
assert.equal(password.type, 'password');
assert.equal(toggle.attributes['aria-label'], 'Mostrar senha');
assert.equal(toggle.attributes['aria-pressed'], 'false');

// Run the actual submit callback with a deferred auth provider, without network.
const loginForm = createNode(), loginButton = createNode(), loginError = createNode();
let requests = 0, resolveRequest, rejectRequest;
const context = vm.createContext({
  loginForm, loginButton, loginError,
  loginEmail: { value: 'teste@example.invalid' }, loginPassword: { value: 'senha de teste' },
  auth: {}, loginAuthorizedForPage: false, console: { error() {} },
  showLoginError(message) { loginError.textContent = message; loginError.classList.remove('hidden'); },
  getAuthErrorMessage: () => 'Confira seu e-mail e sua senha.',
  signInWithEmailAndPassword() { requests++; return new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject; }); }
});
const start = html.indexOf('      loginForm.addEventListener("submit",');
const end = html.indexOf('      loginResetPassword.addEventListener(', start);
assert.ok(start >= 0 && end > start);
vm.runInContext(html.slice(start, end), context);
const event = { prevented: 0, preventDefault() { this.prevented++; } };
const first = loginForm.events.submit(event);
assert.equal(loginButton.disabled, true);
assert.equal(loginButton.textContent, 'Entrando…');
assert.equal(loginButton.attributes['aria-busy'], 'true');
await loginForm.events.submit(event);
assert.equal(requests, 1, 'Envio por Enter repetido não deve iniciar outra autenticação.');
resolveRequest();
await first;
assert.equal(loginButton.disabled, false);
assert.equal(loginButton.textContent, 'Entrar');
assert.equal(loginButton.attributes['aria-busy'], undefined);
assert.equal(context.loginAuthorizedForPage, true);

const failed = loginForm.events.submit(event);
rejectRequest({ code: 'auth/invalid-credential' });
await failed;
assert.equal(context.loginAuthorizedForPage, false);
assert.equal(loginError.textContent, 'Confira seu e-mail e sua senha.');
assert.ok(!loginError.classList.contains('hidden'));
assert.equal(loginButton.disabled, false);
assert.equal(loginButton.textContent, 'Entrar');
assert.equal(loginButton.attributes['aria-busy'], undefined);

const login = html.match(/<section id="login-screen"[\s\S]*?<\/section>/)[0];
assert.match(login, /<label for="login-email">E-mail<\/label>/);
assert.match(login, /<label for="login-password">Senha<\/label>/);
assert.match(login, /id="login-password-toggle" type="button"/);
assert.match(login, /role="status" aria-live="polite" aria-atomic="true"/);
assert.doesNotMatch(login, /<video|\.webp|<footer|Organize sua rotina/);
assert.ok(login.indexOf('id="login-reset-password"') < login.indexOf('id="login-button"'));

// The existing recovery action still asks management to reset the internal account.
const recovery = createNode();
context.loginResetPassword = recovery;
const recoveryEnd = html.indexOf('      function openPasswordModal()', end);
vm.runInContext(html.slice(end, recoveryEnd), context);
context.loginEmail.value = '';
recovery.events.click();
assert.match(loginError.textContent, /Digite seu e-mail/);
context.loginEmail.value = 'teste@example.invalid';
recovery.events.click();
assert.match(loginError.textContent, /Solicite à gestão a redefinição/);
assert.ok(loginError.textContent.includes('teste@example.invalid'));
assert.equal(requests, 2, 'Recuperação não deve iniciar autenticação.');
console.log('Login: senha visível/oculta, carregamento, envio duplicado, erro e recuperação aprovados.');
