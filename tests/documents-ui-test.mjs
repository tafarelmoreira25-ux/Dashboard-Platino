import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.doesNotMatch(html, /id="nav-documentos"/);
assert.doesNotMatch(html, /id="section-documentos"/);
assert.doesNotMatch(html, /navigateTo\('documentos'\)/);
assert.doesNotMatch(html, /Gerador Inteligente de PDF/);
assert.doesNotMatch(html, /Gerar documento<small>Modelos padronizados<\/small>/);

console.log('A aba Documentos e o gerador de documentos foram removidos da interface.');
