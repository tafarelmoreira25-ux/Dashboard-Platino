import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { IDENTIFICATION, createSession, fileName, normalizeReport, reportBlocks, saoPauloDate, whatsappMessage } from '../src/process-reports/report-core.js';
import { extractProcessSummary } from '../src/lib/processSummary.js';
import { generateLocalReport, organizeReport } from '../src/process-reports/report-local.js';
import { createReportDocument, createWordDocument, PAGE } from '../src/process-reports/report-export.js';

const text = `Cliente: Cliente Exemplo
Processo: 0000001-01.2026.8.26.0000
Órgão julgador: Vara Cível de Exemplo
Classe: Procedimento comum
Assunto: Contratos
Justiça gratuita: Não concedida
26/11/2026 — Juntada de petição
Petição juntada aos autos.
25/11/2026 — Distribuição
Processo distribuído.`;
const input = extra => ({ sources: [{ name: 'Texto colado', text, method: 'text' }], ...extra });
function fixture() { return generateLocalReport(input()); }

test('geração local reutiliza o parser do gerador, extrai campos e ordena as movimentações', () => {
  const legacy = extractProcessSummary(text), report = fixture();
  assert.equal(legacy.cliente, 'Cliente Exemplo'); assert.equal(report.identificacao.cliente, legacy.cliente);
  assert.equal(report.identificacao.orgaoJulgador, 'Vara Cível de Exemplo');
  assert.equal(report.identificacao.classe, 'Procedimento comum'); assert.equal(report.identificacao.assunto, 'Contratos');
  assert.equal(report.identificacao.justicaGratuita, 'Não');
  assert.deepEqual(report.linhaTempo.map(item => item.data), ['2026-11-25', '2026-11-26']);
  assert.match(report.statusAtual, /Juntada/); assert.equal(report.proximasEtapas.length, 0);
});
test('dados de outro processo ou cliente são bloqueados; conflito de campo é sinalizado', () => {
  assert.throws(() => generateLocalReport(input({ process: '0000002-01.2026.8.26.0000' })), /diverge/);
  assert.throws(() => generateLocalReport(input({ sources: [{ name: 'a', text }, { name: 'b', text: text.replace('0000001-01', '0000002-01') }] })), /processos diferentes/);
  assert.throws(() => generateLocalReport(input({ sources: [{ name: 'a', text }, { name: 'b', text: text.replace('Cliente Exemplo', 'Outro Cliente') }] })), /clientes diferentes/);
  const report = generateLocalReport(input({ sources: [{ name: 'a', text }, { name: 'b', text: text.replace('Vara Cível de Exemplo', 'Outra Vara') }] }));
  assert.ok(report.alertas.some(item => item.includes('diverge')));
});
test('informações incompletas e OCR: preservar o original e sinalizar lacunas sem inventar', () => {
  const report = generateLocalReport({ sources: [{ name: 'print.png', text: 'Documento recebido sem data ou identificação.', method: 'ocr', confidence: 45 }] });
  assert.equal(report.identificacao.cliente, ''); assert.equal(report.statusAtual, '');
  assert.equal(report.linhaTempo[0].resumo, 'Documento recebido sem data ou identificação.');
  assert.ok(report.alertas.some(item => item.includes('baixa confiança')));
  assert.doesNotMatch(reportBlocks(report, '2026-11-26').map(item => item.text).join(' '), /Processo nº|Interessado|undefined|Não informado/);
  assert.throws(() => generateLocalReport({ sources: [] }), /legível/);
  assert.throws(() => generateLocalReport({ sources: [{ name: 'a', text: 'a'.repeat(60001) }] }), /60 mil/);
});
test('datas inválidas não viram prazos; distribuição não é presumida como autuação', () => {
  const report = generateLocalReport({ sources: [{ name: 'Texto', text: 'Data da distribuição: 25/11/2026\n31/02/2026 — Expedição de intimação' }] });
  assert.equal(report.identificacao.dataAutuacao, ''); assert.equal(report.linhaTempo[0].data, '');
  assert.ok(report.alertas.some(item => item.includes('Data inválida')));
  assert.equal(report.proximasEtapas.length, 0); assert.doesNotMatch(report.statusAtual, /prazo|deferido|favorável/);
});
test('data de São Paulo, mensagem, esquema e isolamento entre atendimentos', () => {
  assert.equal(saoPauloDate(new Date('2026-11-27T01:30:00Z')), '2026-11-26');
  assert.equal(fileName(fixture(), '2026-11-26', 'pdf'), 'Relatorio_Processual_Cliente_Exemplo_26-11-2026.pdf');
  assert.match(whatsappMessage(fixture()), /Olá, Cliente!/);
  assert.throws(() => normalizeReport({ ...fixture(), html: '<script>' }), /desconhecido/);
  const session = createSession(), a = session.begin(); session.clear(); assert.equal(a.signal.aborted, true); assert.equal(session.current(a.version), false);
  const b = session.begin(); session.begin(); assert.equal(b.signal.aborted, true);
});
test('organização só altera espaços; resumido preserva dados e informa o recorte', () => {
  const report = fixture(); report.statusAtual = '  Texto   conferido.  ';
  assert.equal(organizeReport(report).statusAtual, 'Texto conferido.');
  report.linhaTempo = Array.from({ length: 12 }, (_, i) => ({ data: `2026-11-${String(i + 1).padStart(2, '0')}`, evento: `Movimento ${i}`, resumo: '', fonte: 'Texto colado' }));
  const original = structuredClone(report);
  const blocks = reportBlocks(report, '2026-11-26', { detail: 'resumido' });
  assert.equal(blocks.filter(item => item.text.includes('— Movimento')).length, 5); assert.ok(blocks.some(item => item.text.includes('cinco movimentações')));
  assert.deepEqual(report, original);
  assert.ok(reportBlocks(report, '2026-11-26', { detail: 'detalhado' }).some(item => item.text === 'Fonte: Texto colado'));
});
test('PDF válido e selecionável; DOCX editável, A4, múltiplas páginas e timbrado', async () => {
  const png = await fs.readFile(new URL('../assets/process-reports/papel-timbrado.png', import.meta.url));
  const single = await createReportDocument(fixture(), '2026-11-26', png); assert.equal(single.pages.length, 1);
  const report = fixture(); report.linhaTempo = Array.from({ length: 65 }, (_, index) => ({ data: '2026-11-26', evento: `Evento fictício ${index}`, resumo: 'Descrição para testar a continuidade do texto, a acentuação e a preservação das margens institucionais em cada página.', fonte: 'Anexo fictício' }));
  const document = await createReportDocument(report, '2026-11-26', png), parsed = await PDFDocument.load(document.pdf);
  assert.ok(parsed.getPageCount() > 2); assert.equal(parsed.getPageCount(), document.pages.length);
  document.pages.flat().forEach(line => { assert.ok(line.y >= PAGE.bottom && line.y <= PAGE.top); });
  const docx = createWordDocument(document); assert.equal(Buffer.from(docx).readUInt32LE(0), 0x04034b50);
  const xml = new TextDecoder().decode(docx); assert.match(xml, /behindDoc="1"/); assert.match(xml, /w:pageBreakBefore/); assert.match(xml, /Descrição/);
  await fs.mkdir(new URL('../tmp/process-reports-qa/', import.meta.url), { recursive: true });
  for (const [name, bytes] of [['single.pdf', single.pdf], ['multi.pdf', document.pdf], ['multi.docx', docx]]) await fs.writeFile(new URL(`../tmp/process-reports-qa/${name}`, import.meta.url), bytes);
});
test('o módulo não tem chave, geração remota, token ou gateway pago', async () => {
  const ui = await fs.readFile(new URL('../src/process-reports/process-reports.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /getIdToken|api\/process-reports|platinoGenerateAI|Gerar relatório com IA/);
  assert.match(ui, /generateLocalReport/); assert.match(ui, /extractSources/);
  const env = await fs.readFile(new URL('../.env.example', import.meta.url), 'utf8'); assert.doesNotMatch(env, /PROCESS_REPORT_GEMINI_API_KEY/);
});
