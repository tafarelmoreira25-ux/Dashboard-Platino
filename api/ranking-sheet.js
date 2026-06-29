const REQUIRED_HEADERS = {
  name: ["NOME", "NOME COMPLETO", "COLABORADOR", "VENDEDOR", "RESPONSAVEL"],
  sold: ["VALOR LIQUIDO", "LIQUIDO", "VENDIDO", "RESULTADO", "VENDAS", "VALOR VENDIDO", "VALOR"],
  goal: ["META", "META INDIVIDUAL"],
  gap: ["GAP (FALTA)", "GAP", "FALTA"],
  teamGoal: ["META DA EQUIPE", "META EQUIPE", "META DO SETOR"],
  teamGap: ["GAP DA EQUIPE", "GAP EQUIPE", "FALTA DA EQUIPE", "FALTA EQUIPE"],
  sector: ["SETOR", "EQUIPE", "TIME"]
};

const DEFAULT_SPREADSHEET_ID = "1BJfwUQWr_R5K52QIKi2NHYW48bIJlGjHJwFNDtD4lEg";
const DEFAULT_TEAM_GOALS = {
  comercial: 150000,
  juridico: 310000
};

function getCurrentPortugueseMonthName() {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "America/Sao_Paulo"
  }).format(new Date()).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function getDefaultSheetCsvUrl() {
  const spreadsheetId = process.env.RANKING_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const sheetName = process.env.RANKING_SHEET_NAME || getCurrentPortugueseMonthName();
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

function getColumn(row, headerMap, key) {
  const aliases = REQUIRED_HEADERS[key] || [];
  for (const alias of aliases) {
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

async function fetchCsv(url) {
  const response = await fetch(url, { cache: "no-store" });
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
    const goal = parseMoney(getColumn(row, headerMap, "goal"));

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

function extractSummaryData(rows, section) {
  const entries = [];
  const team = {
    total: 0,
    goal: extractTeamGoal(rows, section)
  };
  let summaryStarted = false;

  for (const row of rows.slice(1)) {
    const hasDate = isDateLike(row[section.dateIndex]);
    const name = normalizeConsultantName(row[section.dateIndex]) || normalizeConsultantName(row[section.consultantIndex]);
    const sold = parseMoney(row[section.valueIndex]);
    const goal = parseMoney(row[section.metaIndex]);
    const gap = parseMoney(row[section.gapIndex]);
    const explicitTeamTotal = parseMoney(row[section.netValueIndex]);
    const metaLabel = normalizeHeader(row[section.metaIndex]);
    const gapLabel = normalizeHeader(row[section.gapIndex]);

    if (metaLabel.includes("META") || gapLabel.includes("GAP")) {
      summaryStarted = true;
      continue;
    }

    if (!hasDate && !name && explicitTeamTotal > team.total) {
      team.total = explicitTeamTotal;
    }

    if (hasDate || !sold) continue;

    if (summaryStarted) {
      if (isTeamSummaryRow(sold, goal, entries, section)) {
        team.total = Math.max(team.total, sold);
        if (goal) team.goal = goal;
        continue;
      }

      entries.push({
        name,
        sold,
        goal,
        gap
      });
      continue;
    }

    if (!name && !goal && !gap) {
      entries.push({ name: "", sold, goal: 0, gap: 0 });
    }
  }

  const summarizedTotal = entries.reduce((sum, item) => sum + (item.sold || 0), 0);
  if (!team.total && summarizedTotal) team.total = summarizedTotal;
  return { entries, team };
}

function applySummaryData(grouped, summaryEntries) {
  const usedEntries = new Set();
  const items = Array.from(grouped.values());

  for (const item of items) {
    const itemKey = normalizeNameKey(item.name);
    let entryIndex = summaryEntries.findIndex((entry, index) =>
      !usedEntries.has(index) && entry.name && normalizeNameKey(entry.name) === itemKey
    );

    if (entryIndex === -1) {
      entryIndex = summaryEntries.findIndex((entry, index) =>
        !usedEntries.has(index) && Math.abs((entry.sold || 0) - (item.sold || 0)) < 0.02
      );
    }

    if (entryIndex === -1) continue;

    const entry = summaryEntries[entryIndex];
    usedEntries.add(entryIndex);
    item.sold = entry.sold || item.sold;
    item.goal = entry.goal || item.goal || 0;
    item.gap = entry.gap || Math.max((item.goal || 0) - (item.sold || 0), 0);
  }

  summaryEntries.forEach((entry, index) => {
    if (usedEntries.has(index) || !entry.name) return;
    const key = normalizeNameKey(entry.name);
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: entry.name,
        sold: entry.sold,
        goal: entry.goal || 0,
        gap: entry.gap || Math.max((entry.goal || 0) - (entry.sold || 0), 0)
      });
    }
  });
}

function rowsFromPlatinoSideBySideCsv(text) {
  const csvRows = parseCsv(text);
  if (csvRows.length < 2) return null;

  const headers = csvRows[0];
  const sections = detectSideBySideSections(headers);
  if (!sections.length) return null;

  const rows = [];
  const teamGoals = {};
  const teamTotals = {};
  const metrics = {
    comercialContracts: 0
  };

  for (const section of sections) {
    const grouped = new Map();
    const summary = extractSummaryData(csvRows, section);
    teamGoals[section.sector] = summary.team.goal || DEFAULT_TEAM_GOALS[section.sector] || 0;
    teamTotals[section.sector] = summary.team.total || 0;

    for (const row of csvRows.slice(1)) {
      const isValidEntryDate = summary.entries.length
        ? isDateLike(row[section.dateIndex])
        : isCurrentMonthDate(row[section.dateIndex]);
      if (!isValidEntryDate) continue;

      const name = normalizeConsultantName(row[section.consultantIndex]);
      const sold = getNetSoldValue(row, section);
      if (!name || !sold) continue;
      if (section.sector === "comercial") metrics.comercialContracts += 1;

      const key = normalizeNameKey(name);
      const current = grouped.get(key) || {
        name,
        sold: 0,
        goal: 0,
        gap: 0
      };
      current.sold += sold;
      grouped.set(key, current);
    }

    applySummaryData(grouped, summary.entries);

    grouped.forEach(item => {
      rows.push({
        sector: section.sector,
        name: item.name,
        sold: item.sold,
        goal: item.goal || 0,
        gap: item.gap || Math.max((item.goal || 0) - (item.sold || 0), 0),
        teamGoal: teamGoals[section.sector],
        teamGap: 0
      });
    });
  }

  return { rows, teamGoals, teamTotals, metrics };
}

function buildRanking(rows, explicitTeamGoals = {}, explicitTeamTotals = {}, metrics = {}) {
  const ranking = {
    comercial: [],
    juridico: [],
    teamGoals: {},
    teamTotals: {},
    metrics: {
      comercialContracts: Number(metrics.comercialContracts) || 0,
      companyTotal: 0
    },
    updatedAt: new Date().toISOString()
  };

  for (const row of rows) {
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
    const soldTotal = items.reduce((sum, item) => sum + (item.sold || 0), 0);

    ranking.teamGoals[sector] = teamGoal;
    ranking.teamTotals[sector] = explicitTeamTotals[sector] || (teamGoal && teamGaps.length
      ? Math.max(teamGoal - Math.min(...teamGaps), 0)
      : soldTotal);
  }

  ranking.metrics.companyTotal = (ranking.teamTotals.comercial || 0) + (ranking.teamTotals.juridico || 0);
  return ranking;
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const sharedUrl = process.env.RANKING_SHEET_CSV_URL;
  const comercialUrl = process.env.RANKING_COMERCIAL_SHEET_CSV_URL;
  const juridicoUrl = process.env.RANKING_JURIDICO_SHEET_CSV_URL;

  try {
    const rows = [];
    const explicitTeamGoals = {};
    const explicitTeamTotals = {};
    const metrics = {};

    if (sharedUrl || (!comercialUrl && !juridicoUrl)) {
      const csv = await fetchCsv(sharedUrl || getDefaultSheetCsvUrl());
      const platinoData = rowsFromPlatinoSideBySideCsv(csv);
      if (platinoData) {
        rows.push(...platinoData.rows);
        Object.assign(explicitTeamGoals, platinoData.teamGoals);
        Object.assign(explicitTeamTotals, platinoData.teamTotals);
        Object.assign(metrics, platinoData.metrics);
      } else {
        rows.push(...rowsFromCsv(csv));
      }
    }
    if (comercialUrl) {
      rows.push(...rowsFromCsv(await fetchCsv(comercialUrl), "comercial"));
    }
    if (juridicoUrl) {
      rows.push(...rowsFromCsv(await fetchCsv(juridicoUrl), "juridico"));
    }

    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json(buildRanking(rows, explicitTeamGoals, explicitTeamTotals, metrics));
  } catch (error) {
    return response.status(502).json({
      error: "Nao foi possivel sincronizar a planilha de ranking.",
      details: error.message
    });
  }
}
