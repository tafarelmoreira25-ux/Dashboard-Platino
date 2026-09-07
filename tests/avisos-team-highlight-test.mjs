import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const functionSource = (name, next) => html.slice(html.indexOf('        function ' + name + '('), html.indexOf('        function ' + next + '('));
const people = vm.runInNewContext(html.match(/people: (\[[\s\S]*?\n                \])/)[1]);
const container = { innerHTML: '' };
const context = vm.createContext({
    document: { getElementById: () => container },
    defaultAvisosData: { highlight: { people } },
    rankingData: { source: 'googleSheets', period: 'month', periodStart: '2026-08-01T03:00:00.000Z', periodEnd: '2026-08-31T03:00:00.000Z', comercial: [{ name: 'Mariana Guijo', sold: 12345 }], juridico: [{ name: 'Janaina', sold: 23456 }] },
    escapeHtml: String,
    normalizePersonKey: value => value.toLowerCase(),
    getRankingSold: item => item.sold,
    formatCurrency: value => 'BRL ' + value
});
vm.runInContext(functionSource('renderAvisosHighlights', 'renderAvisos'), context);
context.renderAvisosHighlights();
assert.match(container.innerHTML, /Mariana Guijo/);
assert.match(container.innerHTML, /Janaina Rodrigues Paiva/);
assert.match(container.innerHTML, />MG<\/span>/);
assert.match(container.innerHTML, /janaina-rodrigues-paiva.jpeg/);
assert.doesNotMatch(container.innerHTML, /beatriz|mariana-santos/i);
assert.equal((container.innerHTML.match(/META SUPERADA/g) || []).length, 2);
assert.match(container.innerHTML, /BRL 12345/);
assert.match(container.innerHTML, /BRL 23456/);
context.rankingData.period = 'today';
context.renderAvisosHighlights();
assert.doesNotMatch(container.innerHTML, /BRL/);
context.rankingData.period = 'month';
context.rankingData.periodStart = '2026-09-01T03:00:00.000Z';
context.renderAvisosHighlights();
assert.doesNotMatch(container.innerHTML, /BRL/);
context.rankingData.periodStart = '2026-08-01T03:00:00.000Z';
context.rankingData.comercial = [{ name: 'Mariana Santos', sold: 999 }];
context.rankingData.juridico = [];
context.renderAvisosHighlights();
assert.doesNotMatch(container.innerHTML, /BRL/);
assert.ok((await stat(new URL('../assets/equipe/janaina-rodrigues-paiva.jpeg', import.meta.url))).size > 50000);
assert.equal((html.match(/name: 'BEATRIZ GARCIA'/g) || []).length, 1);
assert.match(html, /AVISOS_HIGHLIGHT_VERSION = '2026-08-mariana-janaina'/);

const timers = new Map();
let id = 0;
const message = { textContent: '', classList: { add() {}, remove() {} } };
const status = { hidden: true };
let busy;
let reducedMotion = false;
const loading = vm.createContext({
    document: { getElementById: name => name === 'ranking-sync-status' ? status : name === 'ranking-sync-message' ? message : { setAttribute: (_, value) => { busy = value; } } },
    window: { addEventListener() {}, matchMedia: () => ({ matches: reducedMotion }) },
    setInterval: (fn, delay) => { assert.equal(delay, 2800); timers.set(++id, fn); return id; },
    setTimeout: (fn, delay) => { assert.equal(delay, reducedMotion ? 0 : 220); timers.set(++id, fn); return id; },
    clearInterval: key => timers.delete(key),
    clearTimeout: key => timers.delete(key)
});
vm.runInContext(html.slice(html.indexOf('        const rankingSyncMessages'), html.indexOf('        function normalizeRankingData')), loading);
loading.setRankingLoading(true);
assert.equal(status.hidden, false);
assert.equal(busy, 'true');
const firstMessage = message.textContent;
const interval = timers.get(1);
interval();
const fade = timers.get(2); timers.delete(2); fade();
assert.notEqual(message.textContent, firstMessage);
loading.setRankingLoading(true);
loading.setRankingLoading(false);
assert.equal(status.hidden, false, 'Uma segunda consulta ainda está em andamento.');
interval();
loading.setRankingLoading(false);
assert.equal(status.hidden, true);
assert.equal(busy, 'false');
assert.equal(timers.size, 0, 'Intervalo e fade devem ser cancelados ao finalizar.');
reducedMotion = true;
loading.setRankingLoading(true);
[...timers.values()][0]();
loading.setRankingLoading(false);
assert.equal(timers.size, 0);
assert.match(html, /prefers-reduced-motion: reduce/);
console.log('Destaques de agosto e ciclo de sincronização validados.');
