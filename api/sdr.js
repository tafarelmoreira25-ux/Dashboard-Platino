import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, requireAuthenticated, sendApiError } from "./_firebase-admin.js";
import {
  SDR_ROLES,
  assertTransition,
  calculateSimulation,
  createCorrectionNumber,
  getForwardingMissingFields,
  normalizeDigits,
  roleCan,
  sanitizeText,
  validateLeadRegistration
} from "../src/sdr/sdr-core.js";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 90;
const rateBuckets = new Map();
const MANAGER_ROLES = new Set([SDR_ROLES.ADMIN, SDR_ROLES.MANAGER]);
const CONSULTANT_ROLES = new Set([SDR_ROLES.CONSULTANT, SDR_ROLES.ANALYST]);
const LEGACY_MANAGEMENT_EMAILS = new Set([
  "gestao@platino.com",
  "tafarel@platino.com",
  "tafarel.moreira@platino.com",
  "tafarelmoreira@platino.com",
  "supervisao@platino.com",
  "diretoria@platino.com",
  "admin@platino.com",
  "isabela@platino.com",
  "vanessa@platino.com"
]);
const LEGACY_SDR_EMAILS = new Set([
  "roberta@platino.com",
  "janaina@platino.com",
  "rafaela@platino.com",
  "fernanda@platino.com",
  "geovanna@platino.com"
]);
const LEGACY_CONSULTANT_EMAILS = new Set([
  "giullian@platino.com",
  "nicolas@platino.com",
  "tabata@platino.com",
  "elaine@platino.com"
]);

function apiError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function checkRateLimit(uid) {
  const now = Date.now();
  const bucket = rateBuckets.get(uid) || { start: now, count: 0 };
  if (now - bucket.start >= RATE_WINDOW_MS) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(uid, bucket);
  if (bucket.count > RATE_MAX) throw apiError("Muitas solicitações. Aguarde um minuto e tente novamente.", 429);
}

function cleanRole(value) {
  const role = sanitizeText(value, 40).toLowerCase();
  if (["gestor", "supervisor"].includes(role)) return SDR_ROLES.MANAGER;
  if (["consultor", "consultor_comercial"].includes(role)) return SDR_ROLES.CONSULTANT;
  if (["analista"].includes(role)) return SDR_ROLES.ANALYST;
  if (["sdr"].includes(role)) return SDR_ROLES.SDR;
  if (["admin", "manager", "consultant", "analyst"].includes(role)) return role;
  return "collaborator";
}

async function getActor(request) {
  const token = await requireAuthenticated(request);
  checkRateLimit(token.uid);
  const profileSnapshot = await adminDb().collection("users").doc(token.uid).get();
  const profile = profileSnapshot.exists ? profileSnapshot.data() : {};
  const email = sanitizeText(token.email, 254).toLowerCase();
  const sector = sanitizeText(token.sector || profile.sector, 80);
  let role = cleanRole(token.operationalRole || profile.operationalRole || token.role || profile.role);
  if (LEGACY_MANAGEMENT_EMAILS.has(email)) role = token.role === "admin" || profile.role === "admin" ? SDR_ROLES.ADMIN : SDR_ROLES.MANAGER;
  if (LEGACY_SDR_EMAILS.has(email)) role = SDR_ROLES.SDR;
  if (LEGACY_CONSULTANT_EMAILS.has(email)) role = SDR_ROLES.CONSULTANT;
  if (role === "collaborator" && /sdr|comercial/i.test(sector)) role = SDR_ROLES.SDR;
  if (role === "collaborator" && /jur[ií]d|consult/i.test(sector)) role = SDR_ROLES.CONSULTANT;
  if (profile.disabled === true) throw apiError("Usuário inativo.", 403);
  return {
    uid: token.uid,
    email,
    name: sanitizeText(profile.displayName || token.name || token.email, 120),
    role,
    sector
  };
}

function assertMethod(request) {
  if (request.method !== "POST") throw apiError("Método não permitido.", 405);
}

function assertActionPermission(action, actor, lead = {}) {
  const allowed = roleCan(action, actor.role, {
    uid: actor.uid,
    ownerSdrId: lead.ownerSdrId,
    assignedConsultantId: lead.assignedConsultantId
  });
  if (!allowed) throw apiError("Você não possui permissão para esta ação.", 403);
}

function leadSummaryForNotification(lead) {
  return {
    leadId: lead.id,
    leadName: sanitizeText(lead.fullName, 120),
    protocol: sanitizeText(lead.protocol, 80)
  };
}

async function writeEvent(transactionOrDb, leadId, actor, eventType, metadata = {}) {
  const reference = adminDb().collection("sdrLeadEvents").doc();
  const payload = {
    leadId,
    eventType,
    actorId: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    metadata,
    createdAt: FieldValue.serverTimestamp()
  };
  if (transactionOrDb?.set) transactionOrDb.set(reference, payload);
  else await reference.set(payload);
  return reference.id;
}

async function writeAudit(transactionOrDb, leadId, actor, action, oldValues = {}, newValues = {}, reason = "", entityType = "lead") {
  const reference = adminDb().collection("sdrAuditLogs").doc();
  const payload = {
    entityType,
    entityId: leadId,
    action,
    oldValues,
    newValues,
    actorId: actor.uid,
    actorRole: actor.role,
    reason: sanitizeText(reason, 1000),
    createdAt: FieldValue.serverTimestamp()
  };
  if (transactionOrDb?.set) transactionOrDb.set(reference, payload);
  else await reference.set(payload);
}

async function notify(transactionOrDb, userId, lead, type, title, message) {
  if (!userId) return;
  const reference = adminDb().collection("sdrNotifications").doc();
  const payload = {
    userId,
    ...leadSummaryForNotification(lead),
    type,
    title: sanitizeText(title, 140),
    message: sanitizeText(message, 1000),
    readAt: null,
    createdAt: FieldValue.serverTimestamp()
  };
  if (transactionOrDb?.set) transactionOrDb.set(reference, payload);
  else await reference.set(payload);
}

function criticalDiff(oldLead, nextLead) {
  const fields = ["cpfCnpj", "phone", "ownerSdrId", "assignedConsultantId", "status", "commercialClassification"];
  return fields.reduce((result, field) => {
    if (JSON.stringify(oldLead?.[field] ?? null) !== JSON.stringify(nextLead?.[field] ?? null)) {
      result.oldValues[field] = oldLead?.[field] ?? null;
      result.newValues[field] = nextLead?.[field] ?? null;
    }
    return result;
  }, { oldValues: {}, newValues: {} });
}

function cleanLeadInput(input = {}, previous = {}) {
  const nowIso = new Date().toISOString();
  return {
    ...previous,
    id: sanitizeText(input.id || previous.id, 128),
    protocol: previous.protocol || sanitizeText(input.protocol, 80),
    externalCode: sanitizeText(input.externalCode, 80),
    fullName: sanitizeText(input.fullName, 120),
    phone: sanitizeText(input.phone, 32),
    phoneKey: normalizeDigits(input.phone),
    email: sanitizeText(input.email, 254).toLowerCase(),
    cpfCnpj: sanitizeText(input.cpfCnpj, 24),
    documentKey: normalizeDigits(input.cpfCnpj),
    state: sanitizeText(input.state, 2).toUpperCase(),
    city: sanitizeText(input.city, 120),
    origin: sanitizeText(input.origin, 80),
    sourceChannel: sanitizeText(input.sourceChannel, 80),
    campaign: sanitizeText(input.campaign, 120),
    marketingCompany: sanitizeText(input.marketingCompany, 120),
    marketingStatus: previous.marketingStatus || sanitizeText(input.marketingStatus || "APROVADO", 80),
    marketingAnalysisDate: sanitizeText(input.marketingAnalysisDate, 30),
    marketingAnalyst: sanitizeText(input.marketingAnalyst, 120),
    marketingSummary: sanitizeText(input.marketingSummary, 4000),
    marketingFindings: Array.isArray(input.marketingFindings)
      ? input.marketingFindings.map(item => sanitizeText(item, 80)).filter(Boolean).slice(0, 20)
      : [],
    initialObservation: sanitizeText(input.initialObservation, 4000),
    status: sanitizeText(input.status || previous.status || "Rascunho", 80),
    commercialClassification: sanitizeText(input.commercialClassification || previous.commercialClassification || "Frio", 40),
    commercialScore: Math.min(Math.max(Number(input.commercialScore) || 0, 0), 100),
    ownerSdrId: previous.ownerSdrId || sanitizeText(input.ownerSdrId, 128),
    ownerSdrName: previous.ownerSdrName || sanitizeText(input.ownerSdrName, 120),
    assignedConsultantId: sanitizeText(input.assignedConsultantId || previous.assignedConsultantId, 128),
    assignedConsultantName: sanitizeText(input.assignedConsultantName || previous.assignedConsultantName, 120),
    nextContactAt: sanitizeText(input.nextContactAt, 40),
    preferredContactTime: sanitizeText(input.preferredContactTime, 80),
    preferredChannel: sanitizeText(input.preferredChannel, 80),
    qualification: cleanNested(input.qualification, 30),
    contract: cleanNested(input.contract, 50),
    analysis: cleanNested(input.analysis, 40),
    analysisDocument: cleanNested(input.analysisDocument, 30),
    consent: cleanNested(input.consent, 20),
    assignment: cleanNested(input.assignment, 30),
    outcome: cleanNested(input.outcome, 30),
    lastContactAt: sanitizeText(input.lastContactAt || previous.lastContactAt, 40),
    updatedAt: nowIso,
    createdAt: previous.createdAt || nowIso,
    deletedAt: previous.deletedAt || null
  };
}

function cleanNested(value, maxKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, maxKeys).map(([key, item]) => {
    if (Array.isArray(item)) {
      return [sanitizeText(key, 80), item.slice(0, 50).map(entry =>
        typeof entry === "object" && entry !== null ? cleanNested(entry, 15) : sanitizeText(entry, 4000)
      )];
    }
    if (item && typeof item === "object") return [sanitizeText(key, 80), cleanNested(item, 30)];
    if (typeof item === "string") return [sanitizeText(key, 80), sanitizeText(item, 8000)];
    return [sanitizeText(key, 80), item];
  }));
}

async function nextCounter(transaction, key) {
  const reference = adminDb().collection("sdrCounters").doc(key);
  const snapshot = await transaction.get(reference);
  const value = Number(snapshot.data()?.value || 0) + 1;
  transaction.set(reference, { value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return value;
}

function formatDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Sao_Paulo"
  }).format(date).replaceAll("-", "");
}

async function createLead(actor, input) {
  if (![SDR_ROLES.SDR, SDR_ROLES.MANAGER, SDR_ROLES.ADMIN].includes(actor.role)) {
    throw apiError("Somente SDR ou gestão pode criar leads.", 403);
  }
  const initial = cleanLeadInput({ ...input, ownerSdrId: actor.uid, ownerSdrName: actor.name });
  Object.assign(initial, {
    analysis: {},
    analysisDocument: {},
    consent: {},
    assignment: {},
    outcome: {},
    assignedConsultantId: "",
    assignedConsultantName: ""
  });
  const errors = validateLeadRegistration(initial);
  if (errors.length) throw apiError(errors.join(" "));

  const duplicates = [];
  if (initial.phoneKey) {
    const snapshot = await adminDb().collection("sdrLeads").where("phoneKey", "==", initial.phoneKey).limit(5).get();
    duplicates.push(...snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }
  if (initial.documentKey) {
    const snapshot = await adminDb().collection("sdrLeads").where("documentKey", "==", initial.documentKey).limit(5).get();
    duplicates.push(...snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }
  const uniqueDuplicates = [...new Map(duplicates.map(item => [item.id, item])).values()];
  if (uniqueDuplicates.length && !sanitizeText(input.duplicateJustification, 1000)) {
    return { duplicate: true, matches: uniqueDuplicates.map(item => ({
      id: item.id,
      fullName: item.fullName,
      phone: item.phone,
      status: item.status,
      ownerSdrName: item.ownerSdrName,
      lastContactAt: item.lastContactAt
    })) };
  }

  const leadReference = adminDb().collection("sdrLeads").doc();
  const dateKey = formatDateKey();
  const created = await adminDb().runTransaction(async transaction => {
    const sequence = await nextCounter(transaction, `protocol-${dateKey}`);
    const protocol = `PLT-${dateKey}-${String(sequence).padStart(6, "0")}-LD${leadReference.id.slice(0, 4).toUpperCase()}`;
    const lead = {
      ...initial,
      id: leadReference.id,
      protocol,
      status: "Novo lead",
      ownerSdrId: actor.uid,
      ownerSdrName: actor.name,
      consentAt: null,
      createdBy: actor.uid,
      createdAtServer: FieldValue.serverTimestamp(),
      updatedAtServer: FieldValue.serverTimestamp()
    };
    transaction.set(leadReference, lead);
    await writeEvent(transaction, leadReference.id, actor, "lead.created", { protocol });
    if (uniqueDuplicates.length) {
      await writeAudit(transaction, leadReference.id, actor, "lead.duplicate.override", {}, {
        duplicateIds: uniqueDuplicates.map(item => item.id)
      }, input.duplicateJustification);
    }
    return lead;
  });
  return { lead: created };
}

async function saveLead(actor, input) {
  const id = sanitizeText(input.id, 128);
  if (!id) throw apiError("Lead inválido.");
  const reference = adminDb().collection("sdrLeads").doc(id);
  return adminDb().runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw apiError("Lead não encontrado.", 404);
    const previous = snapshot.data();
    assertActionPermission("lead.autosave", actor, previous);
    const next = cleanLeadInput({ ...input, id }, previous);
    Object.assign(next, {
      analysis: previous.analysis || {},
      analysisDocument: previous.analysisDocument || {},
      consent: previous.consent || {},
      assignment: previous.assignment || {},
      outcome: previous.outcome || {},
      assignedConsultantId: previous.assignedConsultantId || "",
      assignedConsultantName: previous.assignedConsultantName || ""
    });
    if (next.status !== previous.status) assertTransition(previous.status, next.status);
    if (previous.marketingStatus !== next.marketingStatus && !MANAGER_ROLES.has(actor.role)) {
      throw apiError("Somente a gestão pode corrigir a aprovação original.", 403);
    }
    const changes = criticalDiff(previous, next);
    transaction.set(reference, { ...next, updatedAtServer: FieldValue.serverTimestamp() }, { merge: true });
    await writeEvent(transaction, id, actor, "lead.autosaved", { step: sanitizeText(input.currentStep, 40) });
    if (Object.keys(changes.newValues).length) {
      await writeAudit(transaction, id, actor, "lead.critical.update", changes.oldValues, changes.newValues, input.changeReason);
    }
    return { lead: next };
  });
}

async function assignLead(actor, input) {
  const id = sanitizeText(input.id, 128);
  const consultantId = sanitizeText(input.consultantId, 128);
  if (!id || !consultantId) throw apiError("Lead e consultor são obrigatórios.");
  const leadReference = adminDb().collection("sdrLeads").doc(id);
  const consultantReference = adminDb().collection("users").doc(consultantId);
  return adminDb().runTransaction(async transaction => {
    const [leadSnapshot, consultantSnapshot] = await Promise.all([
      transaction.get(leadReference),
      transaction.get(consultantReference)
    ]);
    if (!leadSnapshot.exists) throw apiError("Lead não encontrado.", 404);
    if (!consultantSnapshot.exists) throw apiError("Consultor não encontrado.", 404);
    const lead = leadSnapshot.data();
    const consultant = consultantSnapshot.data();
    assertActionPermission("assignment.create", actor, lead);
    const consultantRole = cleanRole(consultant.operationalRole || consultant.role);
    if (!CONSULTANT_ROLES.has(consultantRole) && !MANAGER_ROLES.has(consultantRole)) {
      throw apiError("Selecione um analista ou consultor ativo.");
    }
    if (consultant.disabled === true || consultant.isActive === false) throw apiError("O consultor selecionado está inativo.");
    const assignment = {
      consultantId,
      consultantName: sanitizeText(consultant.displayName || consultant.email, 120),
      priority: sanitizeText(input.priority || "Normal", 30),
      deadline: sanitizeText(input.deadline, 40),
      reason: sanitizeText(input.reason, 1000),
      instructions: sanitizeText(input.instructions, 4000),
      importantPoints: sanitizeText(input.importantPoints, 4000),
      assignedAt: new Date().toISOString(),
      status: "Encaminhado"
    };
    const candidate = { ...lead, assignment, assignedConsultantId: consultantId };
    const missing = getForwardingMissingFields(candidate);
    if (missing.length) throw apiError(`Complete antes de encaminhar: ${missing.join(", ")}.`);
    assertTransition(lead.status, "Encaminhado");
    transaction.set(leadReference, {
      assignment,
      assignedConsultantId: consultantId,
      assignedConsultantName: assignment.consultantName,
      status: "Encaminhado",
      updatedAt: new Date().toISOString(),
      updatedAtServer: FieldValue.serverTimestamp()
    }, { merge: true });
    const assignmentReference = adminDb().collection("sdrLeadAssignments").doc();
    transaction.set(assignmentReference, {
      id: assignmentReference.id,
      leadId: id,
      fromUserId: actor.uid,
      toUserId: consultantId,
      ...assignment,
      createdAt: FieldValue.serverTimestamp()
    });
    await notify(transaction, consultantId, lead, "lead.assigned", "Novo lead encaminhado", `O lead ${lead.fullName} foi encaminhado para você.`);
    await writeEvent(transaction, id, actor, "lead.assigned", { consultantId, priority: assignment.priority });
    await writeAudit(transaction, id, actor, "lead.assignment", {
      assignedConsultantId: lead.assignedConsultantId || null
    }, { assignedConsultantId: consultantId }, input.reason);
    return { assignment };
  });
}

async function runAnalysis(actor, input) {
  const id = sanitizeText(input.id, 128);
  if (!id) throw apiError("Lead inválido.");
  const leadReference = adminDb().collection("sdrLeads").doc(id);
  const leadSnapshot = await leadReference.get();
  if (!leadSnapshot.exists) throw apiError("Lead não encontrado.", 404);
  const lead = leadSnapshot.data();
  assertActionPermission("analysis.create", actor, lead);
  if (!lead.contract?.contractType || !lead.contract?.bankId) throw apiError("Preencha e salve o contrato antes da análise.");
  if (!["Qualificado", "Análise Concluída", "APROVADO"].includes(lead.status)) {
    throw apiError("Conclua a qualificação do lead antes de executar a análise.", 409);
  }
  assertTransition(lead.status, "Análise em andamento");

  const rulesSnapshot = await adminDb().collection("sdrSimulationRules").where("isActive", "==", true).get();
  const rules = rulesSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const rule = rules.find(item =>
    (!item.contractType || item.contractType === lead.contract.contractType)
    && (!item.bankId || item.bankId === lead.contract.bankId)
  ) || rules.find(item => !item.contractType && !item.bankId);
  if (!rule) throw apiError("Nenhuma regra de simulação ativa foi configurada para este contrato.", 409);

  const result = calculateSimulation(lead.contract, rule);
  const year = new Date().getFullYear();
  const analysis = await adminDb().runTransaction(async transaction => {
    const sequence = await nextCounter(transaction, `correction-${year}`);
    const correctionNumber = createCorrectionNumber(year, sequence);
    const value = {
      ...result,
      correctionNumber,
      status: "Análise Concluída",
      ruleId: rule.id,
      ruleVersion: Number(rule.version) || 1,
      createdBy: actor.uid,
      createdByName: actor.name,
      createdAt: new Date().toISOString()
    };
    transaction.set(leadReference, {
      analysis: value,
      status: "Análise Concluída",
      updatedAt: new Date().toISOString(),
      updatedAtServer: FieldValue.serverTimestamp()
    }, { merge: true });
    const simulationReference = adminDb().collection("sdrLeadSimulations").doc();
    transaction.set(simulationReference, {
      id: simulationReference.id,
      leadId: id,
      contractId: id,
      ...value,
      createdAtServer: FieldValue.serverTimestamp()
    });
    await writeEvent(transaction, id, actor, "analysis.completed", {
      correctionNumber,
      ruleId: rule.id,
      ruleVersion: value.ruleVersion
    });
    await writeAudit(transaction, id, actor, "analysis.create", {}, {
      correctionNumber,
      ruleId: rule.id,
      ruleVersion: value.ruleVersion,
      result: result
    });
    return value;
  });
  return { analysis };
}

async function registerAnalysisDocument(actor, input) {
  const id = sanitizeText(input.id, 128);
  const fileName = sanitizeText(input.fileName, 240);
  const fileHash = sanitizeText(input.fileHash, 128);
  if (!id || !fileName || !fileHash) throw apiError("Metadados do documento incompletos.");
  const reference = adminDb().collection("sdrLeads").doc(id);
  return adminDb().runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw apiError("Lead não encontrado.", 404);
    const lead = snapshot.data();
    assertActionPermission("document.create", actor, lead);
    if (!lead.analysis?.correctionNumber) throw apiError("Conclua a análise antes de gerar o documento.");
    const versionsQuery = adminDb().collection("sdrLeadAnalysisDocuments").where("leadId", "==", id);
    const versionsSnapshot = await transaction.get(versionsQuery);
    const version = versionsSnapshot.size + 1;
    const document = {
      leadId: id,
      simulationId: lead.analysis.correctionNumber,
      protocol: lead.protocol,
      correctionNumber: lead.analysis.correctionNumber,
      version,
      fileName,
      fileHash,
      storageMode: "local-download",
      storedRemotely: false,
      createdBy: actor.uid,
      createdByName: actor.name,
      createdAt: new Date().toISOString()
    };
    const documentReference = adminDb().collection("sdrLeadAnalysisDocuments").doc();
    transaction.set(documentReference, { id: documentReference.id, ...document, createdAtServer: FieldValue.serverTimestamp() });
    transaction.set(reference, {
      analysisDocument: { id: documentReference.id, ...document },
      status: "APROVADO",
      updatedAtServer: FieldValue.serverTimestamp()
    }, { merge: true });
    await writeEvent(transaction, id, actor, "document.generated", { documentId: documentReference.id, version, fileHash });
    await writeAudit(transaction, id, actor, "document.version.create", {}, { documentId: documentReference.id, version, fileHash });
    return { id: documentReference.id, ...document };
  });
}

async function recordConsent(actor, input) {
  const id = sanitizeText(input.id, 128);
  const answer = sanitizeText(input.answer, 80);
  const valid = ["Sim", "Não", "Solicitou prazo", "Aguardando retorno", "Precisa consultar outra pessoa", "Não respondeu"];
  if (!valid.includes(answer)) throw apiError("Resposta de aceite inválida.");
  const reference = adminDb().collection("sdrLeads").doc(id);
  return adminDb().runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw apiError("Lead não encontrado.", 404);
    const lead = snapshot.data();
    assertActionPermission("consent.create", actor, lead);
    if (!lead.analysisDocument?.fileHash) throw apiError("Gere o documento antes de registrar o aceite.");
    if (answer === "Não" && (!sanitizeText(input.reason, 1000) || !sanitizeText(input.objection, 1000))) {
      throw apiError("Motivo e principal objeção são obrigatórios.");
    }
    const consent = {
      answer,
      reason: sanitizeText(input.reason, 1000),
      objection: sanitizeText(input.objection, 1000),
      observation: sanitizeText(input.observation, 2000),
      returnPossible: Boolean(input.returnPossible),
      nextAction: sanitizeText(input.nextAction, 1000),
      nextContactAt: sanitizeText(input.nextContactAt, 40),
      recordedAt: new Date().toISOString(),
      recordedBy: actor.uid
    };
    const status = answer === "Sim" ? "Lead potencial" : answer === "Não" ? "Retorno agendado" : "Aguardando aceite";
    transaction.set(reference, {
      consent,
      consentAt: answer === "Sim" ? new Date().toISOString() : null,
      status,
      nextContactAt: consent.nextContactAt || lead.nextContactAt,
      updatedAtServer: FieldValue.serverTimestamp()
    }, { merge: true });
    await writeEvent(transaction, id, actor, "consent.recorded", { answer, status });
    return { consent, status };
  });
}

async function recordContact(actor, input) {
  const id = sanitizeText(input.id, 128);
  const type = sanitizeText(input.type, 60);
  const details = sanitizeText(input.details, 3000);
  if (!id || !type || !details) throw apiError("Tipo e detalhes do contato são obrigatórios.");
  const reference = adminDb().collection("sdrLeads").doc(id);
  return adminDb().runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw apiError("Lead não encontrado.", 404);
    const lead = snapshot.data();
    assertActionPermission("contact.create", actor, lead);
    if (!["Recebido pelo consultor", "Em contato", "Retorno agendado", "Em negociação"].includes(lead.status)) {
      throw apiError("Aceite o lead antes de registrar o contato.", 409);
    }
    const eventReference = adminDb().collection("sdrLeadEvents").doc();
    transaction.set(eventReference, {
      id: eventReference.id,
      leadId: id,
      eventType: "contact.recorded",
      actorId: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      metadata: { type, details, nextContactAt: sanitizeText(input.nextContactAt, 40) },
      createdAt: FieldValue.serverTimestamp()
    });
    const nextStatus = sanitizeText(input.nextContactAt, 40)
      ? "Retorno agendado"
      : lead.status === "Em negociação" ? "Em negociação" : "Em contato";
    if (nextStatus !== lead.status) assertTransition(lead.status, nextStatus);
    transaction.set(reference, {
      status: nextStatus,
      lastContactAt: new Date().toISOString(),
      nextContactAt: sanitizeText(input.nextContactAt, 40) || lead.nextContactAt,
      updatedAtServer: FieldValue.serverTimestamp()
    }, { merge: true });
    return { status: nextStatus };
  });
}

async function acceptLead(actor, input) {
  const id = sanitizeText(input.id, 128);
  const reference = adminDb().collection("sdrLeads").doc(id);
  return adminDb().runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw apiError("Lead não encontrado.", 404);
    const lead = snapshot.data();
    assertActionPermission("assignment.accept", actor, lead);
    assertTransition(lead.status, "Recebido pelo consultor");
    transaction.set(reference, {
      status: "Recebido pelo consultor",
      assignment: {
        ...(lead.assignment || {}),
        status: "Aceito",
        acceptedAt: new Date().toISOString()
      },
      updatedAtServer: FieldValue.serverTimestamp()
    }, { merge: true });
    await notify(transaction, lead.ownerSdrId, lead, "lead.accepted", "Lead aceito", `${actor.name} aceitou o lead ${lead.fullName}.`);
    await writeEvent(transaction, id, actor, "lead.accepted");
    return { status: "Recebido pelo consultor" };
  });
}

async function returnLead(actor, input) {
  const id = sanitizeText(input.id, 128);
  const reason = sanitizeText(input.reason, 2000);
  const missingInformation = sanitizeText(input.missingInformation, 2000);
  const guidance = sanitizeText(input.guidance, 2000);
  const deadline = sanitizeText(input.deadline, 40);
  if (!reason || !missingInformation || !guidance || !deadline) {
    throw apiError("Motivo, informação faltante, orientação e prazo são obrigatórios.");
  }
  const reference = adminDb().collection("sdrLeads").doc(id);
  return adminDb().runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw apiError("Lead não encontrado.", 404);
    const lead = snapshot.data();
    assertActionPermission("assignment.return", actor, lead);
    assertTransition(lead.status, "Devolvido");
    transaction.set(reference, {
      status: "Devolvido",
      returnRequest: { reason, missingInformation, guidance, deadline, returnedAt: new Date().toISOString(), returnedBy: actor.uid },
      updatedAtServer: FieldValue.serverTimestamp()
    }, { merge: true });
    await notify(transaction, lead.ownerSdrId, lead, "lead.returned", "Lead devolvido", `O lead ${lead.fullName} foi devolvido por ${actor.name}. Consulte as informações solicitadas.`);
    await writeEvent(transaction, id, actor, "lead.returned", { reason, deadline });
    return { status: "Devolvido" };
  });
}

async function recordOutcome(actor, input) {
  const id = sanitizeText(input.id, 128);
  const outcome = sanitizeText(input.outcome, 40);
  if (!["LEAD APROVADO", "LEAD REPROVADO", "Em acompanhamento", "Retorno agendado", "Sem contato", "Devolvido ao SDR"].includes(outcome)) {
    throw apiError("Resultado inválido.");
  }
  const reference = adminDb().collection("sdrLeads").doc(id);
  return adminDb().runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw apiError("Lead não encontrado.", 404);
    const lead = snapshot.data();
    assertActionPermission("outcome.create", actor, lead);
    if (outcome === "LEAD APROVADO") {
      if (!sanitizeText(input.contractedService, 120) || !(Number(input.contractedValue) > 0) || !sanitizeText(input.paymentMethod, 40)) {
        throw apiError("Serviço, valor e forma de pagamento são obrigatórios para LEAD APROVADO.");
      }
    }
    if (outcome === "LEAD REPROVADO") {
      if (!sanitizeText(input.lossReason, 120) || !sanitizeText(input.difficultyDescription, 3000) || !sanitizeText(input.observation, 3000)) {
        throw apiError("Motivo, dificuldade encontrada e observação são obrigatórios para LEAD REPROVADO.");
      }
    }
    const nextStatus = ({
      "Devolvido ao SDR": "Devolvido",
      "Em acompanhamento": "Em contato",
      "Sem contato": "Em contato"
    })[outcome] || outcome;
    assertTransition(lead.status, nextStatus);
    const outcomeData = {
      outcome,
      lossReason: sanitizeText(input.lossReason, 120),
      difficultyDescription: sanitizeText(input.difficultyDescription, 3000),
      mainObjection: sanitizeText(input.mainObjection, 1000),
      attempts: Math.max(Number(input.attempts) || 0, 0),
      futureContact: Boolean(input.futureContact),
      nextContactAt: sanitizeText(input.nextContactAt, 40),
      observation: sanitizeText(input.observation, 3000),
      contractedService: sanitizeText(input.contractedService, 120),
      contractedValue: Math.max(Number(input.contractedValue) || 0, 0),
      paymentMethod: sanitizeText(input.paymentMethod, 40),
      installments: Math.max(Number(input.installments) || 0, 0),
      consultantId: actor.uid,
      consultantName: actor.name,
      createdAt: new Date().toISOString()
    };
    transaction.set(reference, {
      status: nextStatus,
      outcome: outcomeData,
      nextContactAt: outcomeData.nextContactAt || lead.nextContactAt,
      updatedAtServer: FieldValue.serverTimestamp()
    }, { merge: true });
    const outcomeReference = adminDb().collection("sdrLeadOutcomes").doc();
    transaction.set(outcomeReference, { id: outcomeReference.id, leadId: id, ...outcomeData, createdAtServer: FieldValue.serverTimestamp() });
    await notify(transaction, lead.ownerSdrId, lead, outcome === "LEAD APROVADO" ? "lead.approved" : "lead.outcome", outcome, outcome === "LEAD APROVADO"
      ? `LEAD APROVADO - O lead ${lead.fullName} realizou a contratação com ${actor.name}.`
      : `${outcome} - Consulte o resultado registrado por ${actor.name}.`);
    await writeEvent(transaction, id, actor, outcome === "LEAD APROVADO" ? "lead.approved" : "lead.outcome", { outcome });
    await writeAudit(transaction, id, actor, "lead.outcome", { outcome: lead.outcome?.outcome || null }, { outcome }, input.difficultyDescription);
    return { outcome: outcomeData, status: nextStatus };
  });
}

async function addComment(actor, input) {
  const id = sanitizeText(input.id, 128);
  const content = sanitizeText(input.content, 4000);
  if (!content) throw apiError("Digite o comentário.");
  const leadSnapshot = await adminDb().collection("sdrLeads").doc(id).get();
  if (!leadSnapshot.exists) throw apiError("Lead não encontrado.", 404);
  const lead = leadSnapshot.data();
  assertActionPermission("comment.create", actor, lead);
  const mentionUserIds = Array.isArray(input.mentionUserIds)
    ? input.mentionUserIds.map(item => sanitizeText(item, 128)).filter(Boolean).slice(0, 20)
    : [];
  const reference = adminDb().collection("sdrLeadComments").doc();
  await reference.set({
    id: reference.id,
    leadId: id,
    authorId: actor.uid,
    authorName: actor.name,
    authorRole: actor.role,
    content,
    mentionUserIds,
    createdAt: FieldValue.serverTimestamp(),
    editedAt: null
  });
  await Promise.all(mentionUserIds.filter(uid => uid !== actor.uid).map(uid =>
    notify(null, uid, lead, "lead.mention", "Você foi mencionado", `${actor.name} mencionou você no lead ${lead.fullName}.`)
  ));
  await writeEvent(null, id, actor, "lead.comment", { commentId: reference.id });
  return { id: reference.id };
}

async function listAssignableUsers(actor) {
  if (![SDR_ROLES.SDR, SDR_ROLES.MANAGER, SDR_ROLES.ADMIN].includes(actor.role)) {
    throw apiError("Acesso restrito.", 403);
  }
  const snapshot = await adminDb().collection("users").get();
  const users = [];
  for (const item of snapshot.docs) {
    const data = item.data();
    const role = cleanRole(data.operationalRole || data.role);
    if ((!CONSULTANT_ROLES.has(role) && !MANAGER_ROLES.has(role)) || data.disabled === true || data.isActive === false) continue;
    const leads = await adminDb().collection("sdrLeads")
      .where("assignedConsultantId", "==", item.id)
      .get();
    const activeStatuses = new Set(["Encaminhado", "Recebido pelo consultor", "Em contato", "Retorno agendado", "Em negociação"]);
    users.push({
      id: item.id,
      displayName: sanitizeText(data.displayName || data.email, 120),
      operationalRole: role,
      photoURL: sanitizeText(data.photoURL, 1000),
      availabilityStatus: sanitizeText(data.availabilityStatus || "Disponível", 40),
      activeLeads: leads.docs.filter(lead => activeStatuses.has(lead.data().status)).length,
      lastActivityAt: data.lastActivityAt || null
    });
  }
  return { users };
}

async function markNotificationRead(actor, input) {
  const id = sanitizeText(input.notificationId, 128);
  const reference = adminDb().collection("sdrNotifications").doc(id);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw apiError("Notificação não encontrada.", 404);
  if (snapshot.data().userId !== actor.uid && !MANAGER_ROLES.has(actor.role)) throw apiError("Acesso negado.", 403);
  await reference.set({ readAt: FieldValue.serverTimestamp() }, { merge: true });
  return { id, read: true };
}

async function saveSimulationRule(actor, input) {
  if (!MANAGER_ROLES.has(actor.role)) throw apiError("Somente a gestão pode configurar regras de cálculo.", 403);
  const reductionPercentage = Number(input.reductionPercentage);
  if (!(reductionPercentage > 0 && reductionPercentage < 100)) {
    throw apiError("Informe um percentual de redução maior que 0 e menor que 100.");
  }
  const contractType = sanitizeText(input.contractType, 80);
  const bankId = sanitizeText(input.bankId, 128);
  const rulesReference = adminDb().collection("sdrSimulationRules");
  return adminDb().runTransaction(async transaction => {
    const existingQuery = rulesReference.where("contractType", "==", contractType);
    const existing = await transaction.get(existingQuery);
    const matching = existing.docs.filter(item => (item.data().bankId || "") === bankId);
    const nextVersion = Math.max(0, ...matching.map(item => Number(item.data().version) || 0)) + 1;
    matching.forEach(item => transaction.set(item.ref, {
      isActive: false,
      supersededAt: FieldValue.serverTimestamp(),
      supersededBy: actor.uid
    }, { merge: true }));
    const reference = rulesReference.doc();
    const rule = {
      id: reference.id,
      name: sanitizeText(input.name || `Regra ${contractType || "geral"}`, 140),
      contractType,
      bankId,
      reductionPercentage,
      referenceRate: Math.max(Number(input.referenceRate) || 0, 0),
      installmentsRule: Math.max(Number(input.installmentsRule) || 0, 0),
      otherReductions: Math.max(Number(input.otherReductions) || 0, 0),
      minimumReduction: Math.max(Number(input.minimumReduction) || 0, 0),
      maximumReduction: Math.max(Number(input.maximumReduction) || 0, 0),
      roundingRule: ["cent", "integer", "floor-cent", "ceil-cent"].includes(input.roundingRule) ? input.roundingRule : "cent",
      version: nextVersion,
      isActive: true,
      createdBy: actor.uid,
      createdByName: actor.name,
      createdAt: FieldValue.serverTimestamp()
    };
    transaction.set(reference, rule);
    await writeAudit(transaction, reference.id, actor, "simulation.rule.create", {}, {
      contractType,
      bankId,
      version: nextVersion,
      reductionPercentage
    }, "", "simulationRule");
    return { rule };
  });
}

const ACTIONS = {
  "lead.create": createLead,
  "lead.save": saveLead,
  "analysis.run": runAnalysis,
  "document.register": registerAnalysisDocument,
  "consent.record": recordConsent,
  "lead.assign": assignLead,
  "lead.accept": acceptLead,
  "lead.return": returnLead,
  "lead.outcome": recordOutcome,
  "contact.record": recordContact,
  "comment.add": addComment,
  "users.assignable": listAssignableUsers,
  "notification.read": markNotificationRead,
  "rule.save": saveSimulationRule
};

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  try {
    assertMethod(request);
    const actor = await getActor(request);
    const action = sanitizeText(request.body?.action, 80);
    const execute = ACTIONS[action];
    if (!execute) throw apiError("Ação SDR inválida.", 404);
    const requestId = crypto.randomUUID();
    const result = await execute(actor, request.body?.payload || {});
    return response.status(200).json({ ok: true, requestId, ...result });
  } catch (error) {
    if (error?.message?.startsWith("Transição")) error.status = 409;
    return sendApiError(response, error);
  }
}

export {
  cleanLeadInput,
  cleanRole,
  criticalDiff
};
