import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

const removedCampaignMarkers = [
  "celebrando-isabela",
  "Celebrando Isabela",
  "homenagem-isabela",
  "isabela-campaign",
  "isabela-message",
  "isabelaTributes",
  "IsabelaCampaign",
  "IsabelaTribute"
];

for (const marker of removedCampaignMarkers) {
  assert.ok(!html.includes(marker), `A campanha removida ainda contém a referência: ${marker}`);
}

assert.ok(!rules.includes("isabelaTributes"), "As regras do mural removido ainda estão habilitadas.");
assert.ok(!rules.includes("isValidIsabelaTributeCreate"), "A validação do mural removido ainda está presente.");

assert.match(
  html,
  /<section id="section-inicio"[^>]*>\s*<div class="max-w-7xl mx-auto">\s*<header class="home-command-header">/,
  "A tela inicial operacional deve ser o primeiro conteúdo da seção Início."
);
assert.match(html, /id="home-greeting">Bom dia, equipe Platino\.<\/h2>/);
assert.doesNotMatch(html, /<span class="home-eyebrow">/);
assert.doesNotMatch(html, /<div class="home-command-mark"/);
assert.match(html, /href="\.\/src\/styles\/workspace\.css"/);

console.log("Campanha de homenagem removida; tela inicial operacional preservada como entrada.");
