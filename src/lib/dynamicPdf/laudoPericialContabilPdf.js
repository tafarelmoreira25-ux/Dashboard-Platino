import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  calcularMotorCdc,
  parcelaPrice,
} from "./laudoCdcCalculator.js";

const A4 = [595.28, 841.89];
const MARGEM = 58;
const TOPO = 742;
const BASE = 88;
const LARGURA = A4[0] - (MARGEM * 2);
const AZUL = rgb(23 / 255, 54 / 255, 93 / 255);
const AZUL_CLARO = rgb(231 / 255, 238 / 255, 247 / 255);
const DOURADO = rgb(181 / 255, 143 / 255, 54 / 255);
const CINZA = rgb(91 / 255, 103 / 255, 119 / 255);
const CINZA_CLARO = rgb(209 / 255, 216 / 255, 225 / 255);
const FUNDO = rgb(247 / 255, 249 / 255, 252 / 255);
const ALERTA = rgb(255 / 255, 248 / 255, 226 / 255);
const PRETO = rgb(28 / 255, 32 / 255, 39 / 255);

function sanitizarWinAnsi(valor) {
  return String(valor ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/\u2022/g, "-")
    .replace(/\uFFFD/g, "?")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2020\u2021\u2026\u2030\u2039\u203A\u20AC\u2122]/g, "?");
}

function texto(valor, fallback = "Não informado") {
  return sanitizarWinAnsi(valor).trim() || fallback;
}

function possuiConteudo(valor) {
  return String(valor ?? "").trim().length > 0;
}

function moeda(valor) {
  if (!Number.isFinite(Number(valor))) return "Não informado";
  return `R$ ${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor))}`;
}

function percentual(valor, casas = 2) {
  if (!Number.isFinite(Number(valor))) return "Não informado";
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: 4,
  }).format(Number(valor))}%`;
}

function normalizarPeritos(valor) {
  const entradas = Array.isArray(valor)
    ? valor
    : String(valor ?? "")
        .split(/\r?\n/)
        .map(item => item.trim())
        .filter(Boolean);

  return entradas.map((entrada) => {
    if (entrada && typeof entrada === "object") {
      return {
        nome: texto(entrada.nome || entrada.name, ""),
        categoria: texto(entrada.categoria || entrada.titulo || entrada.category, ""),
        registro: texto(entrada.registro || entrada.crc, ""),
        funcao: texto(entrada.funcao || entrada.function, ""),
        cnpc: texto(entrada.cnpc, ""),
      };
    }
    const [nome = "", categoria = "", registro = "", funcao = "", cnpc = ""] = String(entrada)
      .split("|")
      .map(item => item.trim());
    return { nome, categoria, registro, funcao, cnpc };
  });
}

function validarPeritos(peritos) {
  if (!peritos.length) {
    throw new Error("Informe ao menos um responsável técnico pelo laudo.");
  }
  peritos.forEach((perito, indice) => {
    if (!perito.nome || !perito.categoria || !perito.registro || !perito.funcao) {
      throw new Error(
        `Responsável técnico ${indice + 1}: use Nome | Categoria | CRC/registro | Função | CNPC (opcional).`,
      );
    }
  });
}

function identificacaoPerito(perito) {
  return [
    perito.categoria,
    perito.registro,
    perito.funcao,
    perito.cnpc ? `CNPC ${perito.cnpc}` : "",
  ].filter(Boolean).join(" - ");
}

function quebrarPalavra(palavra, fonte, tamanho, largura) {
  const partes = [];
  let trecho = "";
  for (const caractere of palavra) {
    const candidato = `${trecho}${caractere}`;
    if (trecho && fonte.widthOfTextAtSize(candidato, tamanho) > largura) {
      partes.push(trecho);
      trecho = caractere;
    } else {
      trecho = candidato;
    }
  }
  if (trecho) partes.push(trecho);
  return partes;
}

function quebrar(valor, fonte, tamanho, largura) {
  const paragrafos = texto(valor).split(/\r?\n/);
  const linhas = [];

  paragrafos.forEach((paragrafo, indiceParagrafo) => {
    const palavras = paragrafo.trim().split(/\s+/).filter(Boolean);
    let linha = "";

    palavras.forEach((palavraOriginal) => {
      const partes = fonte.widthOfTextAtSize(palavraOriginal, tamanho) > largura
        ? quebrarPalavra(palavraOriginal, fonte, tamanho, largura)
        : [palavraOriginal];
      partes.forEach((palavra) => {
        const candidata = linha ? `${linha} ${palavra}` : palavra;
        if (linha && fonte.widthOfTextAtSize(candidata, tamanho) > largura) {
          linhas.push(linha);
          linha = palavra;
        } else {
          linha = candidata;
        }
      });
    });
    if (linha) linhas.push(linha);
    if (!palavras.length || indiceParagrafo < paragrafos.length - 1) linhas.push("");
  });

  return linhas.length ? linhas : [""];
}

function desenharFundo(ctx, pagina) {
  if (!ctx.backgroundImage) return;
  pagina.drawImage(ctx.backgroundImage, {
    x: 0,
    y: 0,
    width: A4[0],
    height: A4[1],
    opacity: 0.9,
  });
}

function desenharCabecalho(ctx, pagina) {
  pagina.drawText("CÁLCULOS REVISIONAIS BANCÁRIOS - CDC", {
    x: A4[0] - MARGEM
      - ctx.fonts.bold.widthOfTextAtSize("CÁLCULOS REVISIONAIS BANCÁRIOS - CDC", 7.6),
    y: 805,
    size: 7.6,
    font: ctx.fonts.bold,
    color: AZUL,
  });
  pagina.drawLine({
    start: { x: MARGEM, y: 793 },
    end: { x: A4[0] - MARGEM, y: 793 },
    thickness: 1,
    color: AZUL,
  });
}

function novaPagina(ctx, opcoes = {}) {
  ctx.page = ctx.pdf.addPage(A4);
  desenharFundo(ctx, ctx.page);
  if (!opcoes.capa) desenharCabecalho(ctx, ctx.page);
  ctx.y = opcoes.capa ? 700 : TOPO;
  return ctx.page;
}

function garantir(ctx, altura) {
  if (ctx.y - altura < BASE) novaPagina(ctx);
}

function titulo(ctx, valor) {
  garantir(ctx, 38);
  const conteudo = texto(valor).toUpperCase();
  ctx.page.drawText(conteudo, {
    x: MARGEM,
    y: ctx.y,
    size: 10,
    font: ctx.fonts.bold,
    color: AZUL,
  });
  ctx.y -= 8;
  ctx.page.drawLine({
    start: { x: MARGEM, y: ctx.y },
    end: { x: A4[0] - MARGEM, y: ctx.y },
    thickness: 0.8,
    color: DOURADO,
  });
  ctx.y -= 17;
}

function paragrafo(ctx, valor, opcoes = {}) {
  const tamanho = opcoes.size || 9.4;
  const alturaLinha = opcoes.lineHeight || 12.4;
  const fonte = opcoes.bold ? ctx.fonts.bold : ctx.fonts.normal;
  const largura = opcoes.width || LARGURA;
  const linhas = quebrar(valor, fonte, tamanho, largura);
  garantir(ctx, (linhas.length * alturaLinha) + 8);

  linhas.forEach((linha) => {
    if (linha) {
      ctx.page.drawText(linha, {
        x: opcoes.x ?? MARGEM,
        y: ctx.y,
        size: tamanho,
        font: fonte,
        color: opcoes.color || PRETO,
      });
    }
    ctx.y -= alturaLinha;
  });
  ctx.y -= opcoes.after ?? 5;
}

function tabela(ctx, linhas, opcoes = {}) {
  const larguraRotulo = opcoes.labelWidth || 230;
  const larguraValor = LARGURA - larguraRotulo;
  const tamanho = opcoes.size || 8.5;

  linhas.forEach(([rotuloBruto, valorBruto]) => {
    const rotulo = texto(rotuloBruto);
    const valor = texto(valorBruto);
    const linhasRotulo = quebrar(rotulo, ctx.fonts.bold, tamanho, larguraRotulo - 14);
    const linhasValor = quebrar(valor, ctx.fonts.normal, tamanho, larguraValor - 14);
    const altura = Math.max(25, (Math.max(linhasRotulo.length, linhasValor.length) * 10.5) + 10);
    garantir(ctx, altura);
    const base = ctx.y - altura;

    ctx.page.drawRectangle({
      x: MARGEM,
      y: base,
      width: larguraRotulo,
      height: altura,
      color: AZUL_CLARO,
    });
    ctx.page.drawRectangle({
      x: MARGEM,
      y: base,
      width: LARGURA,
      height: altura,
      color: rgb(1, 1, 1),
      opacity: 0.78,
      borderWidth: 0.55,
      borderColor: CINZA_CLARO,
    });
    ctx.page.drawRectangle({
      x: MARGEM,
      y: base,
      width: larguraRotulo,
      height: altura,
      color: AZUL_CLARO,
      opacity: 0.92,
    });
    ctx.page.drawLine({
      start: { x: MARGEM + larguraRotulo, y: ctx.y },
      end: { x: MARGEM + larguraRotulo, y: base },
      thickness: 0.55,
      color: CINZA_CLARO,
    });

    linhasRotulo.forEach((linha, indice) => {
      if (!linha) return;
      ctx.page.drawText(linha, {
        x: MARGEM + 7,
        y: ctx.y - 15 - (indice * 10.5),
        size: tamanho,
        font: ctx.fonts.bold,
        color: AZUL,
      });
    });
    linhasValor.forEach((linha, indice) => {
      if (!linha) return;
      ctx.page.drawText(linha, {
        x: MARGEM + larguraRotulo + 7,
        y: ctx.y - 15 - (indice * 10.5),
        size: tamanho,
        font: ctx.fonts.normal,
        color: PRETO,
      });
    });
    ctx.y = base;
  });
  ctx.y -= opcoes.after ?? 13;
}

function caixaAviso(ctx, tituloAviso, conteudo) {
  const linhas = quebrar(conteudo, ctx.fonts.normal, 8.4, LARGURA - 22);
  const altura = 33 + (linhas.length * 10.5);
  garantir(ctx, altura);
  const base = ctx.y - altura;
  ctx.page.drawRectangle({
    x: MARGEM,
    y: base,
    width: LARGURA,
    height: altura,
    color: ALERTA,
    opacity: 0.94,
    borderWidth: 0.8,
    borderColor: DOURADO,
  });
  ctx.page.drawText(tituloAviso.toUpperCase(), {
    x: MARGEM + 11,
    y: ctx.y - 17,
    size: 8,
    font: ctx.fonts.bold,
    color: AZUL,
  });
  linhas.forEach((linha, indice) => {
    if (!linha) return;
    ctx.page.drawText(linha, {
      x: MARGEM + 11,
      y: ctx.y - 33 - (indice * 10.5),
      size: 8.4,
      font: ctx.fonts.normal,
      color: PRETO,
    });
  });
  ctx.y = base - 13;
}

function formulaPrice(ctx) {
  const formula = ctx.formulaPriceImage;
  if (formula) {
    const larguraMaxima = LARGURA - 42;
    const alturaMaxima = 84;
    const escala = Math.min(larguraMaxima / formula.width, alturaMaxima / formula.height);
    const largura = formula.width * escala;
    const altura = formula.height * escala;
    garantir(ctx, altura + 22);
    ctx.page.drawImage(formula, {
      x: (A4[0] - largura) / 2,
      y: ctx.y - altura,
      width: largura,
      height: altura,
    });
    ctx.y -= altura + 15;
    return;
  }

  garantir(ctx, 55);
  const textoFormula = "P = q0 x J / [1 - (1 + J)^(-N)]";
  ctx.page.drawText(textoFormula, {
    x: (A4[0] - ctx.fonts.bold.widthOfTextAtSize(textoFormula, 13)) / 2,
    y: ctx.y - 24,
    size: 13,
    font: ctx.fonts.bold,
    color: AZUL,
  });
  ctx.y -= 42;
}

function quadroConclusaoFinanceira(ctx, calculo) {
  const larguraColuna = LARGURA / 3;
  const alturaCabecalho = 38;
  const alturaValores = 33;
  const alturaTotal = alturaCabecalho + alturaValores;
  const itens = [
    ["TARIFAS A DEVOLVER", "EM DOBRO", moeda(calculo.tarifasRestituicao)],
    ["A MAIS NO RECÁLCULO", "DEVOLUÇÃO / COMPENSAÇÃO", moeda(calculo.jurosRestituicao)],
    ["TOTAL FINAL", "PROVEITO ECONÔMICO", moeda(calculo.proveitoEconomicoTotal)],
  ];

  garantir(ctx, alturaTotal + 34);
  ctx.page.drawText("SÍNTESE ECONÔMICA DA CONCLUSÃO", {
    x: MARGEM,
    y: ctx.y - 9,
    size: 7.4,
    font: ctx.fonts.bold,
    color: CINZA,
  });

  const topo = ctx.y - 19;
  const base = topo - alturaTotal;
  itens.forEach(([titulo, subtitulo, valor], indice) => {
    const x = MARGEM + (indice * larguraColuna);
    const destaque = indice === 2;
    const corCabecalho = destaque ? AZUL : rgb(228 / 255, 234 / 255, 242 / 255);
    const corTextoCabecalho = destaque ? rgb(1, 1, 1) : AZUL;
    const corValor = destaque ? AZUL_CLARO : rgb(1, 1, 1);

    ctx.page.drawRectangle({
      x,
      y: topo - alturaCabecalho,
      width: larguraColuna,
      height: alturaCabecalho,
      color: corCabecalho,
      borderWidth: 0.65,
      borderColor: CINZA,
    });
    ctx.page.drawRectangle({
      x,
      y: base,
      width: larguraColuna,
      height: alturaValores,
      color: rgb(1, 1, 1),
      borderWidth: 0.65,
      borderColor: CINZA,
    });
    ctx.page.drawText(titulo, {
      x: x + (larguraColuna - ctx.fonts.bold.widthOfTextAtSize(titulo, 7.3)) / 2,
      y: topo - 15,
      size: 7.3,
      font: ctx.fonts.bold,
      color: corTextoCabecalho,
    });
    ctx.page.drawText(subtitulo, {
      x: x + (larguraColuna - ctx.fonts.bold.widthOfTextAtSize(subtitulo, 6.8)) / 2,
      y: topo - 27,
      size: 6.8,
      font: ctx.fonts.bold,
      color: corTextoCabecalho,
    });
    ctx.page.drawText(valor, {
      x: x + (larguraColuna - ctx.fonts.bold.widthOfTextAtSize(valor, 10.5)) / 2,
      y: base + 11,
      size: 10.5,
      font: ctx.fonts.bold,
      color: corValor,
    });
  });
  ctx.y = base - 17;
}

function blocoAssinatura(ctx, perito) {
  garantir(ctx, 115);
  const topo = ctx.y;
  const base = topo - 90;
  const larguraAssinatura = 300;
  const xCarimbo = MARGEM + larguraAssinatura + 22;
  const larguraCarimbo = LARGURA - larguraAssinatura - 22;

  ctx.page.drawText("ASSINATURA DO RESPONSÁVEL TÉCNICO", {
    x: MARGEM,
    y: topo,
    size: 7.4,
    font: ctx.fonts.bold,
    color: CINZA,
  });
  ctx.page.drawLine({
    start: { x: MARGEM, y: topo - 29 },
    end: { x: MARGEM + larguraAssinatura, y: topo - 29 },
    thickness: 0.7,
    color: PRETO,
  });
  ctx.page.drawText(perito.nome, {
    x: MARGEM,
    y: topo - 45,
    size: 8.7,
    font: ctx.fonts.bold,
    color: PRETO,
  });
  quebrar(identificacaoPerito(perito), ctx.fonts.normal, 7.5, larguraAssinatura)
    .slice(0, 3)
    .forEach((linha, indice) => ctx.page.drawText(linha, {
      x: MARGEM,
      y: topo - 59 - (indice * 10),
      size: 7.5,
      font: ctx.fonts.normal,
      color: CINZA,
    }));

  ctx.page.drawRectangle({
    x: xCarimbo,
    y: base,
    width: larguraCarimbo,
    height: 90,
    color: rgb(1, 1, 1),
    opacity: 0.55,
    borderWidth: 0.7,
    borderColor: CINZA,
  });
  const rotulo = "ESPAÇO PARA CARIMBO";
  ctx.page.drawText(rotulo, {
    x: xCarimbo + (larguraCarimbo - ctx.fonts.bold.widthOfTextAtSize(rotulo, 7)) / 2,
    y: base + 41,
    size: 7,
    font: ctx.fonts.bold,
    color: CINZA,
  });
  ctx.y = base - 20;
}

function capa(ctx, dados, peritos) {
  novaPagina(ctx, { capa: true });
  const primeiroPerito = peritos[0];
  ctx.page.drawText("RESPONSABILIDADE TÉCNICA", {
    x: (A4[0] - ctx.fonts.bold.widthOfTextAtSize("RESPONSABILIDADE TÉCNICA", 9)) / 2,
    y: 738,
    size: 9,
    font: ctx.fonts.bold,
    color: AZUL,
  });
  ctx.page.drawLine({
    start: { x: 150, y: 726 },
    end: { x: A4[0] - 150, y: 726 },
    thickness: 0.8,
    color: DOURADO,
  });
  ctx.page.drawText(primeiroPerito.nome.toUpperCase(), {
    x: (A4[0] - ctx.fonts.bold.widthOfTextAtSize(primeiroPerito.nome.toUpperCase(), 12)) / 2,
    y: 703,
    size: 12,
    font: ctx.fonts.bold,
    color: PRETO,
  });
  const identificacao = identificacaoPerito(primeiroPerito);
  ctx.page.drawText(identificacao, {
    x: (A4[0] - ctx.fonts.normal.widthOfTextAtSize(identificacao, 8)) / 2,
    y: 686,
    size: 8,
    font: ctx.fonts.normal,
    color: CINZA,
  });

  const tituloPrincipal = "LAUDO PERICIAL CONTÁBIL";
  const subtitulo = "CÁLCULOS REVISIONAIS BANCÁRIOS";
  ctx.page.drawText(tituloPrincipal, {
    x: (A4[0] - ctx.fonts.bold.widthOfTextAtSize(tituloPrincipal, 19)) / 2,
    y: 486,
    size: 19,
    font: ctx.fonts.bold,
    color: AZUL,
  });
  ctx.page.drawText(subtitulo, {
    x: (A4[0] - ctx.fonts.bold.widthOfTextAtSize(subtitulo, 12)) / 2,
    y: 458,
    size: 12,
    font: ctx.fonts.bold,
    color: DOURADO,
  });
  const modalidade = "Financiamento de veículo - Crédito Direto ao Consumidor (CDC)";
  ctx.page.drawText(modalidade, {
    x: (A4[0] - ctx.fonts.normal.widthOfTextAtSize(modalidade, 9)) / 2,
    y: 435,
    size: 9,
    font: ctx.fonts.normal,
    color: CINZA,
  });

  const documento = `Documento nº ${texto(dados.numeroDocumento)}`;
  ctx.page.drawText(documento, {
    x: (A4[0] - ctx.fonts.normal.widthOfTextAtSize(documento, 8)) / 2,
    y: 405,
    size: 8,
    font: ctx.fonts.normal,
    color: CINZA,
  });
  const localData = `${texto(dados.cidadeEstado, "São Paulo/SP")} - ${texto(dados.dataEmissao || dados.data)}`;
  ctx.page.drawText(localData, {
    x: (A4[0] - ctx.fonts.normal.widthOfTextAtSize(localData, 9)) / 2,
    y: 126,
    size: 9,
    font: ctx.fonts.normal,
    color: PRETO,
  });
}

function numerarPaginas(ctx) {
  const paginas = ctx.pdf.getPages();
  paginas.forEach((pagina, indice) => {
    pagina.drawLine({
      start: { x: MARGEM, y: 58 },
      end: { x: A4[0] - MARGEM, y: 58 },
      thickness: 0.55,
      color: CINZA_CLARO,
    });
    const textoPagina = `Página ${indice + 1} de ${paginas.length}`;
    pagina.drawText(textoPagina, {
      x: A4[0] - MARGEM - ctx.fonts.normal.widthOfTextAtSize(textoPagina, 7.4),
      y: 42,
      size: 7.4,
      font: ctx.fonts.normal,
      color: CINZA,
    });
  });
}

async function incorporarFundo(pdf, bytes) {
  if (!bytes) return null;
  try {
    return await pdf.embedPng(bytes);
  } catch {
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

async function gerarLaudoPericialContabilPdf(dados = {}, assets = {}) {
  const calculo = calcularMotorCdc(dados);
  const peritos = normalizarPeritos(dados.peritosResponsaveis || dados.peritos);
  validarPeritos(peritos);

  const pdf = await PDFDocument.create();
  const ctx = {
    pdf,
    fonts: {
      normal: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    },
    backgroundImage: await incorporarFundo(pdf, assets.backgroundBytes),
    formulaPriceImage: await incorporarFundo(pdf, assets.formulaPriceBytes),
    page: null,
    y: TOPO,
  };
  pdf.setTitle("Laudo Pericial Contábil - Cálculos Revisionais CDC");
  pdf.setSubject("Recálculo de financiamento de veículo pelo Sistema Price");

  capa(ctx, dados, peritos);

  novaPagina(ctx);
  titulo(ctx, "1. Identificação do trabalho");
  tabela(ctx, [
    ["Contratante / cliente", dados.cliente],
    ["CPF ou CNPJ", dados.cpf],
    ["Instituição financeira", dados.banco],
    ["CNPJ da instituição", dados.cnpjBanco],
    ["Número do contrato", dados.contrato],
    ["Data do contrato", dados.dataContrato],
    ["Veículo / bem financiado", dados.descricaoBem],
    ["Data-base do cálculo", dados.dataBaseCalculo],
  ]);

  titulo(ctx, "2. Responsáveis técnicos");
  tabela(ctx, peritos.map((perito, indice) => [
    `Responsável técnico ${indice + 1}`,
    `${perito.nome} - ${identificacaoPerito(perito)}`,
  ]));

  titulo(ctx, "3. Objeto, escopo e elementos examinados");
  paragrafo(
    ctx,
    texto(
      dados.objetoPericia,
      "Examinar os dados econômicos informados do contrato de financiamento de veículo e demonstrar um cenário revisional por expurgo dos encargos indicados e recálculo pelo Sistema Price.",
    ),
  );
  paragrafo(
    ctx,
    `Elementos examinados: ${texto(dados.elementosExaminados, "Contrato de financiamento e dados transcritos no formulário do sistema.")}`,
  );
  novaPagina(ctx);
  titulo(ctx, "4. Metodologia de cálculo");
  paragrafo(
    ctx,
    "O cenário utiliza o Sistema Francês de Amortização (Tabela Price), com juros compostos e capitalização mensal. O novo valor financiado é apurado pelo expurgo dos encargos classificados no caso concreto e conferido pela composição econômica do bem.",
  );
  formulaPrice(ctx);
  tabela(ctx, [
    ["Novo valor financiado (q0)", moeda(calculo.novoValorFinanciadoPorExpurgo)],
    ["Taxa mensal (J)", percentual(calculo.taxaMensalPercentual)],
    ["Taxa anual efetiva equivalente", percentual(calculo.taxaAnualEfetiva)],
    ["Número de parcelas (N)", String(calculo.quantidadeParcelas)],
    ["Prestação recalculada (P)", moeda(calculo.parcelaIncontroversa)],
  ]);
  if (possuiConteudo(dados.referenciaBancoCentral)) {
    paragrafo(
      ctx,
      `Fonte técnica ou normativa informada: ${dados.referenciaBancoCentral}`,
      { size: 8.6 },
    );
  }

  titulo(ctx, "5. Dados do financiamento");
  tabela(ctx, [
    ["Valor do veículo", moeda(calculo.valorVeiculo)],
    ["Valor da entrada", moeda(calculo.valorEntrada)],
    ["IOF", moeda(calculo.iof)],
    ["IOF adicional", moeda(calculo.iofAdicional)],
    ["Valor financiado pelo banco", moeda(calculo.valorFinanciadoBanco)],
    ["Parcela controversa (parcela do banco)", moeda(calculo.parcelaControversa)],
  ]);

  novaPagina(ctx);
  titulo(ctx, "6. Encargos expurgados no cenário");
  tabela(ctx, [
    ["Seguro(s)", moeda(calculo.tarifas.seguro)],
    ["Tarifa de cadastro", moeda(calculo.tarifas.cadastro)],
    ["Tarifa de avaliação do bem", moeda(calculo.tarifas.avaliacao)],
    ["Registro de contrato", moeda(calculo.tarifas.registro)],
    ["Serviços de terceiros", moeda(calculo.tarifas.servicosTerceiros)],
    ["Total dos encargos expurgados", moeda(calculo.totalTarifas)],
  ]);

  titulo(ctx, "7. Conferência do novo valor financiado");
  tabela(ctx, [
    [
      "Forma A: valor financiado pelo banco - encargos",
      `${moeda(calculo.valorFinanciadoBanco)} - ${moeda(calculo.totalTarifas)} = ${moeda(calculo.novoValorFinanciadoPorExpurgo)}`,
    ],
    [
      "Forma B: veículo - entrada + IOF",
      `${moeda(calculo.valorVeiculo)} - ${moeda(calculo.valorEntrada)} + ${moeda(calculo.iof + calculo.iofAdicional)} = ${moeda(calculo.novoValorFinanciadoPorComposicao)}`,
    ],
    ["Diferença entre as bases", moeda(Math.abs(calculo.divergenciaBases))],
    ["Resultado da conferência", calculo.basesConferem ? "Bases conciliadas" : "Bases divergentes"],
  ]);
  if (!calculo.basesConferem) {
    caixaAviso(
      ctx,
      "Conferência obrigatória",
      "As duas formas de apuração não coincidem dentro da tolerância definida. Revise o valor financiado, o IOF, a entrada e todos os encargos antes de assinar o documento.",
    );
  }

  novaPagina(ctx);
  titulo(ctx, "8. Memória sintética do recálculo");
  tabela(ctx, [
    ["Valor controverso", moeda(calculo.parcelaControversa)],
    ["Valor incontroverso", moeda(calculo.parcelaIncontroversa)],
    ["Diferença mensal", moeda(calculo.diferencaMensal)],
    [
      "Diferença projetada no contrato",
      `${moeda(calculo.diferencaMensal)} x ${calculo.quantidadeParcelas} = ${moeda(calculo.prejuizoTotalJuros)}`,
    ],
    ["Parcelas pagas informadas", String(calculo.parcelasPagas)],
    [
      "Diferença relativa às parcelas pagas",
      `${moeda(calculo.diferencaMensal)} x ${calculo.parcelasPagas} = ${moeda(calculo.diferencaParcelasPagas)}`,
    ],
    [
      "Multiplicador do cenário de repetição",
      `${calculo.multiplicadorRestituicao}x`,
    ],
  ]);

  calculo.avisos
    .filter(aviso => aviso !== "A parcela de referência informada não coincide com a fórmula Price.")
    .forEach(aviso => caixaAviso(ctx, "Alerta de consistência", aviso));

  titulo(ctx, "9. Cenário econômico de repetição");
  paragrafo(
    ctx,
    `Tarifas: ${moeda(calculo.totalTarifas)} x ${calculo.multiplicadorRestituicao} = ${moeda(calculo.tarifasRestituicao)}.`,
    { size: 8.8, after: 2 },
  );
  paragrafo(
    ctx,
    `Diferença projetada: ${moeda(calculo.prejuizoTotalJuros)} x ${calculo.multiplicadorRestituicao} = ${moeda(calculo.jurosRestituicao)}.`,
    { size: 8.8 },
  );

  novaPagina(ctx);
  titulo(ctx, "10. Conclusão técnica");
  quadroConclusaoFinanceira(ctx, calculo);
  const conclusaoPadrao = [
    `No cenário examinado, a prestação contratual de ${moeda(calculo.parcelaControversa)} foi comparada à prestação recalculada de ${moeda(calculo.parcelaIncontroversa)}.`,
    `A diferença mensal apurada é de ${moeda(calculo.diferencaMensal)}, com projeção de ${moeda(calculo.prejuizoTotalJuros)} ao longo de ${calculo.quantidadeParcelas} parcelas.`,
    `Aplicado o multiplicador ${calculo.multiplicadorRestituicao} ao cenário informado, o proveito econômico projetado totaliza ${moeda(calculo.proveitoEconomicoTotal)}.`,
  ].join(" ");
  paragrafo(ctx, texto(dados.conclusaoTecnica, conclusaoPadrao), {
    size: 9.6,
    lineHeight: 13.2,
  });

  titulo(ctx, "11. Premissa jurídica do cenário");
  if (possuiConteudo(dados.justificativaRestituicao)) {
    paragrafo(ctx, `Premissa informada pelo responsável: ${dados.justificativaRestituicao}`, {
      size: 8.8,
      lineHeight: 12.2,
    });
  }
  paragrafo(
    ctx,
    "O multiplicador de repetição foi aplicado como premissa do cenário solicitado. O art. 42, parágrafo único, do Código de Defesa do Consumidor refere-se ao valor pago em excesso e ressalva a hipótese de engano justificável. O reconhecimento da cobrança indevida, a incidência da devolução em dobro e a extensão a parcelas futuras dependem de análise jurídica e decisão no caso concreto.",
    { size: 8.8, lineHeight: 12.2 },
  );

  peritos.forEach(perito => blocoAssinatura(ctx, perito));

  numerarPaginas(ctx);
  return pdf.save();
}

export {
  calcularMotorCdc as calcularCenarios,
  gerarLaudoPericialContabilPdf,
  normalizarPeritos,
  parcelaPrice,
};
