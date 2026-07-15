import {
  criarDocumentoPlatinoCompleto,
  desenharAssinaturaPlatino,
  desenharParagrafoPlatino,
} from "./documentoPlatinoCompletoPdf.js";

function texto(valor) {
  return String(valor || "").trim();
}

function valorMonetario(valor) {
  return texto(valor).replace(/^R\$\s*/i, "");
}

export async function gerarModeloTermoCompromissoPagamentoPdf(dados) {
  const { pdf, pagina, fontes, yInicial } =
    await criarDocumentoPlatinoCompleto(
      "TERMO DE COMPROMISSO PARA PAGAMENTO DE\nDOCUMENTAÇÃO",
    );
  const nomeCliente = texto(dados.nomeCliente);
  let y = yInicial;

  y = desenharParagrafoPlatino({
    pagina,
    fontes,
    y,
    tamanho: 12,
    alturaLinha: 16,
    alinhamento: "justify",
    segmentos: [
      { texto: "Eu," },
      { texto: `${nomeCliente},`, negrito: true },
      { texto: "portador(a) do CPF nº" },
      { texto: `${texto(dados.cpfCnpj)},`, negrito: true },
      {
        texto:
          "declaro para os devidos fins que estou ciente da necessidade de pagamento dos custos referentes à",
      },
      { texto: `${texto(dados.produto)},`, negrito: true },
      { texto: "necessário para a finalização do meu processo." },
    ],
  });

  y -= 42;
  y = desenharParagrafoPlatino({
    pagina,
    fontes,
    y,
    tamanho: 12,
    alturaLinha: 16,
    alinhamento: "justify",
    segmentos: [
      {
        texto:
          "Declaro que me comprometo a realizar o pagamento do valor de R$",
      },
      {
        texto: `${valorMonetario(dados.valorTotal)} (${texto(dados.valorTotalExtenso)}),`,
        negrito: true,
      },
      { texto: "à vista, na data" },
      { texto: `${texto(dados.dataPagamento)}.`, negrito: true },
    ],
  });

  y -= 32;
  y = desenharParagrafoPlatino({
    pagina,
    fontes,
    y,
    tamanho: 12,
    alturaLinha: 16,
    alinhamento: "justify",
    segmentos: [
      {
        texto:
          "Estou ciente de que o pagamento acima mencionado é condição indispensável para que o processo seja finalizado de forma acordada e regular, e que o não cumprimento deste compromisso poderá acarretar na suspensão ou impossibilidade de conclusão do procedimento.",
      },
    ],
  });

  y -= 42;
  y = desenharParagrafoPlatino({
    pagina,
    fontes,
    y,
    tamanho: 12,
    alturaLinha: 16,
    alinhamento: "center",
    segmentos: [{ texto: "Por ser verdade, firmo o presente termo." }],
  });

  y = Math.min(y - 85, 190);
  desenharAssinaturaPlatino(pagina, fontes, nomeCliente, y, 11);

  return pdf.save();
}
