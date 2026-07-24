import { rgb } from "pdf-lib";

const CINZA_ESCURO = rgb(72 / 255, 79 / 255, 89 / 255);
const CINZA_CLARO = rgb(155 / 255, 161 / 255, 170 / 255);
const PRETO = rgb(0.08, 0.09, 0.11);

function texto(valor) {
  return String(valor ?? "").trim();
}

function centralizar(pagina, fonte, conteudo, y, tamanho, larguraPagina, cor = PRETO) {
  const valor = texto(conteudo);
  pagina.drawText(valor, {
    x: (larguraPagina - fonte.widthOfTextAtSize(valor, tamanho)) / 2,
    y,
    size: tamanho,
    font: fonte,
    color: cor,
  });
}

export function dataHoraAssinatura(data = new Date(), timeZone = "America/Sao_Paulo") {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(data);
  const obter = tipo => partes.find(parte => parte.type === tipo)?.value || "";
  return {
    data: `${obter("day")}/${obter("month")}/${obter("year")}`,
    hora: `${obter("hour")}:${obter("minute")}`,
  };
}

export async function desenharAssinaturaInstitucional({
  pdf,
  pagina,
  fontes,
  yTopo,
  larguraPagina,
  assinaturaBytes,
  nome = "RAFAEL MOREIRA",
  departamento = "Departamento Processual",
  organizacao = "PLATINO SOLUÇÕES FINANCEIRAS",
  dataAssinatura,
  horaAssinatura,
  codigoValidacao,
}) {
  const centro = larguraPagina / 2;
  const larguraLinha = 238;
  const alturaMaximaImagem = 58;
  const larguraMaximaImagem = 190;
  let y = yTopo;
  let imagem = null;

  if (assinaturaBytes?.length) {
    try {
      imagem = await pdf.embedPng(assinaturaBytes);
    } catch {
      imagem = null;
    }
  }

  if (imagem) {
    const escala = Math.min(
      larguraMaximaImagem / imagem.width,
      alturaMaximaImagem / imagem.height,
      1,
    );
    const largura = imagem.width * escala;
    const altura = imagem.height * escala;
    pagina.drawImage(imagem, {
      x: centro - largura / 2,
      y: y - altura,
      width: largura,
      height: altura,
    });
    y -= altura + 12;
  } else {
    centralizar(pagina, fontes.normal, "[ assinatura manuscrita ]", y - 29, 7.5, larguraPagina, CINZA_CLARO);
    y -= 58;
  }

  pagina.drawLine({
    start: { x: centro - larguraLinha / 2, y },
    end: { x: centro + larguraLinha / 2, y },
    thickness: 0.7,
    color: CINZA_ESCURO,
  });

  y -= 18;
  centralizar(pagina, fontes.negrito, nome, y, 9.2, larguraPagina);
  y -= 14;
  centralizar(pagina, fontes.normal, departamento, y, 8.4, larguraPagina, CINZA_ESCURO);
  y -= 14;
  centralizar(pagina, fontes.negrito, organizacao, y, 8.2, larguraPagina, CINZA_ESCURO);

  y -= 24;
  centralizar(pagina, fontes.normal, "Documento assinado digitalmente por", y, 7.5, larguraPagina, CINZA_ESCURO);
  y -= 12;
  centralizar(pagina, fontes.negrito, nome, y, 7.7, larguraPagina, CINZA_ESCURO);
  y -= 12;
  centralizar(pagina, fontes.normal, `em ${texto(dataAssinatura)} às ${texto(horaAssinatura)}`, y, 7.5, larguraPagina, CINZA_ESCURO);

  y -= 19;
  centralizar(pagina, fontes.normal, "Código de validação:", y, 7.2, larguraPagina, CINZA_ESCURO);
  y -= 11;
  centralizar(pagina, fontes.negrito, texto(codigoValidacao) || "Não informado", y, 7.4, larguraPagina, CINZA_ESCURO);
  return y;
}
