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

const agostoCsv = [
  ['DATA', 'VALOR', 'FORMA DE PAG.', 'QNT. PARCELA', 'VALOR LÍQUIDO', 'CONSULTOR', '', 'DATA', 'VALOR', 'FORMA DE PAG.', 'QNT. PARCELA', 'VALOR LÍQUIDO', 'CONSULTOR'],
  [date, '25036,76', 'Pix', '1x', '25036,76', 'Beatriz', '', date, '100000,00', 'Pix', '1x', '100000,00', 'Janaina'],
  [date, '24106,64', 'Pix', '1x', '24106,64', 'Mariana', '', date, '7687,06', 'Pix', '1x', '7687,06', 'Janaína'],
  [date, '22002,43', 'Pix', '1x', '22002,43', 'Fernanda', '', date, '49825,65', 'Pix', '1x', '49825,65', 'Tabata'],
  [date, '20571,90', 'Pix', '1x', '20571,90', 'Geovanna', '', date, '2500,00', 'Pix', '1x', '2500,00', 'Elaine'],
  [date, '6250,65', 'Pix', '1x', '6250,65', 'Karen'],
  [date, '1542,84', 'Pix', '1x', '1542,84', 'Rafaela'],
  [date, '1303,15', 'Pix', '1x', '1303,15', 'Roberta'],
  [date, '300,00', 'Pix', '1x', '300,00', 'Rayane'],
  ['RANKING DIÁRIO', '', 'META MENSAL', 'GAP', 'COMISSÃO'],
  ['Rafaela', '1542,84', '1542,84', '0,00'],
  ['Fernanda', '22002,43', '30000,00', '7997,57'],
  ['Geovanna', '20571,90', '30000,00', '9428,10'],
  ['Beatriz', '25036,76', '40000,00', '14963,24'],
  ['Mariana', '24106,64', '30000,00', '5893,36'],
  ['Roberta', '1303,15', '1303,15', '0,00'],
  ['Karen', '6250,65', '15500,00', '9249,35'],
  ['Rayane', '300,00', '3000,00', '2700,00'],
  ['TOTAL', '101114,37', '151345,99', '32388,91']
].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');

const agostoResult = rowsFromPlatinoSideBySideCsv(agostoCsv);
const agostoComercial = Object.fromEntries(
  agostoResult.rows.filter(item => item.sector === 'comercial').map(item => [item.name.split(' ')[0], item.sold])
);
const agostoJuridico = Object.fromEntries(
  agostoResult.rows.filter(item => item.sector === 'juridico').map(item => [item.name.split(' ')[0], item.sold])
);

assert.deepEqual(agostoComercial, {
  Rafaela: 1542.84,
  Fernanda: 22002.43,
  Geovanna: 20571.9,
  Beatriz: 25036.76,
  Mariana: 24106.64,
  Roberta: 1303.15,
  Karen: 6250.65,
  Rayane: 300
});
assert.deepEqual(agostoJuridico, {
  Janaina: 107687.06,
  Tabata: 49825.65,
  Elaine: 2500
});
assert.equal(agostoResult.teamTotals.comercial, 101114.37);
assert.equal(agostoResult.teamTotals.juridico, 160012.71);
assert.equal(agostoResult.teamGoals.comercial, 151345.99);
assert.equal(agostoResult.metrics.comercialContracts, 8);

console.log('Ranking preserva lançamentos mesmo quando o resumo mensal está parcial.');
