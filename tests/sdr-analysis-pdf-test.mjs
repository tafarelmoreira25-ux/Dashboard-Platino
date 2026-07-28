import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const output = resolve("output/pdf/analise-preliminar-aprovada-sdr-teste.pdf");
await mkdir(dirname(output), { recursive: true });

const pdf = await PDFDocument.create();
const page = pdf.addPage([595.28, 841.89]);
const regular = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const navy = rgb(18 / 255, 58 / 255, 89 / 255);
const ocean = rgb(8 / 255, 120 / 255, 189 / 255);
const silver = rgb(215 / 255, 224 / 255, 231 / 255);
const text = rgb(48 / 255, 68 / 255, 84 / 255);

page.drawRectangle({ x: 0, y: 746, width: 595.28, height: 95.89, color: navy });
page.drawText("ANÁLISE PRELIMINAR APROVADA", { x: 52, y: 796, font: bold, size: 18, color: rgb(1, 1, 1) });
page.drawText("PLATINUM SOLUÇÕES FINANCEIRAS", { x: 52, y: 775, font: regular, size: 9, color: rgb(0.85, 0.94, 1) });

let y = 715;
function row(label, value, strong = false) {
  page.drawText(label, { x: 52, y, font: bold, size: 9, color: navy });
  page.drawText(String(value), { x: 220, y, font: strong ? bold : regular, size: 9, color: strong ? ocean : text });
  page.drawLine({ start: { x: 52, y: y - 7 }, end: { x: 543, y: y - 7 }, color: silver, thickness: 0.6 });
  y -= 27;
}
function title(value) {
  page.drawRectangle({ x: 52, y: y - 5, width: 491, height: 25, color: rgb(0.94, 0.97, 0.99) });
  page.drawText(value, { x: 62, y: y + 3, font: bold, size: 10, color: navy });
  y -= 38;
}

row("Nome", "CLIENTE DE TESTE");
row("CPF", "529.982.247-25");
row("Protocolo interno", "PLT-20260728-000001-LDTESTE");
row("Data e horário", "28/07/2026 10:30");
title("FINANCIAMENTO ATUAL");
row("Instituição Financeira", "Banco de teste");
row("Financiamento", "Veículo");
row("Número de meses", "48");
row("Valor da parcela", "R$ 1.000,00");
row("Parcelas pagas / restantes", "12 / 36");
title("CORREÇÃO DE FINANCIAMENTO APROVADA");
row("Correção nº", "CR-2026-000001");
row("Situação", "APROVADA", true);
row("Valor da nova parcela", "R$ 800,00", true);
row("Redução por parcela", "R$ 200,00");
row("ESTORNO", "R$ 7.200,00", true);
row("REDUÇÃO TOTAL DO CONTRATO", "R$ 7.700,00", true);

page.drawText("Documento de teste visual. Não contém dados reais.", {
  x: 52,
  y: 28,
  font: regular,
  size: 7,
  color: rgb(0.4, 0.45, 0.5)
});

const bytes = await pdf.save();
await writeFile(output, bytes);
assert.ok(bytes.length > 2_000);
assert.equal(pdf.getPageCount(), 1);
console.log(output);
