import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { calcularMotorCdc } from "../src/lib/dynamicPdf/laudoCdcCalculator.js";
import { gerarLaudoPericialContabilPdf } from "../src/lib/dynamicPdf/laudoPericialContabilPdf.js";

const testsDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(testsDir, "..");
const qaDir = join(projectDir, "tmp", "qa-laudo-multiprofissional");
const outputDir = join(projectDir, "output", "pdf");
const qaFile = join(qaDir, "laudo-multiprofissional.pdf");
const outputFile = join(outputDir, "laudo-cdc-validacao.pdf");
const backgroundBytes = await readFile(
  join(projectDir, "modelos", "laudo-cdc-background-a4.png"),
);
const formulaPriceBytes = await readFile(
  join(projectDir, "modelos", "laudo-price-formula.png"),
);

const dados = {
  numeroDocumento: "CDC-VALIDACAO-001",
  data: "30/07/2026",
  cliente: "Carlos Renato Araujo da Cunha",
  cpf: "000.000.000-00",
  banco: "Omni Banco S.A.",
  cnpjBanco: "00.000.000/0000-00",
  contrato: "102290000070226",
  cidadeEstado: "São Paulo/SP",
  dataContrato: "11/07/2026",
  dataBaseCalculo: "30/07/2026",
  peritosResponsaveis: [
    "PROFISSIONAL DE TESTE | Contador | CRC SP 000000/O-0 | Perito responsável",
    "PROFISSIONAL REVISOR | Contadora | CRC SP 111111/O-1 | Perita revisora | 0000",
  ].join("\n"),
  descricaoBem: "Volkswagen Saveiro G4 2007",
  valorBem: "31.961,10",
  valorEntrada: "9.478,00",
  valorFinanciadoBruto: "28.935,62",
  valorPrestacaoContratual: "1.197,96",
  valorPrestacaoRecalculadaReferencia: "980,35",
  quantidadeParcelas: "48",
  parcelasPagas: "0",
  taxaJurosMensal: "3,26",
  valorTarifaCadastro: "1.960,00",
  valorRegistroContrato: "340,17",
  valorAvaliacaoBem: "653,00",
  valorSeguro: "2.699,15",
  valorServicosTerceiros: "0,00",
  valorIof: "800,20",
  valorIofAdicional: "0,00",
  metodoCalculo: "Tabela Price - Expurgo de Tarifas e Serviços",
  multiplicadorRestituicao: "2",
  elementosExaminados: "Contrato de financiamento e quadro-resumo do caso de validação.",
  limitacoesRessalvas: "Valores usados exclusivamente para testar o motor de cálculo.",
};

const calculo = calcularMotorCdc(dados);
assert.equal(calculo.totalTarifas, 5_652.32);
assert.equal(calculo.novoValorFinanciadoPorExpurgo, 23_283.30);
assert.equal(calculo.novoValorFinanciadoPorComposicao, 23_283.30);
assert.equal(calculo.basesConferem, true);
assert.equal(calculo.parcelaIncontroversa, 966.21);
assert.equal(calculo.diferencaMensal, 231.75);
assert.equal(calculo.prejuizoTotalJuros, 11_124.00);
assert.equal(calculo.parcelasPagas, 0);
assert.equal(calculo.diferencaParcelasPagas, 0);
assert.equal(calculo.tarifasRestituicao, 11_304.64);
assert.equal(calculo.jurosRestituicao, 22_248.00);
assert.equal(calculo.jurosPagosRestituicao, 0);
assert.equal(calculo.proveitoEconomicoTotal, 33_552.64);
assert.equal(calculo.divergenciaParcelaReferencia, 14.14);
assert.ok(
  calculo.avisos.some(aviso => /referência.*não coincide/i.test(aviso)),
  "O motor deve alertar quando o valor de um laudo anterior não coincide com a fórmula.",
);

const totalLegado = ((1_197.96 - 980.35) * 48 * 2) + (5_652.32 * 2);
assert.equal(totalLegado, 32_195.20);
assert.notEqual(
  calculo.proveitoEconomicoTotal,
  totalLegado,
  "O motor não pode reproduzir silenciosamente um valor legado incompatível com a fórmula Price.",
);

const divergente = calcularMotorCdc({
  ...dados,
  valorFinanciadoBruto: "29.500,00",
  valorPrestacaoRecalculadaReferencia: "",
});
assert.equal(divergente.basesConferem, false);
assert.ok(divergente.avisos.some(aviso => /duas formas/i.test(aviso)));

assert.throws(
  () => calcularMotorCdc({ ...dados, quantidadeParcelas: "0" }),
  /quantidade de parcelas/i,
);
assert.throws(
  () => calcularMotorCdc({ ...dados, taxaJurosMensal: "-1" }),
  /taxa de juros mensal/i,
);

const bytes = await gerarLaudoPericialContabilPdf(dados, { backgroundBytes, formulaPriceBytes });
const pdf = await PDFDocument.load(bytes);
assert.ok(pdf.getPageCount() >= 6, "O laudo padronizado deveria ter pelo menos seis páginas.");
assert.ok(bytes.length > 100_000, "O arquivo PDF gerado parece não conter o fundo visual.");

await assert.rejects(
  () => gerarLaudoPericialContabilPdf({
    ...dados,
    peritosResponsaveis: "Nome incompleto | Contador",
  }),
  /Responsável técnico 1/i,
);

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
assert.match(generatorSource, /art\. 42, parágrafo único/i);
assert.match(generatorSource, /valor pago em excesso/i);
assert.match(generatorSource, /engano justificável/i);
assert.match(generatorSource, /formulaPriceImage/);
assert.match(browserSource, /laudo-price-formula\.png/);
assert.match(serverSource, /laudo-price-formula\.png/);
assert.doesNotMatch(generatorSource, /Documento gerado pelo sistema interno Platino/i);
assert.doesNotMatch(generatorSource, /Limitações e ressalvas:/i);
assert.doesNotMatch(generatorSource, /Documento sujeito à validação/i);
assert.doesNotMatch(generatorSource, /calculo\.avisos\.forEach/);
assert.doesNotMatch(generatorSource, /pagina\.drawText\("PLATINO"/);
assert.doesNotMatch(generatorSource, /Parcela de referência informada/);
assert.match(generatorSource, /function quadroConclusaoFinanceira/);
assert.match(generatorSource, /SÍNTESE ECONÔMICA DA CONCLUSÃO/);

await Promise.all([
  mkdir(qaDir, { recursive: true }),
  mkdir(outputDir, { recursive: true }),
]);
await Promise.all([
  writeFile(qaFile, bytes),
  writeFile(outputFile, bytes),
]);

console.log(
  `OK: ${pdf.getPageCount()} páginas; Price ${calculo.parcelaIncontroversa.toFixed(2)}; PDF em ${outputFile}`,
);
