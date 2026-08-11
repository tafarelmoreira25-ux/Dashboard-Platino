import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

for (const text of [
  "AGOSTO • HOMENAGEM ESPECIAL",
  "Celebrando Isabela",
  "A força e a alma da Platino.",
  "Uma história de coragem, liderança e transformação.",
  "13 de agosto",
  "Ler homenagem",
  "Empreender também é transformar vidas.",
  "A Platino é uma história.",
  "Que você nunca se esqueça: o seu sonho não transformou apenas a sua vida.",
  "Uma mensagem de toda a equipe",
  "Deixe sua mensagem para Isabela",
  "Registrar homenagem"
]) {
  assert.ok(html.includes(text), `Conteúdo obrigatório ausente: ${text}`);
}

assert.match(html, /id="celebrando-isabela"[^>]+data-campaign-start="2026-08-01"[^>]+data-campaign-end="2026-08-31"/);
assert.match(html, /isabelaCampaignVisibilityTimer = window\.setInterval\(initializeIsabelaCampaign, 60000\)/);
assert.match(html, /id="isabela-message-input"[^>]+maxlength="400"/);
assert.match(html, /<details class="isabela-open-letter">[\s\S]+ph-envelope-open[\s\S]+<div class="isabela-letter-body">/);
assert.match(html, /#section-inicio \.isabela-campaign-copy h2[^}]+-webkit-text-fill-color:#f7faff !important/);
assert.match(html, /scrollIntoView\(\{ behavior: reduceMotion \? "auto" : "smooth"/);
assert.match(html, /isabela-campaign-hero:hover[^}]+scale\(1\.035\)/);
assert.match(html, /transition:transform 8s/);
assert.match(html, /prefers-reduced-motion: reduce/);
assert.match(html, /@media \(max-width: 767px\)[\s\S]+\.isabela-campaign-media \{ position:relative; order:1;/);
assert.match(html, /\.isabela-campaign-copy \{ order:2;/);
assert.match(html, /\.isabela-message-grid \{ grid-template-columns:1fr;/);

assert.ok(html.includes('collection(db, "isabelaTributes")'), "Coleção isolada do mural não configurada.");
assert.match(html, /name: 'ISABELA LIMA DE SOUZA'[\s\S]+photo: 'assets\/equipe\/isabela-lima-de-souza\.png'/);
assert.ok(html.includes('crypto.subtle.digest("SHA-256"'), "Prevenção determinística de duplicidade ausente.");
assert.ok(html.includes("existingTribute.exists()"), "Verificação de homenagem duplicada ausente.");
assert.match(html, /const visibleTributes = currentIsabelaTributes;/);
assert.match(html, /query\(isabelaTributesRef, orderBy\("createdAt", "desc"\)\)/);
assert.doesNotMatch(html, /currentIsabelaTributes\.filter\(item => item\.status !== "hidden"\)/);
assert.doesNotMatch(html, /window\.moderateIsabelaTribute/);
assert.doesNotMatch(html, /orderBy\("createdAt", "desc"\), limit\(100\)/);

assert.match(rules, /match \/isabelaTributes\/\{tributeId\}/);
assert.match(rules, /allow read: if signedIn\(\)/);
assert.match(rules, /allow create: if signedIn\(\) && isValidIsabelaTributeCreate\(\)/);
assert.match(rules, /isValidShortText\(data\.message, 400\)/);
assert.match(rules, /data\.authorUid == request\.auth\.uid/);
assert.match(rules, /allow update, delete: if false/);

for (const relativePath of [
  "../assets/campaigns/celebrando-isabela-hero.png",
  "../assets/campaigns/celebrando-isabela-trajetoria.png",
  "../assets/equipe/isabela-lima-de-souza.png"
]) {
  const url = new URL(relativePath, import.meta.url);
  assert.ok(existsSync(url), `Imagem da campanha ausente: ${relativePath}`);
  assert.ok(statSync(url).size > 100_000, `Imagem parece inválida ou excessivamente comprimida: ${relativePath}`);
}

console.log("Campanha Celebrando Isabela: estrutura, acessibilidade, persistência e regras validadas.");
