import { gerarChargebackPdf } from "./dynamicPdf/chargebackPdf.js";
import { gerarCitacaoJudicialPdf } from "./dynamicPdf/citacaoJudicialPdf.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gerarContestacaoTaxasEmailPdfComAssets } from "./dynamicPdf/contestacaoTaxasEmailPdf.js";
import { gerarDeclaracaoAusenciaCarteiraTrabalhoPdf } from "./dynamicPdf/declaracaoAusenciaCarteiraTrabalhoPdf.js";
import {
  gerarDeclaracaoHipossuficienciaPdf,
  gerarDeclaracaoIsencaoIrpfPdf,
} from "./dynamicPdf/declaracoesPdf.js";
import { gerarIntimacaoExtrajudicialPdf } from "./dynamicPdf/intimacaoExtrajudicialPdf.js";
import { gerarModeloTermoCompromissoPagamentoPdf } from "./dynamicPdf/modeloTermoCompromissoPagamentoPdf.js";
import { gerarNotificacaoExtrajudicialPdf } from "./dynamicPdf/notificacaoExtrajudicialPdf.js";
import { gerarProcuracaoPdf } from "./dynamicPdf/procuracaoPdf.js";
import { gerarTermoCienciaSegurancaPdfComAssets } from "./dynamicPdf/termoCienciaSegurancaPdf.js";
import { gerarTermoCompromissoPagamentoPdf } from "./dynamicPdf/termoCompromissoPagamentoPdf.js";

function texto(valor) {
  return String(valor ?? "").trim();
}

function dataIso(valor, data = {}) {
  const informada = texto(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(informada)) return informada;
  const br = informada.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  if (data.ano && data.mesNumero && data.dia) {
    return `${data.ano}-${texto(data.mesNumero).padStart(2, "0")}-${texto(data.dia).padStart(2, "0")}`;
  }
  const hoje = new Date();
  const offset = hoje.getTimezoneOffset() * 60_000;
  return new Date(hoje.getTime() - offset).toISOString().slice(0, 10);
}

function dadosComuns(data) {
  const estado = texto(data.estado);
  const partesEstado = estado.split("/");
  return {
    ...data,
    nomeCliente: texto(data.cliente),
    cpfCnpj: texto(data.cpf),
    dataEmissao: dataIso(data.dataEmissao || data.data, data),
    genero: texto(data.genero) || "neutro",
    cidade: texto(data.cidade) || partesEstado[0] || "São Paulo",
    uf: texto(data.uf) || partesEstado[1] || "SP",
    localEmissao: texto(data.localEmissao) || estado || "São Paulo/SP",
    orgaoExpedidor: texto(data.orgaoExpedidor) || "SSP/SP",
    exercicios: texto(data.exercicios) || "2023, 2024 e 2025",
  };
}

function asset(nome) {
  return readFile(path.join(process.cwd(), "modelos", nome));
}

export async function gerarPdfDinamico(templateKey, data = {}) {
  const comum = dadosComuns(data);
  const geradores = {
    chargeback: () => gerarChargebackPdf({
      ...comum,
      dataPagamento: dataIso(data.dataPagamento, data),
      valorPagamento: texto(data.valor),
      responsavelDocumento: texto(data.responsavel),
    }),
    "citacao-intimacao-extrajudicial": () => gerarIntimacaoExtrajudicialPdf({
      ...comum,
      dataContrato: dataIso(data.dataContrato, data),
      valorParcelaCorrigido: texto(data.parcelaCorrigida),
      reducaoParcela: texto(data.reducaoParcela),
      valorEstorno: texto(data.estorno),
      reducaoTotal: texto(data.reducaoTotal),
    }),
    "citacao-judicial": () => gerarCitacaoJudicialPdf(comum),
    "contestacao-taxas-email": async () => gerarContestacaoTaxasEmailPdfComAssets({
      ...comum,
      valorSeguro: texto(data.seguro),
      valorRegistroContrato: texto(data.registroContrato),
      valorTarifaAvaliacao: texto(data.tarifaAvaliacao),
      valorTarifaCadastro: texto(data.tarifaCadastro),
      valorDemaisTarifas: texto(data.demaisTarifas),
      valorIof: texto(data.iof),
      valorIofAdicional: texto(data.iofAdicional),
    }, {
      fundoBytes: await asset("contestacao-taxas-email-fundo.jpg"),
      assinaturaBytes: await asset("contestacao-taxas-email-assinatura.png"),
    }),
    "declaracao-ausencia-carteira-trabalho": () =>
      gerarDeclaracaoAusenciaCarteiraTrabalhoPdf(comum),
    "declaracao-hipossuficiencia": () =>
      gerarDeclaracaoHipossuficienciaPdf(comum),
    "declaracao-isencao-irpf": () => gerarDeclaracaoIsencaoIrpfPdf(comum),
    "notificacao-extrajudicial-platino": () => gerarNotificacaoExtrajudicialPdf({
      ...comum,
      valorFinanciamento: texto(data.valor),
      valorFinanciamentoExtenso: texto(data.valorExtenso),
      quantidadeParcelas: texto(data.quantidadeParcelas),
      valorParcela: texto(data.valorParcela),
      valorParcelaExtenso: texto(data.valorParcelaExtenso),
      dataInicioRepresentacao: dataIso(data.dataRepresentacao, data),
    }),
    "procuracao-dra-juliane": () => gerarProcuracaoPdf({
      ...comum,
      numeroContrato: texto(data.contrato),
    }),
    "termo-ciencia-autorizacao-seguranca": async () => gerarTermoCienciaSegurancaPdfComAssets({
      ...comum,
      dataAberturaReclamacao: dataIso(data.dataReclamacao, data),
      numeroProtocolo: texto(data.protocolo),
    }, {
      assinaturaBytes: await asset("termo-ciencia-seguranca-assinatura.png"),
    }),
    "termo-compromisso-pagamento": () => gerarTermoCompromissoPagamentoPdf({
      ...comum,
      valorTotal: texto(data.valor),
      valorTotalExtenso: texto(data.valorExtenso),
    }),
    "modelo-termo-compromisso-pagamento": () =>
      gerarModeloTermoCompromissoPagamentoPdf({
        ...comum,
        produto: texto(data.produto),
        valorTotal: texto(data.valor),
        valorTotalExtenso: texto(data.valorExtenso),
        dataPagamento: texto(data.dataPagamento),
      }),
  };

  const gerar = geradores[templateKey];
  if (!gerar) throw new Error(`Modelo dinâmico não configurado: ${templateKey}`);
  return gerar();
}
