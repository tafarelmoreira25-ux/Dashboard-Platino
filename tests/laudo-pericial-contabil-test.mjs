import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { gerarLaudoPericialContabilPdf } from "../src/lib/dynamicPdf/laudoPericialContabilPdf.js";

const testsDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(testsDir, "..");
const outputDir = join(projectDir, "tmp", "qa-laudo-multiprofissional");
const outputFile = join(outputDir, "laudo-multiprofissional.pdf");

const dados = {
  numeroDocumento: "TESTE-MULTIPERITO-001",
  cliente: "CLIENTE DE TESTE",
  cpf: "000.000.000-00",
  banco: "INSTITUIÇÃO FINANCEIRA DE TESTE",
  cnpjBanco: "00.000.000/0000-00",
  contrato: "CONTRATO-001",
  cidadeEstado: "São Paulo/SP",
  dataContrato: "25/07/2026",
  dataBaseCalculo: "25/07/2026",
  peritosResponsaveis: [
    "VITOR PROFISSIONAL DE TESTE | Contador | CRC UF 000000/O-0 | Perito responsável",
    "SEGUNDO PROFISSIONAL DE TESTE | Contadora | CRC UF 111111/O-1 | Perita revisora | 0000",
  ].join("\n"),
  descricaoBem: "Veículo de teste",
  valorBem: "100.000,00",
  valorEntrada: "20.000,00",
  valorFinanciadoBruto: "80.000,00",
  valorPrestacaoContratual: "2.500,00",
  quantidadeParcelas: "48",
  parcelasPagas: "12",
  taxaJurosMensal: "1,89",
  valorTarifaCadastro: "900,00",
  valorRegistroContrato: "350,00",
  valorAvaliacaoBem: "500,00",
  valorSeguro: "1.200,00",
  valorIof: "1.500,00",
  valorIofAdicional: "300,00",
  metodoCalculo: "Tabela Price - Expurgo das Tarifas",
  multiplicadorRestituicao: "2",
  valorIncontroverso: "70.000,00",
  valorReceber: "8.740,35",
  referenciaBancoCentral: "Operação autorizada pelo Banco Central, conforme referência informada pelo responsável técnico.",
  conclusaoTecnica: "O valor incontroverso apurado é de R$ 70.000,00 e o valor a receber é de R$ 8.740,35, conforme os cálculos apresentados.",
};

const bytes = await gerarLaudoPericialContabilPdf(dados);
const pdf = await PDFDocument.load(bytes);
assert.ok(pdf.getPageCount() >= 3, "O laudo deveria ter pelo menos três páginas.");
assert.ok(bytes.length > 5_000, "O arquivo PDF gerado parece estar vazio.");

const generatorSource = await readFile(
  join(projectDir, "src", "lib", "dynamicPdf", "laudoPericialContabilPdf.js"),
  "utf8",
);
const browserSource = await readFile(
  join(projectDir, "src", "lib", "browserPdfGenerator.js"),
  "utf8",
);
const serverSource = await readFile(
  join(projectDir, "src", "lib", "dynamicPdfGenerator.js"),
  "utf8",
);

assert.doesNotMatch(generatorSource, /DENIS HENRIQUE|298257\/O-2/i);
assert.doesNotMatch(browserSource, /perito-denis-assinatura/i);
assert.doesNotMatch(serverSource, /perito-denis-assinatura/i);

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, bytes);

console.log(`OK: ${pdf.getPageCount()} páginas geradas em ${outputFile}`);
