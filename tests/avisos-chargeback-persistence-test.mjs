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
  /remoteData\.chargebackVersion = defaultAvisosData\.chargebackVersion;/,
  'A publicação deve marcar a versão da carga de chargebacks de agosto.'
);
assert.match(
  html,
  /\{ client: 'Carlos Adriano Cunha Machado', amount: 979\.20, date: '06\/08\/2026' \}/,
  'A carga inicial deve conter cliente, valor e data.'
);
assert.match(
  html,
  /\{ client: 'Valmir Francisco dos Santos', amount: 1281\.00, date: '25\/08\/2026' \}/,
  'A carga inicial deve conter todos os nove registros informados.'
);
assert.match(
  html,
  /amount: parseRankingValue\(item\?\.amount \?\? item\?\.value \?\? item\?\.valor \?\? ''\)/,
  'A normalização deve preservar o valor de cada chargeback.'
);
assert.match(
  html,
  /avisos-chargebacks-total/,
  'A Central de Vendas deve exibir o total financeiro dos chargebacks.'
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
