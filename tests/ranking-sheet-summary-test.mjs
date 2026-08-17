import assert from 'node:assert/strict';
import { rowsFromPlatinoSideBySideCsv } from '../api/ranking-sheet.js';

const now = new Date();
const date = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo'
}).format(now);

const csv = [
  ['DATA JURIDICO', 'VALOR', 'META', 'GAP', 'VALOR LIQUIDO', 'CONSULTOR'],
  [date, '1000,00', '', '', '1000,00', 'Tabata'],
  [date, '58098,25', '', '', '58098,25', 'Janaina'],
  ['RANKING MENSAL', '', '', '', '', ''],
  ['Tabata', '1000,00', '', '', '', ''],
  ['TOTAL', '1000,00', '', '', '', '']
].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');

const result = rowsFromPlatinoSideBySideCsv(csv);
const juridico = result.rows.filter(item => item.sector === 'juridico');

assert.equal(juridico.length, 2, 'Resumo parcial não pode excluir consultor com lançamento válido.');
assert.equal(juridico.find(item => item.name.startsWith('Janaina'))?.sold, 58098.25);

console.log('Ranking preserva lançamentos mesmo quando o resumo mensal está parcial.');
