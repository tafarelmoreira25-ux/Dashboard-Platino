import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browsers = [
  ['Chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
  ['Edge', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
];
const url = process.env.PLATINO_TEST_URL || 'http://localhost:3000/';

async function waitFor(fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Browser did not become ready.');
}

async function checkBrowser(name, executable) {
  const profile = await mkdtemp(join(tmpdir(), 'platino-search-smoke-'));
  const browser = spawn(executable, [
    '--headless=new', '--disable-gpu', '--disable-extensions', '--no-sandbox',
    '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  try {
    const port = await waitFor(async () => {
      const contents = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
      return Number(contents.split('\n')[0]);
    });
    const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' }).then(r => r.json());
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const job = pending.get(message.id);
      if (!job) return;
      pending.delete(message.id);
      message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    await waitFor(() => evaluate('document.readyState === "complete" && !!document.getElementById("login-form")'));
    const initial = await evaluate('({login: !!document.getElementById("login-form"), search: !!document.getElementById("global-search"), inertSearch: !!document.getElementById("global-search-template")?.content.querySelector("#global-search")})');
    assert.deepEqual(initial, { login: true, search: false, inertSearch: true });
    const afterMount = await evaluate(`(() => {
      const login = document.getElementById('login-screen');
      const template = document.getElementById('global-search-template');
      const input = template.content.querySelector('#global-search');
      login.remove();
      input.value = '';
      template.parentElement.append(input);
      input.value = 'consulta legítima';
      return {login: !!document.getElementById('login-form'), search: document.getElementById('global-search')?.value, form: input.closest('form')?.id || null};
    })()`);
    assert.deepEqual(afterMount, { login: false, search: 'consulta legítima', form: null });
    socket.close();
    console.log(`${name}: login isolado, busca vazia ao montar e digitação preservada.`);
  } finally {
    browser.kill();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

for (const [name, executable] of browsers) await checkBrowser(name, executable);
