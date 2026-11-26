import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const root = fileURLToPath(new URL('..', import.meta.url));
const qa = path.join(root, 'tmp/process-reports-qa'); await fs.mkdir(qa, { recursive: true });
const sourceText = 'Cliente: Cliente Exemplo\nProcesso: 0000001-01.2026.8.26.0000\nÓrgão julgador: Vara Cível de Exemplo\n25/11/2026 — Distribuição\nProcesso distribuído.\n26/11/2026 — Juntada de petição\nPetição juntada aos autos.';
const indexSource = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const legacyWrapper = indexSource.slice(indexSource.indexOf('        function extractAdmProcessSummary()'), indexSource.indexOf('        const admTemplateCatalog ='));
const pdf = await PDFDocument.create(), pagePdf = pdf.addPage(), font = await pdf.embedFont(StandardFonts.Helvetica);
sourceText.split('\n').forEach((text, i) => pagePdf.drawText(text, { x: 50, y: 740 - i * 24, font, size: 13 }));
await fs.writeFile(path.join(qa, 'consulta-texto.pdf'), await pdf.save());
const server = createServer(async (req, res) => {
  if (req.method === 'POST') { res.writeHead(500); return res.end('Nenhum upload ou serviço de IA é permitido neste teste.'); }
  if (req.url === '/legacy-qa') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(`<!DOCTYPE html><textarea id="adm-field-resumoProcesso"></textarea><input id="adm-field-cliente"><input id="adm-field-numeroProcesso"><div id="adm-pdf-status"></div><button onclick="extractAdmProcessSummary()">Separar informações</button><script>function getAdmPdfField(key){return document.getElementById('adm-field-'+key)?.value.trim()||'';} ${legacyWrapper}</script><script type="module">import {extractProcessSummary} from '/src/lib/processSummary.js';window.platinoExtractProcessSummary=extractProcessSummary;</script>`); }
  if (req.url === '/qa') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(`<!DOCTYPE html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;background:#eaf0f8;padding:24px}button,input,textarea{font:inherit}button{cursor:pointer;border:0}h1,h2,p{margin:0}.hidden{display:none}</style><link rel="stylesheet" href="/src/process-reports/process-reports.css"><script type="importmap">{"imports":{"pdf-lib":"/assets/vendor/pdf-lib.esm.min.js"}}</script></head><body><section id="section-relatorios-processuais"><div id="process-reports-root"></div></section><script>window.platinoFirebaseContext={auth:{currentUser:{getIdToken:()=>{throw Error('Token não deve ser solicitado na geração local')}}}};</script><script type="module" src="/src/process-reports/process-reports.js"></script></body></html>`); }
  const filename = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!filename.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const bytes = await fs.readFile(filename);
    res.setHeader('Content-Type', /\.(?:js|mjs)$/.test(filename) ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.wasm') ? 'application/wasm' : filename.endsWith('.pdf') ? 'application/pdf' : filename.endsWith('.png') ? 'image/png' : 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PROCESS_REPORT_BROWSER_CHANNEL ? { channel: process.env.PROCESS_REPORT_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1487, height: 1060 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  const errors = [], external = [], posts = []; page.on('pageerror', error => errors.push(error.message));
  page.on('request', req => { if (/^https?:/.test(req.url()) && !req.url().startsWith(origin)) external.push(req.url()); if (req.method() === 'POST') posts.push(req.url()); });
  await page.goto(origin + '/qa'); await page.locator('#pr-letterhead-status').filter({ hasText: 'incorporado' }).waitFor({ state: 'attached' });
  await page.locator('#pr-generate').click(); assert.match(await page.locator('#pr-status').innerText(), /Cole/);
  await page.locator('#pr-text').fill(sourceText); await page.locator('#pr-generate').click();
  await page.locator('#pr-status').filter({ hasText: 'Relatório gerado localmente.' }).waitFor();
  assert.equal(await page.locator('#pr-id-cliente').inputValue(), 'Cliente Exemplo'); assert.equal(await page.locator('[data-export="pdf"]').isDisabled(), true);
  await page.locator('#pr-reviewed').check();
  let pending = page.waitForEvent('download'); await page.locator('[data-export="pdf"]').click(); let download = await pending;
  assert.match(download.suggestedFilename(), /^Relatorio_Processual_Cliente_Exemplo_\d{2}-\d{2}-\d{4}\.pdf$/); await download.saveAs(path.join(qa, 'browser.pdf'));
  pending = page.waitForEvent('download'); await page.locator('[data-export="docx"]').click(); download = await pending; await download.saveAs(path.join(qa, 'browser.docx'));
  await page.locator('#pr-copy').click(); assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Olá, Cliente!/);
  await page.locator('#pr-edit').click(); await page.locator('#pr-statusAtual').fill('Status revisado pelo operador.');
  assert.equal(await page.locator('#pr-reviewed').isChecked(), false); await page.waitForFunction(() => !document.getElementById('pr-reviewed').disabled);
  await page.locator('#pr-editor').evaluate(el => { el.open = false; });
  await page.screenshot({ path: path.join(qa, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(qa, 'mobile.png'), fullPage: true });
  page.on('dialog', dialog => dialog.accept()); await page.locator('#pr-next').click();
  assert.equal(await page.locator('#pr-source-text').inputValue(), ''); assert.equal(await page.locator('#pr-pages svg').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'pr-text');

  const images = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 700;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#000'; ctx.font = '40px Arial';
    ['Cliente: Cliente Exemplo', 'Processo: 0000001-01.2026.8.26.0000', '26/11/2026 - Juntada de petição', 'Petição juntada aos autos.'].forEach((line, i) => ctx.fillText(line, 60, 100 + i * 90));
    return { png: canvas.toDataURL('image/png').split(',')[1], jpg: canvas.toDataURL('image/jpeg', .95).split(',')[1] };
  });
  await fs.writeFile(path.join(qa, 'consulta-print.png'), Buffer.from(images.png, 'base64')); await fs.writeFile(path.join(qa, 'consulta-print.jpg'), Buffer.from(images.jpg, 'base64'));
  const scanned = await PDFDocument.create(), scannedPage = scanned.addPage([600, 800]), embedded = await scanned.embedPng(Buffer.from(images.png, 'base64'));
  scannedPage.drawImage(embedded, { x: 0, y: 300, width: 600, height: 262.5 }); await fs.writeFile(path.join(qa, 'consulta-digitalizada.pdf'), await scanned.save());

  console.log('Testando OCR real de print local…');
  await page.locator('#pr-files').setInputFiles(path.join(qa, 'consulta-print.png')); await page.locator('.pr-file').waitFor(); await page.locator('#pr-generate').click();
  await page.waitForFunction(() => !document.getElementById('pr-generate').disabled, { timeout: 90000 });
  assert.match(await page.locator('#pr-status').innerText(), /Relatório gerado localmente/);
  assert.equal(await page.locator('#pr-id-cliente').inputValue(), 'Cliente Exemplo'); assert.match(await page.locator('#pr-source-text').inputValue(), /Juntada/i); assert.match(await page.locator('#pr-alerts').innerText(), /OCR/);
  await page.screenshot({ path: path.join(qa, 'ocr.png'), fullPage: true });

  console.log('Testando PDF com texto, PDF digitalizado e JPG reais, sem serviço externo…');
  const sources = await page.evaluate(async () => {
    const { extractSources } = await import('/src/process-reports/source-reader.js');
    const files = await Promise.all(['consulta-texto.pdf', 'consulta-digitalizada.pdf', 'consulta-print.jpg'].map(async name => {
      const type = name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'; const response = await fetch('/tmp/process-reports-qa/' + name); const bytes = await response.arrayBuffer();
      return { name, type, size: bytes.byteLength, file: new File([bytes], name, { type }) };
    }));
    return extractSources(files);
  });
  assert.equal(sources.length, 3); assert.equal(sources[0].method, 'pdf'); assert.equal(sources[1].method, 'ocr'); assert.equal(sources[2].method, 'ocr');
  sources.forEach(source => assert.match(source.text, /Cliente Exemplo/i));

  await page.locator('#pr-next').click();
  await page.locator('#pr-files').setInputFiles(path.join(qa, 'consulta-print.png')); await page.locator('.pr-file').waitFor(); await page.locator('#pr-generate').click(); await page.locator('#pr-next').click();
  await page.waitForTimeout(1500); assert.equal(await page.locator('#pr-source-text').inputValue(), ''); assert.equal(await page.locator('#pr-pages svg').count(), 0);
  await page.evaluate(async () => {
    const bytes = await fetch('/tmp/process-reports-qa/consulta-print.png').then(r => r.arrayBuffer()); const data = new DataTransfer(); data.items.add(new File([bytes], 'print-colado.png', { type: 'image/png' }));
    document.getElementById('pr-text').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    const drag = new DataTransfer(); drag.items.add(new File([bytes], 'print-arrastado.png', { type: 'image/png' })); document.getElementById('pr-drop').dispatchEvent(new DragEvent('drop', { dataTransfer: drag, bubbles: true, cancelable: true }));
  });
  assert.equal(await page.locator('.pr-file').count(), 2); await page.locator('[data-remove="0"]').click(); assert.equal(await page.locator('.pr-file').count(), 1);
  await page.evaluate(() => window.dispatchEvent(new Event('platino-signed-out'))); assert.equal(await page.locator('.pr-file').count(), 0);
  assert.deepEqual(external, []); assert.deepEqual(posts, []); assert.deepEqual(errors, []);
  const legacyPage = await context.newPage(); await legacyPage.goto(origin + '/legacy-qa'); await legacyPage.waitForFunction(() => typeof window.platinoExtractProcessSummary === 'function');
  await legacyPage.locator('#adm-field-resumoProcesso').fill(sourceText); await legacyPage.getByRole('button', { name: 'Separar informações' }).click();
  assert.equal(await legacyPage.locator('#adm-field-cliente').inputValue(), 'Cliente Exemplo'); assert.equal(await legacyPage.locator('#adm-field-numeroProcesso').inputValue(), '0000001-01.2026.8.26.0000');
  await legacyPage.close();
  console.log('Aprovado: texto, OCR real PNG/JPG/PDF digitalizado, PDF textual, edição, exportações, mensagem, responsividade, isolamento e nenhuma chamada de IA ou upload.');
  await context.close();
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
