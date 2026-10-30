import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
const home = readFileSync(new URL('../src/home-presentation.js', import.meta.url), 'utf8');
assert.match(home, /await import\('\.\/presentation-viewer.js'\)/);
assert.doesNotMatch(home, /setTimeout|setInterval|new Image/);
const nodes = new Map();
const document = { activeElement: null, body: { append() {} } };
function node() {
  return { events: {}, hidden: false, setAttribute() {}, scrollTo() {},
    addEventListener(type, fn) { this.events[type] = fn; }, focus() { document.activeElement = this; } };
}
const dialog = node();
dialog.querySelector = selector => { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); };
const selectors = ['[data-presentation-close]', '.presentation-reading-area', '[data-presentation-prev]', '[data-presentation-next]', 'a'];
dialog.querySelectorAll = () => selectors.map(selector => dialog.querySelector(selector));
dialog.showModal = () => { dialog.open = true; dialog.querySelector(selectors[0]).focus(); };
dialog.close = () => { dialog.open = false; dialog.events.close(); };
document.createElement = () => dialog;
const source = readFileSync(new URL('../src/presentation-viewer.js', import.meta.url), 'utf8').replace('export function', 'function').replaceAll('import.meta.url', JSON.stringify(new URL('../src/presentation-viewer.js', import.meta.url).href));
const context = vm.createContext({ document, URL });
vm.runInContext(source, context);
const viewer = context.mountPresentation();
const image = nodes.get('[data-presentation-image]');
const counter = nodes.get('[data-presentation-counter]');
assert.equal(image.src, undefined, 'No page request before opening');
const origin = node();
viewer.open(origin);
assert.equal(dialog.open, true);
assert.equal(document.activeElement, nodes.get('[data-presentation-close]'));
for (let page = 1; page <= 7; page++) {
  assert.equal(counter.textContent, `Página ${page} de 7`);
  assert.ok(image.src.endsWith(`page-${page}.webp`));
  nodes.get('[data-presentation-next]').events.click();
}
assert.equal(counter.textContent, 'Página 1 de 7');
nodes.get('[data-presentation-prev]').events.click();
assert.equal(counter.textContent, 'Página 7 de 7');
let prevented = false;
dialog.querySelector('a').focus();
dialog.events.keydown({ key: 'Tab', preventDefault() { prevented = true; } });
assert.equal(prevented, true);
assert.equal(document.activeElement, nodes.get('[data-presentation-close]'));
dialog.events.keydown({ key: 'Tab', shiftKey: true, preventDefault() {} });
assert.equal(document.activeElement, dialog.querySelector('a'));
image.events.error();
assert.equal(nodes.get('[data-presentation-error]').hidden, false);
nodes.get('[data-presentation-next]').events.click();
assert.equal(nodes.get('[data-presentation-error]').hidden, true);
nodes.get('[data-presentation-close]').events.click();
assert.equal(dialog.open, false);
assert.equal(document.activeElement, origin);
for (let page = 1; page <= 7; page++) assert.ok(existsSync(new URL(`../assets/platino-os/page-${page}.webp`, import.meta.url)));
console.log('Presentation: lazy loading, seven pages, manual navigation, focus trap, return focus and error recovery passed. Native Escape requires browser validation.');
