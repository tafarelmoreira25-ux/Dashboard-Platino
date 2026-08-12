import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const expectedProfiles = [
  ['JANAINA RODRIGUES PAIVA', 'Consultora financeira', 'janaina-rodrigues-paiva.jpeg'],
  ['ELAINE APARECIDA DOS SANTOS', 'Consultora Jurídica', 'elaine-aparecida-dos-santos.jpeg'],
  ['Fernanda Ramos', 'Consultora financeira', 'fernanda-ramos.png'],
  ['Geovanna Alves Xavier', 'Consultora financeira', 'geovanna-alves-xavier.png'],
  ['Mariana Santos', 'Consultora financeira', 'mariana-santos.png'],
  ['Thayla Venturini', 'Consultora financeira', 'thayla-venturini.jpeg']
];

for (const [name, role, photo] of expectedProfiles) {
  assert.equal((html.match(new RegExp(`\\{ name: '${name}', date:`, 'g')) || []).length, 1, `${name} deve aparecer uma única vez no carrossel.`);
  const photoPattern = photo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(html, new RegExp(`name: '${name}'[^\\n]+role: '${role}'[^\\n]+${photoPattern}`));
  const photoFile = await stat(new URL(`../assets/equipe/${photo}`, import.meta.url));
  assert.ok(photoFile.size > 50_000, `A foto de ${name} deve estar disponível.`);
}

console.log('Atualizações disponíveis da equipe validadas.');
