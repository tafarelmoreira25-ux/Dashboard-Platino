// Shared by the local generator, editor and exporters. No customer data is persisted here.
export const LIMITS = Object.freeze({ files: 8, fileBytes: 10_000_000, totalBytes: 30_000_000, text: 60_000 });
export const IDENTIFICATION = Object.freeze({
  numeroProcesso: 'Número do processo', cliente: 'Interessado(a) / Autor(a)',
  orgaoJulgador: 'Órgão julgador', magistrado: 'Magistrado', classe: 'Classe processual',
  assunto: 'Assunto', dataAutuacao: 'Data de autuação', valorCausa: 'Valor da causa',
  situacao: 'Situação', autor: 'Parte autora', reu: 'Parte ré', advogados: 'Advogados',
  perito: 'Perito', justicaGratuita: 'Justiça gratuita'
});
const string = { type: 'string', maxLength: 6000 };
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const array = (items, maxItems) => ({ type: 'array', items, maxItems });
export const REPORT_SCHEMA = object({
  identificacao: object(Object.fromEntries(Object.keys(IDENTIFICATION).map(key => [key, { type: 'string', maxLength: 1500 }]))),
  processosIdentificados: array({ type: 'string', maxLength: 80 }, 20),
  linhaTempo: array(object({ data: { type: 'string', pattern: '^$|^\\d{4}-\\d{2}-\\d{2}$' }, evento: string, resumo: string, fonte: { type: 'string', maxLength: 500 } }), 150),
  statusAtual: string, proximasEtapas: array(string, 20), alertas: array(string, 30)
});
export function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
export function validateSchema(value, schema = REPORT_SCHEMA, at = 'relatório') {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${at}: objeto inválido.`);
    if (Object.keys(value).some(key => !Object.hasOwn(schema.properties, key))) fail(`${at}: campo desconhecido.`);
    for (const key of schema.required) {
      if (!Object.hasOwn(value, key)) fail(`${at}: campo ${key} ausente.`);
      validateSchema(value[key], schema.properties[key], `${at}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > schema.maxItems) fail(`${at}: lista inválida.`);
    value.forEach(item => validateSchema(item, schema.items, at));
  } else if (typeof value !== 'string' || value.length > (schema.maxLength || 6000) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)
    || (schema.pattern && !new RegExp(schema.pattern).test(value))) fail(`${at}: texto inválido.`);
  return value;
}
export const normalizeProcess = value => String(value || '').replace(/\D/g, '');
export function normalizeReport(value) {
  const report = structuredClone(validateSchema(value));
  for (const key of Object.keys(IDENTIFICATION)) report.identificacao[key] = report.identificacao[key].trim();
  const numbers = new Set([report.identificacao.numeroProcesso, ...report.processosIdentificados].map(normalizeProcess).filter(Boolean));
  if (numbers.size > 1) fail('Foram identificados processos diferentes. Separe os anexos por atendimento.', 409);
  report.linhaTempo.forEach(item => {
    const date = item.data ? new Date(`${item.data}T12:00:00Z`) : null;
    if (date && (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== item.data)) fail('A linha do tempo contém uma data inválida.');
  });
  report.linhaTempo = [...new Map(report.linhaTempo.map(item => [JSON.stringify([item.data, item.evento, item.resumo]), item])).values()]
    .sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999'));
  if (!report.identificacao.cliente.trim()) report.alertas.unshift('Cliente não identificado: confira a titularidade das fontes antes de enviar.');
  if (!report.identificacao.numeroProcesso.trim()) report.alertas.unshift('Número do processo não identificado.');
  report.alertas = [...new Set(report.alertas.filter(Boolean))].slice(0, 30);
  return report;
}
export function saoPauloDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = name => parts.find(p => p.type === name).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function longDate(date) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long' }).format(new Date(`${date}T12:00:00Z`)); }
export const shortDate = date => date ? date.split('-').reverse().join('/') : '';
export function fileName(report, date, ext) {
  const name = (report.identificacao.cliente || 'Cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 100);
  return `Relatorio_Processual_${name}_${date.split('-').reverse().join('-')}.${ext}`;
}
export function whatsappMessage(report) {
  const first = report.identificacao.cliente.trim().split(/\s+/)[0];
  return `${first ? `Olá, ${first}!` : 'Olá!'} Tudo bem?\n\nSegue o relatório atualizado referente ao acompanhamento do seu processo judicial, contendo as informações sobre as últimas movimentações e a situação atual.\n\nContinuamos acompanhando o andamento processual e permanecemos à disposição para esclarecimentos.\n\nAtenciosamente,\nEquipe Platino Soluções Financeiras.`;
}
export function reportBlocks(report, date, { detail = 'completo' } = {}) {
  const blocks = [];
  const add = (text, kind = 'text') => { if (text?.trim()) blocks.push({ text: text.trim(), kind }); };
  add('RELATÓRIO DE ACOMPANHAMENTO PROCESSUAL', 'title');
  add(`São Paulo, ${longDate(date)}.`, 'date');
  add(`Assunto: Relatório de Acompanhamento Processual${report.identificacao.numeroProcesso ? ` — Processo nº ${report.identificacao.numeroProcesso}` : ''}`);
  if (report.identificacao.cliente) add(`Interessado(a) / Autor(a): ${report.identificacao.cliente}`);
  add(report.identificacao.cliente ? `Prezado(a) Sr.(a) ${report.identificacao.cliente},` : 'Prezado(a),');
  add('Apresentamos a seguir a análise geral, a síntese do andamento e as orientações de acompanhamento referentes ao processo judicial em epígrafe, considerando as informações processuais disponibilizadas.');
  const fields = Object.entries(IDENTIFICATION).filter(([key]) => report.identificacao[key].trim());
  if (fields.length) { add('1. Identificação do Processo e Partes', 'heading'); fields.forEach(([key, label]) => add(`${label}: ${report.identificacao[key]}`)); }
  if (report.linhaTempo.length) {
    add(report.linhaTempo.some(item => item.data) ? '2. Linha do Tempo do Andamento' : '2. Informações Processuais', 'heading');
    const events = detail === 'resumido' ? [...report.linhaTempo.filter(item => item.data).slice(-5), ...report.linhaTempo.filter(item => !item.data)] : report.linhaTempo;
    if (detail === 'resumido' && events.length < report.linhaTempo.length) add('Síntese com as cinco movimentações datadas mais recentes entre as informações fornecidas.');
    events.forEach(item => { add(`${item.data ? `${shortDate(item.data)} — ` : ''}${item.evento}${item.resumo ? `: ${item.resumo}` : ''}`); if (detail === 'detalhado' && item.fonte) add(`Fonte: ${item.fonte}`); });
  }
  if (report.statusAtual) { add('3. Status Atual', 'heading'); add(report.statusAtual); }
  if (report.proximasEtapas.length) { add('4. Próximas Etapas', 'heading'); report.proximasEtapas.forEach(text => add(text)); }
  add('Permanecemos à disposição para esclarecimentos adicionais.'); add('Atenciosamente,');
  add('PLATINO SOLUÇÕES FINANCEIRAS', 'signature'); add('Departamento de Acompanhamento Processual.');
  return blocks;
}
export function createSession() {
  let version = 0, controller;
  return {
    begin() { controller?.abort(); controller = new AbortController(); return { version: ++version, signal: controller.signal }; },
    current(id) { return id === version; },
    clear() { version++; controller?.abort(); controller = null; }
  };
}
