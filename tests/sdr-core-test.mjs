import assert from "node:assert/strict";
import {
  SDR_STATUSES,
  assertTransition,
  calculateInterestScore,
  calculateRemainingInstallments,
  calculateSimulation,
  createCorrectionNumber,
  createProtocol,
  formatCpfCnpj,
  formatPhone,
  getForwardingMissingFields,
  isValidCpf,
  maskPhone,
  roleCan,
  validateLeadRegistration
} from "../src/sdr/sdr-core.js";
import { isNamedSdrEmail, resolveAccountRole } from "../api/sdr.js";

assert.equal(formatPhone("5511987654321"), "(11) 98765-4321");
assert.equal(maskPhone("5511987654321"), "(11) 98•••••-21");
assert.equal(formatCpfCnpj("52998224725"), "529.982.247-25");
assert.equal(isValidCpf("529.982.247-25"), true);
assert.equal(isValidCpf("111.111.111-11"), false);

assert.equal(calculateRemainingInstallments(48, 12), 36);
assert.throws(() => calculateRemainingInstallments(12, 13), /superar/);

assert.deepEqual(calculateInterestScore({
  compatibility: 25,
  pain: 20,
  urgency: 20,
  intention: 16,
  documents: 10,
  contact: 5
}), {
  score: 96,
  classification: "Quente",
  breakdown: { compatibility: 25, pain: 20, urgency: 20, intention: 16, documents: 10, contact: 5 }
});
assert.equal(calculateInterestScore({ compatibility: 25, pain: 20, urgency: 5 }).classification, "Morno");
assert.equal(calculateInterestScore({ compatibility: 10 }).classification, "Frio");

assert.deepEqual(calculateSimulation({
  currentInstallment: "R$ 1.000,00",
  totalInstallments: 48,
  paidInstallments: 12
}, {
  reductionPercentage: 20,
  installmentsRule: 36,
  otherReductions: 500,
  roundingRule: "cent",
  version: 3
}), {
  situation: "APROVADA",
  currentInstallment: 1000,
  estimatedInstallment: 800,
  installmentReduction: 200,
  installmentsUsed: 36,
  estimatedRefund: 7200,
  totalContractReduction: 7700,
  ruleVersion: 3,
  calculationData: {
    reductionPercentage: 20,
    referenceRate: 0,
    remainingInstallments: 36,
    otherReductions: 500,
    roundingRule: "cent"
  }
});
assert.throws(() => calculateSimulation({
  currentInstallment: 1000,
  totalInstallments: 12,
  paidInstallments: 1
}, { reductionPercentage: 0 }), /percentual/);

assert.equal(createProtocol(new Date("2026-07-28T12:00:00-03:00"), 7, "LDAB12"), "PLT-20260728-000007-LDAB12");
assert.equal(createCorrectionNumber(2026, 15), "CR-2026-000015");
assert.equal(assertTransition("Novo lead", "Em qualificação"), true);
assert.throws(() => assertTransition("Novo lead", "LEAD APROVADO"), /não permitida/);
assert.equal(SDR_STATUSES.includes("Sem contato"), false);

assert.equal(resolveAccountRole({ email: "roberta@platino.com" }), "sdr");
assert.equal(resolveAccountRole({ email: "comercial@platino.com" }), "sdr");
assert.equal(resolveAccountRole({ email: "maria.sdr@platino.com" }), "sdr");
assert.equal(resolveAccountRole({ email: "giullian@platino.com" }), "consultant");
assert.equal(resolveAccountRole({ email: "nicolas@platino.com" }), "consultant");
assert.equal(resolveAccountRole({ email: "isabela@platino.com" }), "manager");
assert.equal(resolveAccountRole({ email: "vanessa@platino.com" }), "manager");
assert.equal(resolveAccountRole({ email: "tafarel@platino.com", role: "admin" }), "admin");
assert.equal(isNamedSdrEmail("nome.sdr@platino.com"), true);
assert.equal(isNamedSdrEmail("nome@platino.com"), false);

assert.equal(validateLeadRegistration({
  fullName: "Cliente de teste",
  phone: "(11) 98765-4321",
  origin: "Site",
  cpfCnpj: "529.982.247-25",
  email: "cliente@example.com"
}).length, 0);

const readyLead = {
  fullName: "Cliente de teste",
  phone: "(11) 98765-4321",
  cpfCnpj: "529.982.247-25",
  qualification: {
    answers: [
      { answer: "Resposta 1" },
      { answer: "Resposta 2" },
      { answer: "Resposta 3" },
      { notInformed: true }
    ],
    sdrSummary: "Resumo registrado."
  },
  contract: { contractType: "Carro", bankId: "banco-do-brasil" },
  analysis: { totalContractReduction: 1000 },
  analysisDocument: { fileHash: "hash-sha256-do-documento" },
  consent: { answer: "Sim" },
  assignment: { consultantId: "consultor-1" }
};
assert.deepEqual(getForwardingMissingFields(readyLead), []);
assert.equal(roleCan("lead.create", "sdr", { uid: "sdr-1" }), true);
assert.equal(roleCan("lead.read", "consultant", { uid: "c-1", assignedConsultantId: "c-1" }), true);
assert.equal(roleCan("lead.read", "consultant", { uid: "c-2", assignedConsultantId: "c-1" }), false);
assert.equal(roleCan("lead.outcome", "sdr", { uid: "sdr-1", ownerSdrId: "sdr-1" }), false);

console.log("SDR core: validações, cálculo, status, máscaras e permissões aprovados.");
