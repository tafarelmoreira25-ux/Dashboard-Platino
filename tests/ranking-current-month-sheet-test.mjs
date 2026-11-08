import assert from 'node:assert/strict';
import { rowsFromPlatinoSideBySideCsv } from '../api/ranking-sheet.js';

const date = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo'
}).format(new Date());
const row = cells => cells.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',');
const csv = [
  ['DATA', 'VALOR', 'FORMA DE PAG.', 'QNT. PARCELA', 'VALOR LÍQUIDO', 'CONSULTOR', '', 'DATA', 'VALOR', 'FORMA DE PAG.', 'QNT. PARCELA', 'VALOR LÍQUIDO', 'CONSULTOR'],
  [date, '150,00', 'Pix', '1x', '100,00', 'Michele', '', date, '450,00', 'Pix', '1x', '400,00', 'Julia'],
  [date, '250,00', 'Pix', '1x', '200,00', 'Geovana', '', date, '550,00', 'Pix', '1x', '500,00', 'Felipe'],
  [date, '350,00', 'Pix', '1x', '300,00', 'Geovanna'],
  ['RANKING MENSAL', '', 'META MENSAL', 'GAP', '', '', '', 'RANKING MENSAL', '', 'META MENSAL', 'GAP'],
  ['Michelli', '100,00', '1000,00', '900,00', '', '', '', 'Julia', '400,00', '2000,00', '1600,00'],
  ['TOTAL', '600,00', '3000,00', '2400,00', '', '', '', 'TOTAL', '900,00', '4000,00', '3100,00']
].map(row).join('\n');

const result = rowsFromPlatinoSideBySideCsv(csv);
const comercial = result.rows.filter(item => item.sector === 'comercial');
const juridico = result.rows.filter(item => item.sector === 'juridico');

assert.deepEqual(comercial.map(item => [item.name, item.sold]), [
  ['Michele', 100], ['Geovana', 200], ['Geovanna', 300]
]);
assert.deepEqual(juridico.map(item => [item.name, item.sold]), [
  ['Julia', 400], ['Felipe', 500]
]);
assert.equal(result.teamTotals.comercial, 600);
assert.equal(result.teamTotals.juridico, 900);
assert.equal(result.metrics.comercialContracts, 3);

const exportRows = csv.split('\n');
exportRows[5] = exportRows[5].replace('"Michelli"', '""').replace('"Julia"', '""');
const csvWithoutVisualNames = rowsFromPlatinoSideBySideCsv(exportRows.join('\n'));
assert.deepEqual(csvWithoutVisualNames.rows.filter(item => item.sector === 'comercial').map(item => item.name),
  ['Michele', 'Geovana', 'Geovanna'],
  'O CSV que omite nomes visuais do resumo deve preservar todos os lançamentos datados.');
assert.equal(csvWithoutVisualNames.teamTotals.comercial, 600);

const nextYear = new Date().getFullYear() + 1;
const oldMonth = rowsFromPlatinoSideBySideCsv(csv, {
  key: 'month', start: new Date(nextYear, 10, 1), end: new Date(nextYear, 10, 30)
});
assert.equal(oldMonth.rows.length, 0, 'O quadro consolidado antigo não substitui lançamentos do mês vigente.');
assert.equal(oldMonth.teamTotals.comercial, 0);
assert.equal(oldMonth.teamTotals.juridico, 0);
console.log('Ranking mensal usa valores líquidos e preserva grafias distintas dos lançamentos.');
