import crypto from "node:crypto";

let clientCache = null;
let clientCacheAt = 0;
const CACHE_MS = 60000;
const TIMELINE_WINDOW_MS = 24 * 60 * 60 * 1000;
let firebaseCertificates = null;
let firebaseCertificatesExpireAt = 0;
const DEFAULT_CLIENT_SHEET_API_URL =
  "https://script.google.com/macros/s/AKfycby2b8UGWBXzQahMNgnCFG2N9LFBWeodyJihxCta9LQQ-m5GJACDerEOWHp5FTafbMKGRw/exec";
const DEFAULT_OPERATION_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1MvKj4uO1GJL1XKJMqM5c2dauAG6q8yKt7fYxGaRMBKI/export?format=csv&gid=0";
const DEFAULT_RANKING_TIMELINE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1BJfwUQWr_R5K52QIKi2NHYW48bIJlGjHJwFNDtD4lEg/export?format=csv&gid=945522157";

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

function normalizeHeader(value) {
  return normalizeText(value).toUpperCase();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some(value => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some(value => String(value).trim())) rows.push(row);
  return rows;
}

function recordsFromOperationCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  const findColumn = aliases => {
    for (const alias of aliases) {
      const index = headers.indexOf(normalizeHeader(alias));
      if (index >= 0) return index;
    }
    return -1;
  };
  const columns = {
    cliente: findColumn(["CLIENTE", "NOME DO CLIENTE"]),
    dataVenda: findColumn(["DATA DA VENDA", "DATA VENDA", "DATA"]),
    dataCadastro: findColumn(["DATA/HORA DO CADASTRO", "DATA HORA DO CADASTRO", "CRIADO EM"]),
    vendedor: findColumn(["CONSULTOR", "VENDEDOR", "RESPONSAVEL"]),
    valor: findColumn(["VALOR DO PROCEDIMENTO", "VALOR DA VENDA", "VALOR"]),
    grupoAberto: findColumn(["GRUPO ABERTO", "GRUPO"]),
    dataGrupoAberto: findColumn(["DATA/HORA DA ABERTURA DO GRUPO", "DATA DA ABERTURA DO GRUPO", "DATA GRUPO ABERTO"]),
    status: findColumn(["OBSERVACAO", "STATUS", "SITUACAO"]),
    comprovante: findColumn(["COMPROVANTE", "ENTRADA"]),
    dataComprovante: findColumn(["DATA DO COMPROVANTE", "DATA COMPROVANTE"])
  };
  const cell = (row, index) => index >= 0 ? String(row[index] || "").trim() : "";

  return rows.slice(1).map(row => normalizeRecord({
    cliente: cell(row, columns.cliente),
    dataVenda: cell(row, columns.dataVenda),
    dataCadastro: cell(row, columns.dataCadastro),
    vendedor: cell(row, columns.vendedor),
    valor: cell(row, columns.valor),
    grupoAberto: cell(row, columns.grupoAberto),
    dataGrupoAberto: cell(row, columns.dataGrupoAberto),
    status: cell(row, columns.status),
    comprovante: cell(row, columns.comprovante),
    dataComprovante: cell(row, columns.dataComprovante)
  })).filter(item => item.cliente);
}

function salesFromRankingCsv(text) {
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex(row => row.filter(cell => normalizeHeader(cell) === "DATA").length >= 2);
  if (headerIndex < 0) return [];
  const dateColumns = rows[headerIndex]
    .map((cell, index) => normalizeHeader(cell) === "DATA" ? index : -1)
    .filter(index => index >= 0);
  const sales = [];

  for (const row of rows.slice(headerIndex + 1)) {
    dateColumns.forEach((dateIndex, sectionIndex) => {
      if (!parseSheetDate(row[dateIndex])) return;
      const vendedor = String(row[dateIndex + 5] || "").trim();
      const valorLiquido = row[dateIndex + 4];
      const valorBruto = row[dateIndex + 1];
      if (!vendedor || (!parseMoney(valorLiquido) && !parseMoney(valorBruto))) return;
      sales.push({
        dataVenda: String(row[dateIndex] || "").trim(),
        vendedor,
        valor: valorLiquido || valorBruto,
        sector: sectionIndex === 0 ? "comercial" : "juridico",
        description: String(row[dateIndex + 6] || "").trim()
      });
    });
  }
  return sales;
}

function normalizeRecord(item) {
  return {
    cliente: String(item?.cliente || item?.CLIENTE || "").replace(/\s+/g, " ").trim(),
    dataVenda: String(item?.dataVenda || item?.data || item?.DATA || "").trim(),
    dataCadastro: String(item?.dataCadastro || item?.["DATA/HORA DO CADASTRO"] || item?.criadoEm || "").trim(),
    grupoAberto: String(item?.grupoAberto || item?.["GRUPO ABERTO"] || "").trim(),
    dataGrupoAberto: String(item?.dataGrupoAberto || item?.["DATA/HORA DA ABERTURA DO GRUPO"] || "").trim(),
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
  if (br) {
    const pad = number => String(number).padStart(2, "0");
    return new Date(`${br[3]}-${pad(br[2])}-${pad(br[1])}T${pad(br[4] || 0)}:${pad(br[5] || 0)}:00-03:00`);
  }
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

function buildTimeline(clients, rankingSales = []) {
  const now = Date.now();
  const isWithinTimelineWindow = date => {
    const timestamp = date?.getTime?.();
    return Number.isFinite(timestamp) && timestamp <= now && now - timestamp < TIMELINE_WINDOW_MS;
  };
  const hasTime = value => /\b\d{1,2}:\d{2}\b/.test(String(value || ""));
  const monthRecords = clients
    .map(record => ({
      ...record,
      saleDate: parseSheetDate(record.dataVenda),
      entryDate: parseSheetDate(record.dataCadastro),
      parsedDate: parseSheetDate(record.dataCadastro || record.dataVenda),
      groupDeadlineBaseDate: parseSheetDate(record.dataCadastro || record.dataVenda)
    }))
    .filter(record => isCurrentMonth(record.parsedDate))
    .sort((a, b) => b.parsedDate - a.parsedDate);
  const currentMonthSales = rankingSales
    .map(record => ({ ...record, parsedDate: parseSheetDate(record.dataVenda) }))
    .filter(record => isCurrentMonth(record.parsedDate))
    .sort((a, b) => b.parsedDate - a.parsedDate);
  const events = [];

  for (const record of monthRecords.slice(0, 30)) {
    const value = parseMoney(record.valor);
    const saleDate = record.saleDate;
    if (record.entryDate && isWithinTimelineWindow(record.entryDate)) {
      events.push({
        id: `cliente-${normalizeText(record.cliente)}-${record.dataCadastro}`,
        type: "cliente",
        cliente: record.cliente,
        data: record.entryDate.toISOString(),
        sourceLabel: "Cliente entrou em",
        sourceHasTime: hasTime(record.dataCadastro),
        message: isPositive(record.grupoAberto)
          ? `Novo cliente registrado: ${record.cliente}.`
          : `Novo cliente aguardando abertura de grupo: ${record.cliente}.`
      });
    }

    if (isDistrato(record) && isWithinTimelineWindow(saleDate)) {
      events.push({
        id: `distrato-${normalizeText(record.cliente)}-${record.dataVenda}`,
        type: "distrato",
        cliente: record.cliente,
        data: saleDate.toISOString(),
        sourceLabel: hasTime(record.dataVenda) ? "Data e hora da venda" : "Data da venda",
        sourceHasTime: hasTime(record.dataVenda),
        message: `Distrato registrado para ${record.cliente}.`
      });
    } else if (!currentMonthSales.length && isWithinTimelineWindow(saleDate)) {
      events.push({
        id: `venda-${normalizeText(record.cliente)}-${record.dataVenda}`,
        type: "venda",
        cliente: record.cliente,
        vendedor: record.vendedor,
        valor: value,
        data: saleDate.toISOString(),
        sourceLabel: hasTime(record.dataVenda) ? "Data e hora da venda" : "Data da venda",
        sourceHasTime: hasTime(record.dataVenda),
        message: value && record.vendedor
          ? `Venda de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)} da ${record.vendedor}. Parabéns!`
          : `Nova venda registrada para ${record.cliente}${record.vendedor ? ` por ${record.vendedor}` : ""}.`
      });
    }

    if (isPositive(record.grupoAberto)) {
      const groupOpenedAt = parseSheetDate(record.dataGrupoAberto);
      if (!isWithinTimelineWindow(groupOpenedAt)) continue;
      events.push({
        id: `grupo-${normalizeText(record.cliente)}-${record.dataVenda}`,
        type: "grupo",
        cliente: record.cliente,
        data: groupOpenedAt.toISOString(),
        sourceLabel: "Data e hora da abertura do grupo",
        sourceHasTime: true,
        message: `Foi aberto o grupo do cliente ${record.cliente}.`
      });
    } else if (!isDistrato(record) && record.groupDeadlineBaseDate) {
      const pendingHours = Math.floor((Date.now() - record.groupDeadlineBaseDate.getTime()) / 3600000);
      if (pendingHours >= 3 && isWithinTimelineWindow(record.groupDeadlineBaseDate)) {
        events.push({
          id: `grupo-pendente-${normalizeText(record.cliente)}-${record.dataVenda}`,
          type: "grupo_pendente",
          cliente: record.cliente,
          data: record.groupDeadlineBaseDate.toISOString(),
          sourceLabel: record.dataCadastro ? "Cliente entrou em" : "Data e hora da venda",
          sourceHasTime: hasTime(record.dataCadastro || record.dataVenda),
          hours: pendingHours,
          message: `Grupo Pendente - Abrir com urgência: ${record.cliente} está há ${pendingHours} hora(s) aguardando a abertura do grupo.`
        });
      }
    }
  }

  for (const sale of currentMonthSales) {
    if (!isWithinTimelineWindow(sale.parsedDate)) continue;
    const value = parseMoney(sale.valor);
    const team = sale.sector === "juridico" ? "Jurídico" : "Comercial";
    events.push({
      id: `ranking-${sale.sector}-${normalizeText(sale.vendedor)}-${sale.dataVenda}-${value}`,
      type: "venda",
      vendedor: sale.vendedor,
      valor: value,
      data: sale.parsedDate.toISOString(),
      sourceLabel: hasTime(sale.dataVenda) ? "Data e hora da venda" : "Data da venda",
      sourceHasTime: hasTime(sale.dataVenda),
      sector: sale.sector,
      message: `${team}: venda de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)} da ${sale.vendedor}. Parabéns!${sale.description ? ` ${sale.description}.` : ""}`
    });
  }

  const latestProof = monthRecords
    .filter(record => record.dataComprovante)
    .map(record => parseSheetDate(record.dataComprovante))
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  if (latestProof) {
    const hours = Math.floor((Date.now() - latestProof.getTime()) / 3600000);
    if (hours >= 5 && isWithinTimelineWindow(latestProof)) {
      events.unshift({
        id: `alerta-comprovante-${latestProof.toISOString()}`,
        type: "alerta",
        data: latestProof.toISOString(),
        sourceLabel: "Último comprovante recebido em",
        sourceHasTime: true,
        hours,
        message: `Equipe, estamos há ${hours} horas sem nenhum comprovante. Quem será o próximo?`
      });
    }
  }

  return {
    events: events
      .filter(event => isWithinTimelineWindow(parseSheetDate(event.data)))
      .sort((a, b) => (parseSheetDate(b.data)?.getTime() || 0) - (parseSheetDate(a.data)?.getTime() || 0))
      .slice(0, 24),
    metrics: {
      distratosMes: monthRecords.filter(isDistrato).length,
      vendasMes: currentMonthSales.length || monthRecords.filter(record => !isDistrato(record)).length,
      gruposPendentes: monthRecords.filter(record =>
        !isDistrato(record)
        && !isPositive(record.grupoAberto)
        && record.groupDeadlineBaseDate
        && Date.now() - record.groupDeadlineBaseDate.getTime() >= 3 * 60 * 60 * 1000
      ).length
    },
    updatedAt: new Date().toISOString()
  };
}

export { buildTimeline, salesFromRankingCsv };

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

async function loadClients(apiUrl, operationCsvUrl) {
  const now = Date.now();
  if (clientCache && now - clientCacheAt < CACHE_MS) return clientCache;

  const datasets = [];
  const failures = [];

  if (operationCsvUrl) {
    try {
      const sheetResponse = await fetch(operationCsvUrl, { cache: "no-store", redirect: "follow" });
      if (!sheetResponse.ok) throw new Error(`Planilha operacional respondeu HTTP ${sheetResponse.status}.`);
      datasets.push(recordsFromOperationCsv(await sheetResponse.text()));
    } catch (error) {
      failures.push(error.message);
    }
  }

  if (apiUrl) {
    try {
      const upstream = await fetch(apiUrl, {
        cache: "no-store",
        redirect: "follow",
        headers: { Accept: "application/json" }
      });
      if (!upstream.ok) throw new Error(`Google Apps Script respondeu HTTP ${upstream.status}.`);
      const data = await upstream.json();
      if (!Array.isArray(data)) throw new Error("A implantação não retornou uma lista de clientes.");
      datasets.push(data.map(normalizeRecord).filter(item => item.cliente));
    } catch (error) {
      failures.push(error.message);
    }
  }

  if (!datasets.length) throw new Error(failures.join(" "));

  const merged = new Map();
  datasets.flat().forEach(item => {
    const key = [
      normalizeText(item.cliente),
      String(item.dataVenda || "").trim()
    ].join("|");
    const current = merged.get(key) || {};
    merged.set(key, {
      ...current,
      ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== "" && value != null))
    });
  });

  clientCache = Array.from(merged.values());
  clientCacheAt = now;
  return clientCache;
}

async function loadRankingSales(csvUrl) {
  const response = await fetch(csvUrl, { cache: "no-store", redirect: "follow" });
  if (!response.ok) throw new Error(`Planilha do ranking respondeu HTTP ${response.status}.`);
  return salesFromRankingCsv(await response.text());
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Método não permitido." });
  }

  const apiUrl = process.env.CLIENT_SHEET_API_URL || DEFAULT_CLIENT_SHEET_API_URL;
  const operationCsvUrl = process.env.OPERATION_SHEET_CSV_URL || DEFAULT_OPERATION_SHEET_CSV_URL;
  const rankingTimelineCsvUrl = process.env.RANKING_TIMELINE_SHEET_CSV_URL || DEFAULT_RANKING_TIMELINE_CSV_URL;

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
      const [clients, rankingSales] = await Promise.all([
        loadClients(apiUrl, operationCsvUrl),
        loadRankingSales(rankingTimelineCsvUrl).catch(error => {
          console.warn("Linha do tempo do ranking indisponível; usando base operacional.", error);
          return [];
        })
      ]);
      response.setHeader("Cache-Control", "private, no-store");
      return response.status(200).json(buildTimeline(clients, rankingSales));
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
    const clients = await loadClients(apiUrl, operationCsvUrl);
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
