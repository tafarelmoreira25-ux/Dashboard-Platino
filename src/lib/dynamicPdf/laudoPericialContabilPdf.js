import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const A4 = [595.28, 841.89];
const MARGEM = 54;
const TOPO = 754;
const BASE = 58;
const LARGURA = A4[0] - MARGEM * 2;
const AZUL = rgb(23 / 255, 54 / 255, 93 / 255);
const CINZA = rgb(95 / 255, 105 / 255, 120 / 255);
const CINZA_CLARO = rgb(0.82, 0.84, 0.87);
const FUNDO = rgb(0.94, 0.96, 0.98);
const PRETO = rgb(0.08, 0.09, 0.11);

function numero(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
    : raw.replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moeda(value) {
  return `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numero(value))}`;
}

function percentual(value) {
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(numero(value))}%`;
}

function texto(value, fallback = "Não informado") {
  return String(value ?? "").trim() || fallback;
}

function normalizarMetodo(value) {
  const method = String(value || "").toUpperCase();
  if (method.includes("SAC")) return "SAC";
  if (method.includes("COMPLETA")) return "PRICE_COMPLETA";
  if (method.includes("SEGURO")) return "PRICE_TARIFAS_SEGUROS";
  return "PRICE_TARIFAS";
}

function parcelaPrice(pv, i, n) {
  return i === 0 ? pv / n : pv * ((i * ((1 + i) ** n)) / (((1 + i) ** n) - 1));
}

function parcelaGauss(pv, i, n) {
  return pv * (1 + (i * n)) / (n * (1 + (i * (n - 1) / 2)));
}

function calcularCenarios(dados) {
  const bruto = numero(dados.valorFinanciadoBruto);
  const cadastro = numero(dados.valorTarifaCadastro);
  const registro = numero(dados.valorRegistroContrato);
  const avaliacao = numero(dados.valorAvaliacaoBem);
  const seguro = numero(dados.valorSeguro) + numero(dados.valorSeguroPrestamista) + numero(dados.valorSeguroBem);
  const tarifas = cadastro + registro + avaliacao;
  const metodo = normalizarMetodo(dados.metodoCalculo);
  const expurgo = metodo === "PRICE_COMPLETA" ? 0 : tarifas + (metodo === "PRICE_TARIFAS_SEGUROS" ? seguro : 0);
  const pv = Math.max(bruto - expurgo, 0);
  const n = Math.max(1, Math.trunc(numero(dados.quantidadeParcelas)));
  const pagas = Math.min(n, Math.max(0, Math.trunc(numero(dados.parcelasPagas))));
  const i = Math.max(0, numero(dados.taxaJurosMensal) / 100);
  const contratual = numero(dados.valorPrestacaoContratual);
  const primeiraSac = (pv / n) + (pv * i);
  const pmt = metodo === "SAC" ? primeiraSac : parcelaPrice(pv, i, n);
  const diferencaMensal = contratual - pmt;
  const diferencaFinanciamento = Math.max(0, bruto - pv);
  const multiplicador = [0, 1, 2].includes(Number(dados.multiplicadorRestituicao))
    ? Number(dados.multiplicadorRestituicao)
    : 0;
  const tarifaDobro = tarifas * multiplicador;
  const devolucaoCompensacao = diferencaMensal * pagas;
  const proveito = (diferencaMensal * n) + tarifaDobro;
  const taxaAnual = numero(dados.taxaJurosAnual) || ((((1 + i) ** 12) - 1) * 100);
  const memoria = [];
  let saldo = pv;
  for (let parcela = 1; parcela <= n; parcela += 1) {
    const juros = saldo * i;
    const amortizacao = metodo === "SAC" ? pv / n : pmt - juros;
    const prestacao = metodo === "SAC" ? amortizacao + juros : pmt;
    const saldoFinal = Math.max(0, saldo - amortizacao);
    memoria.push({ parcela, saldoInicial: saldo, juros, amortizacao, prestacao, saldoFinal });
    saldo = saldoFinal;
  }
  return {
    bruto, tarifas, seguro, pv, n, pagas, i, metodo, pmt, contratual, diferencaMensal,
    diferencaFinanciamento, tarifaDobro, devolucaoCompensacao, proveito, taxaAnual, memoria,
  };
}

function quebrar(text, font, size, width) {
  const words = texto(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function cabecalhoRodape(ctx, page) {
  const { normal, bold } = ctx.fonts;
  page.drawText("PLATINO", { x: MARGEM, y: 807, size: 9, font: bold, color: AZUL });
  page.drawText("SOLUÇÕES FINANCEIRAS", { x: MARGEM + 44, y: 807, size: 7.5, font: normal, color: AZUL });
  const title = "LAUDO PERICIAL CONTÁBIL";
  page.drawText(title, { x: A4[0] - MARGEM - bold.widthOfTextAtSize(title, 8.2), y: 807, size: 8.2, font: bold, color: AZUL });
  page.drawLine({ start: { x: MARGEM, y: 795 }, end: { x: A4[0] - MARGEM, y: 795 }, thickness: 1.2, color: AZUL });
  page.drawLine({ start: { x: MARGEM, y: 45 }, end: { x: A4[0] - MARGEM, y: 45 }, thickness: 0.6, color: CINZA_CLARO });
  const footer = [
    "Rua Fontoura Xavier, nº 1308 - Itaquera - São Paulo/SP - CEP: 08295-300",
    "E-mail: platinoassessoriafinanceira@gmail.com",
  ];
  footer.forEach((line, index) => page.drawText(line, {
    x: (A4[0] - normal.widthOfTextAtSize(line, 7.5)) / 2,
    y: index ? 20 : 31, size: 7.5, font: normal, color: CINZA,
  }));
}

function novaPagina(ctx) {
  ctx.page = ctx.pdf.addPage(A4);
  cabecalhoRodape(ctx, ctx.page);
  ctx.y = TOPO;
}

function garantir(ctx, height) {
  if (ctx.y - height < BASE) novaPagina(ctx);
}

function titulo(ctx, value) {
  garantir(ctx, 35);
  const content = texto(value).toUpperCase();
  ctx.page.drawText(content, { x: MARGEM, y: ctx.y, size: 10, font: ctx.fonts.bold, color: AZUL });
  ctx.y -= 7;
  ctx.page.drawLine({ start: { x: MARGEM, y: ctx.y }, end: { x: A4[0] - MARGEM, y: ctx.y }, thickness: 0.9, color: AZUL });
  ctx.y -= 16;
}

function paragrafo(ctx, value, options = {}) {
  const size = options.size || 9.8;
  const lineHeight = options.lineHeight || 13;
  const lines = quebrar(value, options.bold ? ctx.fonts.bold : ctx.fonts.normal, size, options.width || LARGURA);
  garantir(ctx, lines.length * lineHeight + 8);
  for (const line of lines) {
    ctx.page.drawText(line, { x: options.x || MARGEM, y: ctx.y, size, font: options.bold ? ctx.fonts.bold : ctx.fonts.normal, color: PRETO });
    ctx.y -= lineHeight;
  }
  ctx.y -= options.after ?? 5;
}

function tabela(ctx, rows, options = {}) {
  const labelWidth = options.labelWidth || 265;
  const valueWidth = LARGURA - labelWidth;
  const size = options.size || 8.7;
  for (const [label, rawValue] of rows) {
    const value = texto(rawValue);
    const labelLines = quebrar(label, ctx.fonts.bold, size, labelWidth - 14);
    const valueLines = quebrar(value, ctx.fonts.normal, size, valueWidth - 14);
    const height = Math.max(24, Math.max(labelLines.length, valueLines.length) * 11 + 10);
    garantir(ctx, height);
    const yBottom = ctx.y - height;
    ctx.page.drawRectangle({ x: MARGEM, y: yBottom, width: labelWidth, height, color: FUNDO });
    ctx.page.drawRectangle({ x: MARGEM, y: yBottom, width: LARGURA, height, borderWidth: 0.55, borderColor: CINZA_CLARO });
    ctx.page.drawLine({ start: { x: MARGEM + labelWidth, y: ctx.y }, end: { x: MARGEM + labelWidth, y: yBottom }, thickness: 0.55, color: CINZA_CLARO });
    labelLines.forEach((line, index) => ctx.page.drawText(line, { x: MARGEM + 7, y: ctx.y - 15 - index * 11, size, font: ctx.fonts.bold, color: AZUL }));
    valueLines.forEach((line, index) => ctx.page.drawText(line, { x: MARGEM + labelWidth + 7, y: ctx.y - 15 - index * 11, size, font: ctx.fonts.normal, color: PRETO }));
    ctx.y = yBottom;
  }
  ctx.y -= 14;
}

function nomeMetodo(method) {
  return {
    PRICE_TARIFAS: "Tabela Price - Expurgo das Tarifas",
    PRICE_TARIFAS_SEGUROS: "Tabela Price - Expurgo das Tarifas e Seguros",
    PRICE_COMPLETA: "Tabela Price Completa",
    SAC: "Sistema SAC",
  }[method];
}

export async function gerarLaudoPericialContabilPdf(dados = {}) {
  const calc = calcularCenarios(dados);
  const pdf = await PDFDocument.create();
  const ctx = {
    pdf,
    fonts: {
      normal: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    },
    page: null,
    y: TOPO,
  };
  novaPagina(ctx);

  paragrafo(ctx, "LAUDO PERICIAL CONTÁBIL", { size: 15, bold: true, after: 2 });
  paragrafo(ctx, `Financiamento de veículo • Documento nº ${texto(dados.numeroDocumento)}`, { size: 9, after: 15 });
  titulo(ctx, "1. Identificação");
  tabela(ctx, [
    ["Cliente", dados.cliente],
    ["CPF", dados.cpf],
    ["Instituição financeira", dados.banco],
    ["CNPJ", dados.cnpjBanco],
    ["Contrato", dados.contrato],
    ["Cidade", dados.cidadeEstado],
    ["Data-base", dados.dataBaseCalculo],
  ]);

  titulo(ctx, "2. Objeto e metodologia");
  paragrafo(ctx, `Objeto: ${texto(dados.objetoContrato, "Análise técnica do contrato de financiamento de veículo informado, com recálculo das prestações e apuração das diferenças econômicas.")}`);
  paragrafo(ctx, `Método empregado: ${nomeMetodo(calc.metodo)}. Os cálculos consideram os valores fornecidos no contrato e precisão interna, com apresentação monetária em duas casas decimais.`);

  titulo(ctx, "3. Resumo técnico");
  tabela(ctx, [
    ["Objeto do Contrato", texto(dados.objetoContrato, "Financiamento de veículo")],
    ["Nº do Contrato", dados.contrato],
    ["Data do Contrato", dados.dataContrato],
    ["Veículo / Marca", texto(dados.descricaoBem || [dados.veiculo, dados.marca, dados.modelo, dados.ano].filter(Boolean).join(" "))],
    ["Parcela Controversa", moeda(dados.parcelaControversa || calc.diferencaMensal)],
    ["Parcela Incontroversa", moeda(dados.parcelaIncontroversa || calc.pmt)],
    ["Valor do Veículo", moeda(dados.valorBem)],
    ["Valor da Entrada", moeda(dados.valorEntrada)],
    ["IOF", moeda(dados.valorIof)],
    ["IOF Adicional", moeda(dados.valorIofAdicional)],
    ["Valor Financiado", moeda(calc.bruto)],
    ["Taxa de Juros do Contrato (A.M.)", percentual(dados.taxaJurosMensal)],
    ["Taxa de Juros do Contrato (A.A.)", percentual(calc.taxaAnual)],
    ["Taxa Aplicada pela Instituição Financeira", percentual(dados.taxaAplicadaInstituicao || dados.taxaJurosMensal)],
    ["Seguro", moeda(calc.seguro)],
    ["Registro de Contrato", moeda(dados.valorRegistroContrato)],
    ["Tarifa de Cadastro", moeda(dados.valorTarifaCadastro)],
    ["Tarifa de Avaliação", moeda(dados.valorAvaliacaoBem)],
    ["Total", moeda(dados.valorTotal || calc.contratual * calc.n)],
    ["Prestação Contratual", moeda(calc.contratual)],
    ["Nº de Prestação", String(calc.n)],
    ["Prestação Recalculada", moeda(calc.pmt)],
    ["Diferença Entre Prestação", moeda(calc.diferencaMensal)],
    ["Diferença a Mais no Financiamento", moeda(calc.diferencaFinanciamento)],
    ["Tarifa a Devolver em Dobro", moeda(calc.tarifaDobro)],
    ["A Mais no Recálculo (Devolução / Compensação)", moeda(calc.devolucaoCompensacao)],
    ["Total Final (Proveito Econômico)", moeda(calc.proveito)],
  ]);

  titulo(ctx, "4. Memória de cálculo");
  tabela(ctx, [
    ["Principal considerado", moeda(calc.pv)],
    ["Método", nomeMetodo(calc.metodo)],
    ["Quantidade de parcelas", String(calc.n)],
    ["Parcelas pagas", String(calc.pagas)],
    ["Taxa mensal", percentual(calc.i * 100)],
  ]);
  const sample = calc.memoria.slice(0, Math.min(calc.memoria.length, 12));
  tabela(ctx, sample.map(row => [
    `Parcela ${row.parcela}`,
    `Saldo ${moeda(row.saldoInicial)} | Juros ${moeda(row.juros)} | Amortização ${moeda(row.amortizacao)} | Prestação ${moeda(row.prestacao)}`,
  ]), { labelWidth: 90, size: 7.8 });
  if (calc.memoria.length > sample.length) {
    paragrafo(ctx, `A memória completa contempla ${calc.memoria.length} parcelas. O quadro apresenta as 12 primeiras para conferência objetiva.`, { size: 8.5 });
  }

  titulo(ctx, "5. Conclusão");
  paragrafo(ctx, `A prestação recalculada é de ${moeda(calc.pmt)}, resultando em diferença de ${moeda(calc.diferencaMensal)} por prestação e proveito econômico total estimado de ${moeda(calc.proveito)}.`);
  if (texto(dados.justificativaRestituicao, "")) paragrafo(ctx, `Justificativa: ${dados.justificativaRestituicao}`);
  ctx.y -= 25;
  garantir(ctx, 70);
  const signature = "DENIS HENRIQUE DA SILVA";
  const role = "Perito Contador • CRC SP 298257/O-2";
  ctx.page.drawLine({ start: { x: 170, y: ctx.y }, end: { x: A4[0] - 170, y: ctx.y }, thickness: 0.7, color: PRETO });
  ctx.page.drawText(signature, { x: (A4[0] - ctx.fonts.bold.widthOfTextAtSize(signature, 9)) / 2, y: ctx.y - 17, size: 9, font: ctx.fonts.bold, color: PRETO });
  ctx.page.drawText(role, { x: (A4[0] - ctx.fonts.normal.widthOfTextAtSize(role, 8)) / 2, y: ctx.y - 31, size: 8, font: ctx.fonts.normal, color: CINZA });
  return pdf.save();
}

export { calcularCenarios, parcelaPrice, parcelaGauss, normalizarMetodo };
