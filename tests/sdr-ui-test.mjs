import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, moduleSource, coreSource, css, api, firebaseAdmin, firestoreRules, storageRules, server] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/sdr/sdr-module.js", import.meta.url), "utf8"),
  readFile(new URL("../src/sdr/sdr-core.js", import.meta.url), "utf8"),
  readFile(new URL("../src/sdr/sdr.css", import.meta.url), "utf8"),
  readFile(new URL("../api/sdr.js", import.meta.url), "utf8"),
  readFile(new URL("../api/_firebase-admin.js", import.meta.url), "utf8"),
  readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  readFile(new URL("../storage.rules", import.meta.url), "utf8"),
  readFile(new URL("../server.mjs", import.meta.url), "utf8")
]);

assert.match(html, /id="section-sdr"/);
assert.match(html, /id="sdr-root"/);
assert.match(html, /src="\.\/src\/sdr\/sdr-module\.js"/);
assert.match(html, /href="\.\/src\/sdr\/sdr\.css"/);
assert.doesNotMatch(html, /window\.platinoSdrStore\.subscribe\(\);/);
assert.match(html, /platino-firebase-ready/);
assert.match(html, /enableMultiTabIndexedDbPersistence/);

for (const label of [
  "Cadastro",
  "Perfil do lead",
  "Contrato",
  "Análise preliminar",
  "Documento",
  "Aceite",
  "Encaminhamento",
  "Leads recebidos",
  "Configurações"
]) {
  assert.ok(`${coreSource}\n${moduleSource}`.includes(label), `Interface SDR sem o texto obrigatório: ${label}`);
}

for (const behavior of [
  "lead.create",
  "lead.save",
  "analysis.run",
  "document.register",
  "consent.record",
  "lead.assign",
  "lead.accept",
  "lead.return",
  "lead.outcome",
  "contact.record",
  "comment.add",
  "rule.save"
]) {
  assert.ok(api.includes(`"${behavior}"`), `API sem a ação ${behavior}`);
}

assert.match(moduleSource, /crypto\.subtle\.digest\("SHA-256"/);
assert.doesNotMatch(moduleSource, /uploadBytes|firebase-storage|getStorage|getBlob/);
assert.match(api, /storageMode: "local-download"/);
assert.match(moduleSource, /arquivo não foi armazenado/i);
assert.match(moduleSource, /localStorage/);
assert.match(moduleSource, /navigator\.onLine/);
assert.match(moduleSource, /send\(true\)/);
assert.match(moduleSource, /response\.status === 401/);
assert.match(moduleSource, /comercial@platino\.com/);
assert.match(moduleSource, /\\\.sdr@platino\\\.com/);
assert.match(api, /resolveAccountRole\(consultant\)/);
assert.match(api, /resolveAccountRole\(data\)/);
assert.match(firestoreRules, /sdr@platino\[\.\]com/);
assert.match(moduleSource, /lead ainda não foi salvo/);
assert.match(moduleSource, /alterações que ainda não foram salvas/);
assert.match(moduleSource, /const pendingAssignment = \{ \.\.\.\(lead\.assignment \|\| \{\}\) \}/);
assert.match(moduleSource, /consultantId: pendingAssignment\.consultantId/);
assert.match(firebaseAdmin, /verifyIdToken\(token\)/);
assert.doesNotMatch(firebaseAdmin, /verifyIdToken\(token,\s*true\)/);
assert.match(firebaseAdmin, /error\?\.expose === true/);
assert.match(firebaseAdmin, /app\/invalid-credential/);
assert.match(moduleSource, /onSnapshot/);
assert.match(moduleSource, /if \(!canAccessSdr\(\)\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?mount\(\);[\s\S]*?subscribeLeads\(\);/);
assert.doesNotMatch(moduleSource, /sector\.includes\("comercial"\)/);
assert.match(css, /@media \(max-width: 699px\)/);
assert.match(css, /\.sdr-stepper/);
assert.match(css, /\.sdr-modal/);
assert.match(firestoreRules, /allow write: if false;/);
assert.match(firestoreRules, /canReadLeadData/);
assert.match(firestoreRules, /sdrAuditLogs/);
assert.doesNotMatch(storageRules, /sdrLeads/);
assert.match(storageRules, /O módulo SDR não envia contratos nem PDFs/);
assert.match(server, /app\.post\(['"]\/api\/sdr['"]/);

console.log("SDR UI/API: integração, etapas, segurança, offline, PDF e rotas verificadas.");
