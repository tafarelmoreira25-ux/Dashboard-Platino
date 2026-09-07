import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { textoSeguroParaPdf } from '../src/lib/pdfHelpers.js';

const entrada = 'Aprovação ✅ — cliente feliz 😊; recusado ❌';
const texto = textoSeguroParaPdf(entrada);

assert.equal(texto, 'Aprovação [OK] - cliente feliz ; recusado [X]');

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
pdf.addPage().drawText(texto, { font, x: 20, y: 20 });
await pdf.save();

console.log('pdf-unicode-safety-test: ok');
