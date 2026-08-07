import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.match(
  html,
  /remoteData\.chargebacks = nextData\.chargebacks;\s*remoteData\.monthKey = defaultAvisosData\.monthKey;/,
  'A publicação dos chargebacks deve identificar o mês operacional atual.'
);
assert.match(
  html,
  /remoteData\.chargebacks = nextData\.chargebacks;/,
  'O formulário deve enviar os chargebacks normalizados para o Firestore.'
);
assert.doesNotMatch(
  html,
  /if \(!remoteData\?\.main \|\| !remoteData\?\.highlight \|\| !remoteData\?\.week\) return;/,
  'Um documento remoto parcial não pode fazer a sincronização ser ignorada.'
);
assert.match(
  html,
  /chargebacks: \{ \.\.\.avisosData\.chargebacks, \.\.\.\(remoteData\.chargebacks \|\| \{\}\) \}/,
  'O retorno remoto deve preservar a estrutura e aplicar os chargebacks publicados.'
);

console.log('Persistência mensal dos chargebacks validada.');
