import assert from "node:assert/strict";
import {
  formatarLocalEData,
  normalizarNomeCompleto,
} from "../src/lib/dynamicPdf/citacaoJudicialPdf.js";

assert.equal(
  formatarLocalEData("", "2026-08-06"),
  "São Paulo, 6 de agosto de 2026.",
  "A citação judicial deve usar São Paulo quando a cidade não for informada.",
);

assert.equal(
  formatarLocalEData("Campinas, ", "2026-08-06"),
  "Campinas, 6 de agosto de 2026.",
  "A linha de data não pode produzir vírgulas duplicadas.",
);

assert.equal(
  normalizarNomeCompleto("Luiz   OtávioDos Santos Feck"),
  "Luiz Otávio dos Santos Feck",
  "Partículas 'dos' coladas ao nome devem ser separadas.",
);

console.log("Citação judicial: formatação de nome, local e data validada.");
