import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const buttonTags = [...html.matchAll(/<button\b[^>]*>/gi)].map(match => match[0]);
const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map(match => match[0]);

assert(buttonTags.length >= 100, "A auditoria encontrou menos botões do que o esperado.");

for (const form of forms) {
  const formId = form.match(/\bid="([^"]+)"/i)?.[1] || "formulário sem id";
  const missingType = [...form.matchAll(/<button\b(?![^>]*\btype\s*=)[^>]*>/gi)];
  assert.equal(missingType.length, 0, `${formId} possui botão sem type explícito.`);
}

assert.match(html, /button,[\s\S]*?min-height:\s*44px/, "Área mínima global de toque ausente.");
assert.match(html, /touch-action:\s*manipulation/, "Otimização touch-action ausente.");
assert.match(html, /#chat-widget\s*{[\s\S]*?pointer-events:\s*none/, "Chat fechado pode bloquear a tela.");
assert.match(html, /id="chat-window"\s+inert\s+aria-hidden="true"/, "Chat deve iniciar inerte.");
assert.match(html, /font-size:\s*16px\s*!important/, "Campos móveis podem provocar zoom automático.");
assert.match(html, /viewport-fit=cover/, "Viewport móvel não está normalizado.");
assert.doesNotMatch(html, /user-scalable\s*=\s*no/i, "O zoom de acessibilidade não pode ser bloqueado.");

console.log(`Auditoria aprovada: ${buttonTags.length} botões e ${forms.length} formulários verificados.`);
