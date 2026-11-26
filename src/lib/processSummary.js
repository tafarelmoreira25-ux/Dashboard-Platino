// Shared extraction rules retained from the existing Document Central. No AI or network.
function normalizeAdmProcessDate(value) {
            const text = String(value || '').trim();
            const br = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
            const iso = text.match(/\d{4}-\d{2}-\d{2}/);
            return iso?.[0] || '';
        }

export function extractProcessSummary(summary) {
  if (typeof summary !== "string" || !summary.trim()) return {};
    const normalizeLabel = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const cleanPartyValue = value => String(value || '')
        .replace(/\s+(?:advogad[oa]s?|adv\.?|patrono|procurador)[\s\S]*$/i, '')
        .trim();
    const summaryLines = summary.split(/\r?\n/);
    const nextSummaryLine = index => {
        for (let next = index + 1; next < summaryLines.length; next += 1) {
            const value = String(summaryLines[next] || '').trim();
            if (value) return value;
        }
        return '';
    };
    const line = (labels, options = {}) => {
        const regex = new RegExp(`^\\s*(?:[-*•]\\s*)?(${labels})(.*)$`, 'i');
        for (let index = 0; index < summaryLines.length; index += 1) {
            const match = String(summaryLines[index] || '').trim().match(regex);
            if (!match) continue;
            const label = normalizeLabel(match[1]);
            if (options.ignoreLabel?.test(label)) continue;
            const rest = String(match[2] || '').trim();
            if (/^[:\-–—]\s*\S/.test(rest)) return rest.replace(/^[:\-–—]\s*/, '').trim();
            if (!rest || rest.startsWith('/') || /^[:\-–—]\s*$/.test(rest)) return nextSummaryLine(index);
        }
        return '';
    };
    const section = (start, ends) => {
        const match = summary.match(new RegExp(`(?:^|[\\n\\r])\\s*(?:[-*•]\\s*)?(?:${start})(?:\\s*[:\\-–—]\\s*)?([\\s\\S]*?)(?=\\n\\s*(?:[-*•]\\s*)?(?:${ends})(?:\\s*[:\\-–—]|\\s*(?:\\n|$))|$)`, 'i'));
        return match?.[1]?.trim() || '';
    };
    const normalizedSummary = normalizeLabel(summary);
    const extractJusticeGratuita = () => {
        const mentions = normalizedSummary.match(/[^.!?\n]*(?:justica gratuita|assistencia judiciaria|gratuidade da justica)[^.!?\n]*/g) || [];
        const context = mentions.join(' ');
        if (!context) return '';
        if (/(?:nao\s+(?:foi\s+)?(?:concedid[ao]|deferid[ao]|aceit[ao]|reconhecid[ao])|indeferid[ao]|negad[ao]|rejeitad[ao]|sem\s+(?:o\s+)?beneficio|beneficio\s+nao\s+concedido)/.test(context)) return 'Não';
        if (/(?:deferid[ao]|concedid[ao]|aceit[ao]|reconhecid[ao]|beneficio\s+concedido)/.test(context)) return 'Sim';
        return line('justiça gratuita|assistência judiciária|gratuidade da justiça');
    };
    const lawyer = side => {
        const author = side === 'author';
        const sideLabels = author
            ? '(?:cliente|autor(?:a)?|parte autora|polo ativo|requerente)'
            : '(?:banco|réu|ré|parte ré|polo passivo|requerido|instituição financeira)';
        return line(`advogad[oa]s?(?:\\(a\\))? d[oa] ${sideLabels}|advogad[oa]s?(?:\\(a\\))? ${sideLabels}|adv\\.? ${sideLabels}|patrono(?:\\(a\\))? d[oa] ${sideLabels}|procurador(?:a)? d[oa] ${sideLabels}`);
    };
    const values = {
        numeroProcesso: line('número do processo(?:\\s*/\\s*protocolo)?|processo(?:\\s*/\\s*protocolo)?') || summary.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0] || '',
        origem: line('origem|tribunal|vara'),
        sigilo: line('segredo ou sigilo|sigilo'),
        justicaGratuita: extractJusticeGratuita(),
        dataDistribuicao: normalizeAdmProcessDate(line('data da distribuição|distribuição')),
        cliente: cleanPartyValue(line('nome do cliente|polo ativo|autor(?:a)?|cliente|parte autora|requerente', { ignoreLabel: /advogad|adv\.|patrono|procurador/ })),
        banco: cleanPartyValue(line('polo passivo|réu|parte ré|instituição financeira|banco|requerido', { ignoreLabel: /advogad|adv\.|patrono|procurador/ })),
        advogadoCliente: lawyer('author'),
        advogadoBanco: lawyer('bank'),
        assunto: line('assunto(?:\\s*/\\s*natureza da ação)?|classe|natureza'),
        statusAtual: section('status atual|situação atual', 'atualização processual|resumo processual|data da última movimentação|última movimentação|próximos passos|anexos')
            || section('atualização processual|resumo processual', 'última movimentação|próximos passos|anexos'),
        dataUltimaMovimentacao: normalizeAdmProcessDate(line('data da última movimentação|última movimentação em')),
        descricaoUltimaMovimentacao: section('descrição da última movimentação|última movimentação', 'próximos passos|anexos|data da última consulta|data da consulta|hora da consulta'),
        dataConsulta: normalizeAdmProcessDate(line('data da última consulta|data da consulta')),
        horaConsulta: line('hora da consulta').match(/^\d{1,2}:\d{2}$/)?.[0] || '',
        proximosPassos: section('próximos passos', 'anexos|advogado responsável|link'),
        anexosProcesso: line('link (?:dos |de )?anexos|anexos(?: em processo)?|documentos anexos')
            || section('anexos(?: em processo)?|documentos anexos', 'representante responsável|responsável pelo acompanhamento|advogado responsável|link|fim').match(/https?:\/\/[^\s]+/i)?.[0] || '',
        advogadoResponsavel: line('representante responsável(?: pelo acompanhamento)?|responsável (?:pela consulta|pelo acompanhamento)|assistente jurídico|advogado responsável'),
        linkProcesso: line('link (?:para )?(?:consulta das movimentações|do processo|da consulta)|consulta do processo')
            || summary.match(/https?:\/\/[^\s]+/i)?.[0] || ''
    };


  return values;
}
