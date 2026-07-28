import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../api/_firebase-admin.js";

const banks = [
  "Banco do Brasil",
  "Caixa Econômica Federal",
  "Itaú Unibanco",
  "Bradesco",
  "Santander",
  "Banco Safra",
  "BTG Pactual",
  "Banco BV",
  "Banco PAN",
  "Banco Daycoval",
  "Banco BMG",
  "Banco Inter",
  "Nubank",
  "C6 Bank",
  "Sicoob",
  "Sicredi",
  "Banrisul",
  "Banco do Nordeste",
  "Banco da Amazônia",
  "Banco Mercantil",
  "Banco Original",
  "Banco Rendimento",
  "Banco Alfa",
  "Banco Volkswagen",
  "Banco Toyota",
  "Banco Honda",
  "Banco Mercedes-Benz",
  "Banco GM",
  "Banco CNH Industrial",
  "Outro"
];

async function seedBanks() {
  const db = adminDb();
  const batch = db.batch();
  banks.forEach((name, index) => {
    const id = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    batch.set(db.collection("sdrBankCatalog").doc(id), {
      id,
      name,
      isActive: true,
      displayOrder: index + 1,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
  await batch.commit();
}

async function seedOptionalDefaultRule() {
  const percentage = Number(process.env.SDR_DEFAULT_REDUCTION_PERCENTAGE);
  if (!(percentage > 0 && percentage < 100)) {
    console.log("Regra financeira não criada: defina SDR_DEFAULT_REDUCTION_PERCENTAGE com um percentual validado pela gestão.");
    return;
  }
  const db = adminDb();
  const reference = db.collection("sdrSimulationRules").doc("default-v1");
  const snapshot = await reference.get();
  if (snapshot.exists) {
    console.log("A regra default-v1 já existe; nenhuma regra foi sobrescrita.");
    return;
  }
  await reference.set({
    id: reference.id,
    name: "Regra geral validada pela gestão",
    contractType: "",
    bankId: "",
    reductionPercentage: percentage,
    referenceRate: Math.max(Number(process.env.SDR_DEFAULT_REFERENCE_RATE) || 0, 0),
    installmentsRule: Math.max(Number(process.env.SDR_DEFAULT_INSTALLMENTS_RULE) || 0, 0),
    otherReductions: Math.max(Number(process.env.SDR_DEFAULT_OTHER_REDUCTIONS) || 0, 0),
    minimumReduction: Math.max(Number(process.env.SDR_DEFAULT_MINIMUM_REDUCTION) || 0, 0),
    maximumReduction: Math.max(Number(process.env.SDR_DEFAULT_MAXIMUM_REDUCTION) || 0, 0),
    roundingRule: "cent",
    version: 1,
    isActive: true,
    createdBy: "migration-001",
    createdByName: "Migração SDR",
    createdAt: FieldValue.serverTimestamp()
  });
}

await seedBanks();
await seedOptionalDefaultRule();
console.log(`Migração SDR concluída: ${banks.length} instituições sincronizadas.`);
