export const SDR_STATUSES = Object.freeze([
  "Rascunho",
  "Novo lead",
  "Aguardando contato",
  "Em qualificação",
  "Aguardando informações",
  "Qualificado",
  "Análise em andamento",
  "Análise Concluída",
  "APROVADO",
  "Aguardando aceite",
  "Lead potencial",
  "Encaminhado",
  "Recebido pelo consultor",
  "Em contato",
  "Retorno agendado",
  "Em negociação",
  "LEAD APROVADO",
  "LEAD REPROVADO",
  "Devolvido",
  "Arquivado"
]);

export const SDR_STEPS = Object.freeze([
  { key: "registration", label: "Cadastro" },
  { key: "qualification", label: "Perfil do lead" },
  { key: "contract", label: "Contrato" },
  { key: "analysis", label: "Análise preliminar" },
  { key: "document", label: "Documento" },
  { key: "consent", label: "Aceite" },
  { key: "assignment", label: "Encaminhamento" }
]);

export const SDR_TRANSITIONS = Object.freeze({
  Rascunho: ["Novo lead", "Arquivado"],
  "Novo lead": ["Aguardando contato", "Em qualificação", "Arquivado"],
  "Aguardando contato": ["Em qualificação", "Retorno agendado", "Arquivado"],
  "Em qualificação": ["Aguardando informações", "Qualificado", "Retorno agendado", "Arquivado"],
  "Aguardando informações": ["Em qualificação", "Qualificado", "Devolvido", "Arquivado"],
  Qualificado: ["Análise em andamento", "Em qualificação", "Arquivado"],
  "Análise em andamento": ["Análise Concluída", "Qualificado", "Arquivado"],
  "Análise Concluída": ["APROVADO", "Análise em andamento", "Qualificado", "Arquivado"],
  APROVADO: ["Aguardando aceite", "Análise em andamento", "Arquivado"],
  "Aguardando aceite": ["Lead potencial", "Retorno agendado", "Arquivado"],
  "Lead potencial": ["Encaminhado", "Retorno agendado", "Arquivado"],
  Encaminhado: ["Recebido pelo consultor", "Devolvido", "Arquivado"],
  "Recebido pelo consultor": ["Em contato", "Retorno agendado", "Devolvido", "Arquivado"],
  "Em contato": ["Retorno agendado", "Em negociação", "LEAD APROVADO", "LEAD REPROVADO", "Devolvido"],
  "Retorno agendado": ["Em contato", "Em negociação", "LEAD APROVADO", "LEAD REPROVADO", "Devolvido"],
  "Em negociação": ["Retorno agendado", "LEAD APROVADO", "LEAD REPROVADO", "Devolvido"],
  "LEAD APROVADO": ["Arquivado"],
  "LEAD REPROVADO": ["Retorno agendado", "Arquivado"],
  Devolvido: ["Em qualificação", "Encaminhado", "Arquivado"],
  Arquivado: []
});

export const SDR_ROLES = Object.freeze({
  SDR: "sdr",
  CONSULTANT: "consultant",
  ANALYST: "analyst",
  MANAGER: "manager",
  ADMIN: "admin"
});

const MONEY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

export function normalizeDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function sanitizeText(value, maxLength = 4000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, maxLength);
}

export function formatPhone(value) {
  const digits = normalizeDigits(value).slice(0, 13);
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length <= 10) {
    return local
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return local
    .slice(0, 11)
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export function maskPhone(value) {
  const digits = normalizeDigits(value);
  if (digits.length < 8) return formatPhone(digits);
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  const visibleStart = local.slice(0, 4);
  const hiddenLength = Math.max(local.length - 6, 2);
  const visibleEnd = digits.slice(-2);
  return `(${visibleStart.slice(0, 2)}) ${visibleStart.slice(2)}${"•".repeat(hiddenLength)}-${visibleEnd}`;
}

export function formatCpfCnpj(value) {
  const digits = normalizeDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function isValidCpf(value) {
  const digits = normalizeDigits(value);
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  const calculate = length => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return calculate(9) === Number(digits[9]) && calculate(10) === Number(digits[10]);
}

export function isValidCnpj(value) {
  const digits = normalizeDigits(value);
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const calculate = length => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calculate(12) === Number(digits[12]) && calculate(13) === Number(digits[13]);
}

export function isValidCpfCnpj(value) {
  const digits = normalizeDigits(value);
  return digits.length === 11 ? isValidCpf(digits) : digits.length === 14 && isValidCnpj(digits);
}

export function parsePtBrMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const normalized = text
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

export function formatMoney(value) {
  return MONEY_FORMATTER.format(Number(value) || 0);
}

export function calculateRemainingInstallments(total, paid) {
  const totalNumber = Number(total);
  const paidNumber = Number(paid);
  if (!Number.isInteger(totalNumber) || !Number.isInteger(paidNumber) || totalNumber < 0 || paidNumber < 0) {
    throw new Error("As parcelas devem ser números inteiros não negativos.");
  }
  if (paidNumber > totalNumber) throw new Error("Parcelas pagas não podem superar o total.");
  return totalNumber - paidNumber;
}

export function calculateInterestScore(input = {}) {
  const compatibility = Math.min(Math.max(Number(input.compatibility) || 0, 0), 25);
  const pain = Math.min(Math.max(Number(input.pain) || 0, 0), 20);
  const urgency = Math.min(Math.max(Number(input.urgency) || 0, 0), 20);
  const intention = Math.min(Math.max(Number(input.intention) || 0, 0), 20);
  const documents = Math.min(Math.max(Number(input.documents) || 0, 0), 10);
  const contact = Math.min(Math.max(Number(input.contact) || 0, 0), 5);
  const score = Math.round(compatibility + pain + urgency + intention + documents + contact);
  return {
    score,
    classification: score >= 75 ? "Quente" : score >= 50 ? "Morno" : "Frio",
    breakdown: { compatibility, pain, urgency, intention, documents, contact }
  };
}

export function calculateSimulation(contract = {}, rule = {}) {
  const currentInstallment = parsePtBrMoney(contract.currentInstallment);
  const remainingInstallments = calculateRemainingInstallments(
    Number(contract.totalInstallments),
    Number(contract.paidInstallments)
  );
  const reductionPercentage = Number(rule.reductionPercentage);
  if (!(currentInstallment > 0)) throw new Error("Informe o valor atual da parcela.");
  if (!(reductionPercentage > 0 && reductionPercentage < 100)) {
    throw new Error("A regra ativa deve possuir percentual de redução entre 0 e 100.");
  }
  const months = Math.max(1, Number(rule.installmentsRule) || remainingInstallments);
  const rawEstimated = currentInstallment * (1 - reductionPercentage / 100);
  const estimatedInstallment = applyRounding(rawEstimated, rule.roundingRule);
  const installmentReduction = Math.max(currentInstallment - estimatedInstallment, 0);
  const estimatedRefund = applyRounding(installmentReduction * months, rule.roundingRule);
  const otherReductions = Math.max(parsePtBrMoney(rule.otherReductions), 0);
  const totalContractReduction = applyRounding(estimatedRefund + otherReductions, rule.roundingRule);
  const minimum = Math.max(parsePtBrMoney(rule.minimumReduction), 0);
  const maximum = Math.max(parsePtBrMoney(rule.maximumReduction), 0);
  if (minimum && totalContractReduction < minimum) throw new Error("A análise não atingiu a redução mínima configurada.");
  if (maximum && totalContractReduction > maximum) throw new Error("A análise ultrapassou a redução máxima configurada.");
  return {
    situation: "APROVADA",
    currentInstallment,
    estimatedInstallment,
    installmentReduction,
    installmentsUsed: months,
    estimatedRefund,
    totalContractReduction,
    ruleVersion: Number(rule.version) || 1,
    calculationData: {
      reductionPercentage,
      referenceRate: Number(rule.referenceRate) || 0,
      remainingInstallments,
      otherReductions,
      roundingRule: rule.roundingRule || "cent"
    }
  };
}

export function applyRounding(value, rule = "cent") {
  const number = Number(value) || 0;
  if (rule === "integer") return Math.round(number);
  if (rule === "floor-cent") return Math.floor(number * 100) / 100;
  if (rule === "ceil-cent") return Math.ceil(number * 100) / 100;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

export function canTransition(from, to) {
  return Boolean(SDR_TRANSITIONS[from]?.includes(to));
}

export function assertTransition(from, to) {
  if (!SDR_STATUSES.includes(from) || !SDR_STATUSES.includes(to) || !canTransition(from, to)) {
    throw new Error(`Transição de "${from}" para "${to}" não permitida.`);
  }
  return true;
}

export function getForwardingMissingFields(lead = {}) {
  const missing = [];
  if (!sanitizeText(lead.fullName, 120)) missing.push("Nome");
  if (normalizeDigits(lead.phone).length < 10) missing.push("Telefone");
  if (!isValidCpfCnpj(lead.cpfCnpj)) missing.push("CPF/CNPJ");
  const answers = lead.qualification?.answers || [];
  if (answers.length < 4 || answers.slice(0, 4).some(answer =>
    !sanitizeText(answer?.answer || (typeof answer === "string" ? answer : ""), 4000) && !answer?.notInformed
  )) {
    missing.push("Quatro perguntas");
  }
  if (!lead.qualification?.sdrSummary) missing.push("Resumo do SDR");
  if (!lead.contract?.contractType || !lead.contract?.bankId) missing.push("Contrato");
  if (!lead.analysis?.totalContractReduction) missing.push("Análise");
  if (!lead.analysisDocument?.fileHash) missing.push("Documento gerado");
  if (lead.consent?.answer !== "Sim") missing.push("Aceite");
  if (!lead.assignment?.consultantId) missing.push("Consultor");
  return missing;
}

export function validateLeadRegistration(lead = {}) {
  const errors = [];
  if (!sanitizeText(lead.fullName, 120)) errors.push("Nome completo é obrigatório.");
  if (normalizeDigits(lead.phone).length < 10) errors.push("Telefone/WhatsApp válido é obrigatório.");
  if (!sanitizeText(lead.origin, 80)) errors.push("Origem é obrigatória.");
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) errors.push("Informe um e-mail válido.");
  if (lead.cpfCnpj && !isValidCpfCnpj(lead.cpfCnpj)) errors.push("CPF/CNPJ inválido.");
  return errors;
}

export function createProtocol(date = new Date(), sequence = 1, leadCode = "") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Sao_Paulo"
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "";
  const dateKey = `${get("year")}${get("month")}${get("day")}`;
  const sequenceKey = String(Math.max(Number(sequence) || 1, 1)).padStart(6, "0");
  const code = sanitizeText(leadCode || `LD${sequenceKey.slice(-4)}`, 16).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `PLT-${dateKey}-${sequenceKey}-${code}`;
}

export function createCorrectionNumber(year = new Date().getFullYear(), sequence = 1) {
  return `CR-${year}-${String(Math.max(Number(sequence) || 1, 1)).padStart(6, "0")}`;
}

export function roleCan(action, role, context = {}) {
  // Qualquer conta autenticada e ativa pode cadastrar um lead. Depois da
  // criação, o autor também pode ler e continuar salvando o próprio cadastro,
  // independentemente do perfil operacional atribuído à conta.
  if (action === "lead.create") return Boolean(context.uid);
  if (["lead.read", "lead.autosave"].includes(action) && context.ownerSdrId === context.uid) return true;
  if ([SDR_ROLES.ADMIN, SDR_ROLES.MANAGER].includes(role)) return true;
  if (role === SDR_ROLES.SDR) {
    if (["qualification.edit", "contract.edit", "analysis.create", "document.create", "consent.create", "assignment.create"].includes(action)) {
      return !context.ownerSdrId || context.ownerSdrId === context.uid;
    }
    return action === "lead.read" && context.ownerSdrId === context.uid;
  }
  if ([SDR_ROLES.CONSULTANT, SDR_ROLES.ANALYST].includes(role)) {
    if (["lead.read", "contact.create", "comment.create", "assignment.accept", "assignment.return", "outcome.create"].includes(action)) {
      return context.assignedConsultantId === context.uid;
    }
  }
  return false;
}
