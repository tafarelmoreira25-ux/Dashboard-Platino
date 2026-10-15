import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import rankingHandler from '../api/ranking-sheet.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const NativeDate = Date;
class OctoberDate extends NativeDate {
  constructor(...args) { super(...(args.length ? args : ['2026-10-01T15:00:00Z'])); }
}
const context = vm.createContext({
  Date: OctoberDate,
  getRankingGoal: item => Number(item.goal) || 0,
  getDefaultRankingGoal: () => 0,
  getRankingSold: item => Number(item.sold) || 0,
  parseRankingValue: value => Number(value) || 0,
  isInactiveTeamMember: () => false,
  normalizeClientSearchText: value => value.toLowerCase()
});
const source = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
vm.runInContext(source('        function getCurrentOperationalMonthKey(', '        // Impede'), context);
vm.runInContext(source('        const defaultRankingData = {', '        const RANKING_SHEET_SYNC_INTERVAL_MS'), context);
vm.runInContext(source('        function normalizeRankingData(', '        function parseRankingValue('), context);
assert.equal(context.getCurrentOperationalMonthKey(), 'OUTUBRO');
for (const origin of ['manual', 'googleSheets']) {
  const result = context.normalizeRankingData({
    monthKey: 'SETEMBRO', source: origin,
    comercial: [{ name: 'Mariana', sold: 25000 }], juridico: [],
    teamTotals: { comercial: 25000 }, hunters: [{ name: 'Hunter', value: 9000 }]
  });
  assert.equal(result.monthKey, 'OUTUBRO');
  assert.equal(result.teamTotals.comercial, 0);
  assert.equal(result.teamTotals.juridico, 0);
  assert.ok([...result.comercial, ...result.juridico].every(item => item.sold === 0));
  assert.equal(result.hunters.length, 0);
}
const current = context.normalizeRankingData({
  monthKey: 'OUTUBRO', source: 'googleSheets',
  comercial: [{ name: 'Mariana', sold: 1250, goal: 30000 }], juridico: []
});
assert.equal(current.teamTotals.comercial, 1250);
assert.equal(current.comercial[0].goal, 30000);
const central = source('            <section id="section-avisos"', '            <section id="section-comercial"');
assert.doesNotMatch(central, /avisos-highlight-card|sales-hunters-card|sales-timeline-panel/);
assert.doesNotMatch(central, /id="team-carousel(?:-prev|-next)?"|id="team-track"/);

const originalFetch = globalThis.fetch;
const urls = [];
try {
  globalThis.Date = OctoberDate;
  globalThis.fetch = async url => {
    urls.push(String(url));
    if (String(url).endsWith('/edit')) {
      return { ok: true, text: async () => '<div class="docs-sheet-tab-caption">OUTUBRO</div>' };
    }
    return { ok: true, text: async () => '"NOME","VENDIDO","META","SETOR"\n"Mariana","0","30000","comercial"' };
  };
  let payload;
  await rankingHandler({ method: 'GET', query: {} }, {
    setHeader() {},
    status(code) { assert.equal(code, 200); return this; },
    json(value) { payload = value; }
  });
  assert.ok(urls.some(url => url.includes('sheet=OUTUBRO')));
  assert.equal(payload.monthKey, 'OUTUBRO');
  assert.equal(payload.teamTotals.comercial, 0);
  assert.equal(payload.sourceHealth.ranking.sheet, 'OUTUBRO');
  globalThis.fetch = async () => ({ ok: true, text: async () => '<div class="docs-sheet-tab-caption">SETEMBRO</div>' });
  await rankingHandler({ method: 'GET', query: {} }, {
    status(code) { assert.equal(code, 502); return this; },
    json(value) { assert.match(value.details, /OUTUBRO nao existe/); }
  });
} finally {
  globalThis.Date = NativeDate;
  globalThis.fetch = originalFetch;
}
console.log('Ranking de outubro: cache anterior descartado, vendas zeradas e aba OUTUBRO selecionada.');
