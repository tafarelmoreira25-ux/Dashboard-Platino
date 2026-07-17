import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  const pmt = metodo === "MAJS" ? amortMajs + jurosMajs : pmtPrice;
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

async function carregarModelo() {
  const baseUrl = new URL("../../../modelos-originais/laudo-pericial-contabil-layout.pdf", import.meta.url);
  const camposUrl = new URL("./laudoPericialContabilCampos.json", import.meta.url);
  const [baseResponse, camposResponse] = await Promise.all([fetch(baseUrl), fetch(camposUrl)]);
  if (!baseResponse.ok || !camposResponse.ok) throw new Error("O modelo fiel do laudo não pôde ser carregado.");
  return { bytes: await baseResponse.arrayBuffer(), campos: await camposResponse.json() };
}

function valoresDoModelo(dados, calc) {
  const taxaMensal = numero(dados.taxaJurosMensal);
  const sistema = calc.metodo === "MAJS" ? "Método MAJS - juros simples" : "Tabela Price - expurgo de tarifas";
  const conclusao = `A prestação recalculada é de R$ ${moeda(calc.pmt)}, com diferença mensal de R$ ${moeda(calc.diferencaMensal)} e proveito econômico estimado de R$ ${moeda(calc.proveito)}.`;
  const naoIdentificado = "Não identificado";
  return {
    NUMERO_DOCUMENTO_PERICIAL: texto(dados.numeroDocumento), VERSAO_DOCUMENTO: "1.0",
    DATA_EMISSAO: texto(dados.dataEmissao), CIDADE_UF_EMISSAO: texto(dados.cidadeEstado, "São Paulo/SP"),
    NOME_CLIENTE: texto(dados.cliente), CPF_CNPJ_CLIENTE: texto(dados.cpf),
    INSTITUICAO_FINANCEIRA: texto(dados.banco), CNPJ_INSTITUICAO: texto(dados.cnpjBanco),
    NUMERO_CONTRATO: texto(dados.contrato), DATA_CONTRATO: texto(dados.dataContrato),
    DATA_BASE_CALCULO: texto(dados.dataBaseCalculo), STATUS_DOCUMENTO: "APROVADO PELO PERITO",
    NOME_PROFISSIONAL: "Denis Henrique da Silva", TITULO_PROFISSIONAL: "Perito Contador",
    CONSELHO_UF_NUMERO: "CRC SP 298257/O-2", ESPECIALIDADE_PROFISSIONAL: "Perícia contábil e contratos bancários",
    DOCUMENTO_PROFISSIONAL: texto(dados.documentoProfissional, naoIdentificado), DATA_ASSINATURA: texto(dados.dataValidacao),
    VALOR_FINANCIADO_CONSIDERADO: moeda(calc.pv), TAXA_JUROS_MENSAL: percentual(taxaMensal),
    TAXA_JUROS_ANUAL: percentual(calc.taxaAnual), CET_MENSAL: texto(dados.cetMensal, naoIdentificado),
    CET_ANUAL: texto(dados.cetAnual, naoIdentificado), SISTEMA_AMORTIZACAO: sistema,
    VALOR_PRESTACAO_CONTRATUAL: moeda(calc.contratual), VALOR_PRESTACAO_RECALCULADA: moeda(calc.pmt),
    DIFERENCA_ECONOMICA_TOTAL: moeda(calc.proveito), RESUMO_CONCLUSAO_TECNICA: conclusao,
    QUESITO_01: "Qual o valor financiado líquido após o expurgo das tarifas?", RESPOSTA_QUESITO_01: `R$ ${moeda(calc.pv)}.`,
    QUESITO_02: "Qual o valor da prestação recalculada?", RESPOSTA_QUESITO_02: `R$ ${moeda(calc.pmt)} pelo critério ${sistema}.`,
    QUESITO_03: "Qual o proveito econômico técnico estimado?", RESPOSTA_QUESITO_03: `R$ ${moeda(calc.proveito)}.`,
    IDENTIFICACAO_CONTRATO: texto(dados.contrato), STATUS_CONTRATO: "Documento informado",
    IDENTIFICACAO_CET: texto(dados.identificacaoCet, naoIdentificado), STATUS_CET: texto(dados.statusCet, "Não informado"),
    IDENTIFICACAO_PARCELAS: `${calc.n} parcelas`, STATUS_PARCELAS: "Informado",
    PERIODO_COMPROVANTES: `${calc.pagas} parcelas pagas`, STATUS_COMPROVANTES: calc.pagas ? "Informado" : "Não informado",
    DATA_EXTRATO_SALDO: texto(dados.dataBaseCalculo), STATUS_EXTRATO_SALDO: texto(dados.statusExtrato, "Não informado"),
    OUTROS_DOCUMENTOS: texto(dados.outrosDocumentos, "Não aplicável"), STATUS_OUTROS_DOCUMENTOS: texto(dados.statusOutrosDocumentos, "Não aplicável"),
    LIMITACOES_E_RESSALVAS: "Resultados vinculados aos dados e documentos fornecidos para elaboração do laudo.",
    TIPO_OPERACAO: "Financiamento de veículo", DESCRICAO_BEM: texto(dados.descricaoBem), VALOR_BEM: moeda(dados.valorBem),
    VALOR_ENTRADA: moeda(dados.valorEntrada), VALOR_FINANCIADO_BRUTO: moeda(calc.bruto), VALOR_FINANCIADO_LIQUIDO: moeda(calc.pv),
    DATA_PRIMEIRO_VENCIMENTO: texto(dados.dataPrimeiroVencimento), QUANTIDADE_PARCELAS: String(calc.n),
    PERIODICIDADE_PARCELAS: "Mensal", TOTAL_CONTRATUAL_PROJETADO: moeda(calc.contratual * calc.n),
    CRITERIO_IOF: texto(dados.criterioIof, "Conforme contrato"), VALOR_IOF: moeda(dados.valorIof),
    CRITERIO_TARIFA_CADASTRO: "Expurgo", VALOR_TARIFA_CADASTRO: moeda(dados.valorTarifaCadastro),
    CRITERIO_REGISTRO: "Expurgo", VALOR_REGISTRO_CONTRATO: moeda(dados.valorRegistroContrato),
    CRITERIO_AVALIACAO: "Expurgo", VALOR_AVALIACAO_BEM: moeda(dados.valorAvaliacaoBem),
    CRITERIO_SEGURO_PRESTAMISTA: "Expurgo", VALOR_SEGURO_PRESTAMISTA: moeda(dados.valorSeguroPrestamista),
    CRITERIO_SEGURO_BEM: "Expurgo", VALOR_SEGURO_BEM: moeda(dados.valorSeguroBem),
    CRITERIO_OUTROS_ENCARGOS: "Não aplicável", VALOR_OUTROS_ENCARGOS: "0,00", TOTAL_TARIFAS_E_SERVICOS: moeda(calc.tarifas),
    DESCRICAO_CENARIO_RECALCULO: sistema, PRINCIPAL_CONSIDERADO: moeda(calc.pv),
    TAXA_CENARIO_CONTRATADO: `${percentual(taxaMensal)}% a.m.`, TAXA_CENARIO_RECALCULADO: `${percentual(taxaMensal)}% a.m.`,
    SISTEMA_AMORTIZACAO_CONTRATADO: "Tabela Price", SISTEMA_AMORTIZACAO_RECALCULADO: sistema,
    CONVENCAO_PERIODOS: "Períodos mensais", CRITERIO_ARREDONDAMENTO: "Precisão interna e apresentação em 2 casas",
    TRATAMENTO_TARIFAS: "Expurgo das tarifas e seguros informados", TRATAMENTO_PAGAMENTOS: `${calc.pagas} parcelas consideradas`,
    FORMULA_CENARIO_CONTRATADO: "PMT = PV x [i x (1+i)^n] / [(1+i)^n - 1]",
    FORMULA_CENARIO_RECALCULADO: calc.metodo === "MAJS" ? "PM = PV/n + (PV x i)" : "PMT sobre o valor líquido financiado",
    TAXA_REFERENCIA_MENSAL: percentual(taxaMensal), TAXA_REFERENCIA_ANUAL: percentual(calc.taxaAnual),
    CET_REFERENCIA_MENSAL: naoIdentificado, CET_REFERENCIA_ANUAL: naoIdentificado,
    TOTAL_RECALCULADO_PROJETADO: moeda(calc.pmt * calc.n), DIFERENCA_MENSAL: moeda(calc.diferencaMensal),
    DIFERENCA_ACUMULADA_DATA_BASE: moeda(calc.estornoPagas), DIFERENCA_PROJETADA_TOTAL: moeda(calc.diferencaMensal * calc.n),
    TOTAL_TARIFAS_QUESTIONADAS: moeda(calc.tarifasDobro), ATUALIZACAO_MONETARIA: "0,00", PROVEITO_ECONOMICO_ESTIMADO: moeda(calc.proveito),
    ACHADO_TECNICO_01: `Tarifas e seguros apurados em R$ ${moeda(calc.tarifas)}.`,
    ACHADO_TECNICO_02: `Prestação recalculada em R$ ${moeda(calc.pmt)}.`,
    ACHADO_TECNICO_03: `Diferença mensal estimada em R$ ${moeda(calc.diferencaMensal)}.`,
    INTERPRETACAO_RESULTADOS: conclusao, CONCLUSAO_TECNICA_COMPLETA: conclusao,
    RESULTADO_DO_EXAME: calc.diferencaMensal > 0 ? "Diferença econômica identificada" : "Sem diferença econômica positiva",
    SALDO_RECALCULADO_DATA_BASE: moeda(calc.memoria[Math.min(calc.pagas, calc.n) - 1]?.finalRecalculo ?? calc.pv),
    IMPACTO_ESTIMADO_PRESTACAO: moeda(calc.diferencaMensal), GRAU_SUFICIENCIA_DOCUMENTAL: "Conforme documentos informados",
    NECESSIDADE_COMPLEMENTACAO: "Mediante ausência de documento essencial", REFERENCIAS_TECNICAS_E_NORMATIVAS: "Decreto-Lei nº 9.295/46 e normas profissionais aplicáveis.",
    DESCRICAO_DA_REVISAO: "Emissão inicial", CODIGO_VALIDACAO_DOCUMENTO: texto(dados.codigoValidacao),
    URL_VALIDACAO_DOCUMENTO: "Validação interna no sistema Platino", PARCELA_E_VENCIMENTO: `${calc.n} parcelas mensais`,
    SALDO_INICIAL_CONTRATO: moeda(calc.bruto), SALDO_INICIAL_RECALCULO: moeda(calc.pv),
    JUROS_CONTRATO: moeda(calc.memoria[0]?.jurosContrato), JUROS_RECALCULO: moeda(calc.memoria[0]?.jurosRecalculo),
    AMORTIZACAO_CONTRATO: moeda(calc.memoria[0]?.amortContrato), AMORTIZACAO_RECALCULO: moeda(calc.memoria[0]?.amortRecalculo),
    PRESTACAO_CONTRATO: moeda(calc.contratual), PRESTACAO_RECALCULO: moeda(calc.pmt),
    SALDO_FINAL_CONTRATO: moeda(calc.memoria.at(-1)?.finalContrato), SALDO_FINAL_RECALCULO: moeda(calc.memoria.at(-1)?.finalRecalculo),
  };
}

function ajustarTextoNaLargura(content, font, size, width) {
  if (font.widthOfTextAtSize(content, size) <= width) return content;
  const suffix = "...";
  let low = 0;
  let high = content.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${content.slice(0, middle).trimEnd()}${suffix}`;
    if (font.widthOfTextAtSize(candidate, size) <= width) low = middle;
    else high = middle - 1;
  }
  return `${content.slice(0, low).trimEnd()}${suffix}`;
}

function desenharCampo(page, font, field, value) {
  const content = texto(value).replace(/\s+/g, " ");
  const key = String(field.key || "").replace(/\s+/g, "");
  const originalSize = Math.min(field.size || 10, 11);
  const width = Math.max(36, Number(field.width) || 100);
  const minimumSize = originalSize >= 14 ? 10 : 7.5;
  let size = originalSize;

  while (size > minimumSize && font.widthOfTextAtSize(content, size) > width) size -= 0.25;
  const shown = ajustarTextoNaLargura(content, font, size, width);
  const isNumeric = /^(VALOR_|TOTAL_|DIFERENCA_|TAXA_|CET_|SALDO_|JUROS_|AMORTIZACAO_|PRESTACAO_|PROVEITO_|QUANTIDADE_)/.test(key);
  const textWidth = font.widthOfTextAtSize(shown, size);
  const textX = isNumeric ? field.x + Math.max(0, width - textWidth) : field.x;
  const maskPaddingX = 2;
  const maskPaddingY = 2.25;

  // Apaga somente o marcador do modelo. A máscara antiga tinha cerca de três
  // linhas de altura e encobria bordas, rótulos e fundos das células vizinhas.
  page.drawRectangle({
    x: field.x - maskPaddingX,
    y: field.y - maskPaddingY,
    width: width + (maskPaddingX * 2),
    height: originalSize + (maskPaddingY * 2),
    color: rgb(1, 1, 1)
  });
  page.drawText(shown, {
    x: textX,
    y: field.y,
    size,
    font,
    color: rgb(0.10, 0.13, 0.18)
  });
}

export async function gerarLaudoPericialContabilPdf(dados = {}, assets = {}) {
  const aprovado = String(dados.validacaoPerito || "").toUpperCase().includes("APROVADO");
  const loginValidador = String(dados.loginValidador || "").trim().toLowerCase();
  if (loginValidador !== "administrativo@platino.com") throw new Error("Somente o login administrativo@platino.com pode validar e gerar o laudo final.");
  if (!aprovado) throw new Error("O laudo precisa estar aprovado pelo perito antes da geração e do download do PDF final.");

  const calc = calcularCenarios(dados);
  const modelo = await carregarModelo();
  const pdf = await PDFDocument.load(modelo.bytes);
  if (pdf.getPageCount() !== 12) throw new Error("O modelo do laudo deve possuir exatamente 12 páginas.");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const values = valoresDoModelo(dados, calc);
  const pages = pdf.getPages();
  for (const field of modelo.campos) {
    const normalizedKey = String(field.key || "").replace(/\s+/g, "");
    const isSignatureIdentity = field.page === 11 && field.y < 350 && ["NOME_PROFISSIONAL", "TITULO_PROFISSIONAL", "CONSELHO_UF_NUMERO"].includes(normalizedKey);
    if (isSignatureIdentity && String(dados.incluirAssinatura || "").toUpperCase().includes("SIM")) {
      pages[field.page - 1].drawRectangle({ x: field.x - 2, y: field.y - 3, width: Math.max(field.width, 150) + 4, height: (field.size || 10) + 6, color: rgb(1, 1, 1) });
      continue;
    }
    desenharCampo(pages[field.page - 1], field.bold ? fontBold : font, field, values[normalizedKey]);
  }

  if (String(dados.incluirAssinatura || "").toUpperCase().includes("SIM") && assets.assinaturaBytes) {
    const image = await pdf.embedPng(assets.assinaturaBytes);
    const width = 205;
    const height = width * (image.height / image.width);
    pages[10].drawImage(image, { x: (612 - width) / 2, y: 275, width, height });
    const crc = "CRC SP 298257/O-2";
    pages[10].drawText(crc, { x: (612 - fontBold.widthOfTextAtSize(crc, 9)) / 2, y: 266, size: 9, font: fontBold, color: rgb(0.08, 0.08, 0.09) });
  }
  return pdf.save();
}

export { calcularCenarios };
