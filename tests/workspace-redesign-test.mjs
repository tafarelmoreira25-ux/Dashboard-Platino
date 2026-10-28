import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/workspace.css', import.meta.url), 'utf8');

// Parse all inline programs without executing requests or Firebase initialization.
for (const [, attrs, code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (!code.trim() || /type="importmap"/.test(attrs)) continue;
  if (/type="module"/.test(attrs)) {
    const parsed = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: code, encoding: 'utf8' });
    assert.equal(parsed.status, 0, parsed.stderr);
  } else new vm.Script(code);
}

// Exercise the actual renderer and expand/collapse behavior with isolated DOM nodes.
const elements = new Map();
function element(id) {
  const classes = new Set();
  const node = { innerHTML: '', style: {}, attributes: {}, classList: {
    add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value)
  }, setAttribute(key, value) { this.attributes[key] = value; } };
  elements.set(id, node);
  return node;
}
const container = element('procedures');
for (const id of ['a1', 'a2']) for (const prefix of ['content-', 'icon-', 'toggle-']) element(prefix + id);
let permissionPasses = 0;
const document = {
  getElementById: id => elements.get(id),
  querySelectorAll: selector => [...elements].filter(([id]) => id.startsWith(
    selector === '.accordion-content' ? 'content-' : selector === '.procedure-toggle' ? 'toggle-' : 'icon-'
  )).map(([, node]) => node)
};
const context = vm.createContext({ document, applyGestorVisibility: () => permissionPasses++ });
const start = html.indexOf('        function renderAccordions(');
const end = html.indexOf('        // ENVIO DO HUB', start);
vm.runInContext(html.slice(start, end), context);
context.renderAccordions('procedures', [
  { id: 'a1', title: '1. Análise Contratual', icon: 'ph-files', tasks: ['Conferir documentos originais'], extraHtml: '<a href="documento.pdf">Documento</a>' },
  { id: 'a2', title: '2. GOV.BR', icon: 'ph-envelope', tasks: ['Enviar protocolo'] }
]);
assert.equal(permissionPasses, 1, 'Permissões devem continuar aplicadas.');
assert.ok(container.innerHTML.includes('Conferir documentos originais'));
assert.ok(container.innerHTML.includes('<a href="documento.pdf">Documento</a>'));
assert.ok(container.innerHTML.includes("openFlowEditor('a1')"));
assert.ok(container.innerHTML.includes('aria-controls="content-a1"'));
context.toggleAccordion('a1');
assert.ok(elements.get('content-a1').classList.contains('open'));
assert.equal(elements.get('toggle-a1').attributes['aria-expanded'], 'true');
context.toggleAccordion('a2');
assert.equal(elements.get('toggle-a1').attributes['aria-expanded'], 'false');
assert.ok(!elements.get('content-a1').classList.contains('open'));
assert.equal(elements.get('toggle-a2').attributes['aria-expanded'], 'true');
context.toggleAccordion('a2');
assert.equal(elements.get('toggle-a2').attributes['aria-expanded'], 'false');

function luminance(hex) {
  const rgb = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
for (const foreground of ['16191F', '667085', '0735C5']) {
  for (const background of ['FFFFFF', 'F7F8FA', ...(foreground === '667085' ? [] : ['EDF2FF'])]) {
    assert.ok((luminance(background) + .05) / (luminance(foreground) + .05) >= 4.5, `${foreground}/${background}`);
  }
}
assert.ok((luminance('EDF2FF') + .05) / (luminance('596477') + .05) >= 4.5);
assert.ok(!css.includes('gradient('));
for (const file of ['index.html', 'apresentacao_platino.html', 'abertura-de-grupos.html', 'treinamento-trilho-revisao-contratos.html']) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.ok(source.includes('./src/styles/workspace.css'), `${file} sem identidade central.`);
  for (const [declaration] of source.matchAll(/@import[^\n]+/g)) assert.match(declaration.trim(), /\);$/);
}
console.log('Redesign: scripts, expansão/edição, permissões, conteúdo e contraste AA aprovados.');
