import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const declaracoesPdf = await readFile(
  new URL('../src/lib/dynamicPdf/declaracoesPdf.js', import.meta.url),
  'utf8'
);
const termoCompromissoPagamentoPdf = await readFile(
  new URL('../src/lib/dynamicPdf/termoCompromissoPagamentoPdf.js', import.meta.url),
  'utf8'
);
const heroIcon = await stat(new URL('../assets/pdf-document-icon.png', import.meta.url));
const libraryIcon = await stat(new URL('../assets/document-library-icon-3d.png', import.meta.url));

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
  /Localize um modelo, preencha os dados e gere o documento padronizado\./
);
assert.match(
  documentsSection,
  /<img src="assets\/pdf-document-icon\.png" alt="Ícone PDF do Gerador Inteligente de PDF" class="documents-pdf-hero-icon">/
);
assert.equal(
  (html.match(/assets\/pdf-document-icon\.png/g) || []).length,
  1,
  'O ícone original de PDF deve ser exclusivo do cabeçalho do gerador.'
);
assert.match(documentsSection, /assets\/document-library-icon-3d\.png/);
assert.ok(heroIcon.size > 1000, 'O ícone original de PDF deve estar disponível.');
assert.ok(libraryIcon.size > 1000, 'O ícone 3D da biblioteca deve estar disponível.');
assert.match(
  html,
  /\.documents-central,\s*\.documents-central \*\s*\{\s*font-family: "Inter"/
);
assert.match(html, /\.documents-central :is\(h2, h3, h4, h5\)[\s\S]*?font-family: "Montserrat"/);
assert.match(html, /--docs-ink: #173a5e;/);
assert.match(html, /--docs-accent: #0878bd;/);
assert.match(html, /--docs-line: #cbd4dc;/);
assert.doesNotMatch(html, /Times New Roman/);
assert.match(html, /documents-template-icon"><img src="assets\/document-library-icon-3d\.png"/);
assert.match(html, /\.documents-central\s*\{[\s\S]*?background: #ffffff;/);
assert.match(html, /const categoryOrder = \['Todos', 'Defesa', 'Extrajudicial', 'Judicial', 'Termos', 'Procurações', 'Declarações', 'Homologação', 'Perícia'\]/);
assert.match(html, /\.documents-categories\s*\{[\s\S]*?flex-wrap: wrap;[\s\S]*?overflow: visible;/);
assert.match(html, /\.documents-template-options\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(html, /@media \(max-width: 759px\)[\s\S]*?\.documents-template-options,[\s\S]*?grid-template-columns: 1fr;/);
assert.match(html, /name="document_global_search"[\s\S]*?autocomplete="off"[\s\S]*?placeholder="Pesquisar no sistema\.\.\."/);
assert.match(html, /function clearGlobalSearch\(\)/);
assert.match(html, /window\.addEventListener\('pageshow', clearGlobalSearch\)/);
assert.match(html, /name="document_library_search"/);
assert.match(html, /function clearDocumentsSearch\(\)/);
assert.match(html, /id="documents-search-clear"/);
assert.match(html, /role="option" tabindex="0"[\s\S]*?onclick="selectAdmTemplate\(this\.dataset\.templateValue\)"[\s\S]*?onkeydown="handleAdmTemplateCardKey\(event\)"/);
assert.match(html, /Preencher documento/);
assert.match(html, /class="documents-template-action"[\s\S]*?>•••<\/button>/);

const expectedCategories = {
  chargeback: 'Defesa',
  'citacao-intimacao-extrajudicial': 'Extrajudicial',
  'notificacao-extrajudicial-platino': 'Extrajudicial',
  'contestacao-taxas-email': 'Extrajudicial',
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
assert.equal(optionEntries.length, 17, 'A biblioteca deve manter os 17 modelos disponíveis.');
assert.deepEqual(
  new Set(optionEntries.map(option => option.value)),
  new Set(Object.keys(expectedCategories)),
  'Todos os modelos devem continuar disponíveis na pasta Todos.'
);
assert.equal(
  optionEntries.filter(option => expectedCategories[option.value] === 'Extrajudicial').length,
  3,
  'A pasta Extrajudicial deve conter três modelos.'
);
assert.equal(
  optionEntries.filter(option => expectedCategories[option.value] === 'Termos').length,
  5,
  'A pasta Termos deve conter cinco modelos.'
);
assert.doesNotMatch(documentsSection, /certidao-diligencia-contato-profissional/);
assert.doesNotMatch(catalog, /certidao-diligencia-contato-profissional/);

assert.match(html, /function renderAdmTemplateOptions\(query = ''\)/);
assert.match(html, /info\.purpose.*toLocaleLowerCase\('pt-BR'\)\.includes\(normalizedQuery\)/);
assert.match(html, /count\.textContent = filtered[\s\S]*?resultado[\s\S]*?modelos disponíveis/);
assert.match(html, /function selectAdmTemplate\(value\)/);
assert.match(html, /select\.value = value;[\s\S]*?renderAdmPdfFields\(\);[\s\S]*?showDocumentsForm\(\);/);
assert.match(html, /function showDocumentsLibrary\(\)/);
assert.match(html, /function generateAdmPdf\(/);
assert.match(
  html,
  /'declaracao-hipossuficiencia':[\s\S]*?fields: \[[^\]]*'cep'[^\]]*\]/
);
assert.match(declaracoesPdf, /CEP: \$\{dados\.cep\}/);
assert.match(
  termoCompromissoPagamentoPdf,
  /o CLIENTE se compromete com o pagamento na data ____\/____\/________\./
);
assert.match(
  html,
  /contrato de financiamento, e o CLIENTE se compromete com o pagamento na data ____\/____\/________\./
);
assert.match(html, /function renderLaudoProfessionalsField\(\)/);
assert.match(html, /Adicionar outro profissional/);
assert.match(html, /data-professional-key="nome"/);
assert.match(html, /data-professional-key="categoria"/);
assert.match(html, /data-professional-key="registro"/);
assert.match(html, /data-professional-key="funcao"/);
assert.doesNotMatch(html, /Um profissional por linha: Nome \| Categoria profissional/);

console.log('Interface de Documentos: identidade, ícones, busca, cards, conteúdo e categorias validados.');
