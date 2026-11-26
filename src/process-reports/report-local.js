import { extractProcessSummary } from '../lib/processSummary.js';
import { IDENTIFICATION, LIMITS, fail, normalizeProcess, normalizeReport, validateSchema } from './report-core.js';

const cnjPattern = /\d{7}\s*-\s*\d{2}\s*\.\s*\d{4}\s*\.\s*\d\s*\.\s*\d{2}\s*\.\s*\d{4}/g;
const clean = value => String(value ?? '').replace(/[\t ]+/g, ' ').trim();
const comparable = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function date(value) {
  const match = value.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})|(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const iso = match[4] ? `${match[4]}-${match[5]}-${match[6]}` : `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const object = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(object.getTime()) && object.toISOString().slice(0, 10) === iso ? iso : '';
}
function labeled(text, labels) {
  const lines = text.split(/\r?\n/);
  const regex = new RegExp(`(?:^|[|;])\\s*(?:[-*•]\\s*)?(?:${labels})\\s*(?:[:：]|[–—])\\s*([^|;]*)`, 'i');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(regex);
    if (match) return clean(match[1] || lines[i + 1]);
  }
  return '';
}
function movements(source, alerts) {
  const lines = source.text.split(/\r?\n/).map(clean).filter(Boolean), events = [];
  let current;
  const metadata = /^(?:data\s+(?:d[aeo]\s+)?(?:autua|distribui|consulta)|valor da causa|classe|assunto|cliente|autor|requerente|réu|parte|polo|tribunal|órgão|justiça|próxim|status atual|situação atual|advogad|magistrad|perito|número do processo)\b/i;
  for (const line of lines) {
    if (metadata.test(line)) { current = null; continue; }
    const match = line.match(/^(?:(?:evento\s*)?\d{1,5}\s+[–—-]?\s*)?(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{2}-\d{2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s*[–—:\-]?\s*(.*)$/i);
    if (match) {
      const iso = date(match[1]);
      if (!iso) alerts.push(`Data inválida na fonte ${source.name}: ${match[1]}. Confira o original.`);
      current = { data: iso, evento: clean(match[2]), resumo: '', fonte: source.name };
      events.push(current);
    } else if (current) {
      if (!current.evento) current.evento = line;
      else current.resumo += `${current.resumo ? '\n' : ''}${line}`;
    }
  }
  return events.filter(item => item.evento || item.resumo);
}
export function generateLocalReport({ sources, client = '', process = '', instructions = '' }) {
  if (!Array.isArray(sources) || !sources.some(item => item.text?.trim())) fail('Não foi possível ler texto. Cole as informações ou envie um print legível.');
  if (sources.some(item => typeof item.name !== 'string' || typeof item.text !== 'string') || sources.reduce((n, item) => n + item.text.length, 0) > LIMITS.text) fail('Limite de 60 mil caracteres por atendimento.');
  if (client.length > 300 || process.length > 80 || instructions.length > 3000) fail('Confira o tamanho dos campos informados.');
  const report = { identificacao: Object.fromEntries(Object.keys(IDENTIFICATION).map(key => [key, ''])), processosIdentificados: [], linhaTempo: [], statusAtual: '', proximasEtapas: [], alertas: [] };
  const numbers = new Map(), clients = new Map();
  const merge = (key, value, source) => {
    value = clean(value); if (!value) return;
    if (report.identificacao[key] && comparable(report.identificacao[key]) !== comparable(value)) report.alertas.push(`${IDENTIFICATION[key]} diverge entre as fontes. Confira ${source}.`);
    else report.identificacao[key] = value;
  };
  for (const source of sources) {
    if (!source.text.trim()) { report.alertas.push(`Não foi reconhecido texto em ${source.name}. Confira essa fonte antes de exportar.`); continue; }
    for (const number of source.text.match(cnjPattern) || []) numbers.set(normalizeProcess(number), number.replace(/\s/g, ''));
    const legacy = extractProcessSummary(source.text);
    const name = legacy.cliente || labeled(source.text, 'nome do cliente|cliente|interessad[oa](?:\\(a\\))?|autor(?:\\(a\\)|a)?|parte autora|polo ativo|requerente');
    if (name) clients.set(comparable(name), name);
    const fields = {
      numeroProcesso: legacy.numeroProcesso, cliente: name, autor: name,
      orgaoJulgador: labeled(source.text, 'órgão julgador|juízo|juizo') || legacy.origem,
      magistrado: labeled(source.text, 'magistrad[oa]|juiz(?:\\(a\\)|a)?'),
      classe: labeled(source.text, 'classe processual|classe'),
      assunto: labeled(source.text, 'assunto(?:\\s*/\\s*natureza da ação)?|natureza da ação'),
      dataAutuacao: labeled(source.text, 'data (?:de |da )?autuação|autuação'),
      valorCausa: labeled(source.text, 'valor da causa'), situacao: labeled(source.text, 'situação|situação processual'),
      reu: legacy.banco || labeled(source.text, 'réu|ré|parte ré|polo passivo|requerid[oa]'),
      advogados: [legacy.advogadoCliente && `Parte autora: ${legacy.advogadoCliente}`, legacy.advogadoBanco && `Parte ré: ${legacy.advogadoBanco}`].filter(Boolean).join('; ') || labeled(source.text, 'advogados?'),
      perito: labeled(source.text, 'perit[oa]'), justicaGratuita: legacy.justicaGratuita
    };
    for (const [key, value] of Object.entries(fields)) merge(key, value, source.name);
    if (legacy.statusAtual) {
      if (report.statusAtual && comparable(report.statusAtual) !== comparable(legacy.statusAtual)) report.alertas.push('Há descrições de status diferentes entre as fontes. Confira e edite o status atual.');
      else report.statusAtual = legacy.statusAtual;
    }
    if (legacy.proximosPassos) report.proximasEtapas.push(legacy.proximosPassos);
    const events = movements(source, report.alertas);
    if (!events.length && legacy.descricaoUltimaMovimentacao) events.push({ data: date(legacy.dataUltimaMovimentacao || ''), evento: legacy.descricaoUltimaMovimentacao, resumo: '', fonte: source.name });
    report.linhaTempo.push(...events);
    if (source.method === 'ocr') report.alertas.push(`Texto reconhecido por OCR em ${source.name}. Confira nomes, datas e números no original${source.confidence < 80 ? '; a leitura apresentou baixa confiança' : ''}.`);
  }
  if (numbers.size > 1) fail('Foram identificados processos diferentes. Separe os anexos por atendimento.', 409);
  if (clients.size > 1) fail('Foram identificados nomes de clientes diferentes nas fontes. Separe os atendimentos ou confira os textos reconhecidos.', 409);
  report.processosIdentificados = [...numbers.values()];
  if (numbers.size) report.identificacao.numeroProcesso = [...numbers.values()][0];
  if (process.trim()) {
    if (numbers.size && normalizeProcess(process) !== [...numbers.keys()][0]) fail('O processo informado diverge das fontes. Confira o número antes de gerar.', 409);
    report.identificacao.numeroProcesso = process.trim();
  }
  if (client.trim()) {
    if (clients.size && comparable(client) !== [...clients.keys()][0]) report.alertas.push('O nome informado pelo operador difere do nome extraído. Confira a titularidade.');
    report.identificacao.cliente = client.trim();
  }
  if (!report.linhaTempo.length) {
    report.alertas.push('Não foram reconhecidas movimentações com data. As informações abaixo foram transcritas sem interpretação. Confira o editor e as fontes.');
    for (const source of sources) for (let offset = 0; offset < source.text.length; offset += 5500) report.linhaTempo.push({ data: '', evento: 'Informações fornecidas', resumo: source.text.slice(offset, offset + 5500), fonte: source.name });
  }
  if (!report.statusAtual) {
    const latest = report.linhaTempo.filter(item => item.data).sort((a, b) => a.data.localeCompare(b.data)).at(-1);
    if (latest) report.statusAtual = `O registro mais recente entre as informações fornecidas é de ${latest.data.split('-').reverse().join('/')}: ${latest.evento}${latest.resumo ? ` — ${latest.resumo}` : ''}`;
    else report.alertas.push('O status atual não foi identificado. Preencha-o no editor se houver informação suficiente.');
  }
  if (instructions.trim()) report.statusAtual += `${report.statusAtual ? '\n\n' : ''}${instructions.trim()}`;
  report.proximasEtapas = [...new Set(report.proximasEtapas)];
  report.alertas = [...new Set(report.alertas)].slice(0, 27);
  if (report.linhaTempo.length > 150) fail('Há mais de 150 movimentações. Selecione as fontes relevantes ou reduza o texto.');
  return normalizeReport(report);
}
export function organizeReport(input) {
  const report = structuredClone(validateSchema(input));
  const tidy = text => text.replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  for (const key of Object.keys(report.identificacao)) report.identificacao[key] = tidy(report.identificacao[key]);
  report.linhaTempo.forEach(item => { for (const key of ['evento', 'resumo', 'fonte']) item[key] = tidy(item[key]); });
  report.statusAtual = tidy(report.statusAtual); report.proximasEtapas = report.proximasEtapas.map(tidy);
  return normalizeReport(report);
}
