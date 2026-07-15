import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const A4 = [595.28, 841.89];
const A4_LANDSCAPE = [841.89, 595.28];
const AZUL = rgb(0.07, 0.20, 0.43);
const AZUL_CLARO = rgb(0.90, 0.94, 0.98);
const CINZA = rgb(0.35, 0.39, 0.45);
const BORDA = rgb(0.72, 0.76, 0.82);

function numero(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
    : raw.replace(/[^\d.-]/g, "");
  const result = Number.parseFloat(normalized);
  return Number.isFinite(result) ? result : 0;
}

function moeda(value) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numero(value));
}

function percentual(value) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(numero(value));
}

function texto(value, fallback = "Não identificado") {
  return String(value ?? "").trim() || fallback;
}

function calcularCenarios(dados) {
  const bruto = numero(dados.valorFinanciadoBruto);
  const tarifas = [dados.valorSeguroPrestamista, dados.valorSeguroBem, dados.valorTarifaCadastro, dados.valorRegistroContrato, dados.valorAvaliacaoBem]
    .reduce((sum, item) => sum + numero(item), 0);
  const pv = Math.max(bruto - tarifas, 0);
  const n = Math.max(1, Math.trunc(numero(dados.quantidadeParcelas)));
  const pagas = Math.min(n, Math.max(0, Math.trunc(numero(dados.parcelasPagas))));
  const i = Math.max(0, numero(dados.taxaJurosMensal) / 100);
  const metodo = String(dados.metodoCalculo || "Tabela Price").toUpperCase().includes("MAJS") ? "MAJS" : "PRICE";
  const pmtPrice = i === 0 ? pv / n : pv * ((i * ((1 + i) ** n)) / (((1 + i) ** n) - 1));
  const amortMajs = pv / n;
  const jurosMajs = pv * i;
  const pmtMajs = amortMajs + jurosMajs;
  const pmt = metodo === "MAJS" ? pmtMajs : pmtPrice;
  const contratual = numero(dados.valorPrestacaoContratual);
  const diferencaMensal = contratual - pmt;
  const estornoPagas = diferencaMensal * pagas;
  const tarifasDobro = tarifas * 2;
  const proveito = (diferencaMensal * n) + tarifasDobro;
  const taxaAnual = (((1 + i) ** 12) - 1) * 100;
  const memoria = [];
  let saldoContrato = bruto;
  let saldoRecalculo = pv;
  for (let parcela = 1; parcela <= n; parcela += 1) {
    const jurosContrato = saldoContrato * i;
    const amortContrato = contratual - jurosContrato;
    const finalContrato = Math.max(0, saldoContrato - amortContrato);
    const jurosRecalculo = metodo === "MAJS" ? jurosMajs : saldoRecalculo * i;
    const amortRecalculo = metodo === "MAJS" ? amortMajs : pmt - jurosRecalculo;
    const finalRecalculo = Math.max(0, saldoRecalculo - amortRecalculo);
    memoria.push({ parcela, saldoContrato, jurosContrato, amortContrato, contratual, finalContrato, saldoRecalculo, jurosRecalculo, amortRecalculo, pmt, finalRecalculo });
    saldoContrato = finalContrato;
    saldoRecalculo = finalRecalculo;
  }
  return { bruto, tarifas, pv, n, pagas, i, metodo, pmt, contratual, diferencaMensal, estornoPagas, tarifasDobro, proveito, taxaAnual, memoria };
}

function quebrar(text, font, size, width) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function cabecalho(ctx, titulo = "LAUDO PERICIAL CONTÁBIL") {
  const { page, fonts } = ctx;
  page.drawRectangle({ x: 0, y: page.getHeight() - 48, width: page.getWidth(), height: 48, color: AZUL });
  page.drawText(titulo, { x: 36, y: page.getHeight() - 30, size: 12, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText("PERÍCIAS & PARECERES", { x: page.getWidth() - 170, y: page.getHeight() - 30, size: 8, font: fonts.bold, color: rgb(1, 1, 1) });
  ctx.y = page.getHeight() - 75;
}

function rodape(ctx) {
  const { page, fonts, pageNumber } = ctx;
  page.drawLine({ start: { x: 36, y: 28 }, end: { x: page.getWidth() - 36, y: 28 }, thickness: 0.5, color: BORDA });
  page.drawText("Documento técnico de uso restrito", { x: 36, y: 16, size: 7, font: fonts.normal, color: CINZA });
  page.drawText(`Página ${pageNumber}`, { x: page.getWidth() - 70, y: 16, size: 7, font: fonts.normal, color: CINZA });
}

function novaPagina(ctx, landscape = false, title) {
  if (ctx.page) rodape(ctx);
  ctx.page = ctx.pdf.addPage(landscape ? A4_LANDSCAPE : A4);
  ctx.pageNumber += 1;
  cabecalho(ctx, title);
}

function garantir(ctx, needed, landscape = false, title) {
  if (ctx.y - needed < 45) novaPagina(ctx, landscape, title);
}

function titulo(ctx, value) {
  garantir(ctx, 42);
  ctx.page.drawText(value, { x: 42, y: ctx.y, size: 17, font: ctx.fonts.bold, color: AZUL });
  ctx.page.drawLine({ start: { x: 42, y: ctx.y - 8 }, end: { x: ctx.page.getWidth() - 42, y: ctx.y - 8 }, thickness: 1.2, color: AZUL });
  ctx.y -= 34;
}

function paragrafo(ctx, value, options = {}) {
  const size = options.size || 9.5;
  const width = options.width || ctx.page.getWidth() - 84;
  const lines = quebrar(value, options.bold ? ctx.fonts.bold : ctx.fonts.normal, size, width);
  garantir(ctx, lines.length * (size + 3) + 10);
  for (const line of lines) {
    ctx.page.drawText(line, { x: options.x || 42, y: ctx.y, size, font: options.bold ? ctx.fonts.bold : ctx.fonts.normal, color: options.color || rgb(0.08, 0.10, 0.14) });
    ctx.y -= size + 3;
  }
  ctx.y -= options.after ?? 8;
}

function tabela(ctx, rows, widths, options = {}) {
  const x = options.x || 42;
  const size = options.size || 8;
  const rowHeight = options.rowHeight || 22;
  rows.forEach((row, rowIndex) => {
    garantir(ctx, rowHeight + 5, options.landscape, options.title);
    let cx = x;
    row.forEach((cell, colIndex) => {
      const width = widths[colIndex];
      ctx.page.drawRectangle({ x: cx, y: ctx.y - rowHeight + 5, width, height: rowHeight, borderWidth: 0.55, borderColor: BORDA, color: rowIndex === 0 ? AZUL_CLARO : rgb(1, 1, 1) });
      const font = rowIndex === 0 ? ctx.fonts.bold : ctx.fonts.normal;
      const lines = quebrar(String(cell ?? ""), font, size, width - 8).slice(0, 2);
      lines.forEach((line, li) => ctx.page.drawText(line, { x: cx + 4, y: ctx.y - 7 - (li * (size + 1)), size, font, color: rowIndex === 0 ? AZUL : rgb(0.08, 0.10, 0.14) }));
      cx += width;
    });
    ctx.y -= rowHeight;
  });
  ctx.y -= 12;
}

export async function gerarLaudoPericialContabilPdf(dados = {}, assets = {}) {
  const aprovado = String(dados.validacaoPerito || "").toUpperCase().includes("APROVADO");
  const loginValidador = String(dados.loginValidador || "").trim().toLowerCase();
  if (loginValidador !== "administrativo@platino.com") {
    throw new Error("Somente o login administrativo@platino.com pode validar e gerar o laudo final.");
  }
  if (!aprovado) {
    throw new Error("O laudo precisa estar aprovado pelo perito antes da geração e do download do PDF final.");
  }
  const calc = calcularCenarios(dados);
  const pdf = await PDFDocument.create();
  const fonts = { normal: await pdf.embedFont(StandardFonts.TimesRoman), bold: await pdf.embedFont(StandardFonts.TimesRomanBold) };
  const ctx = { pdf, fonts, page: null, pageNumber: 0, y: 0 };

  novaPagina(ctx);
  ctx.y = 680;
  paragrafo(ctx, "LAUDO PERICIAL CONTÁBIL", { size: 24, bold: true, color: AZUL, after: 4 });
  paragrafo(ctx, "ANÁLISE DE CONTRATO BANCÁRIO", { size: 14, bold: true, after: 35 });
  paragrafo(ctx, texto(dados.cliente), { size: 17, bold: true, after: 5 });
  paragrafo(ctx, `${texto(dados.banco)}  •  Contrato nº ${texto(dados.contrato)}`, { size: 11, after: 35 });
  tabela(ctx, [["CONTROLE", "INFORMAÇÃO"], ["Registro pericial", texto(dados.numeroDocumento)], ["Data de emissão", texto(dados.dataEmissao)], ["Local", texto(dados.cidadeEstado)], ["Status", "Documento técnico de uso restrito"]], [150, 360]);

  novaPagina(ctx);
  titulo(ctx, "FOLHA DE ROSTO");
  tabela(ctx, [["CONTROLE", "INFORMAÇÃO"], ["Contratante / interessado", `${texto(dados.cliente)} — CPF/CNPJ ${texto(dados.cpf)}`], ["Objeto examinado", `Contrato de financiamento nº ${texto(dados.contrato)}`], ["Instituição financeira", `${texto(dados.banco)} — CNPJ ${texto(dados.cnpjBanco)}`], ["Período-base", `${texto(dados.dataContrato)} a ${texto(dados.dataBaseCalculo)}`], ["Natureza", "Laudo pericial contábil extrajudicial"]], [165, 345]);
  titulo(ctx, "Profissional responsável");
  tabela(ctx, [["Nome", "Denis Henrique da Silva"], ["Qualificação", "Perito Contador"], ["Registro", "CRC SP 298257/O-2"], ["Especialidade", "Perícia contábil e contratos bancários"]], [165, 345]);

  novaPagina(ctx);
  titulo(ctx, "VISÃO GERAL");
  paragrafo(ctx, "O presente laudo reúne a identificação da operação, as premissas técnicas, os critérios de cálculo e a síntese dos resultados apurados no contrato indicado.");
  tabela(ctx, [["INDICADOR", "RESULTADO"], ["Valor financiado bruto", `R$ ${moeda(calc.bruto)}`], ["Tarifas e seguros expurgados", `R$ ${moeda(calc.tarifas)}`], ["Valor financiado líquido (PV)", `R$ ${moeda(calc.pv)}`], ["Taxa contratual", `${percentual(numero(dados.taxaJurosMensal))}% a.m. | ${percentual(calc.taxaAnual)}% a.a.`], ["Sistema comparativo", calc.metodo === "MAJS" ? "Método MAJS — juros simples" : "Tabela Price — expurgo de tarifas"], ["Prestação contratual", `R$ ${moeda(calc.contratual)}`], ["Prestação recalculada", `R$ ${moeda(calc.pmt)}`], ["Proveito econômico estimado", `R$ ${moeda(calc.proveito)}`]], [240, 270]);

  novaPagina(ctx);
  titulo(ctx, "DADOS DO CONTRATO E COMPOSIÇÃO DA OPERAÇÃO");
  tabela(ctx, [["DADO CONTRATUAL", "INFORMAÇÃO"], ["Bem financiado", texto(dados.descricaoBem)], ["Valor do bem", `R$ ${moeda(dados.valorBem)}`], ["Entrada", `R$ ${moeda(dados.valorEntrada)}`], ["Valor financiado bruto", `R$ ${moeda(calc.bruto)}`], ["Valor financiado líquido", `R$ ${moeda(calc.pv)}`], ["Data da contratação", texto(dados.dataContrato)], ["Quantidade de parcelas", calc.n], ["Parcelas pagas", calc.pagas], ["Prestação contratual", `R$ ${moeda(calc.contratual)}`]], [235, 275]);
  titulo(ctx, "Encargos, tarifas e serviços");
  tabela(ctx, [["RUBRICA", "VALOR"], ["Tarifa de cadastro", `R$ ${moeda(dados.valorTarifaCadastro)}`], ["Registro de contrato", `R$ ${moeda(dados.valorRegistroContrato)}`], ["Avaliação do bem", `R$ ${moeda(dados.valorAvaliacaoBem)}`], ["Seguro prestamista", `R$ ${moeda(dados.valorSeguroPrestamista)}`], ["Seguro do bem", `R$ ${moeda(dados.valorSeguroBem)}`], ["TOTAL", `R$ ${moeda(calc.tarifas)}`]], [300, 210]);

  novaPagina(ctx);
  titulo(ctx, "METODOLOGIA E PREMISSAS DE CÁLCULO");
  paragrafo(ctx, `O valor financiado líquido foi apurado mediante o expurgo das tarifas e seguros informados: PV = valor financiado bruto - tarifas e seguros. O cenário selecionado foi ${calc.metodo === "MAJS" ? "o Método MAJS, com juros simples e amortização constante" : "a Tabela Price, mantendo juros compostos e recalculando a prestação sobre o valor líquido"}.`);
  if (calc.metodo === "MAJS") paragrafo(ctx, "Fórmula: PM = PV / n + (PV × i). Amortização constante = PV / n. Juros simples = PV × i.", { bold: true });
  else paragrafo(ctx, "Fórmula: PMT = PV × [i × (1+i)^n] / [(1+i)^n - 1]. Juros = saldo anterior × i. Amortização = PMT - juros.", { bold: true });
  tabela(ctx, [["PREMISSA", "PARÂMETRO"], ["Data-base", texto(dados.dataBaseCalculo)], ["Principal considerado", `R$ ${moeda(calc.pv)}`], ["Taxa mensal", `${percentual(numero(dados.taxaJurosMensal))}%`], ["Quantidade de períodos", calc.n], ["Arredondamento", "Precisão interna; duas casas decimais apenas na apresentação"], ["Pagamentos realizados", `${calc.pagas} parcelas informadas`]], [240, 270]);

  novaPagina(ctx);
  titulo(ctx, "ANÁLISES COMPARATIVAS E RESULTADOS");
  tabela(ctx, [["RESULTADO", "VALOR APURADO"], ["Diferença mensal", `R$ ${moeda(calc.diferencaMensal)}`], ["Estorno das parcelas pagas", `R$ ${moeda(calc.estornoPagas)}`], ["Tarifas a devolver em dobro", `R$ ${moeda(calc.tarifasDobro)}`], ["Diferença projetada até o final", `R$ ${moeda(calc.diferencaMensal * calc.n)}`], ["Proveito econômico total", `R$ ${moeda(calc.proveito)}`]], [300, 210]);
  paragrafo(ctx, `A prestação recalculada é de R$ ${moeda(calc.pmt)}, comparada à prestação contratual de R$ ${moeda(calc.contratual)}, resultando em diferença mensal estimada de R$ ${moeda(calc.diferencaMensal)}.`, { size: 11, bold: true });

  novaPagina(ctx);
  titulo(ctx, "CONCLUSÃO TÉCNICA");
  paragrafo(ctx, `Com base nos parâmetros informados e no cenário ${calc.metodo === "MAJS" ? "MAJS" : "Tabela Price"}, o valor financiado líquido considerado foi de R$ ${moeda(calc.pv)}. A prestação recalculada alcançou R$ ${moeda(calc.pmt)}, com proveito econômico técnico estimado em R$ ${moeda(calc.proveito)}.`);
  paragrafo(ctx, "Os resultados estão vinculados aos dados fornecidos. Alterações de taxa, datas, pagamentos, encargos ou documentos produzem resultados distintos e exigem nova emissão do laudo.");
  tabela(ctx, [["VALIDAÇÃO PERICIAL", "REGISTRO"], ["Status", "APROVADO PELO PERITO"], ["Perito responsável", "Denis Henrique da Silva — CRC SP 298257/O-2"], ["Login que realizou a validação", loginValidador], ["Data da validação", texto(dados.dataValidacao)], ["Código de validação", texto(dados.codigoValidacao)]], [190, 320]);
  ctx.y -= 25;
  const incluirAssinatura = String(dados.incluirAssinatura || "").toUpperCase().includes("SIM");
  if (incluirAssinatura && assets.assinaturaBytes) {
    const assinatura = await pdf.embedPng(assets.assinaturaBytes);
    const scale = Math.min(1, 250 / assinatura.width, 92 / assinatura.height);
    const width = assinatura.width * scale;
    const height = assinatura.height * scale;
    garantir(ctx, height + 32);
    ctx.page.drawImage(assinatura, { x: 42, y: ctx.y - height, width, height });
    ctx.y -= height + 8;
    paragrafo(ctx, "Assinatura eletrônica visual incluída após aprovação do perito.", { size: 7.5, color: CINZA, after: 5 });
  } else {
    paragrafo(ctx, "DENIS HENRIQUE DA SILVA", { size: 13, bold: true, after: 2 });
    paragrafo(ctx, "Perito Contador — CRC SP 298257/O-2", { size: 11, bold: true });
  }
  paragrafo(ctx, "O profissional está habilitado para prestar serviços contábeis de acordo com os arts. 25 e 26 do Decreto-Lei nº 9.295/46.", { size: 8 });

  novaPagina(ctx, true, "ANEXO I — MEMÓRIA DE CÁLCULO ANALÍTICA");
  const header = ["Nº", "Saldo inicial contrato", "Juros", "Amort.", "Prestação", "Saldo inicial recálculo", "Juros", "Amort.", "Prestação", "Saldo final recálculo"];
  const widths = [28, 90, 58, 58, 68, 100, 58, 58, 68, 90];
  const drawMemoryHeader = () => tabela(ctx, [header], widths, { x: 31, size: 6.6, rowHeight: 28, landscape: true, title: "ANEXO I — MEMÓRIA DE CÁLCULO ANALÍTICA" });
  drawMemoryHeader();
  for (const item of calc.memoria) {
    if (ctx.y - 19 < 45) { novaPagina(ctx, true, "ANEXO I — MEMÓRIA DE CÁLCULO ANALÍTICA"); drawMemoryHeader(); }
    tabela(ctx, [[item.parcela, moeda(item.saldoContrato), moeda(item.jurosContrato), moeda(item.amortContrato), moeda(item.contratual), moeda(item.saldoRecalculo), moeda(item.jurosRecalculo), moeda(item.amortRecalculo), moeda(item.pmt), moeda(item.finalRecalculo)]], widths, { x: 31, size: 6.5, rowHeight: 17, landscape: true, title: "ANEXO I — MEMÓRIA DE CÁLCULO ANALÍTICA" });
    ctx.y += 12;
  }

  rodape(ctx);
  return pdf.save();
}

export { calcularCenarios };
