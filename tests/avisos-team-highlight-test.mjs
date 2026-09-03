import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const photo = await stat(new URL('../assets/equipe/janaina-rodrigues-paiva.jpeg', import.meta.url));

assert.equal(
  (html.match(/name: 'BEATRIZ GARCIA'/g) || []).length,
  1,
  'Beatriz deve existir uma única vez na lista oficial da equipe.'
);
assert.match(html, /name: 'BEATRIZ GARCIA',[^\n]+role: 'Consultora financeira'/);
assert.match(html, /Destaques do mês de agosto/i);
assert.match(html, /name: 'Mariana Guijo', sector: 'comercial'/);
assert.match(html, /name: 'Janaina Rodrigues Paiva', sector: 'juridico'/);
assert.match(html, /photo: 'assets\/equipe\/janaina-rodrigues-paiva\.jpeg'/);
assert.match(html, /getInitials\(person\.name\)/);
assert.match(html, /getRankingSold\(rankingMatch\)/);
assert.match(html, /AVISOS_HIGHLIGHT_VERSION = '2026-08-dual-highlights'/);
assert.ok(photo.size > 10_000, 'A fotografia da Janaina deve estar disponível.');

console.log('Carrossel e destaques de agosto validados.');
