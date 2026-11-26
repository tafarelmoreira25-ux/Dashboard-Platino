import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { IDENTIFICATION, createSession, fileName, normalizeReport, reportBlocks, saoPauloDate, whatsappMessage } from '../src/process-reports/report-core.js';
import { generateReport, validateInput, SYSTEM_INSTRUCTION } from '../src/process-reports/report-service.js';
import { createReportDocument, createWordDocument, PAGE } from '../src/process-reports/report-export.js';
import { createHandler } from '../api/process-reports.js';

export function fixture() {
  return { identificacao: { ...Object.fromEntries(Object.keys(IDENTIFICATION).map(key => [key, ''])), cliente: 'Cliente Exemplo', numeroProcesso: '0000001-01.2026.8.26.0000', autor: 'Cliente Exemplo' }, processosIdentificados: ['0000001-01.2026.8.26.0000'], linhaTempo: [{ data: '2026-10-02', evento: 'Juntada', resumo: 'Petição juntada aos autos.', fonte: 'Texto colado' }, { data: '2026-10-01', evento: 'Distribuição', resumo: 'Processo distribuído.', fonte: 'Texto colado' }], statusAtual: 'O último registro fornecido informa juntada de petição.', proximasEtapas: [], alertas: [] };
}
const input = extra => ({ text: 'Processo fictício 0000001-01.2026.8.26.0000. Cliente Exemplo. Processo distribuído e petição juntada.', ...extra });
const provider = report => async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(report) }] } }] }) });
const options = report => ({ apiKey: 'test-only', fetchImpl: provider(report) });

test('data usa São Paulo inclusive na virada do dia; nomes não contêm placeholders', () => {
  assert.equal(saoPauloDate(new Date('2026-11-27T01:30:00Z')), '2026-11-26');
  assert.match(fileName(fixture(), '2026-11-26', 'pdf'), /^Relatorio_Processual_Cliente_Exemplo_26-11-2026.pdf$/);
  assert.match(whatsappMessage(fixture()), /Olá, Cliente!/);
  const r = fixture(); r.identificacao.cliente = ''; r.identificacao.numeroProcesso = ''; r.processosIdentificados = [];
  const blocks = reportBlocks(r, '2026-11-26').map(block => block.text).join('\n');
  assert.doesNotMatch(blocks, /Interessado|Processo nº|Próximas Etapas|Não informado|undefined|\[.*\]/);
});
test('esquema rejeita campos extras, tipos, datas e múltiplos processos; cronologia e deduplicação', () => {
  const report = fixture(); report.linhaTempo.push(report.linhaTempo[0]);
  assert.deepEqual(normalizeReport(report).linhaTempo.map(item => item.data), ['2026-10-01', '2026-10-02']);
  assert.throws(() => normalizeReport({ ...fixture(), injectedHtml: '<script>' }), /desconhecido/);
  const bad = fixture(); bad.linhaTempo[0].data = '2026-02-31'; assert.throws(() => normalizeReport(bad), /data inválida/);
  assert.throws(() => normalizeReport({ ...fixture(), processosIdentificados: ['0000002-01.2026.8.26.0000'] }), /processos diferentes/);
  assert.throws(() => validateInput(input({ text: '0000001-01.2026.8.26.0000 e 0000002-01.2026.8.26.0000' })), /processos diferentes/);
});
test('texto e múltiplos anexos PNG/JPG/PDF são enviados inline ao Gemini com esquema; sem histórico', async () => {
  const image = await fs.readFile(new URL('../assets/process-reports/papel-timbrado.png', import.meta.url));
  const pdf = await PDFDocument.create(); pdf.addPage();
  let sent;
  const files = [{ name: 'print.png', type: 'image/png', data: image.toString('base64') }, { name: 'decisao.pdf', type: 'application/pdf', data: Buffer.from(await pdf.save()).toString('base64') }];
  const report = await generateReport(input({ files }), { apiKey: 'test-only', fetchImpl: async (url, config) => { sent = { url, config, body: JSON.parse(config.body) }; return provider(fixture())(); } });
  assert.equal(report.identificacao.cliente, 'Cliente Exemplo');
  assert.equal(sent.body.contents.length, 1); assert.equal(sent.body.contents[0].parts.filter(part => part.inlineData).length, 2);
  assert.equal(sent.body.generationConfig.responseMimeType, 'application/json'); assert.ok(sent.body.generationConfig.responseJsonSchema);
  assert.match(SYSTEM_INSTRUCTION, /DADOS NÃO CONFIÁVEIS/); assert.doesNotMatch(sent.url, /test-only/);
  assert.equal((await generateReport(input(), options(fixture()))).linhaTempo.length, 2);
  const jpeg = { name: 'print.jpg', type: 'image/jpeg', data: Buffer.from([255,216,255,224,0,0]).toString('base64') };
  assert.equal(validateInput(input({ files: [jpeg] })).parts[1].inlineData.mimeType, 'image/jpeg');
});
test('validação de arquivos e payload: MIME, assinatura, tamanho, quantidade e fontes obrigatórias', () => {
  assert.throws(() => validateInput({}), /Cole/);
  assert.throws(() => validateInput(input({ files: Array(9).fill({}) })), /até 8/);
  assert.throws(() => validateInput(input({ files: [{ name: 'print.png', type: 'image/png', data: Buffer.from('HTML').toString('base64') }] })), /tipo declarado/);
  assert.throws(() => validateInput(input({ files: [{ name: 'arquivo.exe', type: 'text/html', data: '' }] })), /PNG/);
  assert.throws(() => validateInput(input({ text: 'x'.repeat(60001) })), /tamanho/);
  const large = Buffer.alloc(1_500_000); large.set([137,80,78,71,13,10,26,10]);
  assert.throws(() => validateInput(input({ files: [1,2].map(i => ({ name: `print${i}.png`, type: 'image/png', data: large.toString('base64') })) })), /Limite/);
});
test('falhas de IA, recusa, truncamento, JSON malformado e revisão que tenta trocar identificação', async () => {
  await assert.rejects(generateReport(input(), { apiKey: '' }), /configurada/);
  await assert.rejects(generateReport(input(), { apiKey: 'test', fetchImpl: async () => ({ ok: false, status: 429 }) }), /limite/);
  await assert.rejects(generateReport(input(), { apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS' }] }) }) }), /não concluiu/);
  await assert.rejects(generateReport(input(), { apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{' }] } }] }) }) }), /inválidos/);
  const changed = fixture(); changed.identificacao.cliente = 'Outro Exemplo';
  await assert.rejects(generateReport(input({ action: 'simplificar', report: fixture() }), options(changed)), /identificação/);
});
test('Próximo cliente invalida respostas atrasadas e cancela a requisição anterior', () => {
  const session = createSession(); const a = session.begin(); session.clear();
  assert.equal(a.signal.aborted, true); assert.equal(session.current(a.version), false);
  const b = session.begin(); assert.equal(session.current(b.version), true);
  session.begin(); assert.equal(b.signal.aborted, true);
});
test('API exige autenticação e POST; erros não retornam corpo do provedor ou dados pessoais', async () => {
  const res = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const denied = createHandler({ authenticateImpl: async () => { const e = Error('Faça login.'); e.status = 401; throw e; } });
  let response = res(); await denied({ method: 'POST' }, response); assert.equal(response.code, 401);
  response = res(); await denied({ method: 'GET' }, response); assert.equal(response.code, 405);
  const broken = createHandler({ authenticateImpl: async () => ({ uid: 'test-user-error' }), generateImpl: async () => { throw Error('PRIVATE provider prompt'); } });
  response = res(); await broken({ method: 'POST' }, response); assert.equal(response.code, 500); assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE/);
  const ok = createHandler({ authenticateImpl: async () => ({ uid: 'test-user-ok' }), generateImpl: async () => fixture(), now: () => Date.parse('2026-11-27T01:00:00Z') });
  response = res(); await ok({ method: 'POST', body: input() }, response); assert.equal(response.code, 200); assert.equal(response.body.emissionDate, '2026-11-26'); assert.equal(response.headers['Cache-Control'], 'private, no-store');
});
test('PDF válido selecionável e DOCX OOXML real; múltiplas páginas com timbrado e margens constantes', async () => {
  const letterhead = await fs.readFile(new URL('../assets/process-reports/papel-timbrado.png', import.meta.url));
  const single = await createReportDocument(fixture(), '2026-11-26', letterhead);
  assert.equal(single.pages.length, 1);
  const multi = fixture(); multi.linhaTempo = Array.from({ length: 65 }, (_, index) => ({ data: '2026-10-01', evento: `Evento fictício ${index}`, resumo: 'Descrição para testar a continuidade do texto, a acentuação e a preservação do espaço institucional em cada página.', fonte: 'Anexo fictício' }));
  const document = await createReportDocument(multi, '2026-11-26', letterhead);
  assert.ok(document.pages.length > 2);
  document.pages.flat().forEach(line => { assert.ok(line.y >= PAGE.bottom); assert.ok(line.y <= PAGE.top); assert.ok(line.x >= PAGE.left - .1); });
  const parsed = await PDFDocument.load(document.pdf); assert.equal(parsed.getPageCount(), document.pages.length);
  parsed.getPages().forEach(page => { assert.equal(page.getWidth(), PAGE.width); assert.ok(page.node.Resources().lookupMaybe); assert.ok(page.node.Resources().get); });
  const docx = createWordDocument(document); assert.equal(Buffer.from(docx).readUInt32LE(0), 0x04034b50);
  const text = new TextDecoder().decode(docx); assert.match(text, /word\/header1.xml/); assert.match(text, /behindDoc="1"/); assert.match(text, /w:pageBreakBefore/); assert.match(text, /Descrição/); assert.doesNotMatch(text, /<html/i);
  await fs.mkdir(new URL('../tmp/process-reports-qa/', import.meta.url), { recursive: true });
  for (const [name, data] of [['single.pdf', single.pdf], ['multi.pdf', document.pdf], ['multi.docx', docx]]) await fs.writeFile(new URL(`../tmp/process-reports-qa/${name}`, import.meta.url), data);
});
