import assert from "node:assert/strict";
import { scanLeadPage, SDR_SEARCH_SCAN_LIMIT } from "../src/sdr/sdr-query-policy.js";

function source(items) {
  const docs = items.map((data, index) => ({ id: String(index), data: () => data }));
  let calls = 0;
  let delivered = 0;
  return {
    fetchBatch: async (cursor, size) => {
      calls += 1;
      const start = cursor ? docs.findIndex(item => item.id === cursor.id) + 1 : 0;
      const batch = docs.slice(start, start + size);
      delivered += batch.length;
      return batch;
    },
    stats: () => ({ calls, delivered })
  };
}

const names = source([{ fullName: "Ana" }, { fullName: "Maria Silva" }, { fullName: "Maria Costa" }, { fullName: "Paulo" }]);
const first = await scanLeadPage({ ...names, matches: doc => doc.data().fullName.includes("Maria"), pageSize: 1 });
assert.equal(first.complete, true);
assert.equal(first.hasNext, true);
assert.equal(first.items[0].data().fullName, "Maria Silva");
const second = await scanLeadPage({ ...names, cursor: first.nextCursor, matches: doc => doc.data().fullName.includes("Maria"), pageSize: 1 });
assert.equal(second.items[0].data().fullName, "Maria Costa");
assert.equal(second.hasNext, false);

const empty = await scanLeadPage({ ...source([{ fullName: "Ana" }]), matches: doc => doc.data().fullName.includes("João"), pageSize: 10 });
assert.equal(empty.complete, true);
assert.deepEqual(empty.items, []);

const combined = await scanLeadPage({
  ...source([
    { status: "Novo lead", commercialClassification: "Quente" },
    { status: "Retorno agendado", commercialClassification: "Frio" },
    { status: "Retorno agendado", commercialClassification: "Quente" }
  ]),
  matches: doc => doc.data().status === "Retorno agendado" && doc.data().commercialClassification === "Quente",
  pageSize: 10
});
assert.equal(combined.items.length, 1);

const many = source(Array.from({ length: 20 }, (_, index) => ({ fullName: `Pessoa ${index}` })));
const capped = await scanLeadPage({ ...many, matches: () => false, pageSize: 10, maxDocuments: 4 });
assert.equal(capped.complete, false);
assert.equal(capped.scanned, 4);
assert.ok(many.stats().delivered <= 4);
assert.equal(SDR_SEARCH_SCAN_LIMIT, 200);

let active = true;
const stale = await scanLeadPage({
  fetchBatch: async () => { active = false; return [{ id: "1", data: () => ({ fullName: "Maria" }) }]; },
  matches: () => true, pageSize: 10, isCurrent: () => active
});
assert.equal(stale.cancelled, true);
assert.equal(stale.items, undefined);

console.log("SDR: busca por nome, ausência, filtros combinados, cursores, limite e cancelamento aprovados.");
