import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf("const HOME_TASKS_KEY = 'platinoHomeTasksV1';");
const end = html.indexOf('function renderHomeOperationalHub()', start);
assert.ok(start !== -1 && end > start, 'Funções de prioridades não encontradas.');

const values = new Map([['platinoHomeTasksV1', JSON.stringify([{ id: 'antiga', text: 'Sem dono' }])]]);
const input = { value: '' };
const context = vm.createContext({
  window: { firebaseAuthUser: null },
  localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  },
  document: { getElementById: () => input },
  renderHomeOperationalHub: () => {},
  Date,
  Math,
});
vm.runInContext(html.slice(start, end), context);

const run = code => vm.runInContext(code, context);
assert.equal(run('loadHomeTasks().length'), 0, 'Sem login, nenhuma tarefa deve aparecer.');

context.window.firebaseAuthUser = { uid: 'usuario-a' };
input.value = 'Prioridade de A';
run('addHomeTask({ preventDefault() {} })');
assert.equal(run('loadHomeTasks().length'), 1);
assert.equal(JSON.parse(values.get('platinoHomeTasksV1:usuario-a'))[0].ownerUid, 'usuario-a');

context.window.firebaseAuthUser = { uid: 'usuario-b' };
assert.equal(run('loadHomeTasks().length'), 0, 'B não deve ver tarefas de A.');
input.value = 'Prioridade de B';
run('addHomeTask({ preventDefault() {} })');
const taskA = JSON.parse(values.get('platinoHomeTasksV1:usuario-a'))[0];
run(`toggleHomeTask(${JSON.stringify(taskA.id)})`);
run(`removeHomeTask(${JSON.stringify(taskA.id)})`);
assert.equal(JSON.parse(values.get('platinoHomeTasksV1:usuario-a'))[0].done, false, 'B não deve alterar A.');
assert.equal(run('loadHomeTasks().length'), 1);

context.window.firebaseAuthUser = { uid: 'usuario-a' };
assert.equal(run('loadHomeTasks().length'), 1, 'A deve recuperar sua própria lista.');
run(`toggleHomeTask(${JSON.stringify(taskA.id)})`);
assert.equal(run('loadHomeTasks()[0].done'), true);
assert.equal(values.has('platinoHomeTasksV1'), true, 'A lista antiga deve permanecer preservada.');

console.log('Prioridades isoladas por UID; lista antiga preservada sem dono atribuído.');
