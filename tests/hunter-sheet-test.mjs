import assert from 'node:assert/strict';
import {
  extractHunterDataFromCsv,
  getCurrentHunterSheetName,
  getHunterSheetCsvUrl
} from '../api/ranking-sheet.js';

const sheetName = getCurrentHunterSheetName();
const expectedMonth = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  timeZone: 'America/Sao_Paulo'
}).format(new Date()).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

assert.equal(sheetName, `HUNTER ${expectedMonth}`);
assert.match(getHunterSheetCsvUrl(), new RegExp(`sheet=${encodeURIComponent(sheetName)}$`));

const response = await fetch(getHunterSheetCsvUrl(), { cache: 'no-store' });
assert.equal(response.status, 200, `A aba ${sheetName} deve estar acessível.`);

const csv = await response.text();
assert.match(csv, /CLIENTE/i);
assert.match(csv, /CONSULTOR/i);
assert.match(csv, /SITUA/i);
assert.match(csv, /VALOR/i);

const data = extractHunterDataFromCsv(csv);
assert.ok(data.hunters.length > 0, `A aba ${sheetName} deve retornar Hunters.`);
assert.ok(data.paidClients.length > 0, `A aba ${sheetName} deve retornar clientes pagos.`);

const totals = data.hunters
  .sort((a, b) => b.value - a.value)
  .map(item => `${item.name}: ${item.paidClients} pago(s), R$ ${item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);

console.log(`${sheetName} sincronizada diretamente:`);
console.log(totals.join('\n'));
