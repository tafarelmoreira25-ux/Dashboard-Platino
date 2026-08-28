import { PDFDocument, rgb } from 'pdf-lib';
import { baixarArquivo, textoSeguroParaPdf } from './pdfHelpers.js';

/**
 * Gera um PDF a partir de um template existente e dados posicionais.
 * @param {string} templateUrl URL do PDF de template que será carregado.
 * @param {{ nome?: string, [key: string]: any }} dados Dados do formulário.
 * @param {{ x: number, y: number, size?: number, color?: [number, number, number], textKey: string }[]} campos Campos posicionais a escrever no template.
 * @param {string} nomeArquivo Nome do PDF final.
 */
export async function gerarPdfComTemplate({
  templateUrl = '/assets/template.pdf',
  dados = {},
  campos = [],
  nomeArquivo = 'documento_gerado.pdf',
}) {
  const templateBytes = await fetch(templateUrl).then((res) => {
    if (!res.ok) {
      throw new Error(`Não foi possível carregar o template: ${res.status}`);
    }
    return res.arrayBuffer();
  });

  const pdfDoc = await PDFDocument.load(templateBytes);
  const pages = pdfDoc.getPages();
  const page = pages[0];

  campos.forEach((campo) => {
    const texto = textoSeguroParaPdf(dados[campo.textKey]);
    if (!texto) return;

    page.drawText(texto, {
      x: campo.x,
      y: campo.y,
      size: campo.size ?? 12,
      color: campo.color ? rgb(...campo.color) : rgb(0, 0, 0),
      maxWidth: campo.maxWidth,
      lineHeight: campo.lineHeight,
    });
  });

  const pdfBytes = await pdfDoc.save();
  baixarArquivo(pdfBytes, nomeArquivo);
}
