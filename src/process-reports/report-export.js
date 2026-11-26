import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { normalizeReport, reportBlocks } from './report-core.js';

export const PAGE = Object.freeze({ width: 595.28, height: 841.89, left: 54, right: 54, top: 700, bottom: 122, line: 14 });
const encoder = new TextEncoder();
const xml = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

function wrap(text, font, size, width) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let remainder = word;
      while (remainder && font.widthOfTextAtSize(remainder, size) > width) {
        if (current) { lines.push(current); current = ''; }
        let piece = '';
        for (const char of remainder) { if (font.widthOfTextAtSize(piece + char, size) > width) break; piece += char; }
        if (!piece) throw new Error('Caractere incompatível com a fonte institucional.');
        lines.push(piece); remainder = remainder.slice(piece.length);
      }
      if (!remainder) continue;
      if (current && font.widthOfTextAtSize(`${current} ${remainder}`, size) > width) { lines.push(current); current = ''; }
      current += `${current ? ' ' : ''}${remainder}`;
    }
    lines.push(current);
  }
  return lines;
}

export async function createReportDocument(input, date, letterheadBytes) {
  const report = normalizeReport(input);
  if (!letterheadBytes?.length) throw new Error('Importe o papel timbrado oficial antes de exportar.');
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(letterheadBytes);
  const imageScale = Math.min(PAGE.width / image.width, PAGE.height / image.height);
  const background = { x: (PAGE.width - image.width * imageScale) / 2, y: (PAGE.height - image.height * imageScale) / 2, width: image.width * imageScale, height: image.height * imageScale };
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const width = PAGE.width - PAGE.left - PAGE.right;
  const pages = [[]]; let y = PAGE.top;
  const next = () => { if (pages.length >= 40) throw new Error('O relatório excedeu 40 páginas. Reduza o conteúdo.'); pages.push([]); y = PAGE.top; };
  for (const block of reportBlocks(report, date)) {
    const bold = ['title', 'heading', 'signature'].includes(block.kind);
    const size = block.kind === 'title' ? 12 : block.kind === 'heading' ? 11 : 10.5;
    const font = bold ? fonts.bold : fonts.regular;
    let lines;
    try { lines = wrap(block.text, font, size, width); }
    catch { throw new Error('Há caracteres incompatíveis com a fonte institucional. Revise símbolos especiais no texto.'); }
    const keep = block.kind === 'heading' ? 3 : Math.min(lines.length, 2);
    if (y - keep * PAGE.line < PAGE.bottom) next();
    for (const text of lines) {
      if (y - PAGE.line < PAGE.bottom) next();
      const measure = font.widthOfTextAtSize(text, size);
      const align = block.kind === 'title' ? 'center' : block.kind === 'date' ? 'right' : 'left';
      const x = align === 'center' ? (PAGE.width - measure) / 2 : align === 'right' ? PAGE.width - PAGE.right - measure : PAGE.left;
      pages.at(-1).push({ text, x, y, size, bold, kind: block.kind, align });
      y -= PAGE.line;
    }
    y -= block.kind === 'heading' ? 5 : 7;
  }
  pages.forEach((lines, index) => {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    page.drawImage(image, background);
    lines.forEach(line => page.drawText(line.text, { x: line.x, y: line.y, font: line.bold ? fonts.bold : fonts.regular, size: line.size, color: line.kind === 'heading' ? rgb(0.04, 0.1, 0.31) : rgb(0, 0, 0) }));
    const count = `${index + 1} / ${pages.length}`;
    page.drawText(count, { x: (PAGE.width - fonts.regular.widthOfTextAtSize(count, 8)) / 2, y: 110, size: 8, font: fonts.regular, color: rgb(0.3, 0.3, 0.3) });
  });
  pdf.setTitle('Relatório de Acompanhamento Processual'); pdf.setAuthor('Platino Soluções Financeiras');
  return { pdf: await pdf.save(), pages, background, letterheadBytes };
}

// Minimal standards-based ZIP writer (stored entries). OOXML stays editable.
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function concat(parts) { const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0; for (const p of parts) { result.set(p, offset); offset += p.length; } return result; }
function header(size, values) { const bytes = new Uint8Array(size), view = new DataView(bytes.buffer); values.forEach(([at, value, length = 4]) => length === 2 ? view.setUint16(at, value, true) : view.setUint32(at, value, true)); return bytes; }
export function zipFiles(files) {
  const local = [], central = []; let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const filename = encoder.encode(name), bytes = typeof value === 'string' ? encoder.encode(value) : value;
    const crc = crc32(bytes);
    const entry = header(30, [[0,0x04034b50],[4,20,2],[10,0,2],[12,33,2],[14,crc],[18,bytes.length],[22,bytes.length],[26,filename.length,2]]);
    local.push(entry, filename, bytes);
    central.push(header(46, [[0,0x02014b50],[4,20,2],[6,20,2],[14,33,2],[16,crc],[20,bytes.length],[24,bytes.length],[28,filename.length,2],[42,offset]]), filename);
    offset += entry.length + filename.length + bytes.length;
  }
  const directory = concat(central), count = Object.keys(files).length;
  return concat([...local, directory, header(22, [[0,0x06054b50],[8,count,2],[10,count,2],[12,directory.length],[16,offset]])]);
}
export function createWordDocument(document) {
  const { pages, background, letterheadBytes } = document;
  const emu = value => Math.round(value * 12700);
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const image = `<w:p><w:r><w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${emu(background.x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${emu(PAGE.height - background.y - background.height)}</wp:posOffset></wp:positionV><wp:extent cx="${emu(background.width)}" cy="${emu(background.height)}"/><wp:wrapNone/><wp:docPr id="1" name="Papel timbrado oficial Platino" descr="Cabeçalho, marca d’água e rodapé institucionais"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="papel-timbrado.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(background.width)}" cy="${emu(background.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
  const content = pages.map((lines, index) => lines.map((line, j) => {
    const gap = j ? Math.max(0, lines[j - 1].y - line.y - PAGE.line) : 0;
    return `<w:p><w:pPr>${index && j === 0 ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="${Math.round(gap * 20)}" w:after="0" w:line="280" w:lineRule="exact"/><w:jc w:val="${line.align}"/><w:widowControl w:val="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="${line.size * 2}"/>${line.bold ? '<w:b/>' : ''}${line.kind === 'heading' ? '<w:color w:val="0A194F"/>' : ''}<w:lang w:val="pt-BR"/></w:rPr><w:t xml:space="preserve">${xml(line.text)}</w:t></w:r></w:p>`;
  }).join('')).join('');
  const rel = (id, type, target) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  const rels = value => `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${value}</Relationships>`;
  return zipFiles({
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`,
    '_rels/.rels': rels(rel('rIdOffice', 'officeDocument', 'word/document.xml')),
    'word/_rels/document.xml.rels': rels(rel('rIdHeader', 'header', 'header1.xml') + rel('rIdFooter', 'footer', 'footer1.xml')),
    'word/_rels/header1.xml.rels': rels(rel('rIdImage', 'image', 'media/papel-timbrado.png')),
    'word/media/papel-timbrado.png': letterheadBytes,
    'word/header1.xml': `<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="${namespace}">${image}</w:hdr>`,
    'word/footer1.xml': `<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="${namespace}"><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${content}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${Math.round((PAGE.height - PAGE.top - 11) * 20)}" w:bottom="2440" w:left="1080" w:right="1080" w:header="0" w:footer="2140"/><w:cols w:space="708"/></w:sectPr></w:body></w:document>`
  });
}
