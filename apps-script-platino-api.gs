/**
 * Cole esta função no mesmo projeto do Google Apps Script que já cria as pastas.
 * Ela localiza as colunas pelo nome, portanto a ordem das colunas pode mudar.
 */
function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("# COMERCIAL");
  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: "Aba # COMERCIAL não encontrada." }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) {
    return ContentService
      .createTextOutput("[]")
      .setMimeType(ContentService.MimeType.JSON);
  }

  const normalizeHeader = value => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  const headers = values[0].map(normalizeHeader);
  const findColumn = aliases => {
    for (const alias of aliases) {
      const index = headers.indexOf(normalizeHeader(alias));
      if (index >= 0) return index;
    }
    return -1;
  };
  const column = {
    cliente: findColumn(["CLIENTE", "NOME DO CLIENTE", "NOME"]),
    dataVenda: findColumn(["DATA DA VENDA", "DATA VENDA", "DATA"]),
    vendedor: findColumn(["VENDEDOR", "CONSULTOR", "RESPONSAVEL", "RESPONSÁVEL"]),
    valor: findColumn(["VALOR DO PROCEDIMENTO", "VALOR DA VENDA", "VALOR VENDA", "VALOR", "VALOR LIQUIDO", "VALOR LÍQUIDO"]),
    grupoAberto: findColumn(["GRUPO ABERTO", "ABERTURA DO GRUPO", "GRUPO"]),
    status: findColumn(["OBSERVAÇÃO", "OBSERVACAO", "STATUS", "SITUACAO", "SITUAÇÃO"]),
    distrato: findColumn(["DISTRATO", "STATUS DISTRATO", "CANCELAMENTO"]),
    comprovante: findColumn(["COMPROVANTE", "COMPROVANTE RECEBIDO", "STATUS COMPROVANTE"]),
    dataComprovante: findColumn(["DATA DO COMPROVANTE", "DATA COMPROVANTE", "HORA DO COMPROVANTE"])
  };
  const cell = (row, index) => index >= 0 ? String(row[index] || "").trim() : "";

  const result = values.slice(1)
    .map(row => ({
      cliente: cell(row, column.cliente),
      dataVenda: cell(row, column.dataVenda),
      vendedor: cell(row, column.vendedor),
      valor: cell(row, column.valor),
      grupoAberto: cell(row, column.grupoAberto),
      status: cell(row, column.status),
      distrato: cell(row, column.distrato),
      comprovante: cell(row, column.comprovante),
      dataComprovante: cell(row, column.dataComprovante)
    }))
    .filter(item => item.cliente);

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
