import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';
import rankingHandler from '../api/ranking-sheet.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const functionSource = (name, next) => html.slice(html.indexOf('        function ' + name + '('), html.indexOf('        function ' + next + '('));
const removed = [];
const context = vm.createContext({
    document: { getElementById: id => ({ remove: () => removed.push(id) }) }
});
vm.runInContext(functionSource('renderAvisosHighlights', 'renderAvisos'), context);
context.renderAvisosHighlights();
assert.deepEqual(removed, ['avisos-highlight-card', 'avisos-highlights']);
assert.doesNotMatch(html, /Resultado de agosto|Destaque \$\{department\} de agosto|refreshMonthlyHighlights/);
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

// A consulta do banner deve usar a aba fechada, mesmo com filtros atuais na requisição.
const originalFetch = globalThis.fetch;
const requestedSheets = [];
globalThis.fetch = async url => {
    requestedSheets.push(new URL(url).searchParams.get('sheet'));
    return new Response('NOME,RESULTADO,META,SETOR\nMariana,12345,10000,comercial\nJanaina Rodrigues Paiva,23456,20000,juridico');
};
try {
    const response = {
        setHeader() {},
        status(code) { this.code = code; return this; },
        json(data) { this.data = data; return this; }
    };
    await rankingHandler({ method: 'GET', query: { action: 'monthly-highlights', period: 'today' } }, response);
    assert.equal(response.code, 200);
    assert.deepEqual(requestedSheets, ['AGOSTO']);
    assert.equal(response.data.month, '2026-08');
    assert.equal(response.data.comercial[0].sold, 12345);
    assert.equal(response.data.juridico[0].sold, 23456);
    globalThis.fetch = async () => { throw new Error('offline'); };
    await rankingHandler({ method: 'GET', query: { action: 'monthly-highlights' } }, response);
    assert.equal(response.code, 502);
    assert.equal(response.data.comercial, undefined, 'Falhas não devem retornar resultados atuais como históricos.');
} finally {
    globalThis.fetch = originalFetch;
}
console.log('Destaques de agosto e ciclo de sincronização validados.');
