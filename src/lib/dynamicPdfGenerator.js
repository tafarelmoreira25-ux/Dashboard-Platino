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
import { gerarRelatorioAtualizacaoProcessoPdf } from "./dynamicPdf/relatorioAtualizacaoProcessoPdf.js";
import { gerarLaudoPericialContabilPdf } from "./dynamicPdf/laudoPericialContabilPdf.js";
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

function extrairResumoProcessual(resumo) {
  const conteudo = texto(resumo);
  const linhas = conteudo.split(/\r?\n/);
  const normalizar = (valor) => texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const limparParte = (valor) => texto(valor)
    .replace(/\s+(?:advogad[oa]s?|adv\.?|patrono|procurador)[\s\S]*$/i, "")
    .trim();
  const proximaLinha = (indiceAtual) => {
    for (let indice = indiceAtual + 1; indice < linhas.length; indice += 1) {
      const valor = texto(linhas[indice]);
      if (valor) return valor;
    }
    return "";
  };
  const campo = (rotulos, opcoes = {}) => {
    const padrao = new RegExp(`^\\s*(?:[-*•]\\s*)?(${rotulos})(.*)$`, "i");
    for (let indice = 0; indice < linhas.length; indice += 1) {
      const match = texto(linhas[indice]).match(padrao);
      if (!match) continue;
      const rotulo = normalizar(match[1]);
      if (opcoes.ignorarRotulo?.test(rotulo)) continue;
      const resto = texto(match[2]);
      if (/^[:\-–—]\s*\S/.test(resto)) return texto(resto.replace(/^[:\-–—]\s*/, ""));
      if (!resto || resto.startsWith("/") || /^[:\-–—]\s*$/.test(resto)) return proximaLinha(indice);
    }
    return "";
  };
  const secao = (inicio, fins) => {
    const padrao = new RegExp(`(?:^|[\\n\\r])\\s*(?:[-*•]\\s*)?(?:${inicio})(?:\\s*[:\\-–—]\\s*)?([\\s\\S]*?)(?=\\n\\s*(?:[-*•]\\s*)?(?:${fins})(?:\\s*[:\\-–—]|\\s*(?:\\n|$))|$)`, "i");
    return texto(conteudo.match(padrao)?.[1]);
  };
  const normalizado = normalizar(conteudo);
  const interpretarJusticaGratuita = () => {
    const mencoes = normalizado.match(/[^.!?\n]*(?:justica gratuita|assistencia judiciaria|gratuidade da justica)[^.!?\n]*/g) || [];
    const contexto = mencoes.join(" ");
    if (!contexto) return "";
    if (/(?:nao\s+(?:foi\s+)?(?:concedid[ao]|deferid[ao]|aceit[ao]|reconhecid[ao])|indeferid[ao]|negad[ao]|rejeitad[ao]|sem\s+(?:o\s+)?beneficio|beneficio\s+nao\s+concedido)/.test(contexto)) return "Não";
    if (/(?:deferid[ao]|concedid[ao]|aceit[ao]|reconhecid[ao]|beneficio\s+concedido)/.test(contexto)) return "Sim";
    return campo("justi(?:ç|c)a gratuita|assist(?:ê|e)ncia judici(?:á|a)ria|gratuidade da justi(?:ç|c)a");
  };
  const identificarAdvogado = (parteAutora) => {
    const parte = parteAutora
      ? "(?:cliente|autor(?:a)?|parte autora|polo ativo|requerente)"
      : "(?:banco|r(?:é|e)u|r(?:é|e)|parte r(?:é|e)|polo passivo|requerido|institui(?:ç|c)(?:ã|a)o financeira)";
    return campo(`advogad[oa]s?(?:\\(a\\))? d[oa] ${parte}|advogad[oa]s?(?:\\(a\\))? ${parte}|adv\\.? ${parte}|patrono(?:\\(a\\))? d[oa] ${parte}|procurador(?:a)? d[oa] ${parte}`);
  };
  return {
    numeroProcesso: campo("n(?:ú|u)mero do processo(?:\\s*/\\s*protocolo)?|processo(?:\\s*/\\s*protocolo)?") || texto(conteudo.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0]),
    origem: campo("origem|tribunal|vara"),
    sigilo: campo("segredo ou sigilo|sigilo"),
    justicaGratuita: interpretarJusticaGratuita(),
    dataDistribuicao: campo("data da distribui(?:ç|c)(?:ã|a)o|distribui(?:ç|c)(?:ã|a)o"),
    cliente: limparParte(campo("nome do cliente|polo ativo|autor(?:a)?|cliente|parte autora|requerente", { ignorarRotulo: /advogad|adv\.|patrono|procurador/ })),
    banco: limparParte(campo("polo passivo|r(?:é|e)u|parte r(?:é|e)|institui(?:ç|c)(?:ã|a)o financeira|banco|requerido", { ignorarRotulo: /advogad|adv\.|patrono|procurador/ })),
    advogadoCliente: identificarAdvogado(true),
    advogadoBanco: identificarAdvogado(false),
    assunto: campo("assunto(?:\\s*/\\s*natureza da a(?:ç|c)(?:ã|a)o)?|classe|natureza"),
    statusAtual: secao("status atual|situa(?:ç|c)(?:ã|a)o atual", "atualiza(?:ç|c)(?:ã|a)o processual|resumo processual|data da (?:ú|u)ltima movimenta(?:ç|c)(?:ã|a)o|(?:ú|u)ltima movimenta(?:ç|c)(?:ã|a)o|pr(?:ó|o)ximos passos|anexos")
      || secao("atualiza(?:ç|c)(?:ã|a)o processual|resumo processual", "(?:ú|u)ltima movimenta(?:ç|c)(?:ã|a)o|pr(?:ó|o)ximos passos|anexos"),
    atualizacaoProcessual: secao("atualiza(?:ç|c)(?:ã|a)o processual|resumo processual", "(?:ú|u)ltima movimenta(?:ç|c)(?:ã|a)o|pr(?:ó|o)ximos passos|anexos"),
    dataUltimaMovimentacao: campo("data da (?:ú|u)ltima movimenta(?:ç|c)(?:ã|a)o|(?:ú|u)ltima movimenta(?:ç|c)(?:ã|a)o em"),
    descricaoUltimaMovimentacao: secao("descri(?:ç|c)(?:ã|a)o da (?:ú|u)ltima movimenta(?:ç|c)(?:ã|a)o|(?:ú|u)ltima movimenta(?:ç|c)(?:ã|a)o", "pr(?:ó|o)ximos passos|anexos|data da (?:ú|u)ltima consulta|data da consulta|hora da consulta"),
    dataConsulta: campo("data da (?:ú|u)ltima consulta|data da consulta"),
    horaConsulta: texto(campo("hora da consulta")).match(/^\d{1,2}:\d{2}$/)?.[0] || "",
    proximosPassos: secao("pr(?:ó|o)ximos passos", "anexos|advogado respons(?:á|a)vel|link"),
    anexosProcesso: campo("link (?:dos |de )?anexos|anexos(?: em processo)?|documentos anexos")
      || texto(secao("anexos(?: em processo)?|documentos anexos", "representante respons(?:á|a)vel|respons(?:á|a)vel pelo acompanhamento|advogado respons(?:á|a)vel|link|fim").match(/https?:\/\/[^\s]+/i)?.[0]),
    advogadoResponsavel: campo("representante respons(?:á|a)vel(?: pelo acompanhamento)?|respons(?:á|a)vel (?:pela consulta|pelo acompanhamento)|assistente jur(?:í|i)dico|advogado respons(?:á|a)vel"),
    linkProcesso: campo("link (?:para )?(?:consulta das movimenta(?:ç|c)(?:õ|o)es|do processo|da consulta)|consulta do processo")
      || texto(conteudo.match(/https?:\/\/[^\s]+/i)?.[0]),
  };
}

export async function gerarPdfDinamico(templateKey, data = {}) {
  const extraido = extrairResumoProcessual(data.resumoProcesso);
  const dadosRelatorio = Object.fromEntries(
    Object.keys({ ...extraido, ...data }).map((chave) => [chave, texto(data[chave]) || texto(extraido[chave])]),
  );
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
    "relatorio-atualizacao-processo-judicial": async () =>
      gerarRelatorioAtualizacaoProcessoPdf({
        ...dadosRelatorio,
        dataConsulta: texto(data.dataConsulta) || texto(dadosRelatorio.dataConsulta) || comum.dataEmissao,
        horaConsulta: texto(data.horaConsulta) || texto(dadosRelatorio.horaConsulta),
        imagemProcesso: data.imagemProcesso,
        codigoValidacao: texto(data.codigoValidacao) || texto(data.numeroDocumento),
      }, {
        assinaturaBytes: await asset("assinatura-manuscrita-rafael.png").catch(() => null),
      }),
    "laudo-pericial-contabil": async () => gerarLaudoPericialContabilPdf({
      ...data,
      numeroDocumento: texto(data.numeroDocumento),
      dataEmissao: texto(data.data) || comum.dataEmissao,
      cidadeEstado: texto(data.cidadeEstado) || "São Paulo/SP",
    }, {
      assinaturaBytes: await asset("perito-denis-assinatura.png"),
    }),
  };

  const gerar = geradores[templateKey];
  if (!gerar) throw new Error(`Modelo dinâmico não configurado: ${templateKey}`);
  return gerar();
}
