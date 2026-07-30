const TOLERANCIA_MONETARIA_PADRAO = 1;

function texto(valor) {
  return String(valor ?? "").trim();
}

function numero(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : Number.NaN;

  const bruto = texto(valor).replace(/[^\d,.\-]/g, "");
  if (!bruto) return Number.NaN;

  const ultimaVirgula = bruto.lastIndexOf(",");
  const ultimoPonto = bruto.lastIndexOf(".");
  let normalizado = bruto;

  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    const decimal = ultimaVirgula > ultimoPonto ? "," : ".";
    const milhar = decimal === "," ? "." : ",";
    normalizado = bruto.split(milhar).join("").replace(decimal, ".");
  } else if (ultimaVirgula >= 0) {
    normalizado = bruto.replace(/\./g, "").replace(",", ".");
  } else if ((bruto.match(/\./g) || []).length > 1) {
    normalizado = bruto.replace(/\./g, "");
  }

  const resultado = Number.parseFloat(normalizado);
  return Number.isFinite(resultado) ? resultado : Number.NaN;
}

function numeroOuZero(valor) {
  const resultado = numero(valor);
  return Number.isFinite(resultado) ? resultado : 0;
}

function arredondarMoeda(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function parcelaPrice(principal, taxaMensal, quantidadeParcelas) {
  if (!Number.isFinite(principal) || principal < 0) {
    throw new Error("O principal do recálculo deve ser um valor monetário válido.");
  }
  if (!Number.isFinite(taxaMensal) || taxaMensal < 0) {
    throw new Error("A taxa mensal deve ser válida e não negativa.");
  }
  if (!Number.isInteger(quantidadeParcelas) || quantidadeParcelas <= 0) {
    throw new Error("A quantidade de parcelas deve ser um número inteiro positivo.");
  }
  if (taxaMensal === 0) return principal / quantidadeParcelas;
  return principal * taxaMensal / (1 - ((1 + taxaMensal) ** -quantidadeParcelas));
}

function exigirNumeroPositivo(dados, chave, rotulo) {
  const valor = numero(dados[chave]);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error(`${rotulo} deve ser informado com um valor maior que zero.`);
  }
  return valor;
}

function exigirInteiroPositivo(dados, chave, rotulo) {
  const valor = numero(dados[chave]);
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(`${rotulo} deve ser informado com um número inteiro maior que zero.`);
  }
  return valor;
}

function calcularMotorCdc(dados = {}) {
  const valorVeiculo = exigirNumeroPositivo(dados, "valorBem", "O valor do veículo");
  const valorEntrada = numeroOuZero(dados.valorEntrada);
  const iof = numeroOuZero(dados.valorIof);
  const iofAdicional = numeroOuZero(dados.valorIofAdicional);
  const valorFinanciadoBanco = exigirNumeroPositivo(
    dados,
    "valorFinanciadoBruto",
    "O valor financiado pelo banco",
  );
  const parcelaControversa = exigirNumeroPositivo(
    dados,
    "valorPrestacaoContratual",
    "A parcela controversa",
  );
  const quantidadeParcelas = exigirInteiroPositivo(
    dados,
    "quantidadeParcelas",
    "A quantidade de parcelas",
  );
  const parcelasPagasInformadas = numeroOuZero(dados.parcelasPagas);
  const parcelasPagas = Math.min(
    quantidadeParcelas,
    Math.max(0, Math.trunc(parcelasPagasInformadas)),
  );
  const taxaMensalPercentual = exigirNumeroPositivo(
    dados,
    "taxaJurosMensal",
    "A taxa de juros mensal",
  );
  const taxaMensal = taxaMensalPercentual / 100;

  if (valorEntrada < 0 || iof < 0 || iofAdicional < 0) {
    throw new Error("Entrada e IOF não podem ter valores negativos.");
  }
  if (valorEntrada >= valorVeiculo) {
    throw new Error("A entrada deve ser menor que o valor do veículo.");
  }

  const tarifas = {
    seguro: numeroOuZero(dados.valorSeguro)
      + numeroOuZero(dados.valorSeguroPrestamista)
      + numeroOuZero(dados.valorSeguroBem),
    cadastro: numeroOuZero(dados.valorTarifaCadastro),
    avaliacao: numeroOuZero(dados.valorAvaliacaoBem),
    registro: numeroOuZero(dados.valorRegistroContrato),
    servicosTerceiros: numeroOuZero(dados.valorServicosTerceiros),
  };
  const totalTarifas = Object.values(tarifas).reduce((total, valor) => total + valor, 0);
  const novoValorFinanciadoPorExpurgo = valorFinanciadoBanco - totalTarifas;
  const novoValorFinanciadoPorComposicao = valorVeiculo - valorEntrada + iof + iofAdicional;
  const divergenciaBases = novoValorFinanciadoPorExpurgo - novoValorFinanciadoPorComposicao;
  const tolerancia = Math.max(
    0,
    numeroOuZero(dados.toleranciaConferencia) || TOLERANCIA_MONETARIA_PADRAO,
  );
  const basesConferem = Math.abs(divergenciaBases) <= tolerancia;

  if (novoValorFinanciadoPorExpurgo <= 0) {
    throw new Error("O total das tarifas não pode ser igual ou superior ao valor financiado.");
  }

  const parcelaIncontroversaExata = parcelaPrice(
    novoValorFinanciadoPorExpurgo,
    taxaMensal,
    quantidadeParcelas,
  );
  const parcelaIncontroversa = arredondarMoeda(parcelaIncontroversaExata);
  const diferencaMensal = arredondarMoeda(parcelaControversa - parcelaIncontroversa);
  const prejuizoTotalJuros = arredondarMoeda(diferencaMensal * quantidadeParcelas);
  const diferencaParcelasPagas = arredondarMoeda(diferencaMensal * parcelasPagas);
  const multiplicadorSolicitado = numero(dados.multiplicadorRestituicao);
  const multiplicadorRestituicao = [1, 2].includes(multiplicadorSolicitado)
    ? multiplicadorSolicitado
    : 2;
  const tarifasRestituicao = arredondarMoeda(totalTarifas * multiplicadorRestituicao);
  const jurosRestituicao = arredondarMoeda(prejuizoTotalJuros * multiplicadorRestituicao);
  const jurosPagosRestituicao = arredondarMoeda(
    diferencaParcelasPagas * multiplicadorRestituicao,
  );
  const proveitoEconomicoTotal = arredondarMoeda(tarifasRestituicao + jurosRestituicao);
  const taxaAnualEfetiva = (((1 + taxaMensal) ** 12) - 1) * 100;

  const parcelaReferencia = numero(dados.valorPrestacaoRecalculadaReferencia);
  const divergenciaParcelaReferencia = Number.isFinite(parcelaReferencia)
    ? arredondarMoeda(parcelaReferencia - parcelaIncontroversa)
    : null;

  const avisos = [];
  if (!basesConferem) {
    avisos.push(
      `As duas formas de apuração do novo valor financiado divergem em R$ ${Math.abs(arredondarMoeda(divergenciaBases)).toFixed(2)}.`,
    );
  }
  if (diferencaMensal < 0) {
    avisos.push("A parcela recalculada ficou superior à parcela contratual.");
  }
  if (
    Number.isFinite(parcelasPagasInformadas)
    && parcelasPagasInformadas !== parcelasPagas
  ) {
    avisos.push("A quantidade de parcelas pagas foi ajustada aos limites do contrato.");
  }
  if (
    Number.isFinite(parcelaReferencia)
    && Math.abs(divergenciaParcelaReferencia) > tolerancia
  ) {
    avisos.push("A parcela de referência informada não coincide com a fórmula Price.");
  }

  return {
    valorVeiculo: arredondarMoeda(valorVeiculo),
    valorEntrada: arredondarMoeda(valorEntrada),
    iof: arredondarMoeda(iof),
    iofAdicional: arredondarMoeda(iofAdicional),
    valorFinanciadoBanco: arredondarMoeda(valorFinanciadoBanco),
    tarifas: Object.fromEntries(
      Object.entries(tarifas).map(([chave, valor]) => [chave, arredondarMoeda(valor)]),
    ),
    totalTarifas: arredondarMoeda(totalTarifas),
    novoValorFinanciadoPorExpurgo: arredondarMoeda(novoValorFinanciadoPorExpurgo),
    novoValorFinanciadoPorComposicao: arredondarMoeda(novoValorFinanciadoPorComposicao),
    divergenciaBases: arredondarMoeda(divergenciaBases),
    basesConferem,
    toleranciaConferencia: tolerancia,
    taxaMensalPercentual,
    taxaMensal,
    taxaAnualEfetiva,
    quantidadeParcelas,
    parcelasPagas,
    parcelaControversa: arredondarMoeda(parcelaControversa),
    parcelaIncontroversa,
    parcelaIncontroversaExata,
    diferencaMensal,
    prejuizoTotalJuros,
    diferencaParcelasPagas,
    multiplicadorRestituicao,
    tarifasRestituicao,
    jurosRestituicao,
    jurosPagosRestituicao,
    proveitoEconomicoTotal,
    parcelaReferencia: Number.isFinite(parcelaReferencia)
      ? arredondarMoeda(parcelaReferencia)
      : null,
    divergenciaParcelaReferencia,
    avisos,
  };
}

export {
  arredondarMoeda,
  calcularMotorCdc,
  numero,
  parcelaPrice,
};
