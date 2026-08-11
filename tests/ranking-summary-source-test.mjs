import assert from "node:assert/strict";
import { rowsFromPlatinoSideBySideCsv } from "../api/ranking-sheet.js";

const csvRow = cells => cells.map(value => `\"${String(value).replaceAll('\"', '\"\"')}\"`).join(",");
const csv = [
  ["COMERCIAL AGOSTO DATA", "VALOR", "FORMA DE PAG.", "QNT. PARCELA", "VALOR LÍQUIDO", "CONSULTOR", "", "JURÍDICO AGOSTO DATA", "VALOR", "FORMA DE PAG.", "QNT. PARCELA", "VALOR LÍQUIDO", "CONSULTOR"],
  ["03/08/2026", "R$ 3.000,00", "Pix", "1x", "R$ 2.700,00", "Nome que nao pode entrar", "", "03/08/2026", "R$ 2.000,00", "Pix", "1x", "R$ 2.000,00", "Outro nome que nao pode entrar"],
  ["RANKING COMERCIAL", "TOTAL MENSAL", "META MENSAL", "GAP", "", "", "", "RANKING JURÍDICO", "TOTAL MENSAL", "META MENSAL", "GAP", "", ""],
  ["Ana da Silva", "R$ 12.500,00", "R$ 30.000,00", "R$ 17.500,00", "", "", "", "Bruno Lima", "R$ 18.000,00", "R$ 80.000,00", "R$ 62.000,00", "", ""],
  ["Carla Souza", "R$ 9.000,00", "R$ 20.000,00", "R$ 11.000,00", "", "", "", "TOTAL", "R$ 18.000,00", "R$ 80.000,00", "R$ 62.000,00", "", ""],
  ["TOTAL", "R$ 21.500,00", "R$ 50.000,00", "R$ 28.500,00", "", "", "", "", "", "", "", "", ""]
].map(csvRow).join("\n");

const result = rowsFromPlatinoSideBySideCsv(csv, { key: "month", start: new Date(2026, 7, 1), end: new Date(2026, 7, 31) });

assert.deepEqual(
  result.rows.map(item => [item.sector, item.name, item.sold, item.goal, item.gap]),
  [
    ["comercial", "Ana da Silva", 12500, 30000, 17500],
    ["comercial", "Carla Souza", 9000, 20000, 11000],
    ["juridico", "Bruno Lima", 18000, 80000, 62000]
  ]
);
assert.equal(result.teamTotals.comercial, 21500);
assert.equal(result.teamTotals.juridico, 18000);
assert.equal(result.metrics.comercialContracts, 1);
assert.ok(!result.rows.some(item => item.name.includes("nao pode entrar")));

const visualOverlayCsv = [
  ["COMERCIAL AGOSTO DATA", "VALOR", "FORMA DE PAG.", "QNT. PARCELA", "VALOR LÍQUIDO", "CONSULTOR", "", "JURÍDICO AGOSTO DATA", "VALOR", "FORMA DE PAG.", "QNT. PARCELA", "VALOR LÍQUIDO", "CONSULTOR"],
  ["04/08/2026", "R$ 1.794,00", "Cartão", "6x", "R$ 1.542,84", "Rafaela", "", "10/08/2026", "R$ 3.200,35", "Pix", "1x", "R$ 3.200,35", "Tabata"],
  ["05/08/2026", "R$ 1.000,00", "Pix", "1x", "R$ 1.000,00", "Mariana", "", "", "", "", "", "", ""],
  ["06/08/2026", "R$ 500,00", "Pix", "1x", "R$ 500,00", "Mariane", "", "", "", "", "", "", ""],
  ["", "", "", "", "R$ 3.042,84", "", "", "", "", "", "", "R$ 3.200,35", ""],
  ["", "", "META MENSAL", "GAP", "", "", "", "", "R$ 3.200,35", "", "", "", ""],
  ["", "R$ 1.542,84", "R$ 15.500,00", "R$ 13.957,16", "", "", "", "", "R$ 3.200,35", "", "", "", ""],
  ["", "R$ 1.500,00", "R$ 20.000,00", "R$ 18.500,00", "", "", "", "", "", "", "", "", ""],
  ["", "R$ 3.042,84", "R$ 35.500,00", "R$ 32.457,16", "", "", "", "", "", "", "", "", ""]
].map(csvRow).join("\n");

const visualOverlayResult = rowsFromPlatinoSideBySideCsv(
  visualOverlayCsv,
  { key: "month", start: new Date(2026, 7, 1), end: new Date(2026, 7, 31) }
);

assert.deepEqual(
  visualOverlayResult.rows.map(item => [item.sector, item.name, item.sold, item.goal]),
  [
    ["comercial", "Rafaela Marcelino", 1542.84, 15500],
    ["comercial", "Mariana", 1500, 20000],
    ["juridico", "Tabata Rangel de Lima", 3200.35, 150000]
  ]
);
assert.equal(visualOverlayResult.teamTotals.comercial, 3042.84);
assert.equal(visualOverlayResult.teamTotals.juridico, 3200.35);

console.log("Ranking: consolidado completo tem prioridade e lançamentos recuperam nomes ausentes do CSV.");
