import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import handler from "../api/generate-document.js";

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

const request = {
  method: "POST",
  headers: { origin: "https://dashboard.example" },
  body: {
    templateKey: "contestacao-taxas-email",
    data: {
      cliente: "Cliente de Teste",
      cpf: "123.456.789-00",
      estado: "São Paulo/SP",
      data: "30/08/2026",
      numeroDocumento: "TESTE-001",
      valor: "1.500,00",
      seguro: "250,00",
      registroContrato: "180,00",
      tarifaAvaliacao: "300,00",
      tarifaCadastro: "500,00",
      demaisTarifas: "0,00",
      iof: "450,00",
      iofAdicional: "100,00",
      dataPagamento: "30/08/2026",
      responsavel: "Equipe Platino",
    },
  },
};
const response = createResponse();

await handler(request, response);

assert.equal(response.statusCode, 200);
assert.equal(response.headers["content-type"], "application/pdf");
assert.match(response.headers["content-disposition"], /^attachment; filename=".+\.pdf"$/);
assert.equal(response.headers["cache-control"], "no-store");
assert.ok(Buffer.isBuffer(response.body));
assert.equal(response.body.subarray(0, 5).toString("ascii"), "%PDF-");
assert.ok(response.body.length > 1_000, "O endpoint deve devolver um PDF não vazio.");

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const browserGenerator = await readFile(
  new URL("../src/lib/browserPdfGenerator.js", import.meta.url),
  "utf8",
);
const serverGenerator = await readFile(
  new URL("../src/lib/dynamicPdfGenerator.js", import.meta.url),
  "utf8",
);

assert.match(html, /id="adm-pdf-download-links"/);
assert.match(html, /async function assertValidAdmPdfBlob\(blob\)/);
assert.match(html, /const isPdf = \[0x25, 0x50, 0x44, 0x46, 0x2d\]/);
assert.match(html, /links\.appendChild\(link\)/);
assert.doesNotMatch(html, /link\.remove\(\);\s*setTimeout\(\(\) => URL\.revokeObjectURL/);
assert.match(browserGenerator, /new URL\(`\.\.\/\.\.\/modelos\/\$\{nome\}`,\s*import\.meta\.url\)/);
assert.match(browserGenerator, /atualizacaoProcessual: secao/);
assert.match(serverGenerator, /const ASSET_URLS = \{/);
assert.doesNotMatch(serverGenerator, /path\.join\(process\.cwd\(\), "modelos"/);

console.log("Download de documentos: contrato da API, PDF e fallback manual validados.");
