import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const carouselSource = html.match(/const platinoPeople = \[[\s\S]*?\n\s*\];/)?.[0] || '';
const expectedProfiles = [
  ['JANAINA RODRIGUES PAIVA', 'Consultora financeira', 'janaina-rodrigues-paiva.jpeg'],
  ['Fernanda Ramos', 'Consultora financeira', 'fernanda-ramos.png'],
  ['Geovanna Alves Xavier', 'Consultora financeira', 'geovanna-alves-xavier.png'],
  ['Mariana Santos', 'Consultora financeira', 'mariana-santos.png'],
  ['Thayla Venturini', 'Departamento administrativo', 'thayla-venturini.jpeg']
];

assert.ok(carouselSource, 'A lista oficial do carrossel deve continuar disponível.');
assert.doesNotMatch(carouselSource, /NICOLAS PERES ISSO|Nicolas Peres/);
assert.doesNotMatch(carouselSource, /ELAINE APARECIDA DOS SANTOS/);

for (const [name, role, photo] of expectedProfiles) {
  assert.equal((html.match(new RegExp(`\\{ name: '${name}', date:`, 'g')) || []).length, 1, `${name} deve aparecer uma única vez no carrossel.`);
  const photoPattern = photo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(html, new RegExp(`name: '${name}'[^\\n]+role: '${role}'[^\\n]+${photoPattern}`));
  const photoFile = await stat(new URL(`../assets/equipe/${photo}`, import.meta.url));
  assert.ok(photoFile.size > 50_000, `A foto de ${name} deve estar disponível.`);
}

console.log('Atualizações disponíveis da equipe validadas.');
