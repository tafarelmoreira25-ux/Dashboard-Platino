import crypto from "node:crypto";
import { gerarPdfDinamico } from "../src/lib/dynamicPdfGenerator.js";

const TEMPLATE_TITLES = {
  chargeback: "Contestação de Chargeback",
  "citacao-intimacao-extrajudicial": "Citação Intimação Extrajudicial",
  "citacao-judicial": "Citação Judicial",
  "contestacao-taxas-email": "Contestação de Taxas por E-mail",
  "declaracao-ausencia-carteira-trabalho": "Declaração de Ausência de Carteira de Trabalho",
  "declaracao-hipossuficiencia": "Declaração de Hipossuficiência",
  "declaracao-isencao-irpf": "Declaração de Isenção de IRPF",
  "notificacao-extrajudicial-platino": "Notificação Extrajudicial Platino",
  "procuracao-dra-juliane": "Procuração Ad Judicia",
  "termo-ciencia-autorizacao-seguranca": "Termo de Ciência e Autorização de Segurança",
  "termo-compromisso-pagamento": "Termo de Compromisso de Pagamento",
  "modelo-termo-compromisso-pagamento": "Modelo - Termo de Compromisso de Pagamento",
  "relatorio-atualizacao-processo-judicial": "Relatório de Atualização do Processo Judicial",
  "laudo-pericial-contabil": "Laudo Pericial Contábil",
};

function slugify(value) {
  return String(value || "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "documento";
}

function allowCors(request, response) {
  const origin = request.headers?.origin;
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(request, response) {
  allowCors(request, response);

  if (request.method === "OPTIONS") return response.status(204).end();

  if (request.method === "GET") {
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({
      ok: true,
      engine: "pdf-lib dynamic layout",
      message: "Gerador dinâmico de documentos pronto.",
      templates: Object.keys(TEMPLATE_TITLES),
    });
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    return response.status(405).json({ error: "Método não permitido." });
  }

  const { templateKey, data = {} } = request.body || {};
  const templateTitle = TEMPLATE_TITLES[templateKey];
  if (!templateTitle) {
    return response.status(400).json({ error: "Modelo inválido." });
  }

  try {
    const pdfBytes = await gerarPdfDinamico(templateKey, data);
    const filenameParts = [
      templateTitle,
      data.cliente || data.banco || "documento",
      data.numeroDocumento || crypto.randomUUID().slice(0, 8),
    ];
    const filename = `${filenameParts.map(slugify).join("-")}.pdf`;

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error("Falha ao gerar PDF dinâmico:", error);
    return response.status(500).json({
      error: "Não foi possível gerar o PDF dinâmico.",
      detail: error.message,
    });
  }
}
