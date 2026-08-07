import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const photo = await stat(new URL('../assets/equipe/beatriz-garcia.png', import.meta.url));

assert.equal(
  (html.match(/name: 'BEATRIZ GARCIA'/g) || []).length,
  1,
  'Beatriz deve existir uma única vez na lista oficial da equipe.'
);
assert.match(html, /name: 'BEATRIZ GARCIA',[^\n]+role: 'Consultora financeira'/);
assert.match(html, /title: 'Destaque do mês de julho'/);
assert.match(html, /name: 'Beatriz Garcia'/);
assert.match(html, /subtitle: 'Ultrapassou sua meta em seu primeiro mês\.'/);
assert.match(html, /value: 'R\$ 21\.078,50'/);
assert.match(html, /photo: 'assets\/equipe\/beatriz-garcia\.png'/);
assert.match(html, /highlightPhoto\.src = avisosData\.highlight\.photo/);
assert.match(html, /AVISOS_HIGHLIGHT_VERSION = '2026-07-beatriz-garcia'/);
assert.ok(photo.size > 100_000, 'A fotografia da Beatriz deve estar disponível em boa resolução.');

console.log('Carrossel e destaque de julho da Beatriz validados.');
