import crypto from "node:crypto";

let clientCache = null;
let clientCacheAt = 0;
const CACHE_MS = 60000;
let firebaseCertificates = null;
let firebaseCertificatesExpireAt = 0;

function decodeJwtPart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

async function loadFirebaseCertificates() {
  const now = Date.now();
  if (firebaseCertificates && now < firebaseCertificatesExpireAt) return firebaseCertificates;

  const response = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
    { cache: "no-store" }
  );
  if (!response.ok) throw new Error("Não foi possível validar a autenticação.");

  firebaseCertificates = await response.json();
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 3600);
  firebaseCertificatesExpireAt = now + maxAge * 1000;
  return firebaseCertificates;
}

async function verifyFirebaseToken(request) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID não configurado.");

  const authorization = String(request.headers?.authorization || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = decodeJwtPart(parts[0]);
    const payload = decodeJwtPart(parts[1]);
    if (header.alg !== "RS256" || !header.kid) return null;

    const certificates = await loadFirebaseCertificates();
    const certificate = certificates[header.kid];
    if (!certificate) return null;

    const signatureIsValid = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      certificate,
      Buffer.from(parts[2], "base64url")
    );
    const now = Math.floor(Date.now() / 1000);
    const claimsAreValid =
      payload.aud === projectId &&
      payload.iss === `https://securetoken.google.com/${projectId}` &&
      Number(payload.exp) > now &&
      Number(payload.iat) <= now &&
      typeof payload.sub === "string" &&
      payload.sub.length > 0;

    return signatureIsValid && claimsAreValid ? payload : null;
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeRecord(item) {
  return {
    cliente: String(item?.cliente || item?.CLIENTE || "").replace(/\s+/g, " ").trim(),
    dataVenda: String(item?.dataVenda || item?.data || item?.DATA || "").trim(),
    grupoAberto: String(item?.grupoAberto || item?.["GRUPO ABERTO"] || "").trim(),
    status: String(item?.status || item?.STATUS || item?.situacao || "").trim(),
    vendedor: String(item?.vendedor || item?.consultor || item?.VENDEDOR || item?.CONSULTOR || "").replace(/\s+/g, " ").trim(),
    valor: item?.valor ?? item?.valorVenda ?? item?.["VALOR DA VENDA"] ?? "",
    comprovante: String(item?.comprovante || item?.COMPROVANTE || item?.["COMPROVANTE RECEBIDO"] || "").trim(),
    dataComprovante: String(item?.dataComprovante || item?.["DATA DO COMPROVANTE"] || "").trim(),
    distrato: item?.distrato ?? item?.DISTRATO ?? ""
  };
}

function parseSheetDate(value) {
  const text = String(value || "").trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4] || 12), Number(br[5] || 0));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
    : raw.replace(/[^\d.-]/g, "");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

function isCurrentMonth(date) {
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function isPositive(value) {
  return ["sim", "s", "true", "1", "aberto", "recebido"].includes(normalizeText(value));
}

function isDistrato(record) {
  const status = normalizeText(record.status);
  return status.includes("distrato") || status.includes("cancelad") || isPositive(record.distrato);
}

function buildTimeline(clients) {
  const monthRecords = clients
    .map(record => ({ ...record, parsedDate: parseSheetDate(record.dataVenda) }))
    .filter(record => isCurrentMonth(record.parsedDate))
    .sort((a, b) => b.parsedDate - a.parsedDate);
  const events = [];

  for (const record of monthRecords.slice(0, 30)) {
    const value = parseMoney(record.valor);
    events.push({
      id: `venda-${normalizeText(record.cliente)}-${record.dataVenda}`,
      type: isDistrato(record) ? "distrato" : "venda",
      cliente: record.cliente,
      vendedor: record.vendedor,
      valor: value,
      data: record.dataVenda,
      message: isDistrato(record)
        ? `Distrato registrado para ${record.cliente}.`
        : value && record.vendedor
          ? `Venda de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)} da ${record.vendedor}. Parabéns!`
          : `Nova venda registrada para ${record.cliente}${record.vendedor ? ` por ${record.vendedor}` : ""}.`
    });

    if (isPositive(record.grupoAberto)) {
      events.push({
        id: `grupo-${normalizeText(record.cliente)}-${record.dataVenda}`,
        type: "grupo",
        cliente: record.cliente,
        data: record.dataVenda,
        message: `Foi aberto o grupo do cliente ${record.cliente}.`
      });
    }
  }

  const latestProof = monthRecords
    .filter(record => record.dataComprovante || record.comprovante)
    .map(record => parseSheetDate(record.dataComprovante || record.dataVenda))
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  if (latestProof) {
    const hours = Math.floor((Date.now() - latestProof.getTime()) / 3600000);
    if (hours >= 5) {
      events.unshift({
        id: `alerta-comprovante-${latestProof.toISOString()}`,
        type: "alerta",
        data: latestProof.toISOString(),
        hours,
        message: `Equipe, estamos há ${hours} horas sem nenhum comprovante. Quem será o próximo?`
      });
    }
  }

  return {
    events: events.slice(0, 24),
    metrics: {
      distratosMes: monthRecords.filter(isDistrato).length,
      vendasMes: monthRecords.filter(record => !isDistrato(record)).length
    },
    updatedAt: new Date().toISOString()
  };
}

export { buildTimeline };

function scoreClientMatch(query, clientName) {
  const question = ` ${normalizeText(query)} `;
  const name = normalizeText(clientName);
  if (!name) return 0;
  if (question.includes(` ${name} `)) return 1000 + name.length;

  const ignored = new Set([
    "cliente", "grupo", "aberto", "abriu", "venda", "contrato",
    "status", "situacao", "planilha", "quando", "data"
  ]);
  const tokens = name.split(" ").filter(token => token.length >= 3 && !ignored.has(token));
  const matched = tokens.filter(token => question.includes(` ${token} `));
  if (!matched.length) return 0;
  return (matched.length / tokens.length) * 100 + matched.join("").length;
}

async function loadClients(apiUrl) {
  const now = Date.now();
  if (clientCache && now - clientCacheAt < CACHE_MS) return clientCache;

  const upstream = await fetch(apiUrl, {
    cache: "no-store",
    redirect: "follow",
    headers: { Accept: "application/json" }
  });
  if (!upstream.ok) {
    throw new Error(`Google Apps Script respondeu HTTP ${upstream.status}.`);
  }

  const data = await upstream.json();
  if (!Array.isArray(data)) {
    throw new Error("A implantação não retornou uma lista de clientes.");
  }

  clientCache = data.map(normalizeRecord).filter(item => item.cliente);
  clientCacheAt = now;
  return clientCache;
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Método não permitido." });
  }

  const apiUrl = process.env.CLIENT_SHEET_API_URL;
  if (!apiUrl) {
    return response.status(503).json({
      error: "Consulta comercial não configurada no servidor."
    });
  }

  let authenticatedUser;
  try {
    authenticatedUser = await verifyFirebaseToken(request);
  } catch (error) {
    return response.status(503).json({ error: error.message });
  }
  if (!authenticatedUser) {
    return response.status(401).json({
      error: "Autenticação necessária para consultar clientes."
    });
  }

  const action = String(request.query?.action || "").toLowerCase();
  if (action === "timeline") {
    try {
      const clients = await loadClients(apiUrl);
      response.setHeader("Cache-Control", "private, no-store");
      return response.status(200).json(buildTimeline(clients));
    } catch (error) {
      return response.status(502).json({
        error: "Não foi possível montar a linha do tempo.",
        details: error.message
      });
    }
  }

  const query = String(request.query?.q || "").trim();
  if (normalizeText(query).length < 3) {
    return response.status(400).json({
      error: "Informe o nome do cliente na consulta."
    });
  }

  try {
    const clients = await loadClients(apiUrl);
    const scored = clients
      .map(item => ({ item, score: scoreClientMatch(query, item.cliente) }))
      .filter(result => result.score >= 25)
      .sort((a, b) => b.score - a.score);

    const bestScore = scored[0]?.score || 0;
    const matches = scored
      .filter(result => result.score === bestScore)
      .slice(0, 10)
      .map(result => result.item);

    response.setHeader("Cache-Control", "private, no-store");
    return response.status(200).json({
      clientes: matches,
      total: matches.length
    });
  } catch (error) {
    return response.status(502).json({
      error: "Não foi possível consultar a base comercial.",
      details: error.message
    });
  }
}
