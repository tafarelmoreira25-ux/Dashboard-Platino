import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  rgb,
} from "pdf-lib";

const A4 = [595.28, 841.89];
const MARGEM = 54;
const TOPO = 754;
const BASE = 58;
const LARGURA = A4[0] - MARGEM * 2;
const AZUL = rgb(23 / 255, 54 / 255, 93 / 255);
const AZUL_LINK = rgb(0, 82 / 255, 180 / 255);
const CINZA = rgb(95 / 255, 105 / 255, 120 / 255);
const PRETO = rgb(0, 0, 0);

function texto(valor) {
  return String(valor ?? "").trim();
}

function tokens(segmentos, fontes, tamanho, largura) {
  const resultado = [];
  let linha = [];
  let medida = 0;

  function concluir() {
    resultado.push(linha);
    linha = [];
    medida = 0;
  }

  for (const segmento of segmentos) {
    const fonte = segmento.negrito ? fontes.negrito : fontes.normal;
    const partes = String(segmento.texto ?? "").split(/(\n|\s+)/);
    for (const parte of partes) {
      if (parte === "\n") {
        concluir();
        continue;
      }
      if (!parte.trim()) continue;
      const medidaPalavra = fonte.widthOfTextAtSize(parte, tamanho);
      const medidaEspaco = linha.length
        ? linha.at(-1).fonte.widthOfTextAtSize(" ", tamanho)
        : 0;
      if (linha.length && medida + medidaEspaco + medidaPalavra > largura) concluir();
      linha.push({ texto: parte, fonte });
      medida += (linha.length > 1 ? medidaEspaco : 0) + medidaPalavra;
    }
  }
  if (linha.length || !resultado.length) concluir();
  return resultado;
}

function adicionarLink(pdf, pagina, url, x, y, largura, altura) {
  if (!/^https?:\/\//i.test(texto(url))) return;
  const rect = PDFArray.withContext(pdf.context);
  [x, y, x + largura, y + altura].forEach((valor) => rect.push(PDFNumber.of(valor)));
  const border = PDFArray.withContext(pdf.context);
  [0, 0, 0].forEach((valor) => border.push(PDFNumber.of(valor)));
  const anotacao = pdf.context.register(pdf.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Link"),
    Rect: rect,
    Border: border,
    A: pdf.context.obj({
      Type: PDFName.of("Action"),
      S: PDFName.of("URI"),
      URI: PDFString.of(url),
    }),
  }));
  pagina.node.addAnnot(anotacao);
}

function cabecalhoRodape(contexto, pagina) {
  const { fontes } = contexto;
  pagina.drawText("PLATINO", { x: MARGEM, y: 807, size: 9, font: fontes.negrito, color: AZUL });
  pagina.drawText("SOLUÇÕES FINANCEIRAS", { x: MARGEM + 44, y: 807, size: 7.5, font: fontes.normal, color: AZUL });
  const titulo = "RELATÓRIO DE ATUALIZAÇÃO DO PROCESSO JUDICIAL";
  const larguraTitulo = fontes.negrito.widthOfTextAtSize(titulo, 8.2);
  pagina.drawText(titulo, { x: A4[0] - MARGEM - larguraTitulo, y: 807, size: 8.2, font: fontes.negrito, color: AZUL });
  pagina.drawLine({ start: { x: MARGEM, y: 795 }, end: { x: A4[0] - MARGEM, y: 795 }, thickness: 1.2, color: AZUL });

  pagina.drawLine({ start: { x: MARGEM, y: 45 }, end: { x: A4[0] - MARGEM, y: 45 }, thickness: 0.6, color: rgb(0.75, 0.78, 0.82) });
  const rodape1 = "Rua Fontoura Xavier, nº 1308 - Itaquera - São Paulo/SP - CEP: 08295-300";
  const rodape2 = "E-mail: platinoassessoriafinanceira@gmail.com";
  [rodape1, rodape2].forEach((linha, indice) => {
    const largura = fontes.normal.widthOfTextAtSize(linha, 7.5);
    pagina.drawText(linha, { x: (A4[0] - largura) / 2, y: indice ? 20 : 31, size: 7.5, font: fontes.normal, color: CINZA });
  });
}

function novaPagina(contexto) {
  const pagina = contexto.pdf.addPage(A4);
  cabecalhoRodape(contexto, pagina);
  contexto.pagina = pagina;
  contexto.y = TOPO;
  return pagina;
}

function garantir(contexto, altura) {
  if (contexto.y - altura < BASE) novaPagina(contexto);
}

function paragrafo(contexto, segmentos, opcoes = {}) {
  const tamanho = opcoes.tamanho ?? 10.2;
  const alturaLinha = opcoes.alturaLinha ?? 13;
  const largura = opcoes.largura ?? LARGURA;
  const x = opcoes.x ?? MARGEM;
  const linhas = tokens(segmentos, contexto.fontes, tamanho, largura);
  const antes = opcoes.antes ?? 3;
  const depois = opcoes.depois ?? 5;
  if (opcoes.manterJunto) garantir(contexto, antes + linhas.length * alturaLinha + depois);
  contexto.y -= antes;

  linhas.forEach((linha, indice) => {
    garantir(contexto, alturaLinha);
    const larguraPalavras = linha.reduce((total, palavra) => total + palavra.fonte.widthOfTextAtSize(palavra.texto, tamanho), 0);
    const espacos = Math.max(0, linha.length - 1);
    const espacoPadrao = contexto.fontes.normal.widthOfTextAtSize(" ", tamanho);
    const ultima = indice === linhas.length - 1;
    const espaco = opcoes.alinhamento === "justify" && !ultima && espacos
      ? Math.max(espacoPadrao, (largura - larguraPalavras) / espacos)
      : espacoPadrao;
    const larguraLinha = larguraPalavras + espacoPadrao * espacos;
    let cursor = x;
    if (opcoes.alinhamento === "center") cursor = x + (largura - larguraLinha) / 2;
    if (opcoes.alinhamento === "right") cursor = x + largura - larguraLinha;
    linha.forEach((palavra, palavraIndice) => {
      if (palavraIndice) cursor += espaco;
      contexto.pagina.drawText(palavra.texto, { x: cursor, y: contexto.y, size: tamanho, font: palavra.fonte, color: opcoes.cor ?? PRETO });
      cursor += palavra.fonte.widthOfTextAtSize(palavra.texto, tamanho);
    });
    contexto.y -= alturaLinha;
  });
  contexto.y -= depois;
}

function secao(contexto, titulo) {
  garantir(contexto, 26);
  contexto.y -= 6;
  contexto.pagina.drawText(titulo.toUpperCase(), { x: MARGEM, y: contexto.y, size: 9.3, font: contexto.fontes.negrito, color: AZUL });
  contexto.y -= 5;
  contexto.pagina.drawLine({ start: { x: MARGEM, y: contexto.y }, end: { x: A4[0] - MARGEM, y: contexto.y }, thickness: 0.8, color: AZUL });
  contexto.y -= 11;
}

function linhaCampo(contexto, rotulo, valor, opcoes = {}) {
  paragrafo(contexto, [
    { texto: `${rotulo}:`, negrito: true },
    { texto: texto(valor) || "Não informado" },
  ], { antes: 0, depois: opcoes.depois ?? 3, tamanho: opcoes.tamanho ?? 9.8, manterJunto: true });
}

function dadosDaImagem(valor) {
  const match = texto(valor).match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i);
  if (!match) return null;
  const binario = atob(match[2]);
  return {
    mime: match[1].toLowerCase(),
    bytes: Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0)),
  };
}

export async function gerarRelatorioAtualizacaoProcessoPdf(dados, { assinaturaBytes } = {}) {
  const pdf = await PDFDocument.create();
  const fontes = {
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    negrito: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const contexto = { pdf, fontes, pagina: null, y: TOPO };
  novaPagina(contexto);

  linhaCampo(contexto, "Número do Processo", dados.numeroProcesso, { tamanho: 11, depois: 5 });
  linhaCampo(contexto, "Origem", dados.origem);
  linhaCampo(contexto, "Segredo ou sigilo", dados.sigilo);
  linhaCampo(contexto, "Justiça Gratuita", dados.justicaGratuita);
  linhaCampo(contexto, "Data da distribuição", dados.dataDistribuicao, { depois: 8 });

  garantir(contexto, 76);
  const coluna = (LARGURA - 12) / 2;
  const yTabela = contexto.y;
  contexto.pagina.drawRectangle({ x: MARGEM, y: yTabela - 60, width: LARGURA, height: 60, borderWidth: 0.8, borderColor: rgb(0.65, 0.68, 0.72) });
  contexto.pagina.drawLine({ start: { x: MARGEM + coluna + 12, y: yTabela }, end: { x: MARGEM + coluna + 12, y: yTabela - 60 }, thickness: 0.8, color: rgb(0.65, 0.68, 0.72) });
  contexto.pagina.drawRectangle({ x: MARGEM, y: yTabela - 19, width: LARGURA, height: 19, color: rgb(0.94, 0.96, 0.98) });
  paragrafo(contexto, [{ texto: "POLO ATIVO", negrito: true }], { x: MARGEM + 5, largura: coluna, tamanho: 9, alinhamento: "center", antes: 4, depois: 0 });
  contexto.y = yTabela - 14;
  paragrafo(contexto, [{ texto: "POLO PASSIVO", negrito: true }], { x: MARGEM + coluna + 17, largura: coluna, tamanho: 9, alinhamento: "center", antes: 0, depois: 0 });
  contexto.y = yTabela - 27;
  paragrafo(contexto, [{ texto: texto(dados.cliente) || "Não informado", negrito: true }, { texto: `\nADV.: ${texto(dados.advogadoCliente) || "Não informado"}` }], { x: MARGEM + 7, largura: coluna - 10, tamanho: 8.7, alturaLinha: 11, antes: 0, depois: 0 });
  contexto.y = yTabela - 27;
  paragrafo(contexto, [{ texto: texto(dados.banco) || "Não informado", negrito: true }, { texto: `\nADV.: ${texto(dados.advogadoBanco) || "Não informado"}` }], { x: MARGEM + coluna + 19, largura: coluna - 10, tamanho: 8.7, alturaLinha: 11, antes: 0, depois: 0 });
  contexto.y = yTabela - 69;

  linhaCampo(contexto, "Assunto", dados.assunto, { depois: 7 });
  secao(contexto, "Status atual");
  paragrafo(contexto, [{ texto: dados.statusAtual }], { alinhamento: "justify", antes: 0, depois: 7 });
  secao(contexto, "Atualização processual");
  paragrafo(contexto, [{ texto: dados.atualizacaoProcessual }], { alinhamento: "justify", antes: 0, depois: 7 });
  secao(contexto, "Última movimentação");
  paragrafo(contexto, [
    { texto: texto(dados.dataUltimaMovimentacao), negrito: true },
    { texto: dados.descricaoUltimaMovimentacao },
  ], { alinhamento: "justify", antes: 0, depois: 7 });

  secao(contexto, "Consulta do processo");
  linhaCampo(contexto, "Data da consulta", `${texto(dados.dataConsulta)}${dados.horaConsulta ? ` - Hora: ${texto(dados.horaConsulta)}` : ""}`);
  const url = texto(dados.linkProcesso);
  if (url) {
    garantir(contexto, 28);
    const chamada = "CLIQUE AQUI PARA CONSULTAR AS MOVIMENTAÇÕES DO PROCESSO";
    const larguraChamada = fontes.negrito.widthOfTextAtSize(chamada, 9.5);
    const x = (A4[0] - larguraChamada) / 2;
    contexto.pagina.drawText(chamada, { x, y: contexto.y, size: 9.5, font: fontes.negrito, color: AZUL_LINK });
    contexto.pagina.drawLine({ start: { x, y: contexto.y - 2 }, end: { x: x + larguraChamada, y: contexto.y - 2 }, thickness: 0.6, color: AZUL_LINK });
    adicionarLink(pdf, contexto.pagina, url, x, contexto.y - 4, larguraChamada, 14);
    contexto.y -= 22;
  }

  const imagemInformada = dadosDaImagem(dados.imagemProcesso);
  if (imagemInformada) {
    const imagem = imagemInformada.mime.includes("png")
      ? await pdf.embedPng(imagemInformada.bytes)
      : await pdf.embedJpg(imagemInformada.bytes);
    const escala = Math.min(1, (LARGURA - 20) / imagem.width, 270 / imagem.height);
    const larguraImagem = imagem.width * escala;
    const alturaImagem = imagem.height * escala;
    garantir(contexto, alturaImagem + 18);
    const x = (A4[0] - larguraImagem) / 2;
    contexto.pagina.drawImage(imagem, { x, y: contexto.y - alturaImagem, width: larguraImagem, height: alturaImagem });
    if (url) adicionarLink(pdf, contexto.pagina, url, x, contexto.y - alturaImagem, larguraImagem, alturaImagem);
    contexto.y -= alturaImagem + 12;
  }

  secao(contexto, "Próximos passos");
  paragrafo(contexto, [{ texto: dados.proximosPassos }], { alinhamento: "justify", antes: 0, depois: 7 });
  secao(contexto, "Anexos em processo");
  paragrafo(contexto, [{ texto: dados.anexosProcesso || "Nenhum anexo informado." }], { alinhamento: "justify", antes: 0, depois: 8 });

  paragrafo(contexto, [
    { texto: "Nossa equipe jurídica, juntamente com" },
    { texto: texto(dados.advogadoResponsavel) || "o(a) advogado(a) responsável", negrito: true },
    { texto: "está acompanhando atentamente todas as movimentações processuais e adotará as medidas cabíveis dentro dos prazos estabelecidos pelo Juízo." },
  ], { alinhamento: "justify", manterJunto: true, antes: 5, depois: 10 });

  garantir(contexto, assinaturaBytes ? 120 : 55);
  paragrafo(contexto, [{ texto: "Cordialmente," }], { antes: 0, depois: 6 });
  if (assinaturaBytes) {
    const assinatura = await pdf.embedPng(assinaturaBytes);
    const escala = Math.min(1, 330 / assinatura.width, 105 / assinatura.height);
    const largura = assinatura.width * escala;
    const altura = assinatura.height * escala;
    contexto.pagina.drawImage(assinatura, { x: MARGEM, y: contexto.y - altura, width: largura, height: altura });
    contexto.y -= altura + 4;
  } else {
    paragrafo(contexto, [{ texto: "Rafael Moreira - Departamento Processual", negrito: true }, { texto: "\nPLATINO SOLUÇÕES FINANCEIRAS" }], { antes: 0, depois: 0 });
  }

  return pdf.save();
}
