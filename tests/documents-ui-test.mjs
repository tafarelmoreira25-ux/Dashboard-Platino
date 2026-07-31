import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const icon = await stat(new URL('../assets/document-model-icon-transparent.png', import.meta.url));

const documentsSection = html.match(
  /<section id="section-documentos"[\s\S]*?<\/section>\s*<section id="section-adm"/
)?.[0] || '';
const catalog = html.match(
  /const admTemplateCatalog = \{([\s\S]*?)\n\s*\};/
)?.[1] || '';

assert.ok(documentsSection, 'A seção Documentos deve existir antes do Administrativo.');
assert.match(documentsSection, /Gerador Inteligente de PDF/);
assert.match(
  documentsSection,
  /Gere, organize e utilize os documentos padronizados\. Fica pronto em menos de 1 minuto\./
);
assert.match(documentsSection, /assets\/document-model-icon-transparent\.png/);
assert.ok(icon.size > 1000, 'O ícone de PDF deve estar disponível.');
assert.match(
  html,
  /\.documents-central,\s*\.documents-central \*\s*\{\s*font-family: "Inter"/
);
assert.match(html, /\.documents-central :is\(h2, h3, h4, h5\)[\s\S]*?font-family: "Montserrat"/);
assert.match(html, /--docs-ink: #173a5e;/);
assert.match(html, /--docs-accent: #0878bd;/);
assert.match(html, /--docs-line: #cbd4dc;/);
assert.doesNotMatch(html, /Times New Roman/);
assert.match(html, /documents-template-icon"><img src="assets\/document-model-icon-transparent\.png"/);
assert.match(html, /box-shadow: inset 0 -3px var\(--docs-accent\)/);
assert.match(html, /\.documents-central\s*\{[\s\S]*?background: #ffffff;/);
assert.match(html, /const categoryOrder = \['Todos', 'Defesa', 'Extrajudicial', 'Termos', 'Procurações', 'Declarações', 'Judicial', 'Homologação', 'Perícia'\]/);

const expectedCategories = {
  chargeback: 'Defesa',
  'citacao-intimacao-extrajudicial': 'Extrajudicial',
  'notificacao-extrajudicial-platino': 'Extrajudicial',
  'contestacao-taxas-email': 'Extrajudicial',
  'certidao-diligencia-contato-profissional': 'Extrajudicial',
  'termo-ciencia-autorizacao-seguranca': 'Termos',
  'termo-compromisso-pagamento': 'Termos',
  'modelo-termo-compromisso-pagamento': 'Termos',
  'termo-recompra': 'Termos',
  'recibo-prestacao-servicos': 'Termos',
  'procuracao-dra-juliane': 'Procurações',
  'declaracao-hipossuficiencia': 'Declarações',
  'declaracao-isencao-irpf': 'Declarações',
  'declaracao-ausencia-carteira-trabalho': 'Declarações',
  'citacao-judicial': 'Judicial',
  'relatorio-atualizacao-processo-judicial': 'Judicial',
  'relatorio-negociacao-acordo-homologacao': 'Homologação',
  'laudo-pericial-contabil': 'Perícia'
};

for (const [template, category] of Object.entries(expectedCategories)) {
  const escapedTemplate = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(
    catalog,
    new RegExp(`'${escapedTemplate}': \\{ category: '${escapedCategory}'`),
    `${template} deve pertencer à pasta ${category}.`
  );
}

const optionEntries = Array.from(
  documentsSection.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g),
  match => ({ value: match[1], label: match[2] })
);
assert.equal(optionEntries.length, 18, 'A biblioteca deve manter os 18 modelos existentes.');
assert.deepEqual(
  new Set(optionEntries.map(option => option.value)),
  new Set(Object.keys(expectedCategories)),
  'Todos os modelos devem continuar disponíveis na pasta Todos.'
);
assert.equal(
  optionEntries.filter(option => expectedCategories[option.value] === 'Extrajudicial').length,
  4,
  'A pasta Extrajudicial deve conter quatro modelos.'
);
assert.equal(
  optionEntries.filter(option => expectedCategories[option.value] === 'Termos').length,
  5,
  'A pasta Termos deve conter cinco modelos.'
);
assert.deepEqual(
  optionEntries
    .filter(option => option.label.toLocaleLowerCase('pt-BR').includes('certidão'))
    .map(option => option.value),
  ['certidao-diligencia-contato-profissional'],
  'A busca textual deve localizar a Certidão pelo nome.'
);

assert.match(html, /function renderAdmTemplateOptions\(query = ''\)/);
assert.match(html, /info\.purpose.*toLocaleLowerCase\('pt-BR'\)\.includes\(normalizedQuery\)/);
assert.match(html, /function selectAdmTemplate\(value\)/);
assert.match(html, /select\.value = value;[\s\S]*?renderAdmPdfFields\(\);[\s\S]*?showDocumentsForm\(\);/);
assert.match(html, /function showDocumentsLibrary\(\)/);
assert.match(html, /function generateAdmPdf\(/);
assert.match(html, /function renderLaudoProfessionalsField\(\)/);
assert.match(html, /Adicionar outro profissional/);
assert.match(html, /data-professional-key="nome"/);
assert.match(html, /data-professional-key="categoria"/);
assert.match(html, /data-professional-key="registro"/);
assert.match(html, /data-professional-key="funcao"/);
assert.doesNotMatch(html, /Um profissional por linha: Nome \| Categoria profissional/);

console.log('Interface de Documentos: aparência clara, conteúdo e categorias validados.');
