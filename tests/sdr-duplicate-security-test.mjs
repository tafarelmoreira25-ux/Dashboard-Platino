import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { duplicatePreview, normalizeLeadTextKey, readableDuplicateMatches } from "../src/sdr/sdr-core.js";
import { cleanLeadInput } from "../api/sdr.js";

const leads = [
  { id: "own", ownerSdrId: "sdr-1", assignedConsultantId: "", fullName: "Own Lead", phone: "11911111111", status: "Novo lead", ownerSdrName: "SDR 1" },
  { id: "assigned", ownerSdrId: "sdr-2", assignedConsultantId: "consultant-1", fullName: "Assigned Lead", phone: "11922222222", status: "Encaminhado", ownerSdrName: "SDR 2" },
  { id: "foreign", ownerSdrId: "sdr-3", assignedConsultantId: "consultant-2", fullName: "Foreign Lead", phone: "11933333333", status: "Novo lead", ownerSdrName: "SDR 3" }
];

const ids = matches => matches.map(match => match.id);
assert.deepEqual(ids(readableDuplicateMatches({ uid: "sdr-1", role: "sdr" }, leads)), ["own"]);
assert.deepEqual(ids(readableDuplicateMatches({ uid: "consultant-1", role: "consultant" }, leads)), ["assigned"]);
assert.deepEqual(ids(readableDuplicateMatches({ uid: "sdr-2", role: "collaborator" }, leads)), ["assigned"]);
assert.deepEqual(ids(readableDuplicateMatches({ uid: "manager-1", role: "manager" }, leads)), ["own", "assigned", "foreign"]);
assert.deepEqual(readableDuplicateMatches({ uid: "sdr-4", role: "sdr" }, leads), []);
assert.deepEqual(readableDuplicateMatches(null, leads), []);
assert.equal(JSON.stringify(readableDuplicateMatches({ uid: "sdr-1", role: "sdr" }, leads)).includes("Foreign Lead"), false);
assert.equal(duplicatePreview({ uid: "sdr-4", role: "sdr" }, leads), null);
assert.equal(duplicatePreview({ uid: "sdr-1", role: "sdr" }, leads, "Revisei"), null);
assert.deepEqual(ids(duplicatePreview({ uid: "sdr-1", role: "sdr" }, leads).matches), ["own"]);
assert.equal(normalizeLeadTextKey("  Jo\u00e3o  da   Silva  "), "joao da silva");
const prepared = cleanLeadInput({ fullName: " Jo\u00e3o   Silva ", phone: "(11) 98888-7777", cpfCnpj: "529.982.247-25", externalCode: " C\u00f3digo  ABC " });
assert.equal(prepared.fullNameKey, "joao silva");
assert.equal(prepared.phoneKey, "11988887777");
assert.equal(prepared.documentKey, "52998224725");
assert.equal(prepared.externalCodeKey, "codigo abc");

const api = await readFile(new URL("../api/sdr.js", import.meta.url), "utf8");
assert.match(api, /const preview = duplicatePreview\(actor, uniqueDuplicates/);
assert.match(api, /if \(preview\) return preview/);
assert.doesNotMatch(api, /matches: uniqueDuplicates\.map/);
console.log("SDR: duplicidades restritas ao escopo autorizado e nome normalizado validados.");
