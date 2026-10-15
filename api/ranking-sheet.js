const REQUIRED_HEADERS = {
  name: ["NOME", "NOME COMPLETO", "COLABORADOR", "VENDEDOR", "RESPONSAVEL"],
  sold: ["VALOR LIQUIDO", "LIQUIDO", "VENDIDO", "RESULTADO", "VENDAS", "VALOR VENDIDO", "VALOR"],
  goal: ["META", "META INDIVIDUAL"],
  gap: ["GAP (FALTA)", "GAP", "FALTA"],
  teamGoal: ["META DA EQUIPE", "META EQUIPE", "META DO SETOR"],
  teamGap: ["GAP DA EQUIPE", "GAP EQUIPE", "FALTA DA EQUIPE", "FALTA EQUIPE"],
  sector: ["SETOR", "EQUIPE", "TIME"]
};

const SUPPLEMENTAL_HEADERS = {
  month: ["MES", "MÊS", "COMPETENCIA", "COMPETÊNCIA"],
  companyTotal: ["TOTAL EMPRESA", "RESULTADO EMPRESA", "TOTAL GERAL", "FATURAMENTO TOTAL"],
  comercialTotal: ["TOTAL COMERCIAL", "COMERCIAL"],
  juridicoTotal: ["TOTAL JURIDICO", "TOTAL JURÍDICO", "JURIDICO", "JURÍDICO"],
  goal: ["META", "META EMPRESA", "META GERAL"],
  hunter: ["HUNTER", "CAPTADOR", "INDICADOR", "ORIGEM"],
  hunterClients: ["CLIENTES", "CLIENTES POTENCIAIS", "LEADS", "QTD CLIENTES"],
  hunterPaid: ["PAGOS", "PAGAMENTOS", "CLIENTES PAGOS", "QTD PAGOS"],
  hunterValue: ["VALOR", "VALOR PAGO", "TOTAL PAGO", "RESULTADO"],
  client: ["CLIENTE", "CLIENTE POTENCIAL", "NOME CLIENTE"],
  paidBy: ["CONSULTOR", "RESPONSAVEL", "RESPONSÁVEL", "VENDEDOR"],
  paidDate: ["DATA", "DATA PAGAMENTO", "DATA DO PAGAMENTO"],
  paidValue: ["VALOR PAGO", "PAGAMENTO", "VALOR", "TOTAL PAGO"],
  paidStatus: ["STATUS", "SITUACAO", "SITUAÇÃO"]
};

const DEFAULT_SPREADSHEET_ID = "1BJfwUQWr_R5K52QIKi2NHYW48bIJlGjHJwFNDtD4lEg";
const DEFAULT_HUNTER_SPREADSHEET_ID = "1CfFR1wjF74xXea4bYrjkea8qaQxsjwoQ13KsiWh2cIE";
const DEFAULT_HUNTER_SHEET_NAME = "HUNTER";
const DEFAULT_HUNTER_NAME = "Giullian Gabriellen";
const DEFAULT_TEAM_GOALS = {
  comercial: 150000,
  juridico: 480000
};
const DEFAULT_INDIVIDUAL_GOALS = {
  comercial: [
    { name: "Rafaela Marcelino", goal: 30000 },
    { name: "Fernanda Ramos", goal: 30000 },
    { name: "Geovanna Alves Xavier", goal: 30000 }
  ],
  juridico: [
    { name: "Tabata Rangel de Lima", goal: 150000 },
    { name: "Elaine Aparecida dos Santos", goal: 80000 },
    { name: "Janaina Rodrigues Paiva", goal: 150000 }
  ]
};
const CONSULTANT_NAME_ALIASES = {
  comercial: [
    { name: "Mariana", aliases: ["Mariane"] }
  ],
  juridico: []
};

function getCurrentPortugueseMonthName() {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "America/Sao_Paulo"
  }).format(new Date()).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function getPortugueseMonthName(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "America/Sao_Paulo"
  }).format(date).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function getPreviousOperationalMonth() {
  const now = new Date();
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
  return {
    sheet: getPortugueseMonthName(previous),
    label: new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(previous)
  };
}

function getCurrentMonthAliases() {
  const month = getCurrentPortugueseMonthName();
  const lower = month.toLowerCase();
  return [month, lower, lower.charAt(0).toUpperCase() + lower.slice(1)];
}

function getDefaultSheetCsvUrl() {
  const spreadsheetId = process.env.RANKING_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const sheetName = process.env.RANKING_SHEET_NAME || getCurrentPortugueseMonthName();
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

async function verifyCurrentRankingSheet() {
  const spreadsheetId = process.env.RANKING_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const sheetName = process.env.RANKING_SHEET_NAME || getCurrentPortugueseMonthName();
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Nao foi possivel verificar a aba ${sheetName}.`);
  const html = await response.text();
  const tabs = Array.from(html.matchAll(/docs-sheet-tab-caption[^>]*>([^<]+)/g), match => match[1].trim());
  // O endpoint CSV pode devolver a primeira aba quando o nome solicitado nao existe.
  if (!tabs.includes(sheetName)) {
    throw new Error(`A aba ${sheetName} nao existe ou nao esta acessivel na planilha. Ranking mantido sem dados de outros meses.`);
  }
}

function getDefaultSheetCsvUrlFor(sheetName) {
  const spreadsheetId = process.env.RANKING_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

function getCurrentHunterSheetName() {
  return process.env.HUNTER_SHEET_NAME || `${DEFAULT_HUNTER_SHEET_NAME} ${getCurrentPortugueseMonthName()}`;
}

function getHunterSheetCsvUrl() {
  if (process.env.HUNTER_SHEET_CSV_URL) return process.env.HUNTER_SHEET_CSV_URL;
  const spreadsheetId = process.env.HUNTER_SPREADSHEET_ID || DEFAULT_HUNTER_SPREADSHEET_ID;
  const sheetName = getCurrentHunterSheetName();
  const encodedSheet = encodeURIComponent(sheetName);
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodedSheet}`;
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
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

function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const currencyLike = raw.includes(",");
  const normalized = currencyLike
    ? raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
    : raw.replace(/[^\d.-]/g, "");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
  return Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;
}

function getColumn(row, headerMap, key) {
  const aliases = [
    ...(key === "sold" ? getCurrentMonthAliases() : []),
    ...(REQUIRED_HEADERS[key] || [])
  ];
  for (const alias of aliases) {
    const index = headerMap.get(normalizeHeader(alias));
    if (index !== undefined) return row[index] || "";
  }
  return "";
}

function getColumnByAliases(row, headerMap, aliases) {
  for (const alias of aliases || []) {
    const index = headerMap.get(normalizeHeader(alias));
    if (index !== undefined) return row[index] || "";
  }
  return "";
}

function normalizeSector(value) {
  const sector = normalizeHeader(value);
  if (sector.includes("JUR")) return "juridico";
  if (sector.includes("COM")) return "comercial";
  return "";
}

function normalizeConsultantName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeNameKey(value) {
  return normalizeConsultantName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function isSameConsultantName(a, b) {
  const first = normalizeNameKey(a);
  const second = normalizeNameKey(b);
  return Boolean(first && second && (first === second || first.includes(second) || second.includes(first)));
}

// Impede que registros legados desligados reapareçam no ranking ativo.
const INACTIVE_CONSULTANT_NAME_HASHES = new Set([
  858537753, 3485962025, 736064913, 3537054721,
  2005598203, 3141668600, 3287841597, 3863809456, 2099074238,
  1130923606, 2114220384, 1441043149
]);

function getConsultantNameHash(value) {
  let hash = 2166136261;
  for (const character of normalizeNameKey(value).toLowerCase()) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

function isInactiveConsultantName(value) {
  return INACTIVE_CONSULTANT_NAME_HASHES.has(getConsultantNameHash(value));
}

function getDefaultIndividualGoal(name, sector) {
  const goals = DEFAULT_INDIVIDUAL_GOALS[sector] || [];
  const match = goals.find(item => isSameConsultantName(item.name, name));
  return match?.goal || 0;
}

function getCanonicalConsultantName(name, sector) {
  const normalizedName = normalizeConsultantName(name);
  const match = (DEFAULT_INDIVIDUAL_GOALS[sector] || [])
    .find(item => isSameConsultantName(item.name, normalizedName));
  if (match?.name) return match.name;

  const aliasMatch = (CONSULTANT_NAME_ALIASES[sector] || []).find(item =>
    isSameConsultantName(item.name, normalizedName)
    || item.aliases.some(alias => isSameConsultantName(alias, normalizedName))
  );
  return aliasMatch?.name || normalizedName;
}

function applyDefaultIndividualGoal(item, sector) {
  const defaultGoal = getDefaultIndividualGoal(item.name, sector);
  if (!item.goal && defaultGoal) item.goal = defaultGoal;
  item.gap = Math.max((item.goal || 0) - (item.sold || 0), 0);
  return item;
}

function getTeamGoalFromEntries(entries, sector) {
  const total = entries.reduce((sum, item) => {
    const goal = item.goal || getDefaultIndividualGoal(item.name, sector);
    return sum + (goal || 0);
  }, 0);
  return total || DEFAULT_TEAM_GOALS[sector] || 0;
}

function getNetSoldValue(row, section) {
  const netValue = parseMoney(row[section.netValueIndex]);
  return netValue || parseMoney(row[section.valueIndex]);
}

function parseSheetDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  if (!day || !month || !year) return null;
  return { day, month, year };
}

function isCurrentMonthDate(value) {
  const parsed = parseSheetDate(value);
  if (!parsed) return false;

  const now = new Date();
  const currentMonth = Number(new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    timeZone: "America/Sao_Paulo"
  }).format(now));
  const currentYear = Number(new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: "America/Sao_Paulo"
  }).format(now));

  return parsed.month === currentMonth && parsed.year === currentYear;
}

function isDateLike(value) {
  return Boolean(parseSheetDate(value));
}

function parseIsoDate(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function getRankingPeriod(request) {
  const period = String(request.query?.period || "month").toLowerCase();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "today") return { key: period, start: today, end: today };
  if (period === "week") {
    const start = new Date(today);
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    return { key: period, start, end: today };
  }
  if (period === "custom") {
    const start = parseIsoDate(request.query?.from);
    const end = parseIsoDate(request.query?.to);
    if (start && end && start <= end) return { key: period, start, end };
  }
  return {
    key: "month",
    start: new Date(today.getFullYear(), today.getMonth(), 1),
    end: today
  };
}

function isDateInRankingPeriod(value, period) {
  const parsed = parseSheetDate(value);
  if (!parsed) return false;
  const date = new Date(parsed.year, parsed.month - 1, parsed.day);
  return date >= period.start && date <= period.end;
}

async function fetchCsv(url) {
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${separator}_sync=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache"
    }
  });
  if (!response.ok) {
    throw new Error(`Falha ao ler planilha CSV (${response.status}).`);
  }
  return response.text();
}

function rowsFromCsv(text, forcedSector = "") {
  const csvRows = parseCsv(text);
  if (csvRows.length < 2) return [];

  const headers = csvRows[0].map(normalizeHeader);
  const headerMap = new Map(headers.map((header, index) => [header, index]));

  return csvRows.slice(1).map(row => {
    const sector = forcedSector || normalizeSector(getColumn(row, headerMap, "sector"));
    const name = String(getColumn(row, headerMap, "name")).trim();
    const sold = parseMoney(getColumn(row, headerMap, "sold"));
    const parsedGoal = parseMoney(getColumn(row, headerMap, "goal"));
    const goal = parsedGoal || getDefaultIndividualGoal(name, sector);

    return {
      sector,
      name,
      sold,
      goal,
      gap: parseMoney(getColumn(row, headerMap, "gap")) || Math.max(goal - sold, 0),
      teamGoal: parseMoney(getColumn(row, headerMap, "teamGoal")),
      teamGap: parseMoney(getColumn(row, headerMap, "teamGap"))
    };
  }).filter(item => item.sector && (item.name || item.sold || item.goal));
}

function extractSupplementalDataFromCsv(text) {
  const csvRows = parseCsv(text);
  if (csvRows.length < 2) {
    return { history: [], hunters: [], paidClients: [] };
  }

  const headers = csvRows[0].map(normalizeHeader);
  const headerMap = new Map(headers.map((header, index) => [header, index]));
  const history = [];
  const hunters = [];
  const paidClients = [];

  for (const row of csvRows.slice(1)) {
    const month = normalizeConsultantName(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.month));
    const companyTotal = parseMoney(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.companyTotal));
    const comercial = parseMoney(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.comercialTotal));
    const juridico = parseMoney(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.juridicoTotal));
    const goal = parseMoney(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.goal));

    if (month && (companyTotal || comercial || juridico || goal)) {
      history.push({ month, companyTotal, comercial, juridico, goal });
    }

    const hunter = normalizeConsultantName(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.hunter));
    const hunterClients = Number.parseInt(String(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.hunterClients) || "0").replace(/\D/g, ""), 10) || 0;
    const hunterPaid = Number.parseInt(String(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.hunterPaid) || "0").replace(/\D/g, ""), 10) || 0;
    const hunterValue = parseMoney(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.hunterValue));

    if (hunter && (hunterClients || hunterPaid || hunterValue)) {
      hunters.push({
        name: hunter,
        potentialClients: hunterClients,
        paidClients: hunterPaid,
        value: hunterValue
      });
    }

    const client = normalizeConsultantName(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.client));
    const paidValue = parseMoney(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.paidValue));
    const status = normalizeConsultantName(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.paidStatus));
    const isPaid = paidValue > 0 || normalizeHeader(status).includes("PAGO");

    if (client && isPaid) {
      paidClients.push({
        name: client,
        value: paidValue,
        date: normalizeConsultantName(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.paidDate)),
        responsible: normalizeConsultantName(getColumnByAliases(row, headerMap, SUPPLEMENTAL_HEADERS.paidBy)),
        status: status || "Pago"
      });
    }
  }

  return { history, hunters, paidClients };
}

function parseFirstMoneyFromText(value) {
  const match = String(value || "").match(/R\$\s*[\d.]+,\d{2}|[\d.]+,\d{2}/);
  return match ? parseMoney(match[0]) : 0;
}

function classifyHunterSituation(value) {
  const situation = normalizeHeader(value);
  if (
    situation.includes("NAO PAGOU") ||
    situation.includes("NÃO PAGOU") ||
    situation.includes("NAO PAGO") ||
    situation.includes("NÃO PAGO") ||
    situation.includes("NAO VAI PAGAR") ||
    situation.includes("NÃO VAI PAGAR") ||
    situation.includes("RECUSOU") ||
    situation.includes("PERDIDO") ||
    situation.includes("CANCELADO") ||
    situation.includes("SEM PAGAMENTO")
  ) {
    return "notPaid";
  }
  if (situation.includes("PAGOU") || situation.includes("PAGO")) return "paid";
  if (situation.includes("PROJECAO") || situation.includes("PROJEÇÃO")) return "projection";
  if (
    situation.includes("CONVERTIDO") ||
    situation.includes("CONVERTEU") ||
    situation.includes("POTENCIAL") ||
    situation.includes("PARA PAGAR") ||
    situation.includes("VAI PAGAR") ||
    situation.includes("PENDENTE") ||
    situation.includes("AGUARDANDO") ||
    situation.includes("NEGOCIACAO") ||
    situation.includes("NEGOCIAÇÃO")
  ) {
    return "potential";
  }
  return situation ? "potential" : "";
}

function extractHunterDataFromCsv(text) {
  const csvRows = parseCsv(text);
  if (csvRows.length < 2) {
    return { hunters: [], paidClients: [], potentialClients: [] };
  }

  const headers = csvRows[0].map(normalizeHeader);
  const headerMap = new Map(headers.map((header, index) => [header, index]));
  const hunterTotals = new Map();
  const paidClients = [];
  const potentialClients = [];

  for (const row of csvRows.slice(1)) {
    const client = normalizeConsultantName(getColumnByAliases(row, headerMap, ["CLIENTE", "CLIENTE POTENCIAL", "NOME CLIENTE"]));
    const explicitHunter = normalizeConsultantName(getColumnByAliases(row, headerMap, ["HUNTER", "CAPTADOR", "ORIGEM", "INDICADOR"]));
    const consultant = normalizeConsultantName(getColumnByAliases(row, headerMap, ["CONSULTOR", "RESPONSAVEL", "RESPONSÁVEL", "VENDEDOR"]));
    const hunter = explicitHunter || consultant || DEFAULT_HUNTER_NAME;
    const situation = normalizeConsultantName(getColumnByAliases(row, headerMap, ["SITUAÇÃO", "SITUACAO", "STATUS"]));
    const product = normalizeConsultantName(getColumnByAliases(row, headerMap, ["PRODUTO"]));
    const date = normalizeConsultantName(getColumnByAliases(row, headerMap, ["DATA", "DATA PAGAMENTO", "DATA DO PAGAMENTO"]));
    const observation = normalizeConsultantName(getColumnByAliases(row, headerMap, ["OBSERVAÇÃO", "OBSERVACAO", "OBS"]));
    const category = classifyHunterSituation(situation);

    if (!client && !explicitHunter && !consultant && !situation && !product && !date && !observation) continue;

    const key = hunter || "Sem hunter";
    const current = hunterTotals.get(key) || {
      name: key,
      convertedClients: 0,
      potentialClients: 0,
      paidClients: 0,
      notPaidClients: 0,
      projections: 0,
      value: 0
    };

    if (client || situation) current.convertedClients += 1;
    if (category === "paid") current.paidClients += 1;
    else if (category === "notPaid") current.notPaidClients += 1;
    else if (category === "projection") current.projections += 1;
    else if (category === "potential") current.potentialClients += 1;

    const directValue = getColumnByAliases(row, headerMap, ["VALOR", "VALOR PAGO", "PAGAMENTO", "TOTAL PAGO"]);
    const value = parseMoney(directValue) || parseFirstMoneyFromText(observation);
    current.value += value;
    hunterTotals.set(key, current);

    if (category === "paid" && client) {
      paidClients.push({
        name: client,
        value,
        date,
        responsible: consultant || hunter,
        hunter,
        status: situation || "Pagou",
        product,
        observation
      });
    }
    if ((category === "potential" || category === "projection") && client) {
      potentialClients.push({
        name: client,
        date,
        responsible: consultant || hunter,
        hunter,
        status: situation || (category === "projection" ? "Projeção" : "Potencial"),
        product,
        observation
      });
    }
  }

  return {
    hunters: Array.from(hunterTotals.values()).filter(item =>
      item.name || item.convertedClients || item.potentialClients || item.paidClients || item.notPaidClients || item.projections || item.value
    ),
    paidClients,
    potentialClients
  };
}

function detectSideBySideSections(headers) {
  const sections = [];

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const consultantHeader = normalizeHeader(headers[index + 5] || "");
    if (!normalized.includes("DATA") || consultantHeader !== "CONSULTOR") return;

    const sector = normalized.includes("JUR")
      ? "juridico"
      : normalized.includes("COM")
      ? "comercial"
      : sections.length === 0
      ? "comercial"
      : "juridico";

    sections.push({
      sector,
      dateIndex: index,
      valueIndex: index + 1,
      metaIndex: index + 2,
      gapIndex: index + 3,
      netValueIndex: index + 4,
      consultantIndex: index + 5
    });
  });

  return sections;
}

function findSideBySideHeaderRow(rows) {
  for (let index = 0; index < rows.length; index += 1) {
    const sections = detectSideBySideSections(rows[index]);
    if (sections.length) return { index, sections };
  }
  return { index: -1, sections: [] };
}

function extractTeamGoal(rows, section) {
  const envKey = section.sector === "comercial"
    ? "RANKING_COMERCIAL_TEAM_GOAL"
    : "RANKING_JURIDICO_TEAM_GOAL";
  const envGoal = parseMoney(process.env[envKey]);
  if (envGoal) return envGoal;

  let detectedGoal = 0;
  for (const row of rows) {
    const metaLabel = normalizeHeader(row[section.metaIndex]);
    if (metaLabel !== "META MENSAL") continue;

    for (const candidate of rows.slice(rows.indexOf(row) + 1)) {
      const meta = parseMoney(candidate[section.metaIndex]);
      if (meta > detectedGoal) detectedGoal = meta;
    }
  }

  return detectedGoal || DEFAULT_TEAM_GOALS[section.sector] || 0;
}

function isTeamSummaryRow(sold, goal, entries, section) {
  if (!sold && !goal) return false;
  const summarizedTotal = entries.reduce((sum, item) => sum + (item.sold || 0), 0);
  const defaultGoal = DEFAULT_TEAM_GOALS[section.sector] || 0;
  return goal >= defaultGoal * 0.5 || (summarizedTotal && Math.abs(sold - summarizedTotal) < 0.02);
}

function isRankingPersonName(value) {
  const name = normalizeConsultantName(value);
  const normalized = normalizeHeader(name);
  if (!name || parseMoney(name) || isDateLike(name)) return false;
  return ![
    "RANKING", "META", "GAP", "COMISSAO", "COMISSÃO", "TOTAL", "RESULTADO",
    "VALOR", "CONSULTOR", "VENDEDOR", "NOME", "COMERCIAL", "JURIDICO", "JURÍDICO"
  ].some(label => normalized === label || normalized.startsWith(`${label} `));
}

function extractSummaryData(rows, section) {
  const entries = [];
  const team = {
    total: 0,
    goal: extractTeamGoal(rows, section)
  };
  let summaryStarted = false;

  for (const row of rows.slice(1)) {
    const hasDate = isDateLike(row[section.dateIndex]);
    const dateLabel = normalizeHeader(row[section.dateIndex]);
    const name = normalizeConsultantName(row[section.dateIndex]);
    const sold = parseMoney(row[section.valueIndex]);
    const goal = parseMoney(row[section.metaIndex]);
    const gap = parseMoney(row[section.gapIndex]);
    const explicitTeamTotal = parseMoney(row[section.netValueIndex]);
    const metaLabel = normalizeHeader(row[section.metaIndex]);
    const gapLabel = normalizeHeader(row[section.gapIndex]);

    if (dateLabel.includes("RANKING") || metaLabel.includes("META") || gapLabel.includes("GAP")) {
      summaryStarted = true;
      continue;
    }

    if (!hasDate && !name && explicitTeamTotal > team.total) {
      team.total = explicitTeamTotal;
      // A planilha atual exibe o título do ranking como objeto visual. No CSV, o
      // primeiro sinal confiável do bloco consolidado é a célula com o total.
      summaryStarted = true;
      continue;
    }

    if (hasDate) continue;
    if (!name && !sold && !goal && !gap && !explicitTeamTotal) continue;

    if (normalizeNameKey(name) === "TOTAL") {
      team.total = Math.max(team.total, sold || explicitTeamTotal || 0);
      if (goal) team.goal = goal;
      continue;
    }

    if (summaryStarted) {
      if (!isRankingPersonName(name) && isTeamSummaryRow(sold, goal, entries, section)) {
        team.total = Math.max(team.total, sold);
        if (goal) team.goal = goal;
        continue;
      }

      if (isRankingPersonName(name) || sold || goal || gap) {
        entries.push({
          name: isRankingPersonName(name) ? name : "",
          sold,
          goal,
          gap
        });
      }
      continue;
    }
  }

  const summarizedTotal = entries.reduce((sum, item) => sum + (item.sold || 0), 0);
  if (!team.total && summarizedTotal) team.total = summarizedTotal;
  return { entries, team };
}

function matchUnnamedSummaryEntries(grouped, summaryEntries) {
  const available = Array.from(grouped.values());
  const used = new Set();
  const matched = [];

  for (const entry of summaryEntries) {
    if (isRankingPersonName(entry.name)) continue;
    const index = available.findIndex((item, itemIndex) =>
      !used.has(itemIndex) && Math.abs((item.sold || 0) - (entry.sold || 0)) < 0.02
    );
    if (index === -1) continue;

    used.add(index);
    const item = available[index];
    matched.push({
      ...item,
      sold: entry.sold || item.sold,
      goal: entry.goal || item.goal || 0,
      gap: entry.gap || Math.max((entry.goal || item.goal || 0) - (entry.sold || item.sold || 0), 0)
    });
  }

  return matched;
}

function rowsFromPlatinoSideBySideCsv(text, period = getRankingPeriod({ query: {} })) {
  const csvRows = parseCsv(text);
  if (csvRows.length < 2) return null;

  const header = findSideBySideHeaderRow(csvRows);
  if (header.index === -1) return null;

  const tableRows = csvRows.slice(header.index);
  const sections = header.sections;
  if (!sections.length) return null;

  const rows = [];
  const teamGoals = {};
  const teamTotals = {};
  const metrics = {
    comercialContracts: 0
  };

  for (const section of sections) {
    const grouped = new Map();
    const summary = extractSummaryData(tableRows, section);
    teamGoals[section.sector] = summary.team.goal || DEFAULT_TEAM_GOALS[section.sector] || 0;
    teamTotals[section.sector] = summary.team.total || 0;

    for (const row of tableRows.slice(1)) {
      const isValidEntryDate = isDateInRankingPeriod(row[section.dateIndex], period);
      if (!isValidEntryDate) continue;

      const name = normalizeConsultantName(row[section.consultantIndex]);
      const sold = getNetSoldValue(row, section);
      if (!name || !sold) continue;
      if (section.sector === "comercial") metrics.comercialContracts += 1;

      const canonicalName = getCanonicalConsultantName(name, section.sector);
      const key = normalizeNameKey(canonicalName);
      const current = grouped.get(key) || {
        name: canonicalName,
        sold: 0,
        goal: 0,
        gap: 0
      };
      current.sold = roundMoney(current.sold + sold);
      grouped.set(key, current);
    }

    const namedSummaryEntries = summary.entries.filter(item => isRankingPersonName(item.name));
    let rankingItems;
    if (period.key === "month" && namedSummaryEntries.length) {
      // O CSV do Google pode exportar apenas parte do bloco visual de resumo. Mantem
      // os consultores ativos cadastrados encontrados nos lancamentos e usa o resumo
      // somente para atualizar os valores que ele realmente trouxe.
      const merged = new Map();
      for (const entry of namedSummaryEntries) {
        const canonicalName = getCanonicalConsultantName(entry.name, section.sector);
        const key = normalizeNameKey(canonicalName);
        const daily = grouped.get(key);
        const sold = daily?.sold || entry.sold || 0;
        const goal = entry.goal || daily?.goal || 0;
        merged.set(key, {
          ...entry,
          ...(daily || {}),
          name: canonicalName,
          // Os lançamentos datados são a fonte viva do vendido. O quadro-resumo
          // pode conter fórmulas com intervalos fixos e ficar atrasado quando novas
          // vendas são acrescentadas à aba mensal.
          sold,
          goal,
          gap: Math.max(goal - sold, 0)
        });
      }
      for (const [key, daily] of grouped) {
        if (!merged.has(key) && getDefaultIndividualGoal(daily.name, section.sector)) {
          merged.set(key, daily);
        }
      }
      rankingItems = Array.from(merged.values());
    } else if (period.key === "month" && summary.entries.length) {
      // Quando os nomes são objetos visuais e somem do CSV, relaciona cada total
      // consolidado ao consultor cujo acumulado diário tem exatamente o mesmo valor.
      const matched = matchUnnamedSummaryEntries(grouped, summary.entries);
      rankingItems = matched.length ? matched : Array.from(grouped.values());
    } else {
      rankingItems = Array.from(grouped.values());
    }

    rankingItems.forEach(item => applyDefaultIndividualGoal(item, section.sector));
    const liveTransactionsTotal = roundMoney(Array.from(grouped.values())
      .reduce((sum, item) => sum + (item.sold || 0), 0));
    if (period.key !== "month") teamTotals[section.sector] = liveTransactionsTotal;
    else teamTotals[section.sector] = Math.max(teamTotals[section.sector] || 0, liveTransactionsTotal);

    rankingItems.forEach(item => {
      rows.push({
        sector: section.sector,
        name: getCanonicalConsultantName(item.name, section.sector),
        sold: item.sold,
        goal: item.goal || 0,
        gap: item.gap || Math.max((item.goal || 0) - (item.sold || 0), 0),
        teamGoal: teamGoals[section.sector],
        teamGap: 0
      });
    });
  }

  return { rows, teamGoals, teamTotals, metrics, period: period.key };
}

function buildRanking(rows, explicitTeamGoals = {}, explicitTeamTotals = {}, metrics = {}, supplemental = {}) {
  const ranking = {
    monthKey: getCurrentPortugueseMonthName(),
    comercial: [],
    juridico: [],
    teamGoals: {},
    teamTotals: {},
    history: Array.isArray(supplemental.history) ? supplemental.history : [],
    hunters: Array.isArray(supplemental.hunters)
      ? supplemental.hunters.filter(item => !isInactiveConsultantName(item?.name))
      : [],
    hunterSheet: String(supplemental.hunterSheet || getCurrentHunterSheetName()),
    paidClients: Array.isArray(supplemental.paidClients) ? supplemental.paidClients : [],
    potentialClients: Array.isArray(supplemental.potentialClients) ? supplemental.potentialClients : [],
    metrics: {
      comercialContracts: Number(metrics.comercialContracts) || 0,
      companyTotal: 0
    },
    updatedAt: new Date().toISOString()
  };

  const consolidatedRows = new Map();
  for (const row of rows) {
    if (!ranking[row.sector] || !row.name) continue;
    if (isInactiveConsultantName(row.name)) continue;
    if (row.sector === "juridico" && normalizeNameKey(row.name).startsWith("NICOLE")) continue;
    const key = `${row.sector}|${normalizeNameKey(row.name)}`;
    const current = consolidatedRows.get(key) || {
      sector: row.sector,
      name: row.name,
      sold: 0,
      goal: 0,
      gap: 0,
      teamGoal: 0,
      teamGap: 0
    };
    current.sold = roundMoney(current.sold + (Number(row.sold) || 0));
    current.goal = Math.max(current.goal, Number(row.goal) || 0);
    current.teamGoal = Math.max(current.teamGoal, Number(row.teamGoal) || 0);
    current.teamGap = Math.max(current.teamGap, Number(row.teamGap) || 0);
    current.gap = Number.isFinite(Number(row.gap)) ? Number(row.gap) : Math.max(current.goal - current.sold, 0);
    consolidatedRows.set(key, current);
  }

  for (const row of consolidatedRows.values()) {
    ranking[row.sector].push({
      name: row.name,
      sold: row.sold,
      goal: row.goal,
      gap: row.gap,
      teamGoal: row.teamGoal,
      teamGap: row.teamGap
    });
  }

  for (const sector of ["comercial", "juridico"]) {
    const items = ranking[sector];
    const teamGoal = explicitTeamGoals[sector] || Math.max(0, ...items.map(item => item.teamGoal || 0));
    const teamGaps = items.map(item => item.teamGap || 0).filter(value => value > 0);
    const soldTotal = roundMoney(items.reduce((sum, item) => sum + (item.sold || 0), 0));

    ranking.teamGoals[sector] = teamGoal;
    ranking.teamTotals[sector] = roundMoney(explicitTeamTotals[sector] || (teamGoal && teamGaps.length
      ? Math.max(teamGoal - Math.min(...teamGaps), 0)
      : soldTotal));
  }

  ranking.metrics.companyTotal = roundMoney((ranking.teamTotals.comercial || 0) + (ranking.teamTotals.juridico || 0));
  return ranking;
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  // Competência fixa da homenagem; não acompanha o calendário nem os filtros do ranking.
  if (request.query?.action === "monthly-highlights") {
    response.setHeader("Cache-Control", "no-store");
    try {
      const csv = await fetchCsv(getDefaultSheetCsvUrlFor("AGOSTO"));
      const period = { key: "month", start: new Date(2026, 7, 1), end: new Date(2026, 7, 31) };
      const parsed = rowsFromPlatinoSideBySideCsv(csv, period);
      const rows = parsed?.rows || rowsFromCsv(csv);
      const archived = buildRanking(rows, parsed?.teamGoals || {}, parsed?.teamTotals || {});
      return response.status(200).json({
        month: "2026-08",
        source: "googleSheets",
        comercial: archived.comercial,
        juridico: archived.juridico
      });
    } catch (error) {
      return response.status(502).json({ error: "Nao foi possivel carregar os resultados de agosto.", details: error.message });
    }
  }

  // A planilha principal sempre acompanha a aba mensal. URLs compartilhadas fixas
  // causavam a permanência acidental no mês anterior após a virada do calendário.
  const sharedUrl = "";
  const comercialUrl = process.env.RANKING_COMERCIAL_SHEET_CSV_URL;
  const juridicoUrl = process.env.RANKING_JURIDICO_SHEET_CSV_URL;
  const period = getRankingPeriod(request);

  try {
    const rows = [];
    const explicitTeamGoals = {};
    const explicitTeamTotals = {};
    const metrics = {};
    const supplemental = {
      history: [],
      hunters: [],
      paidClients: [],
      potentialClients: []
    };
    const sourceHealth = {
      ranking: { ok: false, sheet: process.env.RANKING_SHEET_NAME || getCurrentPortugueseMonthName(), rows: 0 },
      history: { ok: false, sheet: getPreviousOperationalMonth().sheet, rows: 0 },
      hunters: { ok: false, sheet: getCurrentHunterSheetName(), rows: 0 },
      checkedAt: new Date().toISOString()
    };

    if (sharedUrl || (!comercialUrl && !juridicoUrl)) {
      if (!sharedUrl) await verifyCurrentRankingSheet();
      const csv = await fetchCsv(sharedUrl || getDefaultSheetCsvUrl());
      const extraData = extractSupplementalDataFromCsv(csv);
      supplemental.history.push(...extraData.history);
      supplemental.hunters.push(...extraData.hunters);
      supplemental.paidClients.push(...extraData.paidClients);
      const platinoData = rowsFromPlatinoSideBySideCsv(csv, period);
      if (platinoData) {
        rows.push(...platinoData.rows);
        Object.assign(explicitTeamGoals, platinoData.teamGoals);
        Object.assign(explicitTeamTotals, platinoData.teamTotals);
        Object.assign(metrics, platinoData.metrics);
      } else {
        rows.push(...rowsFromCsv(csv));
      }
      sourceHealth.ranking = { ...sourceHealth.ranking, ok: true, rows: rows.length };
    }
    if (comercialUrl) {
      const csv = await fetchCsv(comercialUrl);
      const extraData = extractSupplementalDataFromCsv(csv);
      supplemental.history.push(...extraData.history);
      supplemental.hunters.push(...extraData.hunters);
      supplemental.paidClients.push(...extraData.paidClients);
      rows.push(...rowsFromCsv(csv, "comercial"));
    }
    if (juridicoUrl) {
      const csv = await fetchCsv(juridicoUrl);
      const extraData = extractSupplementalDataFromCsv(csv);
      supplemental.history.push(...extraData.history);
      supplemental.hunters.push(...extraData.hunters);
      supplemental.paidClients.push(...extraData.paidClients);
      rows.push(...rowsFromCsv(csv, "juridico"));
    }

    if (!supplemental.history.length && !sharedUrl && !comercialUrl && !juridicoUrl) {
      try {
        const previousMonth = getPreviousOperationalMonth();
        const previousCsv = await fetchCsv(getDefaultSheetCsvUrlFor(previousMonth.sheet));
        const previousPlatinoData = rowsFromPlatinoSideBySideCsv(previousCsv);
        const previousRows = previousPlatinoData?.rows || rowsFromCsv(previousCsv);
        const comercial = previousPlatinoData?.teamTotals?.comercial
          || previousRows.filter(item => item.sector === "comercial").reduce((sum, item) => sum + (item.sold || 0), 0);
        const juridico = previousPlatinoData?.teamTotals?.juridico
          || previousRows.filter(item => item.sector === "juridico").reduce((sum, item) => sum + (item.sold || 0), 0);
        if (comercial || juridico) {
          supplemental.history.push({
            month: previousMonth.label.charAt(0).toUpperCase() + previousMonth.label.slice(1),
            comercial,
            juridico,
            companyTotal: comercial + juridico,
            goal: 0
          });
        }
        sourceHealth.history = { ...sourceHealth.history, ok: true, rows: previousRows.length };
      } catch (historyError) {
        sourceHealth.history.error = historyError.message;
        console.warn("Nao foi possivel carregar o historico do mes anterior.", historyError);
      }
    }

    supplemental.hunterSheet = getCurrentHunterSheetName();
    supplemental.hunters = [];
    supplemental.paidClients = [];
    supplemental.potentialClients = [];
    try {
      const hunterCsv = await fetchCsv(getHunterSheetCsvUrl());
      const hunterData = extractHunterDataFromCsv(hunterCsv);
      supplemental.hunters = hunterData.hunters;
      supplemental.paidClients = hunterData.paidClients;
      supplemental.potentialClients = hunterData.potentialClients;
      sourceHealth.hunters = {
        ...sourceHealth.hunters,
        ok: true,
        rows: hunterData.hunters.length,
        empty: hunterData.hunters.length === 0
      };
    } catch (hunterError) {
      sourceHealth.hunters.error = hunterError.message;
      console.warn(`Nao foi possivel sincronizar a aba ${supplemental.hunterSheet}.`, hunterError);
    }

    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({
      ...buildRanking(rows, explicitTeamGoals, explicitTeamTotals, metrics, supplemental),
      sourceHealth,
      period: period.key,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString()
    });
  } catch (error) {
    return response.status(502).json({
      error: "Nao foi possivel sincronizar a planilha de ranking.",
      details: error.message
    });
  }
}

export {
  buildRanking,
  extractHunterDataFromCsv,
  getCurrentHunterSheetName,
  getHunterSheetCsvUrl,
  rowsFromPlatinoSideBySideCsv
};
