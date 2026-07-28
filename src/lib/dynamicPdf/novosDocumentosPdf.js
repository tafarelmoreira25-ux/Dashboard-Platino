import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const A4 = [595.28, 841.89];
const A4_PAISAGEM = [841.89, 595.28];
const AZUL_PLATINO = rgb(0, 56 / 255, 168 / 255);
const AZUL_TITULO = rgb(23 / 255, 54 / 255, 93 / 255);
const CINZA_LINHA = rgb(160 / 255, 160 / 255, 160 / 255);
const CINZA_TEXTO = rgb(82 / 255, 82 / 255, 82 / 255);
const PRETO = rgb(0, 0, 0);

function texto(valor) {
  return String(valor ?? "").trim();
}

function semPrefixoReal(valor) {
  return texto(valor).replace(/^R\$\s*/i, "");
}

function dataDocumento(dados) {
  if (dados.dia && dados.mes && dados.ano) {
    return `${texto(dados.dia)} de ${texto(dados.mes)} de ${texto(dados.ano)}`;
  }
  return texto(dados.data);
}

function partesDataDocumento(valor, dados = {}) {
  const dataInformada = texto(valor);
  const br = dataInformada.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  if (br) {
    return {
      dia: br[1],
      mes: meses[Number(br[2]) - 1] || br[2],
      ano: br[3],
    };
  }
  return {
    dia: texto(dados.dia),
    mes: texto(dados.mes),
    ano: texto(dados.ano),
  };
}

function flexoesGenero(genero) {
  const valor = texto(genero).toLowerCase();
  if (valor === "feminino" || valor === "f") {
    return { artigo: "a", tratamento: "Sra.", inscrito: "inscrita" };
  }
  if (valor === "masculino" || valor === "m") {
    return { artigo: "o", tratamento: "Sr.", inscrito: "inscrito" };
  }
  return { artigo: "o(a)", tratamento: "Sr(a).", inscrito: "inscrito(a)" };
}

function quebrarTexto(textoCompleto, fonte, tamanho, larguraMaxima) {
  const palavras = texto(textoCompleto).split(/\s+/).filter(Boolean);
  const linhas = [];
  let linha = "";
  palavras.forEach((palavra) => {
    const candidata = linha ? `${linha} ${palavra}` : palavra;
    if (linha && fonte.widthOfTextAtSize(candidata, tamanho) > larguraMaxima) {
      linhas.push(linha);
      linha = palavra;
    } else {
      linha = candidata;
    }
  });
  if (linha || !linhas.length) linhas.push(linha);
  return linhas;
}

function desenharCentralizado(pagina, fonte, conteudo, y, tamanho, larguraPagina, cor = PRETO) {
  const valor = texto(conteudo);
  pagina.drawText(valor, {
    x: (larguraPagina - fonte.widthOfTextAtSize(valor, tamanho)) / 2,
    y,
    size: tamanho,
    font: fonte,
    color: cor,
  });
}

function desenharTextoSimples({
  pagina,
  fonte,
  conteudo,
  x,
  y,
  largura,
  tamanho = 11,
  alturaLinha = 14,
  cor = PRETO,
  alinhamento = "left",
}) {
  const linhas = quebrarTexto(conteudo, fonte, tamanho, largura);
  linhas.forEach((linha) => {
    const larguraLinha = fonte.widthOfTextAtSize(linha, tamanho);
    const posicaoX = alinhamento === "center"
      ? x + (largura - larguraLinha) / 2
      : alinhamento === "right"
        ? x + largura - larguraLinha
        : x;
    pagina.drawText(linha, {
      x: posicaoX,
      y,
      size: tamanho,
      font: fonte,
      color: cor,
    });
    y -= alturaLinha;
  });
  return y;
}

function criarLinhasRicas(segmentos, fontes, tamanho, larguraMaxima) {
  const tokens = [];
  segmentos.forEach((segmento) => {
    texto(segmento.texto).split(/(\s+)/).forEach((parte) => {
      if (!parte.trim()) return;
      tokens.push({
        texto: parte,
        fonte: segmento.negrito ? fontes.negrito : segmento.italico ? fontes.italico : fontes.normal,
      });
    });
  });

  const linhas = [];
  let linha = [];
  let largura = 0;
  tokens.forEach((token) => {
    const larguraToken = token.fonte.widthOfTextAtSize(token.texto, tamanho);
    const larguraEspaco = linha.length ? fontes.normal.widthOfTextAtSize(" ", tamanho) : 0;
    if (linha.length && largura + larguraEspaco + larguraToken > larguraMaxima) {
      linhas.push(linha);
      linha = [];
      largura = 0;
    }
    linha.push(token);
    largura += (linha.length > 1 ? larguraEspaco : 0) + larguraToken;
  });
  if (linha.length || !linhas.length) linhas.push(linha);
  return linhas;
}

function desenharTextoRico({
  pagina,
  fontes,
  segmentos,
  x,
  y,
  largura,
  tamanho = 11,
  alturaLinha = 14,
  cor = PRETO,
}) {
  const linhas = criarLinhasRicas(segmentos, fontes, tamanho, largura);
  linhas.forEach((linha) => {
    let posicaoX = x;
    linha.forEach((token, indice) => {
      if (indice) posicaoX += fontes.normal.widthOfTextAtSize(" ", tamanho);
      pagina.drawText(token.texto, {
        x: posicaoX,
        y,
        size: tamanho,
        font: token.fonte,
        color: cor,
      });
      posicaoX += token.fonte.widthOfTextAtSize(token.texto, tamanho);
    });
    y -= alturaLinha;
  });
  return y;
}

function desenharFaixa(pagina, altura = A4[1]) {
  pagina.drawRectangle({
    x: 0,
    y: 0,
    width: 15,
    height: altura,
    color: AZUL_PLATINO,
  });
}

function desenharRodape(pagina, fontes) {
  desenharCentralizado(
    pagina,
    fontes.normal,
    "Rua Fontoura Xavier, nº 1308 - Itaquera - São Paulo/SP - CEP: 08295-300",
    30,
    8.5,
    A4[0],
  );
  desenharCentralizado(
    pagina,
    fontes.normal,
    "E-mail: platinoassessoriafinanceira@gmail.com",
    18,
    8.5,
    A4[0],
  );
}

function desenharCabecalhoRetrato(pagina, fontes, titulo, { rodape = true } = {}) {
  desenharFaixa(pagina);
  desenharCentralizado(pagina, fontes.normal, "PLATINO SOLUÇÕES FINANCEIRAS", 800, 8, A4[0]);

  const linhasTitulo = Array.isArray(titulo) ? titulo : [titulo];
  let yTitulo = linhasTitulo.length > 1 ? 760 : 752;
  linhasTitulo.forEach((linha) => {
    desenharCentralizado(pagina, fontes.normal, linha, yTitulo, 14.2, A4[0], AZUL_TITULO);
    yTitulo -= 17;
  });

  const yLinha = linhasTitulo.length > 1 ? 728 : 736;
  pagina.drawLine({
    start: { x: 85.05, y: yLinha },
    end: { x: A4[0] - 76.55, y: yLinha },
    thickness: 1.45,
    color: CINZA_LINHA,
  });
  if (rodape) desenharRodape(pagina, fontes);
  return linhasTitulo.length > 1 ? 690 : 700;
}

async function incorporarImagemPng(pdf, bytes) {
  if (!bytes?.length) return null;
  try {
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

function desenharAssinaturas({
  pagina,
  fontes,
  assinatura,
  carimbo,
  nomeCliente,
  yLinhaCliente,
  cnpj = "CNPJ nº 52.807.405/0001-30",
}) {
  const centro = A4[0] / 2;
  const larguraLinha = 275;
  const xLinha = centro - larguraLinha / 2;

  pagina.drawLine({
    start: { x: xLinha, y: yLinhaCliente },
    end: { x: xLinha + larguraLinha, y: yLinhaCliente },
    thickness: 0.7,
    color: PRETO,
  });
  desenharCentralizado(pagina, fontes.normal, texto(nomeCliente).toUpperCase(), yLinhaCliente - 17, 9.5, A4[0]);

  const yLinhaEmpresa = yLinhaCliente - 105;
  if (assinatura) {
    pagina.drawImage(assinatura, {
      x: centro - 98,
      y: yLinhaEmpresa - 4,
      width: 94,
      height: 78,
    });
  }
  if (carimbo) {
    pagina.drawImage(carimbo, {
      x: centro + 4,
      y: yLinhaEmpresa - 4,
      width: 124,
      height: 91,
    });
  }
  pagina.drawLine({
    start: { x: xLinha, y: yLinhaEmpresa },
    end: { x: xLinha + larguraLinha, y: yLinhaEmpresa },
    thickness: 0.7,
    color: PRETO,
  });
  desenharCentralizado(pagina, fontes.normal, "PLATINO SOLUÇÕES FINANCEIRAS", yLinhaEmpresa - 18, 9.5, A4[0]);
  desenharCentralizado(pagina, fontes.normal, cnpj, yLinhaEmpresa - 31, 8.5, A4[0]);
}

async function criarFontes(pdf, principal = "times") {
  if (principal === "helvetica") {
    return {
      normal: await pdf.embedFont(StandardFonts.Helvetica),
      negrito: await pdf.embedFont(StandardFonts.HelveticaBold),
      italico: await pdf.embedFont(StandardFonts.HelveticaOblique),
    };
  }
  return {
    normal: await pdf.embedFont(StandardFonts.TimesRoman),
    negrito: await pdf.embedFont(StandardFonts.TimesRomanBold),
    italico: await pdf.embedFont(StandardFonts.TimesRomanItalic),
  };
}

export async function gerarReciboPrestacaoServicosPdf(
  dados,
  { assinaturaBytes, carimboBytes } = {},
) {
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage(A4_PAISAGEM);
  const fontes = await criarFontes(pdf, "helvetica");
  const assinatura = await incorporarImagemPng(pdf, assinaturaBytes);
  const carimbo = await incorporarImagemPng(pdf, carimboBytes);
  const largura = A4_PAISAGEM[0];
  const margem = 19;

  pagina.drawText("RECIBO DE PAGAMENTO", {
    x: margem,
    y: 548,
    size: 19,
    font: await pdf.embedFont(StandardFonts.TimesRoman),
    color: AZUL_TITULO,
  });
  pagina.drawText("Platino  SOLUÇÕES FINANCEIRAS", {
    x: margem,
    y: 533,
    size: 8.5,
    font: fontes.negrito,
    color: AZUL_TITULO,
  });
  const numero = texto(dados.numeroDocumento);
  const rotuloNumero = "RECIBO Nº:";
  const tamanhoNumero = 10;
  const larguraNumero = fontes.negrito.widthOfTextAtSize(numero, tamanhoNumero);
  const larguraRotulo = fontes.normal.widthOfTextAtSize(`${rotuloNumero} `, tamanhoNumero);
  const xNumero = largura - 18 - larguraRotulo - larguraNumero;
  pagina.drawText(rotuloNumero, {
    x: xNumero,
    y: 533,
    size: tamanhoNumero,
    font: fontes.normal,
    color: PRETO,
  });
  pagina.drawText(numero, {
    x: xNumero + larguraRotulo,
    y: 533,
    size: tamanhoNumero,
    font: fontes.negrito,
    color: rgb(0.9, 0, 0),
  });
  pagina.drawLine({
    start: { x: margem, y: 519 },
    end: { x: largura - 18, y: 519 },
    thickness: 1,
    color: AZUL_TITULO,
  });

  let y = 472;
  y = desenharTextoRico({
    pagina,
    fontes,
    x: margem,
    y,
    largura: largura - 2 * margem,
    tamanho: 11,
    alturaLinha: 15,
    segmentos: [
      { texto: "Recebi de" },
      { texto: texto(dados.nomeCliente), negrito: true },
      { texto: "- CPF:" },
      { texto: `${texto(dados.cpfCnpj)},`, negrito: true },
      { texto: "a importância de R$" },
      { texto: `${semPrefixoReal(dados.valor)},`, negrito: true },
      { texto: `(${texto(dados.valorExtenso)}),`, negrito: true },
      { texto: "referente ao pagamento realizado por meio de na modalidade" },
      { texto: texto(dados.modalidadePagamento), negrito: true },
      { texto: `parcelado (${texto(dados.parcelas)}),` },
      { texto: "referente à prestação de serviços contratados, conforme comprovante da transação abaixo:" },
    ],
  });

  y -= 14;
  const itens = [
    `Data: ${texto(dados.dataPagamento)}`,
    `Horário: ${texto(dados.horaPagamento)}`,
    `Valor: R$ ${semPrefixoReal(dados.valor)}`,
    `Tipo da transação: ${texto(dados.tipoTransacao)}`,
    `Bandeira: ${texto(dados.bandeiraCartao)}`,
    `Código de Autorização: ${texto(dados.codigoAutorizacao)}`,
    "Tipo da Venda: Não presencial",
  ];
  itens.forEach((item) => {
    pagina.drawCircle({ x: 35, y: y + 3, size: 1.7, color: PRETO });
    pagina.drawText(item, {
      x: 50,
      y,
      size: 10.5,
      font: fontes.normal,
      color: PRETO,
    });
    y -= 16;
  });

  y -= 12;
  pagina.drawText(
    "Declaro, para os devidos fins, que o valor acima foi recebido e encontra-se devidamente registrado.",
    { x: margem, y, size: 10.5, font: fontes.normal, color: PRETO },
  );

  const textoAssinatura = `Documento assinado por PLATINO SOLUÇÕES FINANCEIRAS em ${texto(dados.dataPagamento)} às ${texto(dados.horaPagamento)}`;
  desenharCentralizado(pagina, fontes.normal, textoAssinatura, 266, 7, largura, AZUL_TITULO);
  pagina.drawLine({
    start: { x: margem, y: 248 },
    end: { x: largura - 32, y: 248 },
    thickness: 1.5,
    color: CINZA_LINHA,
  });
  desenharCentralizado(
    pagina,
    fontes.italico,
    `São Paulo ${dataDocumento(dados)}`,
    224,
    10.5,
    largura,
  );

  const centro = largura / 2;
  const yLinha = 102;
  if (assinatura) {
    pagina.drawImage(assinatura, {
      x: centro - 66,
      y: yLinha - 2,
      width: 80,
      height: 67,
    });
  }
  if (carimbo) {
    pagina.drawImage(carimbo, {
      x: centro + 98,
      y: 68,
      width: 195,
      height: 140,
    });
  }
  pagina.drawLine({
    start: { x: centro - 145, y: yLinha },
    end: { x: centro + 145, y: yLinha },
    thickness: 0.65,
    color: PRETO,
  });
  desenharCentralizado(pagina, await pdf.embedFont(StandardFonts.TimesRoman), "PLATINO SOLUÇÕES FINANCEIRAS", 88, 8.5, largura);
  desenharCentralizado(pagina, await pdf.embedFont(StandardFonts.TimesRoman), "CNPJ nº 52.807.405/0001-30", 76, 8, largura);
  desenharCentralizado(
    pagina,
    fontes.normal,
    "Rua Fontoura Xavier, nº 1308 - Itaquera - São Paulo/SP - CEP: 08295-300",
    27,
    7.5,
    largura,
    AZUL_TITULO,
  );
  desenharCentralizado(
    pagina,
    fontes.normal,
    "E-mail: platinoassessoriafinanceira@gmail.com",
    16,
    7.5,
    largura,
    AZUL_TITULO,
  );

  return pdf.save();
}

export async function gerarTermoRecompraPdf(
  dados,
  { assinaturaBytes, carimboBytes } = {},
) {
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage(A4);
  const fontes = await criarFontes(pdf);
  const assinatura = await incorporarImagemPng(pdf, assinaturaBytes);
  const carimbo = await incorporarImagemPng(pdf, carimboBytes);
  let y = desenharCabecalhoRetrato(
    pagina,
    fontes,
    ["TERMO DE RECONHECIMENTO", "RECOMPRA E DESISTÊNCIA DA CONTESTAÇÃO DE PAGAMENTO"],
  );
  const x = 85.05;
  const largura = A4[0] - x - 76.55;

  y = desenharTextoRico({
    pagina,
    fontes,
    x,
    y,
    largura,
    tamanho: 11,
    alturaLinha: 13.6,
    cor: CINZA_TEXTO,
    segmentos: [
      { texto: "Pelo presente instrumento particular, de um lado:" },
      { texto: "Platino Soluções Financeiras,", negrito: true },
      { texto: "pessoa jurídica de direito privado, inscrita no CNPJ sob o n° 52.807.405/0001-30, doravante denominada simplesmente ASSESSORIA. E, de outro lado:" },
      { texto: `${texto(dados.nomeCliente)},`, negrito: true },
      { texto: "inscrito no CPF sob o nº" },
      { texto: `${texto(dados.cpfCnpj)},`, negrito: true },
      { texto: "doravante denominado simplesmente CLIENTE, as partes identificadas declaram e acordam o seguinte:" },
    ],
  });

  const paragrafos = [
    "1. O cliente reconhece que realizou uma contestação do pagamento (“chargeback”) referente aos serviços contratados junto à Platino Soluções Financeiras Ltda.",
    "2. Após novo atendimento e esclarecimentos prestados pela empresa, o cliente manifesta, de forma livre, seu interesse em manter a contratação dos serviços, realizando a recompra/repagamento do valor correspondente.",
  ];
  paragrafos.forEach((paragrafo) => {
    y -= 14;
    y = desenharTextoSimples({
      pagina,
      fonte: fontes.normal,
      conteudo: paragrafo,
      x,
      y,
      largura,
      tamanho: 11,
      alturaLinha: 13.6,
      cor: CINZA_TEXTO,
    });
  });

  y -= 14;
  y = desenharTextoRico({
    pagina,
    fontes,
    x,
    y,
    largura,
    tamanho: 11,
    alturaLinha: 13.6,
    cor: CINZA_TEXTO,
    segmentos: [
      { texto: "3. O valor da recompra será de R$" },
      { texto: semPrefixoReal(dados.valor), negrito: true },
      { texto: `(${texto(dados.valorExtenso)}),`, negrito: true },
      { texto: "pago na seguinte modalidade:" },
    ],
  });
  y -= 8;
  y = desenharTextoSimples({
    pagina,
    fonte: fontes.italico,
    conteudo: texto(dados.modalidadePagamento),
    x,
    y,
    largura,
    tamanho: 11,
    alturaLinha: 13.6,
    cor: CINZA_TEXTO,
  });

  [
    "4. Com a confirmação do pagamento, a empresa dará continuidade à prestação dos serviços contratados, observadas as condições originalmente pactuadas.",
    "5. Este termo passa a produzir efeitos a partir da data de sua assinatura, podendo ser assinado eletronicamente ou por meio de confirmação via plataforma digital ou aplicativo de mensagens, quando admitido pelas partes.",
    "E, por estarem de acordo, firmam o presente Termo.",
  ].forEach((paragrafo) => {
    y -= 14;
    y = desenharTextoSimples({
      pagina,
      fonte: fontes.normal,
      conteudo: paragrafo,
      x,
      y,
      largura,
      tamanho: 11,
      alturaLinha: 13.6,
      cor: CINZA_TEXTO,
    });
  });

  y -= 27;
  desenharCentralizado(
    pagina,
    fontes.italico,
    `São Paulo/SP, ${dataDocumento(dados)}.`,
    y,
    10.5,
    A4[0],
  );
  desenharAssinaturas({
    pagina,
    fontes,
    assinatura,
    carimbo,
    nomeCliente: dados.nomeCliente,
    yLinhaCliente: 240,
  });

  return pdf.save();
}

export async function gerarRelatorioNegociacaoHomologacaoPdf(
  dados,
  { assinaturaBytes, carimboBytes } = {},
) {
  const pdf = await PDFDocument.create();
  const fontes = await criarFontes(pdf);
  const assinatura = await incorporarImagemPng(pdf, assinaturaBytes);
  const carimbo = await incorporarImagemPng(pdf, carimboBytes);
  const pagina1 = pdf.addPage(A4);
  let y = desenharCabecalhoRetrato(
    pagina1,
    fontes,
    "Relatório de Negociação — Acordo de Homologação",
  );
  const x = 85.05;
  const largura = A4[0] - x - 76.55;
  const tamanho = 11.2;
  const alturaLinha = 13.2;

  y = desenharTextoSimples({
    pagina: pagina1,
    fonte: fontes.normal,
    conteudo: `São Paulo/SP, ${dataDocumento(dados)}.`,
    x,
    y,
    largura,
    tamanho,
    alturaLinha,
  });
  y -= 12;
  pagina1.drawText("À", { x, y, size: tamanho, font: fontes.normal, color: PRETO });
  y -= 14;
  pagina1.drawText(texto(dados.nomeCliente).toUpperCase(), { x, y, size: tamanho, font: fontes.negrito, color: PRETO });
  y -= 14;
  pagina1.drawText(`CPF nº ${texto(dados.cpfCnpj)}`, { x, y, size: tamanho, font: fontes.normal, color: PRETO });

  const blocos = [
    "O presente relatório tem por finalidade registrar a atualização das tratativas realizadas junto à instituição financeira, referentes ao procedimento de homologação.",
    `No último contato realizado em ${texto(dados.dataUltimoContato)}, foi informado pela instituição financeira que os valores referentes às parcelas em atraso totalizam R$ ${semPrefixoReal(dados.valorParcelasAtraso)} (${texto(dados.valorParcelasAtrasoExtenso)}).`,
    `Na mesma ocasião, foi apresentada proposta de quitação atual no valor de R$ ${semPrefixoReal(dados.valorQuitacaoAtual)} (${texto(dados.valorQuitacaoAtualExtenso)}), considerando as condições disponibilizadas pela financeira até a presente data.`,
    "A Platino Assessoria Financeira segue em tratativas periódicas com a instituição financeira, com o objetivo de buscar a manutenção ou aproximação do valor inicialmente apresentado, bem como melhores condições para encerramento da obrigação contratual, conforme interesse e viabilidade do cliente.",
    "Também foram repassadas ao cliente as informações atualizadas sobre o andamento da negociação, valores apresentados e medidas que poderão ser adotadas durante o procedimento.",
  ];
  blocos.forEach((bloco, indice) => {
    y -= indice === 0 ? 31 : 15;
    y = desenharTextoSimples({
      pagina: pagina1,
      fonte: fontes.normal,
      conteudo: bloco,
      x,
      y,
      largura,
      tamanho,
      alturaLinha,
    });
  });

  y -= 13;
  pagina1.drawText("Informações atualizadas da negociação", {
    x,
    y,
    size: tamanho,
    font: fontes.negrito,
    color: PRETO,
  });
  y -= 27;
  const linhasInformacoes = [
    `Número de protocolo: ${texto(dados.protocolo)}`,
    `Saldo devedor total atualizado: R$ ${semPrefixoReal(dados.saldoDevedorAtualizado)} (${texto(dados.saldoDevedorAtualizadoExtenso)})`,
    `Valor atual para quitação com desconto: R$ ${semPrefixoReal(dados.valorQuitacaoDesconto)} (${texto(dados.valorQuitacaoDescontoExtenso)})`,
    `Quantidade de parcelas em atraso: ${texto(dados.quantidadeParcelasAtraso)}`,
    `Valor total das parcelas em atraso: R$ ${semPrefixoReal(dados.valorTotalParcelasAtraso)} (${texto(dados.valorTotalParcelasAtrasoExtenso)})`,
    `Data da proposta informada pela financeira: ${texto(dados.dataPropostaFinanceira)}`,
    `Prazo de validade da proposta: ${texto(dados.prazoValidadeProposta)}`,
  ];
  linhasInformacoes.forEach((linha) => {
    y = desenharTextoSimples({
      pagina: pagina1,
      fonte: fontes.normal,
      conteudo: linha,
      x,
      y,
      largura,
      tamanho: 10.4,
      alturaLinha: 12.5,
    });
    y -= 8;
  });

  const pagina2 = pdf.addPage(A4);
  desenharFaixa(pagina2);
  desenharRodape(pagina2, fontes);
  let y2 = 800;
  pagina2.drawText("Manifestação do cliente", {
    x,
    y: y2,
    size: 12,
    font: fontes.negrito,
    color: PRETO,
  });
  y2 -= 30;
  y2 = desenharTextoSimples({
    pagina: pagina2,
    fonte: fontes.normal,
    conteudo: "Após ciência dos valores atualizados e das condições apresentadas pela instituição financeira, o cliente informa que:",
    x,
    y: y2,
    largura,
    tamanho: 11.2,
    alturaLinha: 13.5,
  });

  const opcoes = [
    { value: "interesse-quitacao", label: "possui interesse na quitação pelo valor apresentado;" },
    { value: "aguardar-negociacao", label: "deseja aguardar nova tentativa de negociação;" },
    { value: "sem-interesse", label: "não possui interesse na proposta atual;" },
    { value: "nova-analise", label: "solicita nova análise ou atualização dos valores antes de qualquer decisão." },
  ];
  y2 -= 10;
  opcoes.forEach((opcao) => {
    const marcado = texto(dados.manifestacaoCliente) === opcao.value;
    pagina2.drawText(`[ ${marcado ? "X" : " "} ] ${opcao.label}`, {
      x,
      y: y2,
      size: 9,
      font: fontes.normal,
      color: PRETO,
    });
    y2 -= 25;
  });

  pagina2.drawText("Considerações finais", {
    x,
    y: y2,
    size: 12,
    font: fontes.negrito,
    color: PRETO,
  });
  y2 -= 31;
  [
    "A Platino Assessoria Financeira seguirá em negociação junto à instituição financeira, buscando a melhor condição possível para quitação do financiamento, especialmente quanto à redução do saldo exigido, manutenção de eventual proposta anterior e atualização das condições comerciais disponíveis.",
    "Havendo nova proposta, alteração de valores, emissão de boleto ou necessidade de manifestação expressa do cliente, este será devidamente comunicado para ciência e decisão.",
    "O presente relatório possui caráter informativo e registra o andamento das tratativas administrativas realizadas até a presente data, não representando garantia de aprovação, manutenção de desconto ou obrigatoriedade de aceitação da proposta por parte da instituição financeira.",
    "A continuidade da negociação dependerá da atualização dos valores pela financeira, da validade da proposta apresentada e da manifestação de interesse do cliente.",
  ].forEach((paragrafo) => {
    y2 = desenharTextoSimples({
      pagina: pagina2,
      fonte: fontes.normal,
      conteudo: paragrafo,
      x,
      y: y2,
      largura,
      tamanho: 11.2,
      alturaLinha: 13.5,
    });
    y2 -= 19;
  });

  desenharAssinaturas({
    pagina: pagina2,
    fontes,
    assinatura,
    carimbo,
    nomeCliente: dados.nomeCliente,
    yLinhaCliente: 208,
    cnpj: "CNPJ nº 52.807.405/0001-3",
  });

  return pdf.save();
}

export async function gerarCertidaoDiligenciaContatoProfissionalPdf(
  dados,
  {
    assinaturaPlatinoBytes,
    clicksignBytes,
    seloReproducaoBytes,
    icpBrasilBytes,
  } = {},
) {
  const pdf = await PDFDocument.create();
  const fontes = await criarFontes(pdf, "helvetica");
  const tituloFonte = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const assinaturaPlatino = await incorporarImagemPng(pdf, assinaturaPlatinoBytes);
  const clicksign = await incorporarImagemPng(pdf, clicksignBytes);
  const seloReproducao = await incorporarImagemPng(pdf, seloReproducaoBytes);
  const icpBrasil = await incorporarImagemPng(pdf, icpBrasilBytes);
  const pagina1 = pdf.addPage(A4);
  const margem = 36;
  const largura = A4[0] - margem * 2;
  const corCorpo = rgb(128 / 255, 128 / 255, 128 / 255);
  const genero = flexoesGenero(dados.genero);
  const comarca = texto(dados.estadoCidade || dados.estado || dados.localEmissao);
  const instituicao = texto(dados.instituicaoFinanceira || dados.banco);
  const dataAssinatura = partesDataDocumento(dados.dataAssinatura || dados.data, dados);
  const horaAssinatura = texto(dados.horaAssinatura);

  desenharCentralizado(
    pagina1,
    tituloFonte,
    "CERTIDÃO DE DILIGÊNCIA E CONTATO PROFISSIONAL",
    792,
    12,
    A4[0],
  );

  let y = 755;
  const paragrafos = [
    `CERTIFICO, para os devidos fins, que, na presente data, foi realizada diligência e contato profissional entre a empresa representante PLATINO SOLUÇÕES FINANCEIRAS e a Dra. Juliana Cristina Galzo, brasileira, divorciada, advogada inscrita na OAB/SP nº 336.677, com a finalidade de obter esclarecimentos acerca do andamento e das providências processuais necessárias para a conclusão do caso envolvendo ${genero.artigo} ${genero.tratamento} ${texto(dados.nomeCliente)}, ${texto(dados.nacionalidade)}, ${texto(dados.estadoCivil)}, ${texto(dados.profissao)}, ${genero.inscrito} no CPF nº ${texto(dados.cpfCnpj)}, em trâmite perante a Vara Estadual de Direito Bancário da Comarca de ${comarca}.`,
    "Durante a tratativa, foi informado pela patrona que o processo se encontra atualmente em fase de Conclusão. Contudo, para viabilizar a conclusão da demanda, faz-se necessária a adoção de medida processual complementar consistente na intimação formal da instituição financeira por intermédio de Oficial de Justiça, em observância às determinações constantes nos autos.",
    `Conforme esclarecido pela Dra. Juliana Cristina Galzo, após a efetivação da diligência e a respectiva certificação da ciência do representante do ${instituicao}, mediante assinatura ou comprovação legal da intimação, será concedido ao banco o prazo de cinco dias úteis para apresentação e regularização das informações, documentos ou providências determinadas no processo judicial.`,
    "Ainda segundo a avaliação técnica da advogada, tal providência constitui a medida juridicamente mais adequada, célere e estratégica para o regular prosseguimento da ação, permitindo que ambos lados disponham de todos os elementos necessários para a prolação do acordo.",
    "Por fim, foi consignado que, uma vez cumprida a intimação e atendidas as determinações extrajudiciais pela instituição financeira, o acordo retornará à análise para conclusão e decisão final da demanda.",
    "Para emitir o mandado, é necessário pagar a Guia de Diligência do Oficial de Justiça, cujo valor varia de acordo com o Estado. O valor da diligência deve ser pago obrigatoriamente por meio de uma guia bancária oficial do Tribunal de Justiça. Prestação de Contas: A assessoria jurídica emite essa guia, realiza o pagamento e anexa o comprovante direto no processo para o juiz fiscalizar. Fundo de Custas: O dinheiro vai para uma conta oficial do Tribunal, que depois repassa a verba de transporte e trabalho ao Oficial de Justiça de forma legal. Nada mais havendo a certificar, lavra-se a presente certidão para registro das informações obtidas junto à patrona responsável.",
  ];

  paragrafos.forEach((paragrafo) => {
    y = desenharTextoSimples({
      pagina: pagina1,
      fonte: fontes.normal,
      conteudo: paragrafo,
      x: margem,
      y,
      largura,
      tamanho: 10.4,
      alturaLinha: 12.1,
      cor: corCorpo,
    });
    y -= 8;
  });

  y -= 2;
  pagina1.drawText(
    "Luciano de Araujo Oliveira - Escrevente Autorizado / Responsável pela Certidão",
    { x: margem, y, size: 10, font: fontes.negrito, color: PRETO },
  );
  y -= 28;
  pagina1.drawText("Juliana Cristina Galzo - OAB/SP nº 336.677", {
    x: margem,
    y,
    size: 10,
    font: fontes.italico,
    color: PRETO,
  });
  y -= 29;
  pagina1.drawText(
    `${texto(dados.consultor)} - Representante da Platino Soluções Financeiras`,
    { x: margem, y, size: 10, font: fontes.italico, color: PRETO },
  );
  if (assinaturaPlatino) {
    pagina1.drawImage(assinaturaPlatino, {
      x: 434,
      y: Math.max(24, y - 53),
      width: 116.3,
      height: 61,
    });
  }

  const pagina2 = pdf.addPage(A4);
  if (clicksign) {
    pagina2.drawImage(clicksign, {
      x: margem,
      y: 783,
      width: 60,
      height: 15,
    });
  }
  pagina2.drawText("Anexos", {
    x: margem,
    y: 742,
    size: 20,
    font: fontes.normal,
    color: rgb(15 / 255, 71 / 255, 97 / 255),
  });
  pagina2.drawText("Platino Assessoria", {
    x: margem,
    y: 696,
    size: 12,
    font: fontes.negrito,
    color: PRETO,
  });
  pagina2.drawText(
    `Assinou o documento em ${dataAssinatura.dia} de ${dataAssinatura.mes} de ${dataAssinatura.ano} às ${horaAssinatura}`,
    { x: margem, y: 674, size: 10.5, font: fontes.normal, color: PRETO },
  );
  pagina2.drawText("Datas e horários em GMT -03:00 Brasília", {
    x: margem,
    y: 645,
    size: 8.5,
    font: fontes.normal,
    color: CINZA_TEXTO,
  });
  pagina2.drawText(
    `Log gerado em ${dataAssinatura.dia} de ${dataAssinatura.mes} de ${dataAssinatura.ano}. Versão v1.50.0.`,
    { x: margem, y: 632, size: 8.5, font: fontes.normal, color: CINZA_TEXTO },
  );
  pagina2.drawText("ASSINATURA MANUSCRITA", {
    x: margem,
    y: 590,
    size: 8,
    font: fontes.negrito,
    color: CINZA_TEXTO,
  });
  pagina2.drawText("Assinatura manuscrita com hash SHA256 prefixo 606c17(...)", {
    x: margem,
    y: 566,
    size: 9.5,
    font: fontes.normal,
    color: PRETO,
  });
  if (seloReproducao) {
    pagina2.drawImage(seloReproducao, {
      x: margem,
      y: 442,
      width: 200,
      height: 100,
    });
  }
  pagina2.drawText("Platino Assessoria", {
    x: margem + 63,
    y: 421,
    size: 8,
    font: fontes.normal,
    color: rgb(51 / 255, 51 / 255, 51 / 255),
  });

  pagina2.drawLine({
    start: { x: margem, y: 177 },
    end: { x: A4[0] - margem, y: 177 },
    thickness: 0.6,
    color: CINZA_LINHA,
  });
  pagina2.drawText("Documento assinado com validade jurídica.", {
    x: margem,
    y: 151,
    size: 9,
    font: fontes.negrito,
    color: PRETO,
  });
  pagina2.drawText("Para conferir a validade, acesse", {
    x: margem,
    y: 136,
    size: 8.5,
    font: fontes.normal,
    color: PRETO,
  });
  pagina2.drawText("https://www.clicksign.com/validador", {
    x: margem,
    y: 121,
    size: 8.5,
    font: fontes.normal,
    color: AZUL_TITULO,
  });
  pagina2.drawText("e utilize a senha gerada pelos signatários.", {
    x: margem,
    y: 106,
    size: 8.5,
    font: fontes.normal,
    color: PRETO,
  });
  if (icpBrasil) {
    pagina2.drawImage(icpBrasil, {
      x: A4[0] - 79,
      y: 105,
      width: 40,
      height: 51.5,
    });
  }
  if (clicksign) {
    pagina2.drawImage(clicksign, {
      x: margem,
      y: 36,
      width: 60,
      height: 15,
    });
  }
  const identificador = "5214512c-17f6-43e0-821c-2a766cbfbca";
  desenharCentralizado(pagina2, fontes.normal, identificador, 60, 7.5, A4[0], CINZA_TEXTO);
  pagina2.drawText("Página 2 de 2 do Log", {
    x: A4[0] - margem - 76,
    y: 60,
    size: 7.5,
    font: fontes.normal,
    color: CINZA_TEXTO,
  });

  return pdf.save();
}
