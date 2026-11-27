import { IDENTIFICATION, LIMITS, createSession, fileName, saoPauloDate, shortDate, whatsappMessage } from './report-core.js';
import { createReportDocument, createWordDocument } from './report-export.js';
import { generateLocalReport, organizeReport } from './report-local.js';
import { extractSources } from './source-reader.js';

const root = document.getElementById('process-reports-root');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const session = createSession();
const state = { files: [], report: null, emissionDate: saoPauloDate(), document: null, letterhead: null, letterheadUrl: '', activePage: 0, zoom: 1, dirty: false, messageDirty: false, stale: false, busy: false, epoch: 0, previewVersion: 0, revision: 0 };
const $ = id => root.querySelector(`#pr-${id}`);
const dataUrl = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.')); reader.readAsDataURL(file); });
const status = (text, error = false) => { $('status').textContent = text; $('status').dataset.error = String(error); };

if (root) {
  root.innerHTML = `<header class="pr-header"><div><h1>PLATINO | Documentos</h1><p>Central de atualizações processuais</p></div><span class="pr-lock"><i class="ph ph-lock-key"></i> Uso interno</span></header>
    <div class="pr-layout"><form id="pr-form" class="pr-entry"><h2>Gerar relatório processual</h2>
      <label for="pr-client">Nome do cliente <small>(opcional)</small></label><input id="pr-client" maxlength="300" placeholder="Extraído do texto e dos anexos" autocomplete="off">
      <label for="pr-process">Número do processo <small>(opcional)</small></label><input id="pr-process" maxlength="80" placeholder="Extraído do texto e dos anexos" autocomplete="off">
      <label for="pr-files">Anexos do processo</label><button id="pr-drop" type="button" class="pr-drop"><i class="ph ph-cloud-arrow-up"></i><strong>Arraste ou cole os prints do processo</strong><span>Ctrl + V · PNG · JPG · PDF · Clique para selecionar</span></button>
      <input id="pr-files" class="pr-hidden" type="file" accept="image/png,image/jpeg,application/pdf" multiple><p class="pr-hint">Até 8 arquivos · 10 MB por arquivo · 30 MB no total</p><div id="pr-file-list" class="pr-files" aria-live="polite"></div>
      <label for="pr-text">Informações processuais</label><textarea id="pr-text" maxlength="60000" placeholder="Cole aqui as informações do processo (movimentações, decisões, partes etc.)."></textarea>
      <label for="pr-instructions">Observações para o relatório <small>(opcional)</small></label><textarea id="pr-instructions" maxlength="3000" placeholder="Texto revisado que deseja acrescentar ao status." style="min-height:72px"></textarea>
      <label>Nível de detalhamento</label><div class="pr-detail" role="group" aria-label="Nível de detalhamento"><button type="button" data-detail="resumido" aria-pressed="false">Resumido</button><button type="button" data-detail="completo" aria-pressed="true">Completo</button><button type="button" data-detail="detalhado" aria-pressed="false">Detalhado</button></div>
      <button id="pr-generate" type="submit" class="pr-primary"><i class="ph ph-sparkle"></i> Gerar relatório</button><p id="pr-date" class="pr-date"></p>
    </form><div><div class="pr-preview" id="pr-preview"><div class="pr-preview-header"><span><i class="ph ph-eye"></i> Pré-visualização do documento</span><button type="button" id="pr-fullscreen" class="pr-preview-full" aria-label="Ampliar pré-visualização"><i class="ph ph-corners-out"></i></button></div>
      <div id="pr-empty" class="pr-empty"><i class="ph ph-file-text"></i><h3>Seu relatório aparece aqui</h3><p>Insira as informações de um único atendimento e gere o documento. Confira os dados antes de enviar ao cliente.</p></div><div id="pr-preview-controls" class="pr-preview-controls pr-hidden"><button type="button" id="pr-page-prev" aria-label="Página anterior">‹</button><span id="pr-page-count"></span><button type="button" id="pr-page-next" aria-label="Próxima página">›</button><button type="button" id="pr-zoom-out" aria-label="Diminuir zoom">−</button><span id="pr-zoom-label">100%</span><button type="button" id="pr-zoom-in" aria-label="Aumentar zoom">+</button></div><div id="pr-pages" class="pr-page-scroll pr-hidden" aria-label="Prévia A4 do relatório"></div></div>
      <div id="pr-status" class="pr-status" role="status" aria-live="polite">Pronto para um novo atendimento.</div><div id="pr-alerts" class="pr-alerts pr-hidden"></div>
      <div class="pr-actions"><button type="button" data-export="pdf" disabled><i class="ph ph-file-pdf" style="color:#e53b43"></i>Baixar PDF</button><button type="button" data-export="docx" disabled><i class="ph ph-file-doc" style="color:#1859ef"></i>Baixar Word</button><button type="button" data-export="both" disabled>Baixar ambos</button><button type="button" id="pr-copy" disabled><i class="ph ph-whatsapp" style="color:#159f50"></i>Copiar mensagem</button><button type="button" data-export="pdf-copy" disabled>Baixar PDF e copiar mensagem</button><button type="button" id="pr-edit" disabled><i class="ph ph-pencil-simple"></i>Editar relatório</button></div>
      <label class="pr-review"><input id="pr-reviewed" type="checkbox" disabled><span>Revisão opcional: conferi os dados e as fontes deste relatório.</span></label>
      <div class="pr-tools" role="group" aria-label="Revisar relatório"><button type="button" data-command="regenerar" disabled>Regenerar</button><button type="button" data-command="resumir" disabled>Resumir</button><button type="button" data-command="detalhar" disabled>Detalhar</button><button type="button" data-command="organizar" disabled>Organizar espaçamentos</button></div>
      <details id="pr-editor" class="pr-editor pr-hidden"><summary>Editar conteúdo do relatório</summary><div id="pr-editor-fields"></div></details>
      <details id="pr-sources" class="pr-editor pr-hidden"><summary>Conferir texto extraído das fontes</summary><textarea id="pr-source-text" readonly aria-label="Texto extraído das fontes" style="min-height:220px"></textarea></details>
      <div id="pr-message" class="pr-message pr-hidden"><label for="pr-whatsapp">Mensagem para WhatsApp</label><textarea id="pr-whatsapp" maxlength="6000"></textarea></div>
      <button id="pr-next" type="button" class="pr-primary pr-next">Próximo cliente <i class="ph ph-arrow-right"></i></button>
    </div></div>
    <details class="pr-settings"><summary>Papel timbrado institucional</summary><p id="pr-letterhead-status">Carregando papel timbrado oficial…</p><label for="pr-letterhead">Importar PNG original</label><input id="pr-letterhead" type="file" accept="image/png"><p>O original permanece no projeto. Uma importação manual é mantida neste navegador para os próximos atendimentos. Use o PNG oficial e confira o cabeçalho e o rodapé na prévia.</p><button id="pr-restore" type="button">Restaurar papel timbrado do projeto</button></details>`;

  let detail = 'completo';
  try { detail = localStorage.getItem('platinoProcessReportDetail') || detail; } catch { /* Preferences are optional. */ }
  if (!['completo', 'resumido', 'detalhado'].includes(detail)) detail = 'completo';
  function setDetail(value) { detail = value; root.querySelectorAll('[data-detail]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.detail === detail))); try { localStorage.setItem('platinoProcessReportDetail', detail); } catch { /* No customer data. */ } }
  setDetail(detail);
  function markDirty(source = false) { state.dirty = true; state.revision++; $('reviewed').checked = false; if (source && state.report) { state.stale = true; status('As fontes foram alteradas. Gere novamente antes de exportar.'); } updateButtons(); }
  function updateButtons() {
    const ready = Boolean(state.document && !state.busy && !state.stale);
    root.querySelectorAll('[data-export]').forEach(button => { button.disabled = !ready; });
    root.querySelectorAll('[data-command]').forEach(button => { button.disabled = !state.report || state.busy; });
    $('generate').disabled = state.busy;
    $('generate').innerHTML = state.busy ? 'Processando informações…' : '<i class="ph ph-sparkle"></i> Gerar relatório';
    $('edit').disabled = !state.report || state.busy; $('copy').disabled = !state.report || state.busy;
    $('reviewed').disabled = !state.document || state.stale || state.busy;
    root.querySelectorAll('#pr-editor input,#pr-editor textarea,#pr-editor button').forEach(el => { el.disabled = state.busy; });
    $('form').setAttribute('aria-busy', String(state.busy));
  }
  function renderFiles() {
    state.extracted = null;
    $('file-list').innerHTML = state.files.map((item, index) => `<div class="pr-file">${item.url ? `<img src="${esc(item.url)}" alt="Miniatura do anexo">` : '<i class="ph ph-file-pdf" style="font-size:28px"></i>'}<span>${esc(item.name)}<small>${Math.ceil(item.size / 1024)} KB</small></span><button type="button" data-remove="${index}" aria-label="Remover ${esc(item.name)}">×</button></div>`).join('');
  }
  async function addFiles(files) {
    const epoch = state.epoch;
    const incoming = [...files];
    if (state.files.length + incoming.length > LIMITS.files) return status('Envie até 8 arquivos.', true);
    const total = state.files.reduce((sum, file) => sum + file.size, 0) + incoming.reduce((sum, file) => sum + file.size, 0);
    if (total > LIMITS.totalBytes || incoming.some(file => file.size > LIMITS.fileBytes || !file.size)) return status('Limite: 10 MB por arquivo e 30 MB no total.', true);
    if (incoming.some(file => !['image/png', 'image/jpeg', 'application/pdf'].includes(file.type))) return status('Use arquivos PNG, JPG ou PDF.', true);
    try {
      const additions = incoming.map(file => ({ name: file.name.slice(0, 200), type: file.type, size: file.size, file }));
      if (epoch !== state.epoch) return;
      if (state.files.length + additions.length > LIMITS.files || state.files.reduce((sum, item) => sum + item.size, 0) + additions.reduce((sum, item) => sum + item.size, 0) > LIMITS.totalBytes) return status('Limite de anexos atingido.', true);
      state.files.push(...additions.map(item => ({ ...item, url: item.type.startsWith('image/') ? URL.createObjectURL(item.file) : '' })));
      markDirty(true); renderFiles();
    } catch (error) { if (epoch === state.epoch) status(error.message, true); }
  }
  async function preview() {
    const version = ++state.previewVersion; state.document = null; updateButtons();
    if (!state.report || !state.letterhead) return;
    try {
      const document = await createReportDocument(state.report, state.emissionDate, state.letterhead, { detail });
      if (version !== state.previewVersion) return;
      state.document = document;
      state.activePage = Math.min(state.activePage, document.pages.length - 1);
      renderPreview();
      updateButtons();
    } catch (error) { if (version === state.previewVersion) status(error.message, true); }
  }
  function renderPreview() {
    if (!state.document) return;
    const { pages, background } = state.document;
    const lines = pages[state.activePage];
    $('pages').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595.28 841.89" style="width:${state.zoom * 100}%;height:auto;display:block" role="img" aria-label="Página ${state.activePage + 1} do relatório"><rect width="595.28" height="841.89" fill="white"/><image href="${esc(state.letterheadUrl)}" x="${background.x}" y="${841.89 - background.y - background.height}" width="${background.width}" height="${background.height}"/>${lines.map(line => `<text x="${line.x}" y="${841.89 - line.y}" font-family="Helvetica, Arial, sans-serif" font-size="${line.size}" font-weight="${line.bold ? 700 : 400}" fill="${line.kind === 'heading' ? '#0a194f' : '#000'}" xml:space="preserve">${esc(line.text)}</text>`).join('')}<text x="297.64" y="731.89" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" fill="#4d4d4d">${state.activePage + 1} / ${pages.length}</text></svg>`;
    $('empty').classList.add('pr-hidden'); $('pages').classList.remove('pr-hidden'); $('preview-controls').classList.remove('pr-hidden');
    $('page-count').textContent = `${state.activePage + 1} de ${pages.length}`;
    $('page-prev').disabled = state.activePage === 0; $('page-next').disabled = state.activePage === pages.length - 1;
    $('zoom-label').textContent = `${Math.round(state.zoom * 100)}%`;
  }
  function renderAlerts() {
    const alerts = state.report?.alertas || [];
    $('alerts').classList.toggle('pr-hidden', !alerts.length);
    $('alerts').innerHTML = `<strong>Observações (não impedem o download)</strong><ul>${alerts.map(text => `<li>${esc(text)}</li>`).join('')}</ul>`;
  }
  function renderEditor() {
    const report = state.report;
    $('editor').classList.remove('pr-hidden'); $('message').classList.remove('pr-hidden');
    const field = (id, label, value, textarea = false) => `<label for="pr-${id}">${label}</label>${textarea ? `<textarea id="pr-${id}" data-field="${id}" maxlength="6000">${esc(value)}</textarea>` : `<input id="pr-${id}" data-field="${id}" value="${esc(value)}" maxlength="1500">`}`;
    $('editor-fields').innerHTML = `<div class="pr-editor-grid">${Object.entries(IDENTIFICATION).map(([key, label]) => `<div>${field(`id-${key}`, label, report.identificacao[key])}</div>`).join('')}</div><h3 style="margin-top:20px;font-weight:700">Linha do tempo (opcional)</h3>${report.linhaTempo.map((item, index) => `<div class="pr-event">${field(`event-${index}-data`, 'Data (AAAA-MM-DD ou vazio)', item.data)}${field(`event-${index}-evento`, 'Evento', item.evento)}${field(`event-${index}-resumo`, 'Síntese', item.resumo, true)}${field(`event-${index}-fonte`, 'Fonte', item.fonte)}<button type="button" data-event-remove="${index}">Remover movimentação</button></div>`).join('')}<button type="button" id="pr-event-add" style="margin-top:10px">+ Adicionar movimentação</button>${field('statusAtual', 'Status atual (opcional)', report.statusAtual, true)}${field('proximasEtapas', 'Próximas etapas (uma por linha; deixe vazio para omitir)', report.proximasEtapas.join('\n'), true)}`;
  }
  let previewTimer;
  function schedulePreview() { clearTimeout(previewTimer); state.previewVersion++; state.document = null; updateButtons(); previewTimer = setTimeout(preview, 300); }
  $('editor-fields').addEventListener('input', event => {
    const key = event.target.dataset.field; if (!key || !state.report) return;
    const value = event.target.value;
    if (key.startsWith('id-')) state.report.identificacao[key.slice(3)] = value;
    else if (key.startsWith('event-')) { const [, index, property] = key.split('-'); state.report.linhaTempo[index][property] = value; }
    else state.report[key] = key === 'proximasEtapas' ? value.split('\n').map(text => text.trim()).filter(Boolean) : value;
    if (key === 'id-numeroProcesso') state.report.processosIdentificados = value ? [value] : [];
    markDirty(); schedulePreview();
  });
  async function generate(action = 'gerar') {
    if (state.busy) return;
    if (state.report && ['resumir', 'detalhar', 'organizar'].includes(action)) {
      if (action === 'organizar') { state.report = organizeReport(state.report); renderEditor(); }
      else setDetail(action === 'resumir' ? 'resumido' : 'detalhado');
      markDirty(); await preview(); return;
    }
    if (!window.platinoFirebaseContext?.auth?.currentUser) return status('Faça login no sistema para gerar o relatório.', true);
    if (!$('text').value.trim() && !state.files.length) return status('Cole as informações ou anexe os arquivos do processo.', true);
    if (state.report && (state.dirty || state.messageDirty) && !window.confirm('Gerar novamente substitui o relatório e a mensagem editados. Deseja continuar?')) return;
    const request = session.begin(), epoch = state.epoch, revision = state.revision;
    const input = { text: $('text').value, client: $('client').value, process: $('process').value, instructions: $('instructions').value };
    state.busy = true; $('reviewed').checked = false; updateButtons(); status('Organizando as informações neste navegador…');
    try {
      const extracted = state.extracted || await extractSources(state.files.slice(), { signal: request.signal, onProgress: text => { if (session.current(request.version)) status(text); } });
      if (!session.current(request.version) || epoch !== state.epoch) return;
      if (revision !== state.revision) { status('As informações mudaram durante a leitura. Gere novamente para usar as fontes atuais.', true); return; }
      const sources = [...(input.text.trim() ? [{ name: 'Texto colado', text: input.text, method: 'text' }] : []), ...extracted];
      state.report = generateLocalReport({ ...input, sources }); state.extracted = extracted;
      state.emissionDate = saoPauloDate(); state.stale = false; state.dirty = true; state.revision++;
      $('whatsapp').value = whatsappMessage(state.report); state.messageDirty = false;
      $('date').textContent = 'Emissão: ' + shortDate(state.emissionDate) + ' · America/Sao_Paulo';
      $('source-text').value = sources.map(source => source.name + '\n' + source.text).join('\n\n'); $('sources').classList.remove('pr-hidden');
      renderEditor(); renderAlerts(); await preview();
      if (session.current(request.version)) status(state.document ? 'Relatório gerado localmente. Você já pode baixar em PDF ou Word. A revisão é opcional.' : 'O relatório foi organizado; confira o erro de pré-visualização.', !state.document);
    } catch (error) { if (session.current(request.version) && error.name !== 'AbortError') status(error.message, true); }
    finally { if (session.current(request.version)) { state.busy = false; updateButtons(); } }
  }
  function reset(force = false) {
    if (!force && (state.dirty || state.messageDirty) && !window.confirm('Há conteúdo ainda não exportado ou mensagem editada não copiada. Limpar este atendimento e passar ao próximo cliente?')) return;
    state.epoch++; session.clear(); state.previewVersion++; clearTimeout(previewTimer);
    state.files.forEach(file => { if (file.url) URL.revokeObjectURL(file.url); });
    Object.assign(state, { files: [], report: null, document: null, activePage: 0, zoom: 1, dirty: false, messageDirty: false, stale: false, busy: false, revision: 0, emissionDate: saoPauloDate() });
    ['client', 'process', 'instructions', 'text', 'files', 'whatsapp', 'source-text'].forEach(id => { $(id).value = ''; });
    $('reviewed').checked = false; $('editor').open = false; $('editor-fields').innerHTML = '';
    $('pages').innerHTML = ''; $('pages').classList.add('pr-hidden'); $('preview-controls').classList.add('pr-hidden'); $('empty').classList.remove('pr-hidden');
    $('sources').classList.add('pr-hidden'); $('editor').classList.add('pr-hidden'); $('message').classList.add('pr-hidden'); $('alerts').classList.add('pr-hidden');
    $('date').textContent = `Emissão automática · America/Sao_Paulo`; renderFiles(); updateButtons(); status('Pronto para o próximo cliente.'); $('text').focus();
  }
  async function copyMessage() { const epoch = state.epoch; await navigator.clipboard.writeText($('whatsapp').value); if (epoch === state.epoch) { state.messageDirty = false; status('Mensagem copiada.'); } }
  function download(bytes, filename, type) { const url = URL.createObjectURL(new Blob([bytes], { type })); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
  async function exportReport(mode) {
    if (!state.document || state.busy || state.stale) return;
    const epoch = state.epoch, revision = state.revision;
    try {
      if (mode === 'pdf-copy') await copyMessage();
      if (epoch !== state.epoch || revision !== state.revision) return;
      if (['pdf', 'both', 'pdf-copy'].includes(mode)) download(state.document.pdf, fileName(state.report, state.emissionDate, 'pdf'), 'application/pdf');
      if (['docx', 'both'].includes(mode)) download(createWordDocument(state.document), fileName(state.report, state.emissionDate, 'docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      state.dirty = false; status(mode === 'pdf-copy' ? 'PDF baixado e mensagem copiada.' : 'Download preparado.');
    } catch { status('Não foi possível concluir a exportação ou copiar a mensagem. Confira as permissões do navegador.', true); }
  }
  async function loadLetterhead(restore = false) {
    const version = (state.letterheadVersion || 0) + 1; state.letterheadVersion = version;
    try {
      let saved; try { saved = !restore && localStorage.getItem('platinoProcessReportLetterhead'); } catch { /* Optional. */ }
      const response = await fetch(saved || './assets/process-reports/papel-timbrado.png');
      if (!response.ok) throw new Error();
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (version !== state.letterheadVersion) return;
      if (state.letterheadUrl) URL.revokeObjectURL(state.letterheadUrl);
      state.letterhead = bytes; state.letterheadUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      $('letterhead-status').textContent = saved ? 'PNG institucional importado neste navegador.' : 'Papel timbrado oficial incorporado ao projeto.';
      if (state.report) schedulePreview();
    } catch { if (version === state.letterheadVersion) $('letterhead-status').textContent = 'Não foi possível carregar o original. Importe o PNG oficial abaixo.'; }
  }
  $('letterhead').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.type !== 'image/png' || file.size > 2_000_000) throw new Error('Use o PNG original com até 2 MB.');
      const image = await createImageBitmap(file); const ratio = image.width / image.height; image.close();
      if (ratio < .65 || ratio > .82) throw new Error('O PNG deve conter uma página vertical completa do papel timbrado.');
      const url = await dataUrl(file);
      try { localStorage.setItem('platinoProcessReportLetterhead', url); } catch { throw new Error('Não foi possível manter o papel timbrado neste navegador. Libere armazenamento e tente novamente.'); }
      $('reviewed').checked = false; await loadLetterhead();
    } catch (error) { status(error.message, true); }
    event.target.value = '';
  });
  $('restore').addEventListener('click', () => { try { localStorage.removeItem('platinoProcessReportLetterhead'); } catch { /* Optional. */ } $('reviewed').checked = false; loadLetterhead(true); });
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.detail) { setDetail(button.dataset.detail); if (state.report) { markDirty(); schedulePreview(); } }
    if (button.dataset.remove !== undefined) { const [file] = state.files.splice(Number(button.dataset.remove), 1); if (file?.url) URL.revokeObjectURL(file.url); markDirty(true); renderFiles(); }
    if (button.dataset.command) generate(button.dataset.command);
    if (button.dataset.export) exportReport(button.dataset.export);
    if (button.dataset.eventRemove !== undefined) { state.report.linhaTempo.splice(Number(button.dataset.eventRemove), 1); markDirty(); renderEditor(); schedulePreview(); }
    if (button.id === 'pr-event-add') { if (state.report.linhaTempo.length >= 150) return status('Limite de 150 movimentações.', true); state.report.linhaTempo.push({ data: '', evento: '', resumo: '', fonte: '' }); markDirty(); renderEditor(); schedulePreview(); }
  });
  $('form').addEventListener('submit', event => { event.preventDefault(); generate(); });
  ['client', 'process', 'text', 'instructions'].forEach(id => $(id).addEventListener('input', () => markDirty(true)));
  $('whatsapp').addEventListener('input', () => { state.messageDirty = true; state.revision++; }); $('reviewed').addEventListener('change', updateButtons);
  $('drop').addEventListener('click', () => $('files').click());
  $('files').addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
  ['dragenter', 'dragover'].forEach(type => $('drop').addEventListener(type, event => { event.preventDefault(); $('drop').classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(type => $('drop').addEventListener(type, event => { event.preventDefault(); $('drop').classList.remove('is-over'); }));
  $('drop').addEventListener('drop', event => addFiles(event.dataTransfer.files));
  root.addEventListener('paste', event => { if (event.clipboardData?.files.length) { event.preventDefault(); addFiles(event.clipboardData.files); } });
  $('next').addEventListener('click', () => reset());
  $('copy').addEventListener('click', () => copyMessage().catch(() => status('Selecione e copie a mensagem manualmente; o navegador bloqueou a cópia.', true)));
  $('edit').addEventListener('click', () => { $('editor').open = true; $('editor').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); });
  $('fullscreen').addEventListener('click', () => $('preview').requestFullscreen?.().catch(() => status('Ampliação indisponível neste navegador.', true)));
  $('page-prev').addEventListener('click', () => { state.activePage = Math.max(0, state.activePage - 1); renderPreview(); });
  $('page-next').addEventListener('click', () => { state.activePage = Math.min(state.document.pages.length - 1, state.activePage + 1); renderPreview(); });
  $('zoom-out').addEventListener('click', () => { state.zoom = Math.max(.5, state.zoom - .1); renderPreview(); });
  $('zoom-in').addEventListener('click', () => { state.zoom = Math.min(2, state.zoom + .1); renderPreview(); });
  window.addEventListener('platino-signed-out', () => reset(true));
  window.addEventListener('beforeunload', event => { if (state.dirty || state.messageDirty) { event.preventDefault(); event.returnValue = ''; } });
  $('date').textContent = 'Emissão automática · America/Sao_Paulo'; loadLetterhead(); updateButtons();
}
