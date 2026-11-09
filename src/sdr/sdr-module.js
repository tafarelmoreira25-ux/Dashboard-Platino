import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  limit,
  onSnapshot,
  query,
  startAfter,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import {
  SDR_STEPS,
  calculateInterestScore,
  calculateRemainingInstallments,
  formatCpfCnpj,
  formatMoney,
  formatPhone,
  getForwardingMissingFields,
  maskPhone,
  normalizeDigits,
  normalizeSearch,
  parsePtBrMoney,
  resolveFirestoreLeadRole,
  sanitizeText,
  validateLeadRegistration
} from "./sdr-core.js";
import { scanLeadPage, SDR_SEARCH_SCAN_LIMIT } from "./sdr-query-policy.js";

const root = document.getElementById("sdr-root");
const CACHE_KEY = "platinoSdrWorkspaceV2";
const DEFAULT_BANKS = Object.freeze([
  { id: "banco-bv", name: "Banco BV", featured: true },
  { id: "santander", name: "Santander", featured: true },
  { id: "bradesco", name: "Bradesco", featured: true },
  { id: "itau-unibanco", name: "Itaú Unibanco", featured: true },
  { id: "banco-do-brasil", name: "Banco do Brasil", featured: true },
  { id: "caixa-economica-federal", name: "Caixa Econômica Federal", featured: true },
  { id: "banco-pan", name: "Banco PAN", featured: true },
  { id: "banco-safra", name: "Safra", featured: true },
  { id: "omni-financeira", name: "Omni Financeira", featured: true },
  { id: "banco-daycoval", name: "Daycoval", featured: true },
  { id: "aymore-credito-financiamento-e-investimento", name: "Aymoré Crédito, Financiamento e Investimento" },
  { id: "banco-gm", name: "Chevrolet Serviços Financeiros" },
  { id: "banco-volkswagen", name: "Volkswagen Financial Services" },
  { id: "banco-honda", name: "Banco Honda" },
  { id: "banco-yamaha", name: "Banco Yamaha" },
  { id: "banco-toyota", name: "Banco Toyota" },
  { id: "banco-cnh-industrial", name: "Banco CNH Industrial" }
]);
const state = {
  app: null, auth: null, db: null, user: null, profile: null, role: "collaborator",
  leads: [], notifications: [], banks: [...DEFAULT_BANKS], rules: [], assignableUsers: [], events: [], comments: [],
  activeId: "", activeLead: null, step: 0, view: "sdr", section: "portfolio", metricFilter: "", saveTimer: 0,
  page: 1, pageSize: 10, pageCursors: [null], pageTotal: null, pageCountUnavailable: false, pageHasNext: false, listRequest: 0,
  listError: "", listLoading: false, pageCache: new Map(),
  filters: { search: "", status: "", classification: "" }, metricCounts: {}, metricPending: new Set(), metricGeneration: 0,
  stop: [], notificationUid: "", stopAux: [], detailStops: [], stopList: null, booted: false, duplicatePayload: null
};

const sdrDevMode = ["localhost", "127.0.0.1"].includes(location.hostname);
function invalidateMetricCounts() {
  state.metricCounts = {};
  state.metricPending = new Set();
  state.metricGeneration += 1;
}
const sdrReadStats = { queriesStarted: {}, snapshotEvents: {}, documentsDelivered: {}, cacheHits: {}, activeListeners: {}, peakListeners: 0 };
if (sdrDevMode) {
  window.sdrDevReadStats = () => structuredClone(sdrReadStats);
  window.sdrDevResetReadStats = () => {
    sdrReadStats.queriesStarted = {};
    sdrReadStats.snapshotEvents = {};
    sdrReadStats.documentsDelivered = {};
    sdrReadStats.cacheHits = {};
    sdrReadStats.peakListeners = Object.values(sdrReadStats.activeListeners).reduce((sum, count) => sum + count, 0);
  };
}
function recordRequest(label) {
  if (!sdrDevMode) return;
  sdrReadStats.queriesStarted[label] = (sdrReadStats.queriesStarted[label] || 0) + 1;
}
function recordDelivery(label, documents) {
  if (!sdrDevMode) return;
  sdrReadStats.documentsDelivered[label] = (sdrReadStats.documentsDelivered[label] || 0) + documents;
}
async function trackedDocs(reference, label) {
  recordRequest(label);
  const snapshot = await getDocs(reference);
  recordDelivery(label, snapshot.size);
  return snapshot;
}
async function trackedCount(reference, label) {
  recordRequest(label);
  const result = await getCountFromServer(reference);
  return result;
}
async function trackedDoc(reference, label) {
  recordRequest(label);
  const result = await getDoc(reference);
  recordDelivery(label, result.exists() ? 1 : 0);
  return result;
}
function trackedSnapshot(reference, label, callback, onError) {
  if (sdrDevMode) {
    recordRequest(label);
    sdrReadStats.activeListeners[label] = (sdrReadStats.activeListeners[label] || 0) + 1;
    sdrReadStats.peakListeners = Math.max(sdrReadStats.peakListeners, Object.values(sdrReadStats.activeListeners).reduce((sum, count) => sum + count, 0));
  }
  let first = true;
  const stop = onSnapshot(reference, snapshot => {
    if (sdrDevMode) {
      sdrReadStats.snapshotEvents[label] = (sdrReadStats.snapshotEvents[label] || 0) + 1;
      sdrReadStats.documentsDelivered[label] = (sdrReadStats.documentsDelivered[label] || 0) + (first ? snapshot.size : snapshot.docChanges().length);
    }
    first = false;
    callback(snapshot);
  }, onError);
  return () => {
    stop();
    if (sdrDevMode) sdrReadStats.activeListeners[label] = Math.max(0, (sdrReadStats.activeListeners[label] || 0) - 1);
  };
}

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));

const getPath = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const setPath = (object, path, value) => {
  const keys = path.split(".");
  let target = object;
  keys.slice(0, -1).forEach(key => { target[key] ||= {}; target = target[key]; });
  target[keys.at(-1)] = value;
};

function currentLead() {
  return state.leads.find(item => item.id === state.activeId) || state.activeLead || loadLocalDraft() || null;
}

function canManage() { return ["admin", "manager"].includes(state.role); }
function canSdr() { return canManage() || state.role === "sdr"; }
function canConsult() { return canManage() || ["consultant", "analyst"].includes(state.role); }
function canCreateLead() { return Boolean(state.user); }
function canAccessSdr() { return canCreateLead(); }

function hunterDisplayName() {
  const rawName = state.profile?.displayName || state.user?.displayName || state.user?.email?.split("@")[0] || "Hunter";
  return String(rawName).trim().split(/\s+/).slice(0, 2).join(" ");
}

async function api(action, payload = {}) {
  if (!state.auth?.currentUser) throw new Error("Faça login para continuar.");
  if (!navigator.onLine) throw new Error("Sem conexão. O rascunho permanece salvo neste dispositivo.");
  const send = async forceRefresh => {
    const token = await state.auth.currentUser.getIdToken(forceRefresh);
    return fetch("/api/sdr", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload })
    });
  };

  // O SDK renova o token automaticamente. Em uma resposta 401, força uma
  // renovação e tenta uma única vez antes de interromper o trabalho.
  // A API autentica antes de executar a ação, portanto a repetição não duplica leads.
  let response = await send(false);
  if (response.status === 401) response = await send(true);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
  if (action === "lead.save") state.pageCache.clear();
  if (["lead.create", "lead.assign", "lead.accept", "lead.return", "lead.outcome", "consent.record", "analysis.run", "document.register", "contact.record"].includes(action)) {
    queueMicrotask(() => {
      state.pageCache.clear();
      invalidateMetricCounts();
      if (["portfolio", "returns"].includes(state.section)) loadLeadPage("write");
      if (["portfolio", "returns", "indicators"].includes(state.section)) loadIndicatorCounts(state.section === "indicators");
    });
  }
  return result;
}

function cache() {
  if (!state.user?.uid) return {};
  try {
    const key = `${CACHE_KEY}:${state.user.uid}`;
    const scoped = JSON.parse(localStorage.getItem(key) || "{}");
    const marker = `${key}:migrated`;
    if (!localStorage.getItem(marker)) {
      const legacy = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      for (const [id, draft] of Object.entries(legacy)) {
        if (draft?.lead?.ownerSdrId !== state.user.uid || scoped[id]) continue;
        scoped[id] = draft;
      }
      localStorage.setItem(key, JSON.stringify(scoped));
      localStorage.setItem(marker, "1");
    }
    return scoped;
  } catch { return {}; }
}

function saveLocalDraft(lead) {
  if (!lead) return;
  const data = cache();
  data[lead.id || "new"] = { lead, step: state.step, savedAt: new Date().toISOString() };
  localStorage.setItem(`${CACHE_KEY}:${state.user.uid}`, JSON.stringify(data));
}

function loadLocalDraft() {
  const data = cache();
  return data[state.activeId || "new"]?.lead || null;
}

function clearLocalDraft(id) {
  const data = cache();
  delete data[id || "new"];
  localStorage.setItem(`${CACHE_KEY}:${state.user.uid}`, JSON.stringify(data));
}

function emptyLead() {
  return {
    id: "", status: "Rascunho", fullName: "", phone: "", cpfCnpj: "", email: "", state: "", city: "",
    origin: "", sourceChannel: "", campaign: "", marketingCompany: "", externalCode: "",
    nextContactAt: "", preferredContactTime: "", preferredChannel: "", initialObservation: "",
    marketingStatus: "APROVADO", marketingAnalysisDate: "", marketingAnalyst: "", marketingSummary: "",
    marketingFindings: [], commercialScore: 0, commercialClassification: "Frio",
    qualification: { answers: [{}, {}, {}, {}], communicationProfile: [] },
    contract: { hasContract: "Não informado", totalInstallments: "", paidInstallments: "", remainingInstallments: "" },
    analysis: {}, analysisDocument: {}, consent: {}, assignment: {}, outcome: {}
  };
}

function mount() {
  root.innerHTML = `
    <div class="sdr-shell space-y-4">
      <header class="sdr-command-hero">
        <div class="sdr-command-copy">
          <span class="sdr-command-eyebrow">Qualificação comercial</span>
          <h2 class="sdr-title">SDR — Qualificação <span>· ${esc(hunterDisplayName())}</span></h2>
          <p class="sdr-subtitle">Cadastre clientes potenciais, construa o perfil, gere a análise e encaminhe oportunidades qualificadas.</p>
          <div class="sdr-command-status"><span></span> Carteira atualizada ao navegar e ao salvar</div>
        </div>
        <div class="sdr-command-actions">
          <div class="sdr-notifications">
            <button id="sdr-notification-button" class="sdr-hero-secondary" type="button" aria-expanded="false" title="Notificações"><i class="ph ph-bell"></i><span id="sdr-notification-count">0</span></button>
            <div id="sdr-notification-panel" class="sdr-notification-panel" hidden></div>
          </div>
          <button id="sdr-refresh-button" class="sdr-hero-secondary" type="button"><i class="ph ph-arrows-clockwise"></i>Atualizar carteira</button>
          <button id="sdr-new-button" class="sdr-hero-primary" type="button"><i class="ph ph-user-plus"></i>Novo cliente</button>
        </div>
      </header>
      <nav id="sdr-view-tabs" class="sdr-view-tabs"></nav>
      <nav id="sdr-section-tabs" class="sdr-view-tabs" aria-label="Seções da SDR"></nav>
      <section id="sdr-metrics" class="sdr-metrics"></section>
      <div id="sdr-layout" class="sdr-layout">
        <aside class="sdr-panel sdr-queue">
          <div class="flex items-center justify-between gap-2"><h3 id="sdr-list-heading" class="font-black text-slate-800">Carteira de leads</h3><span id="sdr-list-count" class="text-xs font-bold text-slate-500">0</span></div>
          <div class="sdr-filters mt-3">
            <input id="sdr-search" class="sdr-control col-span-2" type="search" placeholder="Nome, telefone, CPF, protocolo, banco...">
            <select id="sdr-status-filter" class="sdr-control"><option value="">Todos os status</option></select>
            <select id="sdr-class-filter" class="sdr-control"><option value="">Todas as classificações</option><option>Quente</option><option>Morno</option><option>Frio</option></select>
            <label class="sdr-page-size-label">Por página <select id="sdr-page-size" class="sdr-control"><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></label>
          </div>
          <div id="sdr-lead-list" class="sdr-lead-list"></div>
          <nav id="sdr-pagination" class="sdr-pagination" aria-label="Páginas de leads"></nav>
        </aside>
        <main id="sdr-workspace" class="sdr-panel sdr-workspace"></main>
      </div>
    </div>
    <div id="sdr-modal" class="sdr-modal" hidden><div id="sdr-modal-card" class="sdr-modal-card"></div></div>`;
  bindShell();
  renderViewTabs();
  renderSectionTabs();
  renderStatusFilter();
  renderAll();
}

function bindShell() {
  document.getElementById("sdr-new-button").onclick = () => startNew();
  document.getElementById("sdr-refresh-button").onclick = async () => {
    state.pageCache.clear();
    state.pageCountUnavailable = false;
    invalidateMetricCounts();
    await loadLeadPage("refresh");
    await loadIndicatorCounts(state.section === "indicators");
    showToast("Carteira atualizada.", "success");
  };
  document.getElementById("sdr-search").oninput = debounceFilters;
  document.getElementById("sdr-status-filter").onchange = () => resetListFilters("filter");
  document.getElementById("sdr-class-filter").onchange = () => resetListFilters("filter");
  document.getElementById("sdr-page-size").onchange = () => { state.pageSize = Number(document.getElementById("sdr-page-size").value); resetListFilters("page-size"); };
  document.getElementById("sdr-notification-button").onclick = toggleNotifications;
  window.addEventListener("online", () => { setSaveStatus("Conexão restaurada. Sincronizando..."); flushCurrentDraft(); });
  window.addEventListener("offline", () => setSaveStatus("Sem conexão. Alterações protegidas neste dispositivo."));
}

function renderViewTabs() {
  const tabs = [["sdr", "Qualificação"]];
  if (canConsult()) tabs.push(["consultant", "Leads recebidos"]);
  if (canManage()) tabs.push(["settings", "Configurações"]);
  if (!tabs.some(([key]) => key === state.view)) state.view = tabs[0]?.[0] || "sdr";
  document.getElementById("sdr-view-tabs").innerHTML = tabs.map(([key, label]) =>
    `<button class="sdr-view-tab" type="button" data-view="${key}" aria-selected="${state.view === key}">${esc(label)}</button>`
  ).join("");
  document.querySelectorAll("[data-view]").forEach(button => button.onclick = () => {
    state.view = button.dataset.view;
    state.activeId = "";
    state.activeLead = null;
    invalidateMetricCounts();
    state.pageCache.clear();
    state.section = "portfolio";
    renderViewTabs();
    renderSectionTabs();
    subscribeLeads();
    renderAll();
  });
}

function renderSectionTabs() {
  const sections = [["portfolio", "Carteira de leads"], ["returns", "Retornos"], ["indicators", "Indicadores"], ["registration", "Cadastro e qualificação"]];
  const nav = document.getElementById("sdr-section-tabs");
  nav.hidden = state.view === "settings";
  nav.innerHTML = sections.map(([key, label]) => `<button type="button" class="sdr-view-tab" data-section="${key}" aria-selected="${state.section === key}">${label}</button>`).join("");
  nav.querySelectorAll("[data-section]").forEach(button => button.onclick = () => {
    state.section = button.dataset.section;
    updateAuxSubscriptions();
    if (state.section === "registration" || state.section === "indicators") {
      state.stopList?.();
      state.stopList = null;
      state.listRequest += 1;
    }
    if (state.section === "returns") state.metricFilter = "returns";
    else if (state.metricFilter === "returns") state.metricFilter = "";
    renderSectionTabs();
    renderAll();
    if (state.section === "indicators") loadIndicatorCounts(true);
    if (state.section === "returns" || state.section === "portfolio") {
      resetListFilters("section");
      loadIndicatorCounts();
    }
  });
}

const metrics = [
  ["portfolio", "Carteira total"], ["pending", "Pendentes"],
  ["new", "Novos"], ["waiting", "Aguardando contato"], ["today", "Contatos de hoje"],
  ["returns", "Retornos"], ["overdue", "Retornos vencidos"], ["qualifying", "Em qualificação"],
  ["hot", "Quentes"], ["warm", "Mornos"], ["cold", "Frios"], ["forwarded", "Encaminhados"],
  ["negotiation", "Em negociação"], ["approved", "Lead Aprovado"], ["rejected", "Lead Reprovado"]
];
const primaryMetricKeys = new Set(["portfolio", "pending", "qualifying", "forwarded"]);

function metricMatch(key, lead) {
  const today = new Date().toISOString().slice(0, 10);
  const next = String(lead.nextContactAt || "").slice(0, 10);
  return ({
    portfolio: true,
    pending: !["Encaminhado", "Recebido pelo consultor", "LEAD APROVADO", "LEAD REPROVADO", "Arquivado"].includes(lead.status),
    new: lead.status === "Novo lead",
    waiting: ["Aguardando contato", "Aguardando informações", "Aguardando aceite"].includes(lead.status),
    today: next === today,
    returns: lead.status === "Retorno agendado",
    overdue: next && next < today && !["LEAD APROVADO", "LEAD REPROVADO", "Arquivado"].includes(lead.status),
    qualifying: lead.status === "Em qualificação",
    hot: lead.commercialClassification === "Quente",
    warm: lead.commercialClassification === "Morno",
    cold: lead.commercialClassification === "Frio",
    forwarded: ["Encaminhado", "Recebido pelo consultor"].includes(lead.status),
    negotiation: lead.status === "Em negociação",
    approved: lead.status === "LEAD APROVADO",
    rejected: lead.status === "LEAD REPROVADO"
  })[key];
}

function renderMetrics() {
  const metricButton = ([key, label]) => `<button type="button" class="sdr-metric" data-metric="${key}" aria-pressed="${state.metricFilter === key}">
    <span>${esc(label)}</span><strong>${state.metricCounts[key] ?? "—"}</strong>
  </button>`;
  const primary = [
    { key: "portfolio", label: "Clientes na carteira", icon: "ph-address-book", tone: "blue" },
    { key: "pending", label: "Pendentes", icon: "ph-clock-countdown", tone: "amber" },
    { key: "qualifying", label: "Em qualificação", icon: "ph-user-focus", tone: "blue" },
    { key: "forwarded", label: "Encaminhados", icon: "ph-paper-plane-tilt", tone: "green" }
  ];
  const secondary = metrics.filter(([key]) => !primaryMetricKeys.has(key));
  const total = state.metricCounts.portfolio;
  const approved = state.metricCounts.approved;
  const conversion = total === undefined || approved === undefined ? "—" : `${total ? Math.round((approved / total) * 100) : 0}%`;
  document.getElementById("sdr-metrics").innerHTML = `<div class="sdr-metrics-primary">${primary.map(item => `<button type="button" class="sdr-portfolio-metric" data-tone="${item.tone}" data-metric="${item.key}" aria-pressed="${state.metricFilter === item.key}"><span><i class="ph ${item.icon}"></i>${esc(item.label)}</span><strong>${state.metricCounts[item.key] ?? "—"}</strong></button>`).join("")}
      <article class="sdr-portfolio-metric sdr-conversion-metric" data-tone="navy"><span><i class="ph ph-trend-up"></i>Conversão</span><strong>${conversion}</strong><small>${approved ?? "—"} fechamento(s)</small></article>
    </div>
    ${state.section === "indicators" ? `<details class="sdr-metrics-more" open>
      <summary><span><i class="ph ph-chart-bar"></i>Mais indicadores</span><i class="ph ph-caret-down"></i></summary>
      <div class="sdr-metrics-secondary">${secondary.map(metricButton).join("")}</div>
    </details>` : ""}`;
  document.querySelectorAll("[data-metric]").forEach(button => button.onclick = () => {
    state.metricFilter = state.metricFilter === button.dataset.metric ? "" : button.dataset.metric;
    state.section = "portfolio";
    renderSectionTabs();
    renderMetrics();
    resetListFilters("metric");
  });
}

function leadScopeConstraints() {
  if (canManage()) return [];
  return [where(state.view === "consultant" ? "assignedConsultantId" : "ownerSdrId", "==", state.user.uid)];
}

function metricConstraints(key) {
  const today = new Date().toISOString().slice(0, 10);
  const statuses = {
    new: ["Novo lead"], waiting: ["Aguardando contato", "Aguardando informações", "Aguardando aceite"],
    returns: ["Retorno agendado"], qualifying: ["Em qualificação"],
    forwarded: ["Encaminhado", "Recebido pelo consultor"], negotiation: ["Em negociação"],
    approved: ["LEAD APROVADO"], rejected: ["LEAD REPROVADO"]
  };
  if (key === "pending") return [where("status", "not-in", ["Encaminhado", "Recebido pelo consultor", "LEAD APROVADO", "LEAD REPROVADO", "Arquivado"])];
  if (key === "today") return [where("nextContactAt", ">=", today), where("nextContactAt", "<", `${today}T24`)];
  if (key === "overdue") return [where("nextContactAt", ">", ""), where("nextContactAt", "<", today), where("status", "not-in", ["LEAD APROVADO", "LEAD REPROVADO", "Arquivado"])];
  if (["hot", "warm", "cold"].includes(key)) return [where("commercialClassification", "==", { hot: "Quente", warm: "Morno", cold: "Frio" }[key])];
  if (statuses[key]) return [where("status", statuses[key].length === 1 ? "==" : "in", statuses[key].length === 1 ? statuses[key][0] : statuses[key])];
  return [];
}

async function loadIndicatorCounts(all = false) {
  if (!state.db || !state.user) return;
  const uid = state.user.uid;
  const view = state.view;
  const generation = state.metricGeneration;
  const pending = state.metricPending;
  const keys = (all ? metrics.map(([key]) => key) : ["portfolio", "pending", "qualifying", "forwarded", "approved"])
    .filter(key => state.metricCounts[key] === undefined && !pending.has(key));
  keys.forEach(key => pending.add(key));
  const ref = collection(state.db, "sdrLeads");
  await Promise.all(keys.map(async key => {
    try {
      const result = await trackedCount(query(ref, ...leadScopeConstraints(), ...metricConstraints(key)), `indicator:${key}`);
      if (state.user?.uid !== uid || state.view !== view || state.metricGeneration !== generation) return;
      state.metricCounts[key] = result.data().count;
    } catch (error) {
      console.warn(`Indicador SDR ${key}:`, error);
      if (state.user?.uid === uid && state.view === view && state.metricGeneration === generation) state.metricCounts[key] = null;
    } finally { pending.delete(key); }
  }));
  if (state.user?.uid === uid && state.view === view && state.metricGeneration === generation) renderMetrics();
}

function renderStatusFilter() {
  const statuses = ["Rascunho", "Novo lead", "Aguardando contato", "Em qualificação", "Aguardando informações", "Qualificado", "Análise em andamento", "Análise Concluída", "APROVADO", "Aguardando aceite", "Lead potencial", "Encaminhado", "Recebido pelo consultor", "Em contato", "Retorno agendado", "Em negociação", "LEAD APROVADO", "LEAD REPROVADO", "Devolvido", "Arquivado"];
  document.getElementById("sdr-status-filter").innerHTML = `<option value="">Todos os status</option>${statuses.map(item => `<option>${item}</option>`).join("")}`;
}

function leadMatchesFilters(lead) {
  const { search, status, classification } = state.filters;
    if (state.metricFilter && !metricMatch(state.metricFilter, lead)) return false;
    if (status && lead.status !== status) return false;
    if (classification && lead.commercialClassification !== classification) return false;
    if (search && !normalizeSearch([
      lead.fullName, lead.phone, lead.cpfCnpj, lead.protocol, lead.externalCode,
      lead.contract?.bankName, lead.contract?.contractType
    ].join(" ")).includes(search)) return false;
    return true;
}

let filterTimer = 0;
function debounceFilters() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => resetListFilters("typing"), 250);
}

function resetListFilters(reason = "filter") {
  clearTimeout(filterTimer);
  state.filters = {
    search: normalizeSearch(document.getElementById("sdr-search")?.value),
    status: document.getElementById("sdr-status-filter")?.value || "",
    classification: document.getElementById("sdr-class-filter")?.value || ""
  };
  state.page = 1;
  state.pageCursors = [null];
  state.pageTotal = null;
  state.pageCountUnavailable = false;
  state.pageCache.clear();
  loadLeadPage(reason);
}

function leadQueryConstraints() {
  const constraints = [...leadScopeConstraints()];
  // O filtro de status é aplicado no servidor; a busca textual sem índice é
  // percorrida em lotes sob demanda, sem carregar a coleção na inicialização.
  const status = state.filters.status || (state.section === "returns" ? "Retorno agendado" : "");
  if (canManage() && status) constraints.push(where("status", "==", status));
  else if (canManage() && state.filters.classification) constraints.push(where("commercialClassification", "==", state.filters.classification));
  return constraints;
}

async function loadLeadPage(reason = "page") {
  if (!state.db || !state.user || !root?.querySelector("#sdr-lead-list")) return;
  state.stopList?.();
  state.stopList = null;
  const request = ++state.listRequest;
  const uid = state.user.uid;
  const ref = collection(state.db, "sdrLeads");
  const base = leadQueryConstraints();
  let cursor = state.pageCursors[state.page - 1] || null;
  const cacheKey = JSON.stringify([uid, state.view, state.section, state.filters, state.metricFilter, state.pageSize, state.page]);
  const cached = state.pageCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10_000) {
    if (sdrDevMode) sdrReadStats.cacheHits[reason] = (sdrReadStats.cacheHits[reason] || 0) + 1;
    Object.assign(state, { leads: cached.leads, pageHasNext: cached.hasNext, listError: "", listLoading: false });
    state.pageCursors[state.page] = cached.nextCursor;
    renderQueue();
    return;
  }
  state.leads = [];
  state.listError = "";
  state.listLoading = true;
  if (!document.querySelector(".sdr-queue")?.hidden) renderQueue();
  if (!state.filters.search && !state.filters.classification && !state.metricFilter && (!state.filters.status || canManage()) && (state.section !== "returns" || canManage())) {
    const pageQuery = query(ref, ...base, ...(cursor ? [startAfter(cursor)] : []), limit(state.pageSize + 1));
    state.stopList = trackedSnapshot(pageQuery, `lead-page:${reason}`, snapshot => {
      if (request !== state.listRequest || state.user?.uid !== uid) return;
      const visible = snapshot.docs.slice(0, state.pageSize);
      state.leads = visible.map(item => ({ id: item.id, ...item.data() }));
      state.listError = "";
      state.listLoading = false;
      state.pageHasNext = snapshot.size > state.pageSize;
      state.pageCursors[state.page] = visible.at(-1) || cursor;
      renderQueue();
    }, error => {
      if (request !== state.listRequest) return;
      state.leads = [];
      state.pageHasNext = false;
      state.listLoading = false;
      state.listError = `Não foi possível sincronizar esta consulta: ${error.message}`;
      renderQueue();
    });
    if (state.pageTotal === null && !state.pageCountUnavailable) {
      try {
        const count = await trackedCount(query(ref, ...base), "lead-total");
        if (request === state.listRequest) { state.pageTotal = count.data().count; renderLeadPagination(); }
      } catch { state.pageCountUnavailable = true; }
    }
    return;
  }
  try {
    const result = await scanLeadPage({
      pageSize: state.pageSize, cursor, maxDocuments: SDR_SEARCH_SCAN_LIMIT,
      isCurrent: () => request === state.listRequest && state.user?.uid === uid,
      fetchBatch: async (after, size) => {
        const pageQuery = query(ref, ...base, ...(after ? [startAfter(after)] : []), limit(size));
        const snapshot = await trackedDocs(pageQuery, `lead-filter-scan:${reason}`);
        return snapshot.docs;
      },
      matches: item => leadMatchesFilters({ id: item.id, ...item.data() })
    });
    if (result.cancelled) return;
    if (!result.complete) {
      state.leads = [];
      state.pageHasNext = false;
      state.listLoading = false;
      state.listError = `Busca não concluída após ${result.scanned} documentos consultados. Nenhum resultado parcial foi exibido. Refine os filtros; a pesquisa completa exige indexação dos registros.`;
      renderQueue();
      return;
    }
    state.leads = result.items.map(item => ({ id: item.id, ...item.data() }));
    state.listError = "";
    state.listLoading = false;
    state.pageHasNext = result.hasNext;
    state.pageCursors[state.page] = result.nextCursor;
    for (const [key, value] of state.pageCache) if (Date.now() - value.at >= 10_000) state.pageCache.delete(key);
    if (state.pageCache.size >= 8) state.pageCache.delete(state.pageCache.keys().next().value);
    state.pageCache.set(cacheKey, { at: Date.now(), leads: state.leads, hasNext: result.hasNext, nextCursor: result.nextCursor });
    if (state.pageTotal === null && !state.pageCountUnavailable && !state.filters.search && !state.metricFilter && !state.filters.classification && (!state.filters.status || canManage())) {
      try {
        const count = await trackedCount(query(ref, ...base), "lead-total");
        if (request !== state.listRequest) return;
        state.pageTotal = count.data().count;
      } catch { state.pageCountUnavailable = true; }
    } else state.pageTotal = null;
    if (request !== state.listRequest) return;
    renderQueue();
  } catch (error) {
    if (request === state.listRequest) {
      state.leads = [];
      state.pageHasNext = false;
      state.listLoading = false;
      state.listError = `Não foi possível consultar a carteira: ${error.message}`;
      renderQueue();
    }
  }
}

function changeLeadPage(page) {
  if (page < 1 || (page > state.page && !state.pageHasNext)) return;
  if (page > state.page + 1 || !state.pageCursors[page - 1] && page > 1) return;
  state.page = page;
  loadLeadPage("page");
  document.getElementById("sdr-list-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderLeadPagination() {
  if (state.listError || state.listLoading) {
    document.getElementById("sdr-pagination").innerHTML = "";
    return;
  }
  const totalPages = state.pageTotal === null ? null : Math.max(1, Math.ceil(state.pageTotal / state.pageSize));
  const pages = totalPages === null
    ? [Math.max(1, state.page - 1), state.page, ...(state.pageHasNext ? [state.page + 1] : [])]
    : Array.from({ length: Math.min(5, totalPages) }, (_, index) => Math.max(1, Math.min(state.page - 2, totalPages - 4)) + index).filter(page => page <= totalPages);
  document.getElementById("sdr-pagination").innerHTML = `<span class="sdr-page-summary">Página ${state.page}${state.pageTotal === null ? "" : ` de ${totalPages} · ${state.pageTotal} registros`}</span>
    <button type="button" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""} aria-label="Página anterior">Anterior</button>
    ${[...new Set(pages)].map(page => `<button type="button" data-page="${page}" ${page === state.page ? 'aria-current="page"' : ""} ${page > state.page + 1 || page > state.page && !state.pageHasNext ? "disabled" : ""}>${page}</button>`).join("")}
    <button type="button" data-page="${state.page + 1}" ${state.pageHasNext ? "" : "disabled"} aria-label="Próxima página">Próxima</button>`;
  document.querySelectorAll("#sdr-pagination [data-page]").forEach(button => button.onclick = () => changeLeadPage(Number(button.dataset.page)));
}

function badgeClass(lead) {
  if (lead.status === "LEAD APROVADO") return "approved";
  if (lead.status === "LEAD REPROVADO") return "rejected";
  if (["Encaminhado", "Recebido pelo consultor"].includes(lead.status)) return "forwarded";
  return lead.commercialClassification === "Quente" ? "hot" : lead.commercialClassification === "Morno" ? "warm" : "";
}

function renderQueue() {
  const items = state.leads;
  document.getElementById("sdr-list-heading").textContent = state.section === "returns" ? "Retornos" : "Carteira de leads";
  document.getElementById("sdr-list-count").textContent = state.listLoading ? "Buscando..." : state.listError ? "Busca interrompida" : `${items.length} nesta página`;
  document.getElementById("sdr-lead-list").innerHTML = state.listLoading ? '<div class="sdr-empty" role="status">Consultando a carteira...</div>' : state.listError ? `<div class="sdr-empty" role="status">${esc(state.listError)}</div>` : items.length ? items.map(lead => `
    <button type="button" class="sdr-lead-card" data-lead="${esc(lead.id)}" aria-selected="${state.activeId === lead.id}">
      <div class="flex items-start justify-between gap-2"><strong class="truncate text-sm text-slate-800">${esc(lead.fullName || "Sem nome")}</strong><span class="sdr-badge ${badgeClass(lead)}">${esc(lead.commercialClassification || "Frio")} · ${Number(lead.commercialScore) || 0}%</span></div>
      <p class="mt-1 text-xs text-slate-500">${esc(maskPhone(lead.phone))} · ${esc(lead.status || "Rascunho")}</p>
      <div class="mt-2 flex flex-wrap gap-1"><span class="sdr-badge">${esc(lead.origin || "Origem não informada")}</span>${lead.assignedConsultantName ? `<span class="sdr-badge forwarded">${esc(lead.assignedConsultantName)}</span>` : ""}</div>
      <p class="sdr-lead-meta">${esc(lead.protocol || "Protocolo ao criar")}${lead.nextContactAt ? ` · Próximo: ${esc(formatDateTime(lead.nextContactAt))}` : ""}</p>
    </button>`).join("") : `<div class="sdr-empty"><span><i class="ph ph-users-three mb-2 block text-3xl"></i>Nenhum lead para os filtros selecionados.</span></div>`;
  document.querySelectorAll("[data-lead]").forEach(button => button.onclick = () => openLead(button.dataset.lead));
  renderLeadPagination();
}

function renderAll() {
  const queue = document.querySelector(".sdr-queue");
  const layout = document.getElementById("sdr-layout");
  if (queue) queue.hidden = state.view === "settings" || ["registration", "indicators"].includes(state.section);
  document.getElementById("sdr-workspace").hidden = state.section !== "registration" && state.view !== "settings";
  layout.classList.toggle("sdr-single-panel", state.view === "settings" || state.section === "registration");
  layout.classList.toggle("is-editing", state.view === "settings" || state.section === "registration");
  document.getElementById("sdr-metrics").hidden = state.view === "settings" || state.section === "registration";
  renderMetrics();
  if (!queue?.hidden) renderQueue();
  if (state.view === "settings") return renderSettings();
  if (state.section !== "registration") return;
  const lead = currentLead();
  if (!lead) return renderEmptyWorkspace();
  if (state.view === "consultant") renderConsultantWorkspace(lead);
  else renderSdrWorkspace(lead);
}

function renderEmptyWorkspace() {
  document.getElementById("sdr-layout").classList.remove("is-editing");
  document.getElementById("sdr-workspace").innerHTML = `<div class="sdr-empty"><span><i class="ph ph-user-focus mb-3 block text-4xl text-sky-500"></i>Selecione um lead da fila ou crie um novo cadastro.</span></div>`;
}

function startNew() {
  if (!canCreateLead()) return showToast("Faça login para criar um lead.", "error");
  if (state.view !== "sdr") {
    state.view = "sdr";
    invalidateMetricCounts();
    state.pageCache.clear();
    renderViewTabs();
  }
  state.activeId = "";
  state.activeLead = null;
  state.step = 0;
  state.section = "registration";
  state.stopList?.();
  state.stopList = null;
  state.listRequest += 1;
  updateAuxSubscriptions();
  saveLocalDraft(emptyLead());
  renderSectionTabs();
  renderAll();
  document.getElementById("sdr-layout").classList.add("is-editing");
}

async function openLead(id) {
  let lead = state.leads.find(item => item.id === id);
  if (!lead) {
    try {
      const snapshot = await trackedDoc(doc(state.db, "sdrLeads", id), "lead-detail");
      if (!snapshot.exists() || !state.user) return showToast("Lead não encontrado ou sem acesso.", "error");
      lead = { id: snapshot.id, ...snapshot.data() };
    } catch (error) { return showToast(`Não foi possível abrir o lead: ${error.message}`, "error"); }
  }
  if (state.view === "settings") {
    state.view = "sdr";
    invalidateMetricCounts();
    state.pageCache.clear();
    renderViewTabs();
  }
  state.activeId = id;
  state.activeLead = lead;
  state.step = 0;
  state.section = "registration";
  state.stopList?.();
  state.stopList = null;
  state.listRequest += 1;
  updateAuxSubscriptions();
  renderSectionTabs();
  document.getElementById("sdr-layout").classList.add("is-editing");
  subscribeLeadDetails(id);
  renderAll();
}

function renderSdrWorkspace(lead) {
  const step = SDR_STEPS[state.step];
  document.getElementById("sdr-workspace").innerHTML = `
    <header class="sdr-lead-header">
      <button type="button" class="sdr-secondary md:hidden" data-back-list><i class="ph ph-arrow-left"></i>Fila</button>
      <div class="min-w-0"><p class="text-[10px] font-black uppercase tracking-wider text-sky-700">${esc(lead.protocol || "Novo cadastro")}</p><h3 class="truncate font-black text-slate-800">${esc(lead.fullName || "Novo lead")}</h3><p class="text-xs text-slate-500">${esc(lead.status || "Rascunho")}</p></div>
      <div class="sdr-lead-toolbar">
        <span class="sdr-badge ${badgeClass(lead)}">${esc(lead.commercialClassification || "Frio")} · ${Number(lead.commercialScore) || 0}%</span>
        ${lead.phone ? `<a class="sdr-icon-action whatsapp" href="https://wa.me/55${normalizeDigits(lead.phone)}" target="_blank" rel="noopener" title="Conversar no WhatsApp" aria-label="Conversar no WhatsApp"><i class="ph ph-whatsapp-logo"></i></a>` : ""}
        ${lead.id ? `<button class="sdr-icon-action" type="button" data-profile-pdf title="Baixar PDF do perfil" aria-label="Baixar PDF do perfil"><i class="ph ph-identification-card"></i></button>` : ""}
        ${lead.analysis?.correctionNumber ? `<button class="sdr-icon-action" type="button" data-quick-analysis-pdf title="Baixar PDF da análise" aria-label="Baixar PDF da análise"><i class="ph ph-file-pdf"></i></button>` : ""}
        ${lead.id ? `<button class="sdr-forward-action" type="button" data-jump-assignment><i class="ph ph-paper-plane-tilt"></i>Encaminhar</button>` : ""}
      </div>
    </header>
    <div class="sdr-progress-header">
      <div class="sdr-progress-copy"><span>Passo ${state.step + 1} de ${SDR_STEPS.length}</span><strong>${esc(step.label)}</strong></div>
      <div class="sdr-progress-track" aria-hidden="true"><span style="width:${((state.step + 1) / SDR_STEPS.length) * 100}%"></span></div>
      <nav class="sdr-stepper" aria-label="Etapas do atendimento">${SDR_STEPS.map((item, index) => `<button type="button" class="sdr-step" data-step="${index}" aria-label="${index + 1}. ${esc(item.label)}" aria-current="${index === state.step ? "step" : "false"}"><span class="sdr-step-number">${index + 1}</span><span class="sdr-step-label">${esc(item.label)}</span></button>`).join("")}</nav>
    </div>
    <form id="sdr-step-form">
      <div class="sdr-form-body">${renderStep(step.key, lead)}</div>
      <footer class="sdr-actionbar">
        <span id="sdr-save-status" class="sdr-save-status">Rascunho protegido neste dispositivo.</span>
        <button class="sdr-secondary" type="button" data-prev ${state.step === 0 ? "disabled" : ""}><i class="ph ph-arrow-left"></i><span>Voltar</span></button>
        <button class="sdr-secondary sdr-save-button" type="button" data-save><i class="ph ph-floppy-disk"></i><span>${lead.id ? "Salvar agora" : "Criar lead"}</span></button>
        <button class="sdr-primary" type="button" data-next ${state.step === SDR_STEPS.length - 1 ? "disabled" : ""}><span>Avançar</span><i class="ph ph-arrow-right"></i></button>
      </footer>
    </form>`;
  bindWorkspace(lead);
}

function renderStep(key, lead) {
  if (key === "registration") return registrationStep(lead);
  if (key === "qualification") return qualificationStep(lead);
  if (key === "contract") return contractStep(lead);
  if (key === "analysis") return analysisStep(lead);
  if (key === "document") return documentStep(lead);
  if (key === "consent") return consentStep(lead);
  return assignmentStep(lead);
}

function input(label, path, lead, options = {}) {
  const value = getPath(lead, path) ?? "";
  const type = options.type || "text";
  const required = options.required ? `<span class="sdr-required">*</span>` : "";
  const inputMode = options.inputmode || (type === "tel" ? "tel" : type === "number" ? "numeric" : "");
  const attributes = `${inputMode ? ` inputmode="${inputMode}"` : ""}${options.autocomplete ? ` autocomplete="${esc(options.autocomplete)}"` : ""}${options.readonly ? " readonly" : ""}`;
  const field = options.as === "textarea"
    ? `<textarea class="sdr-control" rows="${options.rows || 3}" data-sdr-field="${path}" ${options.required ? "required" : ""} placeholder="${esc(options.placeholder || "")}">${esc(value)}</textarea>`
    : options.options
      ? `<select class="sdr-control" data-sdr-field="${path}" ${options.required ? "required" : ""}>${options.options.map(item => `<option value="${esc(item)}" ${String(value) === item ? "selected" : ""}>${esc(item || "Selecione")}</option>`).join("")}</select>`
      : `<input class="sdr-control" type="${type}" value="${esc(value)}" data-sdr-field="${path}" ${options.required ? "required" : ""} placeholder="${esc(options.placeholder || "")}"${attributes}>`;
  return `<label class="sdr-field">${esc(label)} ${required}${field}${options.help ? `<span class="sdr-help">${esc(options.help)}</span>` : ""}</label>`;
}

function expandableBlock(title, description, content, options = {}) {
  return `<details class="sdr-expandable" ${options.open ? "open" : ""}>
    <summary><span><strong>${esc(title)}</strong>${description ? `<small>${esc(description)}</small>` : ""}</span><i class="ph ph-caret-down"></i></summary>
    <div class="sdr-expandable-body">${content}</div>
  </details>`;
}

function mergeBankCatalog(remoteBanks = []) {
  const defaultsById = new Map(DEFAULT_BANKS.map((bank, index) => [bank.id, { ...bank, displayOrder: index + 1 }]));
  const remoteById = new Map(remoteBanks.map(bank => [bank.id, bank]));
  const preferred = [...defaultsById].map(([id, bank]) => ({ ...remoteById.get(id), ...bank, id }));
  const extras = remoteBanks
    .filter(bank => !defaultsById.has(bank.id) && bank.id !== "outro" && normalizeSearch(bank.name) !== "outro")
    .sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999) || a.name.localeCompare(b.name));
  return [...preferred, ...extras];
}

function registrationStep(lead) {
  const origins = ["", "Instagram", "Facebook", "Site", "WhatsApp", "Ligação", "Indicação", "Campanha", "Lista comercial", "Empresa de marketing", "Outro"];
  const statuses = ["APROVADO", "Aprovado com prioridade", "Aprovado com urgência", "Aprovado aguardando documentos", "Aprovado para contato imediato"];
  return `<section class="sdr-form-card sdr-call-card">
    <div class="sdr-card-heading"><div><span class="sdr-eyebrow">Durante a ligação</span><h3>Identificação rápida</h3><p>Comece pelos três campos obrigatórios. O restante pode ser completado depois.</p></div><span class="sdr-required-note"><b>*</b> obrigatório</span></div>
    <div class="sdr-grid two sdr-essential-grid">
      ${input("Nome completo", "fullName", lead, { required: true, autocomplete: "name", placeholder: "Nome do cliente" })}
      ${input("Telefone/WhatsApp", "phone", lead, { required: true, type: "tel", autocomplete: "tel", placeholder: "(00) 00000-0000" })}
      ${input("Origem do lead", "origin", lead, { options: origins, required: true })}
      ${input("Agendar próximo contato", "nextContactAt", lead, { type: "datetime-local" })}
    </div>
    ${input("Anotação rápida da conversa", "initialObservation", lead, { as: "textarea", rows: 2, placeholder: "Dor principal, pedido do cliente ou informação importante..." })}
  </section>
  ${expandableBlock("Dados complementares", "CPF, e-mail, localização e preferências", `<div class="sdr-grid two">
    ${input("CPF/CNPJ", "cpfCnpj", lead, { inputmode: "numeric", help: "Obrigatório somente ao encaminhar." })}
    ${input("E-mail", "email", lead, { type: "email", autocomplete: "email" })}
    ${input("Estado", "state", lead)}${input("Cidade", "city", lead)}
    ${input("Canal preferido", "sourceChannel", lead, { options: ["", "WhatsApp", "Ligação", "E-mail", "Videochamada", "Outro"] })}
    ${input("Melhor horário", "preferredContactTime", lead, { placeholder: "Ex.: após as 18h" })}
    ${input("Campanha", "campaign", lead)}${input("Código externo", "externalCode", lead)}
  </div>`)}
  ${expandableBlock("Informações do marketing", "Abra somente quando o lead vier de campanha ou parceiro", `<div class="sdr-grid two">
    ${input("Empresa responsável", "marketingCompany", lead)}${input("Data da análise inicial", "marketingAnalysisDate", lead, { type: "date" })}
    ${input("Responsável pela análise", "marketingAnalyst", lead)}${input("Status recebido", "marketingStatus", lead, { options: statuses })}
  </div>${input("Resumo da análise", "marketingSummary", lead, { as: "textarea", rows: 3 })}`)} `;
}

const questions = [
  { title: "Pergunta 1 — Dor principal", text: "Qual é hoje o maior problema relacionado ao seu financiamento ou empréstimo?", shortcuts: ["Parcela muito alta", "Parcelas atrasadas", "Saldo devedor elevado", "Juros elevados", "Encargos não compreendidos", "Renegociação", "Dificuldade para quitar", "Busca e apreensão", "Risco de perder o bem", "Contrato quitado", "Outro"] },
  { title: "Pergunta 2 — Impacto no orçamento", text: "De que forma essa situação está afetando sua vida financeira ou sua rotina?", shortcuts: ["Compromete grande parte da renda", "Está atrasando outras contas", "Risco sobre o bem", "Está impedindo outros planos", "Preocupação familiar", "Precisa reduzir os gastos", "Não possui impacto urgente", "Outro"] },
  { title: "Pergunta 3 — Objetivo esperado", text: "O que você espera conseguir por meio da análise e revisão do contrato?", shortcuts: ["Reduzir a parcela", "Reduzir o saldo devedor", "Entender os juros", "Retirar encargos", "Receber estorno", "Negociar parcelas", "Regularizar atraso", "Evitar busca e apreensão", "Quitar o contrato", "Apenas obter informações", "Outro"] },
  { title: "Pergunta 4 — Prazo de decisão", text: "Caso a análise apresente uma possibilidade de atuação, em quanto tempo você pretende resolver essa situação?", shortcuts: ["Imediatamente", "Hoje", "Em até três dias", "Em até sete dias", "Neste mês", "Sem prazo definido", "Apenas pesquisando", "Precisa falar com outra pessoa", "Ainda não decidiu"] }
];

function qualificationStep(lead) {
  const q = lead.qualification || {};
  return `<section class="sdr-form-card sdr-call-guide"><div class="sdr-card-heading"><div><span class="sdr-eyebrow">Roteiro de ligação</span><h3>Faça uma pergunta por vez</h3><p>Clique nas respostas rápidas e complemente somente quando necessário.</p></div><span class="sdr-call-timer"><i class="ph ph-phone-call"></i>Fluxo guiado</span></div></section>
    <div class="sdr-question-list">${questions.map((item, index) => {
      const selectedValues = new Set(String(q.answers?.[index]?.answer || "").split(";").map(value => value.trim()).filter(Boolean));
      return `<section class="sdr-question"><div class="sdr-question-heading"><span>${index + 1}</span><div><h3>${esc(item.title.replace(/^Pergunta \d+ — /, ""))}</h3><p>${esc(item.text)}</p></div></div>
        <div class="sdr-shortcuts">${item.shortcuts.map(shortcut => `<button class="sdr-shortcut" type="button" data-shortcut="${index}" data-value="${esc(shortcut)}" aria-pressed="${selectedValues.has(shortcut)}">${esc(shortcut)}</button>`).join("")}</div>
        ${input("Resposta registrada", `qualification.answers.${index}.answer`, lead, { as: "textarea", rows: 2, required: true, placeholder: "Selecione uma opção acima ou escreva com as palavras do cliente." })}
        <div class="sdr-question-footer"><label><input type="checkbox" data-sdr-field="qualification.answers.${index}.notInformed" ${q.answers?.[index]?.notInformed ? "checked" : ""}> Cliente não informou</label>${expandableBlock("Adicionar observação", "", input("Observação interna", `qualification.answers.${index}.notes`, lead, { as: "textarea", rows: 2 }))}</div>
      </section>`;
    }).join("")}</div>
    <section class="sdr-form-card"><div class="sdr-card-heading"><div><span class="sdr-eyebrow">Fechamento da qualificação</span><h3>Resumo para continuidade</h3><p>Registre o essencial para quem receber este atendimento.</p></div><div class="sdr-score-chip"><span>Interesse</span><strong id="sdr-score-preview">${Number(lead.commercialScore) || 0}% · ${esc(lead.commercialClassification || "Frio")}</strong></div></div>
      <div class="sdr-grid three sdr-essential-grid">
        ${input("Dor principal", "qualification.mainPain", lead, { options: ["", "Parcela alta", "Parcelas atrasadas", "Saldo elevado", "Busca e apreensão", "Juros elevados", "Encargos", "Quitação", "Renegociação", "Outro"] })}
        ${input("Urgência", "qualification.urgency", lead, { options: ["", "Muito alta", "Alta", "Média", "Baixa", "Sem urgência"] })}
        ${input("Interesse", "qualification.intention", lead, { options: ["", "Muito interessado", "Interessado", "Considerando", "Apenas pesquisando", "Sem interesse no momento"] })}
      </div>
      ${input("Resumo do atendimento", "qualification.sdrSummary", lead, { as: "textarea", rows: 3, required: true, placeholder: "Resuma a situação, objetivo e urgência do cliente." })}
      ${expandableBlock("Detalhes internos", "Disponibilidade, objeções e orientação ao consultor", `<div class="sdr-grid two">
        ${input("Disponibilidade financeira", "qualification.financialAvailability", lead, { options: ["", "Possui disponibilidade imediata", "Possui disponibilidade parcial", "Precisa organizar", "Precisa falar com outra pessoa", "Não informado"] })}
        ${input("Depende de outra pessoa?", "qualification.dependsOnOtherPerson", lead, { options: ["", "Não", "Cônjuge", "Familiar", "Sócio", "Responsável financeiro", "Outro", "Não informado"] })}
        ${input("Principal objeção", "qualification.mainObjection", lead)}
        ${input("Melhor canal", "qualification.preferredChannel", lead, { options: ["", "WhatsApp", "Ligação", "E-mail", "Videochamada", "Outro"] })}
        ${input("Confiança percebida", "qualification.confidenceLevel", lead, { options: ["", "Alto", "Médio", "Baixo"] })}
      </div>${input("Orientação para o consultor", "qualification.consultantGuidance", lead, { as: "textarea", rows: 2 })}`)}
    </section>`;
}

function contractStep(lead) {
  const types = ["", "Financiamento de veículo", "Financiamento de imóvel", "Empréstimo pessoal", "Empréstimo consignado", "Refinanciamento", "Renegociação", "Outro"];
  return `<section class="sdr-form-card"><div class="sdr-card-heading"><div><span class="sdr-eyebrow">Dados para análise</span><h3>Informações essenciais do contrato</h3><p>Peça primeiro os campos marcados com *. Os demais podem ser completados depois.</p></div><span class="sdr-required-note"><b>*</b> obrigatório</span></div>
    <div class="sdr-grid three sdr-essential-grid">
      ${input("Tipo de contrato", "contract.contractType", lead, { options: types, required: true })}
      ${bankSelect(lead)}
      ${input("Outra instituição", "contract.bankOther", lead, { help: "Preencha somente se escolheu Outra instituição." })}
      ${input("Parcela atual", "contract.currentInstallment", lead, { required: true, inputmode: "decimal", placeholder: "R$ 0,00" })}
      ${input("Total de parcelas", "contract.totalInstallments", lead, { type: "number", required: true, placeholder: "Ex.: 48" })}
      ${input("Parcelas pagas", "contract.paidInstallments", lead, { type: "number", required: true, placeholder: "Ex.: 12" })}
      ${input("Parcelas restantes", "contract.remainingInstallments", lead, { type: "number", readonly: true })}
      ${input("Parcelas atrasadas", "contract.overdueInstallments", lead, { type: "number", placeholder: "0" })}
      ${input("Situação atual", "contract.contractStatus", lead, { options: ["", "Em dia", "Parcelas atrasadas", "Quitado", "Renegociado", "Busca e apreensão", "Em negociação", "Não informado", "Outro"] })}
    </div>
    ${input("Observação importante", "contract.notes", lead, { as: "textarea", rows: 2, placeholder: "Registre apenas o que influencia a análise." })}
  </section>
  ${expandableBlock("Valores e taxas", "Valor financiado, entrada, saldo e taxas contratadas", `<div class="sdr-grid three">
    ${input("Valor financiado", "contract.financedAmount", lead, { inputmode: "decimal", placeholder: "R$ 0,00" })}
    ${input("Valor da entrada", "contract.downPayment", lead, { inputmode: "decimal", placeholder: "R$ 0,00" })}
    ${input("Saldo devedor", "contract.informedBalance", lead, { inputmode: "decimal", placeholder: "R$ 0,00" })}
    ${input("Data do contrato", "contract.contractDate", lead, { type: "date" })}
    ${input("Taxa ao mês", "contract.monthlyRate", lead, { inputmode: "decimal", placeholder: "2,19%" })}
    ${input("Taxa ao ano", "contract.annualRate", lead, { inputmode: "decimal", placeholder: "29,64%" })}
  </div>`)}
  ${expandableBlock("Bem e documento", "Detalhes do veículo e disponibilidade do contrato", `<div class="sdr-grid three">
    ${input("Subtipo", "contract.contractSubtype", lead, { options: ["", "Carro", "Moto", "Caminhão", "Utilitário", "Outro"] })}
    ${input("Modelo do veículo", "contract.vehicleModel", lead)}${input("Ano do veículo", "contract.vehicleYear", lead, { type: "number" })}${input("Placa", "contract.vehiclePlate", lead)}
    ${input("Possui contrato?", "contract.hasContract", lead, { options: ["Não informado", "Sim", "Não"] })}
    ${input("Formato", "contract.contractFormat", lead, { options: ["", "PDF", "Físico", "Fotografado", "Não possui", "Não informado"] })}
  </div><div class="sdr-info-note"><i class="ph ph-info"></i>Nenhum arquivo é anexado ou armazenado nesta etapa.</div>`)} `;
}

function bankSelect(lead) {
  const value = lead.contract?.bankId || "";
  const recurring = state.banks.filter(bank => bank.featured);
  const others = state.banks.filter(bank => !bank.featured);
  const options = banks => banks.map(bank => `<option value="${esc(bank.id)}" data-name="${esc(bank.name)}" ${value === bank.id ? "selected" : ""}>${esc(bank.name)}</option>`).join("");
  return `<label class="sdr-field">Banco ou financeira <span class="sdr-required">*</span><select class="sdr-control" data-sdr-field="contract.bankId" required><option value="">Selecione a instituição</option><optgroup label="Mais recorrentes">${options(recurring)}</optgroup><optgroup label="Outras instituições">${options(others)}</optgroup><option value="other" ${value === "other" ? "selected" : ""}>Outra instituição — escrever manualmente</option></select></label>`;
}

function analysisStep(lead) {
  const a = lead.analysis || {};
  return `<section class="sdr-form-card"><h3>Análise preliminar do contrato</h3><p>O cálculo e a análise utilizam tecnologia inteligente para gerar um diagnóstico baseado nas normas e diretrizes do Bacen.</p>
    <button id="sdr-run-analysis" type="button" class="sdr-primary mt-4" ${!lead.id ? "disabled" : ""}><i class="ph ph-calculator"></i>CALCULAR SIMULAÇÃO PRELIMINAR</button>
    <div id="sdr-analysis-loading" class="mt-4 hidden"><p id="sdr-analysis-message" class="mb-2 text-xs font-bold text-sky-800">Organizando os dados do contrato</p><div class="sdr-analysis-progress"><span></span></div></div>
    ${a.correctionNumber ? `<div class="mt-5"><p class="text-xs font-black uppercase text-emerald-700">Análise concluída</p><h4 class="mt-1 text-lg font-black text-slate-800">Margem de redução e estorno detectada com sucesso.</h4><div class="sdr-result-grid mt-4">${[
      ["PARCELA ATUAL", formatMoney(a.currentInstallment)], ["NOVA PARCELA ESTIMADA", formatMoney(a.estimatedInstallment)],
      ["REDUÇÃO POR PARCELA", formatMoney(a.installmentReduction)], ["ESTORNO", formatMoney(a.estimatedRefund)],
      ["REDUÇÃO TOTAL DO CONTRATO", formatMoney(a.totalContractReduction)], ["SITUAÇÃO", "APROVADA"]
    ].map(([label, value]) => `<div class="sdr-result-card"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div><p class="mt-3 text-xs text-slate-500">${esc(a.correctionNumber)} · Regra versão ${Number(a.ruleVersion) || 1}</p></div>` : ""}
  </section>`;
}

function documentStep(lead) {
  return `<section class="sdr-form-card"><div class="sdr-card-heading"><div><span class="sdr-eyebrow">Documentos do cliente</span><h3>PDFs para registro e encaminhamento</h3><p>Os arquivos são gerados no dispositivo e não ficam armazenados no sistema.</p></div><span class="sdr-required-note"><i class="ph ph-shield-check"></i> Dados protegidos</span></div>
    <div class="sdr-document-options">
      <article class="sdr-document-option"><i class="ph ph-identification-card"></i><div><strong>Perfil completo do cliente</strong><p>Cadastro, qualificação, contrato, observações e situação atual.</p></div><button id="sdr-generate-profile-pdf" type="button" class="sdr-secondary" ${!lead.id ? "disabled" : ""}><i class="ph ph-download-simple"></i>Baixar perfil</button></article>
      <article class="sdr-document-option"><i class="ph ph-chart-line-up"></i><div><strong>Análise preliminar do lead</strong><p>Simulação aprovada, valores estimados, redução e estorno.</p></div><button id="sdr-generate-pdf" type="button" class="sdr-primary" ${!lead.analysis?.correctionNumber ? "disabled" : ""}><i class="ph ph-file-pdf"></i>Gerar análise</button></article>
    </div>
    <p id="sdr-document-status" class="mt-3 text-xs text-slate-500">${lead.analysisDocument?.fileName ? `Última análise registrada: ${esc(lead.analysisDocument.fileName)} · arquivo não armazenado` : "O PDF do perfil já pode ser baixado após salvar o cadastro."}</p>
  </section>`;
}

function reviewSummary(lead) {
  const rows = [
    ["Nome", lead.fullName], ["CPF/CNPJ", formatCpfCnpj(lead.cpfCnpj)], ["Protocolo", lead.protocol],
    ["Banco", lead.contract?.bankName || lead.contract?.bankOther], ["Contrato", lead.contract?.contractType],
    ["Parcela atual", formatMoney(parsePtBrMoney(lead.contract?.currentInstallment))],
    ["Nova parcela", formatMoney(lead.analysis?.estimatedInstallment)], ["Estorno", formatMoney(lead.analysis?.estimatedRefund)]
  ];
  return `<div class="sdr-grid two">${rows.map(([label, value]) => `<div class="sdr-result-card"><span>${esc(label)}</span><strong>${esc(value || "Não informado")}</strong></div>`).join("")}</div>`;
}

function consentStep(lead) {
  return `<section class="sdr-form-card"><h3>Aceite da proposta</h3><p>Registre a resposta apresentada pelo lead.</p><div class="sdr-grid two">
    ${input("O lead aceitou a proposta?", "consent.answer", lead, { options: ["", "Sim", "Não", "Solicitou prazo", "Aguardando retorno", "Precisa consultar outra pessoa", "Não respondeu"], required: true })}
    ${input("Data de retorno", "consent.nextContactAt", lead, { type: "datetime-local" })}
    ${input("Motivo", "consent.reason", lead)}${input("Principal objeção", "consent.objection", lead)}
  </div>${input("Observação", "consent.observation", lead, { as: "textarea" })}${input("Próxima ação", "consent.nextAction", lead, { as: "textarea" })}
  <button id="sdr-record-consent" type="button" class="sdr-primary mt-4" ${!lead.id ? "disabled" : ""}>Registrar aceite</button></section>`;
}

function assignmentStep(lead) {
  return `<section class="sdr-form-card"><h3>Encaminhar lead potencial</h3><p>Somente usuários ativos com perfil Analista, Consultor ou Gestão são apresentados.</p><div class="sdr-grid two">
    <label class="sdr-field">Consultor responsável <span class="sdr-required">*</span><select class="sdr-control" data-sdr-field="assignment.consultantId"><option value="">Selecione</option>${state.assignableUsers.map(user => `<option value="${esc(user.id)}" ${lead.assignment?.consultantId === user.id ? "selected" : ""}>${esc(user.displayName)} · ${esc(user.operationalRole)} · ${user.activeLeads} ativo(s)</option>`).join("")}</select></label>
    ${input("Prioridade", "assignment.priority", lead, { options: ["Normal", "Urgente", "Alta", "Baixa"] })}
    ${input("Prazo recomendado", "assignment.deadline", lead, { type: "datetime-local" })}
    ${input("Motivo do encaminhamento", "assignment.reason", lead)}
  </div>${input("Orientação do SDR", "assignment.instructions", lead, { as: "textarea" })}${input("Pontos importantes", "assignment.importantPoints", lead, { as: "textarea" })}
  <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">${getForwardingMissingFields(lead).length ? `Pendências: ${esc(getForwardingMissingFields(lead).join(", "))}` : "Todos os requisitos obrigatórios estão preenchidos."}</div>
  <button id="sdr-assign-lead" type="button" class="sdr-primary mt-4" ${!lead.id ? "disabled" : ""}>Finalizar e encaminhar</button></section>`;
}

function bindWorkspace(lead) {
  document.querySelector("[data-back-list]")?.addEventListener("click", () => {
    document.getElementById("sdr-layout").classList.remove("is-editing");
  });
  document.querySelectorAll("[data-step]").forEach(button => button.onclick = () => {
    collectWorkspace(lead);
    state.step = Number(button.dataset.step);
    saveLocalDraft(lead);
    renderSdrWorkspace(lead);
  });
  document.querySelector("[data-prev]")?.addEventListener("click", () => moveStep(-1, lead));
  document.querySelector("[data-next]")?.addEventListener("click", () => moveStep(1, lead));
  document.querySelector("[data-save]")?.addEventListener("click", () => saveLead(lead, true));
  document.getElementById("sdr-step-form")?.addEventListener("input", event => onFormInput(event, lead));
  document.getElementById("sdr-step-form")?.addEventListener("focusout", event => {
    const field = event.target.dataset.sdrField;
    if (field?.startsWith("contract.") && ["currentInstallment", "financedAmount", "downPayment", "informedBalance"].includes(field.split(".").at(-1)) && event.target.value.trim()) {
      event.target.value = formatMoney(parsePtBrMoney(event.target.value));
      collectWorkspace(lead);
      saveLocalDraft(lead);
    }
  });
  document.querySelectorAll("[data-shortcut]").forEach(button => button.onclick = () => applyShortcut(button, lead));
  document.getElementById("sdr-run-analysis")?.addEventListener("click", () => runAnalysis(lead));
  document.getElementById("sdr-generate-profile-pdf")?.addEventListener("click", () => generateLeadProfilePdf(lead));
  document.getElementById("sdr-generate-pdf")?.addEventListener("click", () => generateAnalysisPdf(lead));
  document.querySelector("[data-profile-pdf]")?.addEventListener("click", () => generateLeadProfilePdf(lead));
  document.querySelector("[data-quick-analysis-pdf]")?.addEventListener("click", () => generateAnalysisPdf(lead, { register: false }));
  document.querySelector("[data-jump-assignment]")?.addEventListener("click", () => {
    collectWorkspace(lead);
    state.step = SDR_STEPS.length - 1;
    saveLocalDraft(lead);
    renderSdrWorkspace(lead);
  });
  document.getElementById("sdr-record-consent")?.addEventListener("click", () => recordConsent(lead));
  document.getElementById("sdr-assign-lead")?.addEventListener("click", () => assignLead(lead));
}

function onFormInput(event, lead) {
  const field = event.target.dataset.sdrField;
  if (field === "phone") event.target.value = formatPhone(event.target.value);
  if (field === "cpfCnpj") event.target.value = formatCpfCnpj(event.target.value);
  if (field?.startsWith("contract.") && ["currentInstallment", "financedAmount", "downPayment", "informedBalance"].includes(field.split(".").at(-1))) {
    // Mantém a entrada livre e converte somente ao calcular.
  }
  collectWorkspace(lead);
  if (["contract.totalInstallments", "contract.paidInstallments"].includes(field)) updateRemaining(lead);
  if (field?.startsWith("qualification.")) updateScore(lead);
  saveLocalDraft(lead);
  scheduleAutosave(lead);
}

function collectWorkspace(lead) {
  document.querySelectorAll("[data-sdr-field]").forEach(field => {
    const value = field.type === "checkbox" ? field.checked : field.value;
    setPath(lead, field.dataset.sdrField, value);
    if (field.dataset.sdrField === "contract.bankId") {
      lead.contract.bankName = field.selectedOptions?.[0]?.dataset?.name || (value === "other" ? lead.contract.bankOther : "");
    }
  });
  return lead;
}

function updateRemaining(lead) {
  try {
    const remaining = calculateRemainingInstallments(Number(lead.contract.totalInstallments), Number(lead.contract.paidInstallments));
    lead.contract.remainingInstallments = remaining;
    const field = document.querySelector('[data-sdr-field="contract.remainingInstallments"]');
    if (field) field.value = remaining;
  } catch (error) { setSaveStatus(error.message, "error"); }
}

function updateScore(lead) {
  const q = lead.qualification || {};
  const result = calculateInterestScore({
    compatibility: lead.contract?.contractType ? 25 : 0,
    pain: q.mainPain ? 20 : 0,
    urgency: { "Muito alta": 20, Alta: 17, Média: 12, Baixa: 6 }[q.urgency] || 0,
    intention: { "Muito interessado": 20, Interessado: 16, Considerando: 10, "Apenas pesquisando": 4 }[q.intention] || 0,
    documents: lead.contract?.hasContract === "Sim" ? 10 : 0,
    contact: lead.preferredChannel || q.preferredChannel ? 5 : 0
  });
  lead.commercialScore = result.score;
  lead.commercialClassification = result.classification;
  lead.qualification.scoreBreakdown = result.breakdown;
  const preview = document.getElementById("sdr-score-preview");
  if (preview) preview.textContent = `${result.score}% · ${result.classification}`;
}

function applyShortcut(button, lead) {
  const index = Number(button.dataset.shortcut);
  const field = document.querySelector(`[data-sdr-field="qualification.answers.${index}.answer"]`);
  if (!field) return;
  const values = new Set(field.value.split(";").map(item => item.trim()).filter(Boolean));
  if (values.has(button.dataset.value)) values.delete(button.dataset.value); else values.add(button.dataset.value);
  field.value = [...values].join("; ");
  button.setAttribute("aria-pressed", String(values.has(button.dataset.value)));
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

async function moveStep(direction, lead) {
  collectWorkspace(lead);
  const previousStatus = lead.status;
  if (direction > 0 && !validateCurrentStep(lead)) return;
  if (direction > 0 && state.step === 0 && !lead.id) {
    const created = await saveLead(lead, true);
    if (!created || !lead.id) return;
  }
  if (direction > 0 && state.step === 0 && lead.status === "Novo lead") {
    lead.status = "Em qualificação";
    if (!await saveLead(lead, false)) return;
  }
  if (direction > 0 && state.step === 1 && ["Novo lead", "Em qualificação", "Aguardando informações"].includes(lead.status)) {
    if (lead.status === "Novo lead") {
      lead.status = "Em qualificação";
      if (!await saveLead(lead, false)) return;
    }
    lead.status = "Qualificado";
    if (!await saveLead(lead, false)) return;
  }
  state.step = Math.max(0, Math.min(state.step + direction, SDR_STEPS.length - 1));
  if (lead.status !== previousStatus) {
    invalidateMetricCounts();
  }
  saveLocalDraft(lead);
  renderSdrWorkspace(lead);
  document.getElementById("sdr-workspace").scrollIntoView({ behavior: "smooth", block: "start" });
}

function validateCurrentStep(lead) {
  if (state.step === 0) {
    const errors = validateLeadRegistration(lead);
    if (errors.length) { showToast(errors.join(" "), "error"); return false; }
  }
  if (state.step === 1 && lead.qualification.answers.slice(0, 4).some(item => !item.answer && !item.notInformed)) {
    showToast("Responda ou marque como não informado as quatro perguntas.", "error"); return false;
  }
  if (state.step === 2) {
    try {
      if (!lead.contract.contractType) throw new Error("Informe o tipo de contrato.");
      if (!lead.contract.bankId) throw new Error("Selecione a instituição financeira.");
      if (lead.contract.bankId === "other" && !lead.contract.bankOther) throw new Error("Informe o nome da outra instituição.");
      if (!(parsePtBrMoney(lead.contract.currentInstallment) > 0)) throw new Error("Informe o valor atual da parcela.");
      if (!(Number(lead.contract.totalInstallments) > 0)) throw new Error("Informe a quantidade total de parcelas.");
      calculateRemainingInstallments(Number(lead.contract.totalInstallments), Number(lead.contract.paidInstallments));
      if (Number(lead.contract.overdueInstallments) > Number(lead.contract.remainingInstallments)) throw new Error("Parcelas atrasadas não podem superar as restantes.");
    } catch (error) { showToast(error.message, "error"); return false; }
  }
  return true;
}

function scheduleAutosave(lead) {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveLead(lead, false), 900);
}

async function saveLead(lead, explicit) {
  collectWorkspace(lead);
  updateScore(lead);
  saveLocalDraft(lead);
  setSaveStatus(navigator.onLine ? "Salvando..." : "Sem conexão. Rascunho salvo localmente.");
  try {
    if (!lead.id) {
      if (!explicit) return false;
      const result = await api("lead.create", lead);
      if (result.duplicate) {
        showDuplicate(result.matches, lead);
        return false;
      }
      clearLocalDraft("");
      Object.assign(lead, result.lead);
      state.activeId = lead.id;
    } else {
      const result = await api("lead.save", { ...lead, currentStep: SDR_STEPS[state.step].key });
      Object.assign(lead, result.lead);
    }
    saveLocalDraft(lead);
    setSaveStatus(`Alterações salvas automaticamente às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`, "success");
    if (explicit) showToast("Lead salvo com segurança.", "success");
    if (explicit) renderSdrWorkspace(lead);
    return true;
  } catch (error) {
    setSaveStatus(error.message, "error");
    if (explicit) showToast(error.message, "error");
    return false;
  }
}

function showDuplicate(matches, lead) {
  state.duplicatePayload = lead;
  showModal(`<h3 class="text-lg font-black text-slate-800">Já existe um lead com esses dados.</h3><div class="mt-3 space-y-2">${matches.map(item => `<button type="button" class="sdr-lead-card" data-open-duplicate="${esc(item.id)}"><strong>${esc(item.fullName)}</strong><p class="text-xs text-slate-500">${esc(maskPhone(item.phone))} · ${esc(item.status)} · ${esc(item.ownerSdrName || "")}</p></button>`).join("")}</div>
    <label class="sdr-field mt-4">Justificativa para continuar<textarea id="sdr-duplicate-reason" class="sdr-control" rows="3"></textarea></label><div class="mt-4 flex justify-end gap-2"><button class="sdr-secondary" data-close-modal>Cancelar</button><button class="sdr-primary" data-continue-duplicate>Continuar mesmo assim</button></div>`);
  document.querySelectorAll("[data-open-duplicate]").forEach(button => button.onclick = () => { closeModal(); openLead(button.dataset.openDuplicate); });
  document.querySelector("[data-continue-duplicate]").onclick = async () => {
    const reason = document.getElementById("sdr-duplicate-reason").value.trim();
    if (!reason) return showToast("Informe a justificativa.", "error");
    const result = await api("lead.create", { ...lead, duplicateJustification: reason });
    closeModal(); clearLocalDraft(""); Object.assign(lead, result.lead); state.activeId = lead.id; saveLocalDraft(lead); renderAll();
  };
}

async function flushCurrentDraft() {
  const lead = currentLead();
  if (lead?.id) await saveLead(lead, false);
}

async function runAnalysis(lead) {
  collectWorkspace(lead);
  if (!await saveLead(lead, false)) {
    return showToast("A análise não foi iniciada porque o lead ainda não foi salvo.", "error");
  }
  const loading = document.getElementById("sdr-analysis-loading");
  const fill = loading?.querySelector("span");
  const message = document.getElementById("sdr-analysis-message");
  const button = document.getElementById("sdr-run-analysis");
  const messages = ["Organizando os dados do contrato", "Verificando as informações financeiras", "Analisando o saldo devedor", "Calculando a margem de redução", "Calculando o estorno", "Finalizando a análise"];
  loading?.classList.remove("hidden"); if (button) button.disabled = true;
  for (let index = 0; index < messages.length; index += 1) {
    if (message) message.textContent = messages[index];
    if (fill) fill.style.width = `${((index + 1) / messages.length) * 100}%`;
    await new Promise(resolve => setTimeout(resolve, 520));
  }
  try {
    const result = await api("analysis.run", { id: lead.id });
    lead.analysis = result.analysis; lead.status = "Análise Concluída"; saveLocalDraft(lead); renderSdrWorkspace(lead);
  } catch (error) { showToast(error.message, "error"); if (button) button.disabled = false; }
}

function generateLeadProfilePdf(lead) {
  if (!window.jspdf?.jsPDF) return showToast("Gerador PDF indisponível.", "error");
  if (!lead?.id) return showToast("Salve o cadastro antes de gerar o perfil em PDF.", "error");
  collectWorkspace(lead);
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 16;
    const contentWidth = 178;
    let y = 45;

    const drawHeader = () => {
      pdf.setFillColor(9, 31, 63);
      pdf.rect(0, 0, 210, 34, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(17);
      pdf.text("PERFIL DO CLIENTE", margin, 15);
      pdf.setFontSize(8);
      pdf.setTextColor(191, 219, 254);
      pdf.text("PLATINO · CENTRAL HUNTER", margin, 23);
      pdf.text(lead.protocol || "Cadastro sem protocolo", 194, 23, { align: "right" });
    };
    const ensureSpace = height => {
      if (y + height <= 276) return;
      pdf.addPage();
      drawHeader();
      y = 45;
    };
    const section = title => {
      ensureSpace(14);
      pdf.setFillColor(235, 243, 251);
      pdf.roundedRect(margin, y - 5, contentWidth, 9, 1.5, 1.5, "F");
      pdf.setTextColor(18, 58, 89);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.text(title.toUpperCase(), margin + 4, y + 1);
      y += 11;
    };
    const row = (label, value) => {
      const safeValue = String(value ?? "").trim() || "Não informado";
      pdf.setFontSize(8.5);
      pdf.setFont("helvetica", "bold");
      const labelLines = pdf.splitTextToSize(label, 44);
      pdf.setFont("helvetica", "normal");
      const valueLines = pdf.splitTextToSize(safeValue, 128);
      const height = Math.max(labelLines.length, valueLines.length) * 4.2 + 3;
      ensureSpace(height);
      pdf.setTextColor(70, 92, 112);
      pdf.setFont("helvetica", "bold");
      pdf.text(labelLines, margin, y);
      pdf.setTextColor(31, 49, 70);
      pdf.setFont("helvetica", "normal");
      pdf.text(valueLines, margin + 48, y);
      pdf.setDrawColor(224, 231, 238);
      pdf.line(margin, y + height - 2, margin + contentWidth, y + height - 2);
      y += height;
    };

    drawHeader();
    section("Identificação e atendimento");
    row("Nome", lead.fullName);
    row("Telefone / WhatsApp", formatPhone(lead.phone));
    row("CPF / CNPJ", formatCpfCnpj(lead.cpfCnpj));
    row("E-mail", lead.email);
    row("Localização", [lead.city, lead.state].filter(Boolean).join(" / "));
    row("Origem", [lead.origin, lead.campaign].filter(Boolean).join(" · "));
    row("Status", `${lead.status || "Rascunho"} · ${lead.commercialClassification || "Frio"} (${Number(lead.commercialScore) || 0}%)`);
    row("Próximo contato", lead.nextContactAt ? formatDateTime(lead.nextContactAt) : "Não agendado");
    row("Observação inicial", lead.initialObservation);

    section("Perfil e qualificação");
    (lead.qualification?.answers || []).slice(0, 4).forEach((answer, index) => {
      row(`Pergunta ${index + 1}`, answer?.answer || (answer?.notInformed ? "Cliente não informou" : "Não informada"));
    });
    row("Dor principal", lead.qualification?.mainPain);
    row("Urgência", lead.qualification?.urgency);
    row("Intenção", lead.qualification?.intention);
    row("Principal objeção", lead.qualification?.mainObjection);
    row("Resumo do Hunter", lead.qualification?.sdrSummary);
    row("Orientação ao consultor", lead.qualification?.consultantGuidance);

    section("Contrato informado");
    row("Tipo de contrato", lead.contract?.contractType);
    row("Banco / financeira", lead.contract?.bankName || lead.contract?.bankOther);
    row("Parcela atual", formatMoney(parsePtBrMoney(lead.contract?.currentInstallment)));
    row("Parcelas", `${lead.contract?.paidInstallments || 0} pagas · ${lead.contract?.remainingInstallments || 0} restantes · ${lead.contract?.overdueInstallments || 0} atrasadas`);
    row("Saldo devedor", formatMoney(parsePtBrMoney(lead.contract?.informedBalance)));
    row("Situação", lead.contract?.contractStatus);
    row("Observações", lead.contract?.notes);

    if (lead.analysis?.correctionNumber) {
      section("Análise preliminar");
      row("Correção", lead.analysis.correctionNumber);
      row("Nova parcela estimada", formatMoney(lead.analysis.estimatedInstallment));
      row("Redução por parcela", formatMoney(lead.analysis.installmentReduction));
      row("Estorno estimado", formatMoney(lead.analysis.estimatedRefund));
      row("Redução total", formatMoney(lead.analysis.totalContractReduction));
    }

    section("Encaminhamento");
    row("Consultor responsável", lead.assignedConsultantName || lead.assignment?.consultantName);
    row("Prioridade", lead.assignment?.priority);
    row("Motivo", lead.assignment?.reason);
    row("Pontos importantes", lead.assignment?.importantPoints);

    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(112, 126, 140);
      pdf.text(`Gerado em ${new Date().toLocaleString("pt-BR")} · Uso interno e confidencial`, margin, 288);
      pdf.text(`${page}/${pages}`, 194, 288, { align: "right" });
    }
    const fileName = `perfil-cliente-${lead.protocol || lead.id}.pdf`.replace(/[^A-Za-z0-9._-]/g, "-");
    pdf.save(fileName);
    showToast("PDF do perfil do cliente baixado com sucesso.", "success");
    return true;
  } catch (error) {
    showToast(`Não foi possível gerar o perfil: ${error.message}`, "error");
    return false;
  }
}

async function generateAnalysisPdf(lead, options = {}) {
  const register = options.register !== false;
  if (!window.jspdf?.jsPDF) return showToast("Gerador PDF indisponível.", "error");
  const button = document.getElementById("sdr-generate-pdf");
  if (button) button.disabled = true;
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 18;
    let y = 18;
    const line = (label, value, bold = false) => {
      if (y > 274) { pdf.addPage(); y = 18; }
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.setFontSize(bold ? 11 : 9);
      pdf.setTextColor(bold ? 18 : 55, bold ? 58 : 75, bold ? 89 : 92);
      pdf.text(`${label}${value ? `: ${value}` : ""}`, margin, y, { maxWidth: 174 });
      y += bold ? 7 : 5.5;
    };
    pdf.setFillColor(18, 58, 89); pdf.rect(0, 0, 210, 34, "F");
    pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(17);
    pdf.text("ANÁLISE PRELIMINAR APROVADA", margin, 16);
    pdf.setFontSize(9); pdf.text("PLATINUM SOLUÇÕES FINANCEIRAS", margin, 24);
    y = 45;
    line("Nome", lead.fullName, true); line("CPF", formatCpfCnpj(lead.cpfCnpj)); line("Protocolo interno", lead.protocol);
    line("Data", new Date().toLocaleDateString("pt-BR")); line("Horário", new Date().toLocaleTimeString("pt-BR"));
    y += 4; line("FINANCIAMENTO ATUAL", "", true);
    line("Instituição Financeira", lead.contract?.bankName || lead.contract?.bankOther);
    line("Financiamento", lead.contract?.contractType); line("Modelo do Veículo", lead.contract?.vehicleModel);
    line("Ano", lead.contract?.vehicleYear); line("Valor financiado", formatMoney(parsePtBrMoney(lead.contract?.financedAmount)));
    line("Saldo devedor", formatMoney(parsePtBrMoney(lead.contract?.informedBalance)));
    line("Número de meses", lead.contract?.totalInstallments); line("Valor da parcela", formatMoney(parsePtBrMoney(lead.contract?.currentInstallment)));
    line("Parcelas pagas", lead.contract?.paidInstallments); line("Parcelas restantes", lead.contract?.remainingInstallments);
    line("Parcelas atrasadas", lead.contract?.overdueInstallments); line("Situação", lead.contract?.contractStatus);
    y += 4; line("CORREÇÃO DE FINANCIAMENTO APROVADA", "", true);
    line("Correção nº", lead.analysis?.correctionNumber); line("Situação", "APROVADA", true);
    line("Número de meses", lead.analysis?.installmentsUsed); line("Valor da nova parcela", formatMoney(lead.analysis?.estimatedInstallment));
    line("Redução por parcela", formatMoney(lead.analysis?.installmentReduction));
    line("ESTORNO", formatMoney(lead.analysis?.estimatedRefund), true);
    line("REDUÇÃO TOTAL DO CONTRATO", formatMoney(lead.analysis?.totalContractReduction), true);
    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page); pdf.setFontSize(7); pdf.setTextColor(100);
      pdf.text("Documento gerado para registro e acompanhamento interno das tratativas realizadas pela Platinum Soluções Financeiras.", margin, 287, { maxWidth: 158 });
      pdf.text(`${page}/${pages}`, 190, 287);
    }
    const blob = pdf.output("blob");
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("");
    const version = register
      ? Number(lead.analysisDocument?.version || 0) + 1
      : Number(lead.analysisDocument?.version || 1);
    const fileName = lead.analysisDocument?.fileName && !register
      ? lead.analysisDocument.fileName
      : `analise-aprovada-${lead.protocol}-v${version}.pdf`.replace(/[^A-Za-z0-9._-]/g, "-");
    if (register) {
      const result = await api("document.register", { id: lead.id, fileName, fileHash: hash });
      lead.analysisDocument = result;
      lead.status = "APROVADO";
      saveLocalDraft(lead);
    }
    pdf.save(fileName);
    showToast(register ? "PDF gerado e registro salvo. O arquivo não foi armazenado no sistema." : "PDF gerado novamente no seu dispositivo.", "success");
    if (register && state.view === "sdr") renderSdrWorkspace(lead);
    return true;
  } catch (error) {
    showToast(error.message, "error");
    if (button) button.disabled = false;
    return false;
  }
}

async function recordConsent(lead) {
  collectWorkspace(lead);
  try {
    const result = await api("consent.record", { id: lead.id, ...lead.consent });
    lead.consent = result.consent; lead.status = result.status; saveLocalDraft(lead); showToast("Aceite registrado.", "success"); renderSdrWorkspace(lead);
  } catch (error) { showToast(error.message, "error"); }
}

async function assignLead(lead) {
  collectWorkspace(lead);
  const pendingAssignment = { ...(lead.assignment || {}) };
  try {
    if (!await saveLead(lead, false)) {
      throw new Error("O lead não foi encaminhado porque existem alterações que ainda não foram salvas.");
    }
    // O salvamento comum preserva a última delegação confirmada no servidor.
    // Mantemos a escolha atual separada até a transação de encaminhamento concluir.
    lead.assignment = pendingAssignment;
    const result = await api("lead.assign", { id: lead.id, consultantId: pendingAssignment.consultantId, ...pendingAssignment });
    lead.assignment = result.assignment; lead.status = "Encaminhado"; lead.assignedConsultantId = result.assignment.consultantId; saveLocalDraft(lead); showToast(`Lead encaminhado com sucesso para ${result.assignment.consultantName}.`, "success"); renderSdrWorkspace(lead);
  } catch (error) { showToast(error.message, "error"); }
}

function renderConsultantWorkspace(lead) {
  document.getElementById("sdr-workspace").innerHTML = `<header class="sdr-lead-header"><button type="button" class="sdr-secondary md:hidden" data-back-list><i class="ph ph-arrow-left"></i>Fila</button><div><p class="text-[10px] font-black text-sky-700">${esc(lead.protocol)}</p><h3 class="font-black">${esc(lead.fullName)}</h3><p class="text-xs text-slate-500">${esc(lead.status)}</p></div><div class="flex gap-2">${lead.status === "Encaminhado" ? `<button class="sdr-success" data-accept>Aceitar lead</button>` : ""}<button class="sdr-secondary" data-return>Devolver</button></div></header>
    <div class="sdr-form-body"><section class="sdr-form-card"><h3>Visão geral</h3>${reviewSummary(lead)}<div class="mt-4 flex flex-wrap gap-2"><a class="sdr-primary" href="https://wa.me/55${normalizeDigits(lead.phone)}" target="_blank" rel="noopener"><i class="ph ph-whatsapp-logo"></i>Abrir WhatsApp</a><button class="sdr-secondary" data-contact>Registrar contato</button><button class="sdr-secondary" data-outcome>Registrar resultado</button>${lead.analysisDocument?.fileHash ? `<button class="sdr-secondary" data-analysis-file><i class="ph ph-file-pdf"></i>Gerar PDF</button>` : ""}</div></section>
    <section class="sdr-form-card"><h3>Perfil e orientação</h3><p>${esc(lead.qualification?.sdrSummary || "Resumo não informado.")}</p><p class="mt-3"><strong>Dor:</strong> ${esc(lead.qualification?.mainPain || "Não informada")} · <strong>Urgência:</strong> ${esc(lead.qualification?.urgency || "Não informada")} · <strong>Objeção:</strong> ${esc(lead.qualification?.mainObjection || "Não informada")}</p></section>
    <section class="sdr-form-card"><h3>Documento da análise</h3><p>${lead.analysisDocument?.fileHash ? `Geração registrada em ${esc(formatDateTime(lead.analysisDocument.createdAt))}. O arquivo não fica armazenado; utilize “Gerar PDF” quando precisar de uma nova cópia.` : "Nenhum PDF registrado."}</p></section>
    <section class="sdr-form-card"><h3>Comentários internos</h3><div id="sdr-comments">${renderComments()}</div><textarea id="sdr-comment-text" class="sdr-control mt-3" rows="3" placeholder="Adicione um comentário. Use @nome para mencionar."></textarea><button class="sdr-primary mt-2" data-comment>Adicionar comentário</button></section>
    <section class="sdr-form-card"><h3>Histórico</h3><div>${renderEvents()}</div></section></div>`;
  document.querySelector("[data-back-list]")?.addEventListener("click", () => document.getElementById("sdr-layout").classList.remove("is-editing"));
  document.querySelector("[data-accept]")?.addEventListener("click", () => consultantAction("lead.accept", { id: lead.id }));
  document.querySelector("[data-return]")?.addEventListener("click", () => returnModal(lead));
  document.querySelector("[data-contact]")?.addEventListener("click", () => contactModal(lead));
  document.querySelector("[data-outcome]")?.addEventListener("click", () => outcomeModal(lead));
  document.querySelector("[data-comment]")?.addEventListener("click", () => addComment(lead));
  document.querySelector("[data-analysis-file]")?.addEventListener("click", () => generateAnalysisPdf(lead, { register: false }));
}

function renderComments() {
  return state.comments.length ? state.comments.map(item => `<div class="mb-2 rounded-xl bg-slate-50 p-3 text-xs"><strong>${esc(item.authorName)}</strong><p class="mt-1">${esc(item.content)}</p></div>`).join("") : `<p class="text-xs text-slate-500">Nenhum comentário.</p>`;
}

function renderEvents() {
  return state.events.length ? state.events.map(item => `<div class="mb-2 border-l-2 border-sky-300 pl-3 text-xs"><strong>${esc(item.eventType)}</strong><p class="text-slate-500">${esc(item.actorName || "")} · ${formatTimestamp(item.createdAt)}</p></div>`).join("") : `<p class="text-xs text-slate-500">Nenhum evento.</p>`;
}

async function consultantAction(action, payload) {
  try { await api(action, payload); showToast("Ação registrada.", "success"); } catch (error) { showToast(error.message, "error"); }
}

function contactModal(lead) {
  showModal(`<h3 class="text-lg font-black">Registrar contato</h3><div class="sdr-grid mt-4">${inputRaw("Tipo", "modal-type", ["WhatsApp", "Ligação", "Reunião", "Tentativa"])}<label class="sdr-field">Detalhes<textarea id="modal-details" class="sdr-control" rows="4"></textarea></label><label class="sdr-field">Próximo contato<input id="modal-next" type="datetime-local" class="sdr-control"></label></div><div class="mt-4 flex justify-end gap-2"><button class="sdr-secondary" data-close-modal>Cancelar</button><button class="sdr-primary" data-confirm>Salvar</button></div>`);
  document.querySelector("[data-confirm]").onclick = async () => { await consultantAction("contact.record", { id: lead.id, type: value("modal-type"), details: value("modal-details"), nextContactAt: value("modal-next") }); closeModal(); };
}

function returnModal(lead) {
  showModal(`<h3 class="text-lg font-black">Devolver lead ao SDR</h3><div class="sdr-grid mt-4">${textAreaRaw("Motivo", "modal-reason")}${textAreaRaw("Informação faltante", "modal-missing")}${textAreaRaw("Orientação", "modal-guidance")}<label class="sdr-field">Prazo<input id="modal-deadline" type="datetime-local" class="sdr-control"></label></div><div class="mt-4 flex justify-end gap-2"><button class="sdr-secondary" data-close-modal>Cancelar</button><button class="sdr-danger" data-confirm>Devolver</button></div>`);
  document.querySelector("[data-confirm]").onclick = async () => { await consultantAction("lead.return", { id: lead.id, reason: value("modal-reason"), missingInformation: value("modal-missing"), guidance: value("modal-guidance"), deadline: value("modal-deadline") }); closeModal(); };
}

function outcomeModal(lead) {
  showModal(`<h3 class="text-lg font-black">Resultado da tratativa</h3><div class="sdr-grid mt-4">
    ${inputRaw("Resultado", "modal-outcome", ["LEAD APROVADO", "LEAD REPROVADO", "Em acompanhamento", "Retorno agendado", "Sem contato", "Devolvido ao SDR"])}
    <input id="modal-service" class="sdr-control" placeholder="Serviço contratado"><input id="modal-value" class="sdr-control" type="number" min="0" step="0.01" placeholder="Valor contratado">
    ${inputRaw("Forma de pagamento", "modal-payment", ["", "Pix", "Cartão", "Boleto", "Transferência", "Dinheiro", "Outro"])}
    <input id="modal-loss" class="sdr-control" placeholder="Motivo da reprovação">${textAreaRaw("Dificuldade encontrada", "modal-difficulty")}${textAreaRaw("Observação obrigatória", "modal-observation")}
  </div><div class="mt-4 flex justify-end gap-2"><button class="sdr-secondary" data-close-modal>Cancelar</button><button class="sdr-primary" data-confirm>Confirmar resultado</button></div>`);
  document.querySelector("[data-confirm]").onclick = async () => { await consultantAction("lead.outcome", { id: lead.id, outcome: value("modal-outcome"), contractedService: value("modal-service"), contractedValue: Number(value("modal-value")), paymentMethod: value("modal-payment"), lossReason: value("modal-loss"), difficultyDescription: value("modal-difficulty"), observation: value("modal-observation") }); closeModal(); };
}

async function addComment(lead) {
  const content = value("sdr-comment-text");
  try { await api("comment.add", { id: lead.id, content, mentionUserIds: [] }); document.getElementById("sdr-comment-text").value = ""; } catch (error) { showToast(error.message, "error"); }
}

function renderSettings() {
  document.getElementById("sdr-layout").classList.add("is-editing");
  document.getElementById("sdr-workspace").innerHTML = `<div class="sdr-form-body"><section class="sdr-form-card"><h3>Catálogo de bancos</h3><p>${state.banks.length} instituição(ões) ativa(s).</p><div class="sdr-grid two"><input id="sdr-new-bank" class="sdr-control" placeholder="Nome da instituição"><button id="sdr-add-bank" class="sdr-primary" type="button">Adicionar banco</button></div></section><section class="sdr-form-card"><h3>Regras de cálculo</h3><p>Ao salvar, a versão anterior da mesma combinação de contrato e banco é desativada e preservada para auditoria.</p><div class="sdr-grid two mt-4">
    <input id="sdr-rule-name" class="sdr-control" placeholder="Nome da regra">
    <select id="sdr-rule-contract" class="sdr-control"><option value="">Regra geral</option>${["Financiamento de veículo", "Financiamento de imóvel", "Empréstimo pessoal", "Empréstimo consignado", "Refinanciamento", "Renegociação", "Outro"].map(item => `<option>${item}</option>`).join("")}</select>
    <select id="sdr-rule-bank" class="sdr-control"><option value="">Todos os bancos</option>${state.banks.map(bank => `<option value="${esc(bank.id)}">${esc(bank.name)}</option>`).join("")}</select>
    <input id="sdr-rule-percentage" type="number" min="0.01" max="99.99" step="0.01" class="sdr-control" placeholder="Percentual de redução">
    <input id="sdr-rule-installments" type="number" min="0" class="sdr-control" placeholder="Meses para cálculo (0 = restantes)">
    <input id="sdr-rule-other" type="number" min="0" step="0.01" class="sdr-control" placeholder="Outras reduções">
    <input id="sdr-rule-minimum" type="number" min="0" step="0.01" class="sdr-control" placeholder="Redução mínima">
    <input id="sdr-rule-maximum" type="number" min="0" step="0.01" class="sdr-control" placeholder="Redução máxima (0 = sem limite)">
    <select id="sdr-rule-rounding" class="sdr-control"><option value="cent">Centavos</option><option value="integer">Inteiro</option><option value="floor-cent">Centavos para baixo</option><option value="ceil-cent">Centavos para cima</option></select>
    <button id="sdr-save-rule" class="sdr-primary" type="button">Salvar nova versão</button>
  </div><div class="mt-4 space-y-2">${state.rules.length ? state.rules.map(rule => `<div class="rounded-xl border border-slate-200 p-3 text-xs"><strong>${esc(rule.name)}</strong><span class="ml-2 sdr-badge ${rule.isActive ? "hot" : ""}">v${Number(rule.version) || 1} · ${rule.isActive ? "Ativa" : "Inativa"}</span><p class="mt-1 text-slate-500">${esc(rule.contractType || "Todos os contratos")} · ${esc(state.banks.find(bank => bank.id === rule.bankId)?.name || "Todos os bancos")} · ${Number(rule.reductionPercentage) || 0}%</p></div>`).join("") : `<p class="text-sm text-amber-700">Nenhuma regra configurada. A análise permanece bloqueada até a gestão cadastrar uma regra válida.</p>`}</div></section></div>`;
  document.getElementById("sdr-add-bank").onclick = async () => {
    const name = value("sdr-new-bank");
    if (!name) return;
    await addDoc(collection(state.db, "sdrBankCatalog"), { name: sanitizeText(name, 120), isActive: true, displayOrder: state.banks.length + 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  };
  document.getElementById("sdr-save-rule").onclick = async () => {
    try {
      await api("rule.save", {
        name: value("sdr-rule-name"),
        contractType: value("sdr-rule-contract"),
        bankId: value("sdr-rule-bank"),
        reductionPercentage: Number(value("sdr-rule-percentage")),
        installmentsRule: Number(value("sdr-rule-installments")),
        otherReductions: Number(value("sdr-rule-other")),
        minimumReduction: Number(value("sdr-rule-minimum")),
        maximumReduction: Number(value("sdr-rule-maximum")),
        roundingRule: value("sdr-rule-rounding")
      });
      showToast("Nova versão da regra ativada.", "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  };
}

function inputRaw(label, id, options) {
  return `<label class="sdr-field">${esc(label)}<select id="${id}" class="sdr-control">${options.map(item => `<option>${esc(item)}</option>`).join("")}</select></label>`;
}
function textAreaRaw(label, id) { return `<label class="sdr-field">${esc(label)}<textarea id="${id}" class="sdr-control" rows="3"></textarea></label>`; }
function value(id) { return document.getElementById(id)?.value?.trim() || ""; }

function showModal(content) {
  const modal = document.getElementById("sdr-modal");
  document.getElementById("sdr-modal-card").innerHTML = content;
  modal.hidden = false;
  document.querySelectorAll("[data-close-modal]").forEach(button => button.onclick = closeModal);
}
function closeModal() { document.getElementById("sdr-modal").hidden = true; }

function showToast(message, type = "info") {
  const color = type === "error" ? "bg-red-700" : type === "success" ? "bg-emerald-700" : "bg-slate-800";
  const toast = document.createElement("div");
  toast.className = `fixed bottom-5 right-5 z-[200] max-w-sm rounded-xl ${color} px-4 py-3 text-sm font-bold text-white shadow-xl`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
}

function setSaveStatus(message, type = "info") {
  const element = document.getElementById("sdr-save-status");
  if (!element) return;
  element.textContent = message;
  element.style.color = type === "error" ? "#b42318" : type === "success" ? "#177245" : "";
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("pt-BR");
}
function formatTimestamp(value) {
  const date = value?.toDate?.() || new Date(value || 0);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("pt-BR");
}

function toggleNotifications() {
  const panel = document.getElementById("sdr-notification-panel");
  panel.hidden = !panel.hidden;
  document.getElementById("sdr-notification-button").setAttribute("aria-expanded", String(!panel.hidden));
  renderNotifications();
}

function renderNotifications() {
  const panel = document.getElementById("sdr-notification-panel");
  if (!panel) return;
  panel.innerHTML = `<div class="mb-2 flex items-center justify-between"><strong class="text-sm">Notificações</strong><span class="text-xs text-slate-500">${state.notifications.filter(item => !item.readAt).length} não lida(s)</span></div>${state.notifications.length ? state.notifications.map(item => `<button class="sdr-notification ${item.readAt ? "" : "unread"}" data-notification="${esc(item.id)}" data-notification-lead="${esc(item.leadId)}"><strong class="text-xs">${esc(item.title)}</strong><span class="text-xs">${esc(item.message)}</span><small>${formatTimestamp(item.createdAt)}</small></button>`).join("") : `<p class="p-3 text-xs text-slate-500">Nenhuma notificação.</p>`}`;
  document.querySelectorAll("[data-notification]").forEach(button => button.onclick = async () => {
    await api("notification.read", { notificationId: button.dataset.notification });
    if (button.dataset.notificationLead) openLead(button.dataset.notificationLead);
    panel.hidden = true;
  });
}

function subscribeLeads() {
  if (state.notificationUid !== state.user?.uid) {
    state.stop.splice(0).forEach(stop => stop?.());
    state.notificationUid = state.user?.uid || "";
  }
  state.stopAux.splice(0).forEach(stop => stop?.());
  state.stopList?.();
  state.stopList = null;
  state.detailStops.splice(0).forEach(stop => stop?.());
  if (!state.db || !state.user) return;
  state.page = 1;
  state.pageCursors = [null];
  state.pageTotal = null;
  state.pageCountUnavailable = false;
  state.pageCache.clear();
  if (state.view !== "settings" && ["portfolio", "returns"].includes(state.section)) {
    loadLeadPage("open");
    loadIndicatorCounts();
  }
  if (!state.stop.length) state.stop.push(trackedSnapshot(query(collection(state.db, "sdrNotifications"), where("userId", "==", state.user.uid), limit(100)), "notifications", snapshot => {
    state.notifications = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    document.getElementById("sdr-notification-count").textContent = state.notifications.filter(item => !item.readAt).length;
    renderNotifications();
  }));
  updateAuxSubscriptions();
}

function updateAuxSubscriptions() {
  if (!state.db || !state.user || (state.view !== "settings" && state.section !== "registration")) {
    state.stopAux.splice(0).forEach(stop => stop?.());
    return;
  }
  if (state.stopAux.length) return;
  state.stopAux.push(trackedSnapshot(query(collection(state.db, "sdrBankCatalog"), where("isActive", "==", true), limit(200)), "bank-catalog", snapshot => {
    const remoteBanks = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    state.banks = mergeBankCatalog(remoteBanks);
    if (state.view === "settings" || state.step === 2) renderAll();
  }));
  state.stopAux.push(trackedSnapshot(query(collection(state.db, "sdrSimulationRules"), limit(200)), "simulation-rules", snapshot => {
    state.rules = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.version || 0) - (a.version || 0));
    if (state.view === "settings") renderAll();
  }));
  const uid = state.user.uid;
  if (canSdr() && state.view !== "settings") api("users.assignable").then(result => {
    if (state.user?.uid !== uid) return;
    state.assignableUsers = result.users || [];
    if (state.step === SDR_STEPS.length - 1 && state.view === "sdr") renderAll();
  }).catch(() => {});
}

function subscribeLeadDetails(id) {
  state.detailStops.splice(0).forEach(stop => stop?.());
  if (state.view !== "consultant") return;
  const commentsStop = trackedSnapshot(query(collection(state.db, "sdrLeadComments"), where("leadId", "==", id), limit(200)), "lead-comments", snapshot => {
    state.comments = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    if (state.view === "consultant") renderAll();
  });
  const eventsStop = trackedSnapshot(query(collection(state.db, "sdrLeadEvents"), where("leadId", "==", id), limit(300)), "lead-events", snapshot => {
    state.events = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (state.view === "consultant") renderAll();
  });
  state.detailStops.push(commentsStop, eventsStop);
}

async function boot(context) {
  if (!root || !context?.auth?.currentUser) return;
  if (state.booted && state.user?.uid === context.auth.currentUser.uid) return;
  if (state.booted) clearSdrSession();
  state.booted = true;
  Object.assign(state, context, { user: context.auth.currentUser });
  const uid = state.user.uid;
  const [profileSnapshot, tokenResult] = await Promise.all([
    trackedDoc(doc(state.db, "users", uid), "profile"),
    state.user.getIdTokenResult().catch(() => null)
  ]);
  if (context.auth.currentUser?.uid !== uid || !state.booted) return;
  state.profile = profileSnapshot.data() || {};
  state.role = resolveFirestoreLeadRole({
    uid, email: state.user.email, profile: state.profile,
    tokenRole: tokenResult?.claims?.role, hasProfile: profileSnapshot.exists()
  });
  window.platinoUserOperationalRole = state.role;
  window.sdrApplyAccess = () => {
    document.getElementById("nav-sdr")?.classList.toggle("hidden", !canAccessSdr());
  };
  window.sdrApplyAccess();
  if (!canAccessSdr()) {
    root.innerHTML = "";
    return;
  }
  mount();
  subscribeLeads();
}

window.addEventListener("platino-firebase-ready", event => boot(event.detail));
if (window.platinoFirebaseContext?.auth?.currentUser) boot(window.platinoFirebaseContext);

function clearSdrSession() {
  clearTimeout(state.saveTimer);
  clearTimeout(filterTimer);
  state.stop.splice(0).forEach(stop => stop?.());
  state.notificationUid = "";
  state.stopAux.splice(0).forEach(stop => stop?.());
  state.stopList?.();
  state.stopList = null;
  state.detailStops.splice(0).forEach(stop => stop?.());
  state.booted = false;
  state.listRequest += 1;
  state.leads = [];
  state.notifications = [];
  state.banks = [...DEFAULT_BANKS];
  state.rules = [];
  state.assignableUsers = [];
  state.events = [];
  state.comments = [];
  state.activeId = "";
  state.activeLead = null;
  state.view = "sdr";
  state.section = "portfolio";
  state.metricFilter = "";
  state.filters = { search: "", status: "", classification: "" };
  state.page = 1;
  state.pageCursors = [null];
  state.pageTotal = null;
  state.pageCountUnavailable = false;
  state.pageHasNext = false;
  state.listError = "";
  state.listLoading = false;
  invalidateMetricCounts();
  state.pageCache.clear();
  state.user = null;
  state.profile = null;
  state.db = null;
  state.auth = null;
  state.app = null;
  state.role = "collaborator";
  if (root) root.innerHTML = "";
}

window.addEventListener("platino-signed-out", clearSdrSession);
