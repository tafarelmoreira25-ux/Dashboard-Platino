import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';

const source = readFileSync(new URL('../src/home-presentation.js', import.meta.url), 'utf8')
  .replace('export function', 'function')
  .replaceAll('import.meta.url', JSON.stringify(new URL('../src/home-presentation.js', import.meta.url).href));
async function setup(reduced = false) {
  const nodes = new Map();
  const events = {};
  const timers = new Map();
  let observer;
  let loads = 0;
  let sequence = 0;
  const motion = { matches: reduced, addEventListener: (_, fn) => { events.motion = fn; } };
  const root = { querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      classList: { add() {}, remove() {} },
      setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; },
      addEventListener(_, fn) { this.click = fn; }
    });
    return nodes.get(selector);
  } };
  const document = { hidden: false, getElementById: () => root,
    addEventListener: (_, fn) => { events.visibility = fn; } };
  const context = vm.createContext({ URL, document,
    window: { matchMedia: () => motion },
    Image: class { set src(value) { this.value = value; loads++; queueMicrotask(() => this.onload()); } get src() { return this.value; } },
    IntersectionObserver: class { constructor(fn) { observer = fn; } observe() {} },
    clearTimeout: id => timers.delete(id),
    setTimeout: (fn, delay) => { assert.equal(delay, 8000); timers.set(++sequence, fn); return sequence; }
  });
  vm.runInContext(source, context);
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const visible = async value => { observer([{ isIntersecting: value }]); await flush(); };
  const tick = async () => { assert.equal(timers.size, 1); const fn = [...timers.values()][0]; timers.clear(); await fn(); await flush(); };
  return { nodes, events, motion, document, timers, visible, tick, flush, loads: () => loads };
}
const player = await setup();
assert.equal(player.loads(), 0, 'No page fetch while login hides the presentation');
await player.visible(true);
assert.equal(player.loads(), 2, 'Only current and next page loaded');
for (let i = 1; i <= 7; i++) {
  assert.equal(player.nodes.get('[data-presentation-counter]').textContent, `${i} / 7`);
  await player.tick();
}
assert.equal(player.nodes.get('[data-presentation-counter]').textContent, '1 / 7');
player.nodes.get('[data-presentation-toggle]').click();
assert.equal(player.timers.size, 0, 'Pause cancels advance');
player.nodes.get('[data-presentation-next]').click();
await player.flush();
assert.equal(player.nodes.get('[data-presentation-counter]').textContent, '2 / 7');
assert.equal(player.timers.size, 0, 'Manual navigation stays paused');
player.nodes.get('[data-presentation-toggle]').click();
await player.visible(false);
assert.equal(player.timers.size, 0, 'Offscreen playback stops');
await player.visible(true);
player.document.hidden = true;
player.events.visibility();
assert.equal(player.timers.size, 0, 'Background tab stops playback');
const reduced = await setup(true);
await reduced.visible(true);
assert.equal(reduced.timers.size, 0);
assert.equal(reduced.nodes.get('[data-presentation-toggle]').textContent, 'Reproduzir');
reduced.nodes.get('[data-presentation-toggle]').click();
assert.equal(reduced.timers.size, 1, 'Explicit playback allowed without animation');
reduced.events.motion();
assert.equal(reduced.timers.size, 0, 'Device preference changes pause playback');
for (let i = 1; i <= 7; i++) assert.ok(existsSync(new URL(`../assets/platino-os/page-${i}.webp`, import.meta.url)));
console.log('Homepage presentation: order, loop, lazy load, pause, visibility and reduced motion passed.');
