import { LIMITS, fail } from './report-core.js';
const asset = path => new URL(`../../assets/vendor/process-reports/${path}`, import.meta.url).href;
const abortError = () => new DOMException('Leitura cancelada.', 'AbortError');
function check(signal) { if (signal?.aborted) throw abortError(); }
function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError()); signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export async function extractSources(files, { signal, onProgress = () => {} } = {}) {
  if (!Array.isArray(files) || files.length > LIMITS.files) fail('Envie até 8 arquivos.');
  if (files.some(file => file.size > LIMITS.fileBytes) || files.reduce((n, file) => n + file.size, 0) > LIMITS.totalBytes) fail('Limite: 10 MB por arquivo e 30 MB no total.');
  let worker, workerPromise, pdfModule, pageCount = 0, totalText = 0, currentName = '';
  const sources = [];
  const stop = () => { if (worker) { const active = worker; worker = null; active.terminate(); } };
  signal?.addEventListener('abort', stop, { once: true });
  async function recognize(blob, name) {
    check(signal);
    currentName = name;
    if (!workerPromise) workerPromise = (async () => {
      const { default: { createWorker } } = await import('../../assets/vendor/process-reports/ocr/tesseract.esm.min.js');
      const value = await createWorker('por', 1, { workerPath: asset('ocr/worker.min.js'), corePath: asset('ocr/tesseract-core-lstm.js'), langPath: asset('ocr'), gzip: true, workerBlobURL: false, cacheMethod: 'none', logger: event => { if (!signal?.aborted) onProgress(`Lendo ${currentName} no navegador… ${Math.round((event.progress || 0) * 100)}%`); } });
      if (signal?.aborted) { await value.terminate(); throw abortError(); }
      worker = value; return value;
    })();
    const active = await abortable(workerPromise, signal);
    const result = await abortable(active.recognize(blob), signal);
    check(signal); return { name, text: result.data.text.trim(), method: 'ocr', confidence: result.data.confidence };
  }
  function add(source) {
    totalText += source.text.length;
    if (totalText > LIMITS.text) fail('O texto dos anexos excede 60 mil caracteres. Selecione as páginas relevantes.');
    sources.push(source);
  }
  try {
    for (const item of files) {
      check(signal); onProgress(`Lendo ${item.name} localmente…`);
      const blob = item.file;
      if (!(blob instanceof Blob)) fail('Anexo indisponível. Selecione o arquivo novamente.');
      const bytes = new Uint8Array(await abortable(blob.arrayBuffer(), signal));
      const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
      const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const pdf = new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
      if (!((item.type === 'image/png' && png) || (item.type === 'image/jpeg' && jpg) || (item.type === 'application/pdf' && pdf))) fail('O conteúdo do arquivo não corresponde a PNG, JPG ou PDF.');
      if (!pdf) {
        const image = await createImageBitmap(blob); const pixels = image.width * image.height; image.close();
        if (pixels > 24_000_000) fail('A imagem excede 24 megapixels. Reduza a resolução.');
        add(await recognize(blob, item.name)); continue;
      }
      pdfModule ||= await import('../../assets/vendor/process-reports/pdf/pdf.min.mjs');
      pdfModule.GlobalWorkerOptions.workerSrc = asset('pdf/pdf.worker.min.mjs');
      const task = pdfModule.getDocument({ data: bytes, standardFontDataUrl: asset('pdf/standard_fonts/'), wasmUrl: asset('pdf/wasm/'), isEvalSupported: false, useSystemFonts: true });
      const cancel = () => task.destroy(); signal?.addEventListener('abort', cancel, { once: true });
      try {
        const document = await abortable(task.promise, signal);
        if (document.numPages > 30 || (pageCount += document.numPages) > 60) fail('Envie PDFs com até 30 páginas e até 60 páginas no atendimento.');
        for (let n = 1; n <= document.numPages; n++) {
          check(signal); const page = await document.getPage(n), name = `${item.name} — página ${n}`;
          onProgress(`Lendo ${name} no navegador…`);
          const content = await page.getTextContent(); let text = '', previousY;
          for (const part of content.items) if ('str' in part) {
            const y = part.transform?.[5];
            if (text && previousY !== undefined && Math.abs(y - previousY) > 3 && !text.endsWith('\n')) text += '\n';
            text += part.str + (part.hasEOL ? '\n' : ' '); previousY = y;
          }
          text = text.trim();
          if (text.replace(/\s/g, '').length >= 120) { add({ name, text, method: 'pdf' }); continue; }
          const base = page.getViewport({ scale: 1 }); const viewport = page.getViewport({ scale: Math.min(2, Math.sqrt(8_000_000 / (base.width * base.height))) });
          const canvas = window.document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          const render = page.render({ canvasContext: canvas.getContext('2d'), viewport });
          const cancelRender = () => render.cancel(); signal?.addEventListener('abort', cancelRender, { once: true });
          try {
            await abortable(render.promise, signal);
            const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!image) fail('Não foi possível ler a página do PDF.');
            const source = await recognize(image, name);
            if (source.text || !text) add(source); else add({ name, text, method: 'pdf' });
          } finally { signal?.removeEventListener('abort', cancelRender); canvas.width = 0; canvas.height = 0; }
        }
      } finally { signal?.removeEventListener('abort', cancel); await task.destroy(); }
    }
    check(signal); return sources;
  } finally { signal?.removeEventListener('abort', stop); stop(); }
}
