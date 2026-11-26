import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { IDENTIFICATION } from '../src/process-reports/report-core.js';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const fixture = () => ({ identificacao: { ...Object.fromEntries(Object.keys(IDENTIFICATION).map(key => [key, ''])), cliente: 'Cliente Exemplo', numeroProcesso: '0000001-01.2026.8.26.0000' }, processosIdentificados: ['0000001-01.2026.8.26.0000'], linhaTempo: [{ data: '2026-10-01', evento: 'Distribuição', resumo: 'Processo distribuído.', fonte: 'Texto colado' }], statusAtual: 'Processo distribuído conforme fonte fornecida.', proximasEtapas: [], alertas: ['Confira a fonte antes de enviar.'] });
let calls = [], slow = false;
const server = createServer(async (req, res) => {
  if (req.url === '/qa') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(`<!DOCTYPE html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;background:#eaf0f8;padding:24px}button,input,textarea{font:inherit}button{cursor:pointer}button{border:0}h1,h2,p{margin:0}.hidden{display:none}</style><link rel="stylesheet" href="/src/process-reports/process-reports.css"><script type="importmap">{"imports":{"pdf-lib":"/assets/vendor/pdf-lib.esm.min.js"}}</script></head><body><section id="section-relatorios-processuais"><div id="process-reports-root"></div></section><script>window.platinoFirebaseContext={auth:{currentUser:{getIdToken:async()=>"test-token"}}};</script><script type="module" src="/src/process-reports/process-reports.js"></script></body></html>`); }
  if (req.url === '/api/process-reports') {
    let body = ''; for await (const part of req) body += part;
    calls.push({ ...JSON.parse(body), authorization: req.headers.authorization });
    if (slow) await new Promise(resolve => setTimeout(resolve, 900));
    res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ report: fixture(), emissionDate: '2026-11-26' }));
  }
  const filename = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  try { const bytes = await fs.readFile(filename); res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'image/png'); res.end(bytes); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PROCESS_REPORT_BROWSER_CHANNEL ? { channel: process.env.PROCESS_REPORT_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1487, height: 1060 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/qa'); await page.locator('#pr-letterhead-status').filter({ hasText: 'incorporado' }).waitFor({ state: 'attached' });
  await page.locator('#pr-generate').click(); assert.match(await page.locator('#pr-status').innerText(), /Cole/);
  await page.locator('#pr-text').fill('Processo fictício para o teste de interface.');
  await page.locator('#pr-files').setInputFiles(path.join(root, 'assets/process-reports/papel-timbrado.png'));
  await page.locator('.pr-file').waitFor();
  await page.locator('#pr-generate').click(); await page.locator('#pr-status').filter({ hasText: 'Relatório gerado.' }).waitFor();
  assert.equal(calls[0].files.length, 1); assert.equal(calls[0].authorization, 'Bearer test-token');
  assert.equal(await page.locator('[data-export="pdf"]').isDisabled(), true);
  assert.equal(await page.locator('#pr-id-cliente').inputValue(), 'Cliente Exemplo');
  assert.match(await page.locator('#pr-alerts').innerText(), /Confira a fonte/);
  await page.locator('#pr-reviewed').check();
  let pending = page.waitForEvent('download'); await page.locator('[data-export="pdf"]').click(); let download = await pending;
  assert.equal(download.suggestedFilename(), 'Relatorio_Processual_Cliente_Exemplo_26-11-2026.pdf');
  await fs.mkdir(path.join(root, 'tmp/process-reports-qa'), { recursive: true }); await download.saveAs(path.join(root, 'tmp/process-reports-qa/browser.pdf'));
  pending = page.waitForEvent('download'); await page.locator('[data-export="docx"]').click(); download = await pending;
  assert.match(download.suggestedFilename(), /\.docx$/); await download.saveAs(path.join(root, 'tmp/process-reports-qa/browser.docx'));
  await page.locator('#pr-copy').click(); assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Olá, Cliente!/);
  await page.locator('#pr-edit').click(); await page.locator('#pr-statusAtual').fill('Status revisado pelo operador.');
  assert.equal(await page.locator('#pr-reviewed').isChecked(), false);
  await page.waitForFunction(() => !document.getElementById('pr-reviewed').disabled);
  await page.locator('#pr-editor').evaluate(el => { el.open = false; });
  await page.screenshot({ path: path.join(root, 'tmp/process-reports-qa/desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(root, 'tmp/process-reports-qa/mobile.png'), fullPage: true });
  page.on('dialog', dialog => dialog.accept()); await page.locator('#pr-next').click();
  assert.equal(await page.locator('#pr-text').inputValue(), ''); assert.equal(await page.locator('.pr-file').count(), 0); assert.equal(await page.locator('#pr-whatsapp').inputValue(), '');
  assert.equal(await page.locator('#pr-pages svg').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'pr-text');
  // A response from the preceding client must not repopulate the cleared form.
  slow = true; await page.locator('#pr-text').fill('Outro atendimento fictício.'); await page.locator('#pr-generate').click();
  await page.waitForFunction(() => document.getElementById('pr-generate').disabled);
  await page.locator('#pr-next').click(); await page.waitForTimeout(1200);
  assert.equal(await page.locator('#pr-whatsapp').inputValue(), ''); assert.equal(await page.locator('#pr-pages svg').count(), 0);
  // Pasted screenshots and drag/drop use the same bounded attachment pipeline.
  await page.evaluate(async () => {
    const bytes = await fetch('/assets/process-reports/papel-timbrado.png').then(r => r.arrayBuffer());
    const data = new DataTransfer(); data.items.add(new File([bytes], 'print-colado.png', { type: 'image/png' }));
    document.getElementById('pr-text').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.locator('.pr-file').waitFor(); assert.match(await page.locator('.pr-file').innerText(), /print-colado/);
  await page.evaluate(async () => {
    const bytes = await fetch('/assets/process-reports/papel-timbrado.png').then(r => r.arrayBuffer());
    const data = new DataTransfer(); data.items.add(new File([bytes], 'print-arrastado.png', { type: 'image/png' }));
    document.getElementById('pr-drop').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('.pr-file').length === 2);
  await page.locator('[data-remove="0"]').click(); assert.equal(await page.locator('.pr-file').count(), 1);
  await page.evaluate(() => window.dispatchEvent(new Event('platino-signed-out')));
  assert.equal(await page.locator('.pr-file').count(), 0);
  assert.deepEqual(errors, []);
  console.log('Interface: texto, upload, colagem, arraste, edição, PDF/DOCX, mensagem, revisão, responsividade e isolamento aprovados.');
  await context.close();
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
