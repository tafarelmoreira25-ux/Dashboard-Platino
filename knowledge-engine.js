(function () {
    'use strict';

    const STOP_WORDS = new Set([
        'a', 'ao', 'aos', 'as', 'com', 'como', 'da', 'das', 'de', 'do', 'dos',
        'e', 'ela', 'ele', 'em', 'essa', 'esse', 'esta', 'este', 'eu', 'foi',
        'isso', 'me', 'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'por',
        'qual', 'que', 'se', 'sem', 'sobre', 'tem', 'ter', 'um', 'uma'
    ]);

    const SYNONYMS = {
        'advogada': ['advogado', 'juridico'],
        'apreender': ['apreensao', 'busca'],
        'atrasada': ['atraso', 'inadimplencia'],
        'atrasadas': ['atraso', 'inadimplencia'],
        'boleto': ['parcela', 'pagamento'],
        'cancelamento': ['cancelar', 'distrato', 'desistir'],
        'cancelar': ['cancelamento', 'distrato', 'desistir'],
        'carro': ['veiculo', 'financiamento'],
        'cobrar': ['cobranca', 'pagamento'],
        'desistir': ['distrato', 'cancelamento'],
        'documentacao': ['documento', 'documentos'],
        'funciona': ['funcionamento', 'processo'],
        'juros': ['taxa', 'abusivo', 'revisao'],
        'pagar': ['pagamento', 'parcela'],
        'processar': ['processual', 'judicial'],
        'reembolso': ['devolucao', 'distrato'],
        'renegociar': ['negociacao', 'acordo'],
        'segunda': ['via', 'contrato'],
        'tomar': ['apreensao', 'busca'],
        'veiculo': ['carro', 'financiamento']
    };

    let documents = [];
    let idf = new Map();
    let sourceText = '';

    function normalize(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function tokenize(value, expand = true) {
        const base = normalize(value)
            .split(' ')
            .filter(token => token.length > 2 && !STOP_WORDS.has(token));
        const expanded = new Set(base);

        if (expand) {
            base.forEach(token => (SYNONYMS[token] || []).forEach(item => expanded.add(item)));
        }

        return [...expanded];
    }

    function cleanContent(value) {
        return String(value || '')
            .replace(/\n={10,}[\s\S]*$/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function parseKnowledge(text) {
        const parsed = [];
        const sections = [];
        const sectionRegex = /={20,}\s*\r?\n([^\r\n]+)\r?\n={20,}\s*\r?\n([\s\S]*?)(?=\r?\n={20,}|$)/g;
        let sectionMatch;

        while ((sectionMatch = sectionRegex.exec(text)) !== null) {
            const heading = cleanContent(sectionMatch[1]);
            const content = cleanContent(sectionMatch[2]);
            sections.push({
                heading,
                start: sectionMatch.index,
                end: sectionRegex.lastIndex
            });

            const paragraphs = content
                .split(/\r?\n\r?\n+/)
                .map(paragraph => cleanContent(paragraph))
                .filter(paragraph => paragraph.length > 40);

            paragraphs.forEach((paragraph, paragraphIndex) => {
                parsed.push(createDocument(
                    `section-${sections.length - 1}-${paragraphIndex}`,
                    heading,
                    heading,
                    paragraph,
                    'section'
                ));
            });
        }

        const sectionAt = position => {
            const section = sections.find(item => position >= item.start && position <= item.end);
            return section?.heading || 'Base Operacional';
        };

        const qaRegex = /(?:PERGUNTA|OBJEÇÃO):\s*(.+?)\r?\nResposta:\s*([\s\S]*?)(?=\r?\n(?:(?:PERGUNTA|OBJEÇÃO):|={10,}|[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s—–/-]{4,}:)|$)/gi;
        let match;
        let qaIndex = 0;

        while ((match = qaRegex.exec(text)) !== null) {
            const question = cleanContent(match[1]);
            const answer = cleanContent(match[2]);
            parsed.push(createDocument(`qa-${qaIndex++}`, sectionAt(match.index), question, answer, 'qa'));
        }

        const topicRegex = /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9\s—–/().-]{4,}):\s*\r?\n?([\s\S]*?)(?=^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9\s—–/().-]{4,}:\s*$|^={20,}|$)/gm;
        let topicMatch;
        let topicIndex = 0;

        while ((topicMatch = topicRegex.exec(text)) !== null) {
            const title = cleanContent(topicMatch[1]);
            const content = cleanContent(topicMatch[2]);
            if (content.length < 25 || /^(PERGUNTA|OBJEÇÃO)$/i.test(title)) continue;
            parsed.push(createDocument(
                `topic-${topicIndex++}`,
                sectionAt(topicMatch.index),
                title,
                content,
                'topic'
            ));
        }

        return parsed;
    }

    function createDocument(id, section, title, content, type) {
        const normalizedTitle = normalize(title);
        const normalizedContent = normalize(content);
        return {
            id,
            section,
            title,
            content,
            type,
            normalizedTitle,
            normalizedContent,
            titleTokens: tokenize(title, false),
            contentTokens: tokenize(content, false)
        };
    }

    function buildIdf() {
        const occurrences = new Map();
        documents.forEach(doc => {
            new Set([...doc.titleTokens, ...doc.contentTokens]).forEach(token => {
                occurrences.set(token, (occurrences.get(token) || 0) + 1);
            });
        });

        idf = new Map();
        occurrences.forEach((count, token) => {
            idf.set(token, Math.log((documents.length + 1) / (count + 1)) + 1);
        });
    }

    function initialize(text) {
        sourceText = String(text || '');
        documents = parseKnowledge(sourceText);
        buildIdf();
        return { documents: documents.length };
    }

    function countMatches(text, phrase) {
        if (!phrase || phrase.length < 4) return 0;
        let count = 0;
        let position = text.indexOf(phrase);
        while (position !== -1) {
            count += 1;
            position = text.indexOf(phrase, position + phrase.length);
        }
        return count;
    }

    function search(query, limit = 6) {
        if (!documents.length && window.conhecimentoEmpresa) initialize(window.conhecimentoEmpresa);

        const normalizedQuery = normalize(query);
        const queryTokens = tokenize(query);
        if (!normalizedQuery || !queryTokens.length) return [];

        return documents
            .map(doc => {
                let score = 0;

                if (doc.normalizedTitle === normalizedQuery) score += 60;
                if (doc.normalizedTitle.includes(normalizedQuery)) score += 32;
                if (doc.normalizedContent.includes(normalizedQuery)) score += 16;

                queryTokens.forEach(token => {
                    const weight = idf.get(token) || 1;
                    if (doc.titleTokens.includes(token)) score += 5 * weight;
                    if (doc.contentTokens.includes(token)) score += 1.4 * weight;
                });

                const words = normalizedQuery.split(' ');
                for (let index = 0; index < words.length - 1; index += 1) {
                    const bigram = `${words[index]} ${words[index + 1]}`;
                    score += countMatches(doc.normalizedTitle, bigram) * 8;
                    score += countMatches(doc.normalizedContent, bigram) * 3;
                }

                if (doc.type === 'qa') score *= 1.2;
                return { ...doc, score };
            })
            .filter(doc => doc.score >= 3.5)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatText(value) {
        return escapeHtml(value)
            .replace(/\r?\n[•*-]\s*/g, '</p><p class="mt-2">• ')
            .replace(/\r?\n/g, '<br>');
    }

    function localAnswer(query, options = {}) {
        const results = search(query, options.limit || 4);
        if (!results.length) {
            return {
                found: false,
                html: '<p>Não encontrei uma orientação específica na base para essa pergunta. Tente informar o setor, a etapa do processo e o que aconteceu. Se houver risco financeiro, jurídico ou dados divergentes, acione a supervisão.</p>',
                results: []
            };
        }

        const primary = results[0];
        const related = results
            .slice(1, 3)
            .filter(item => item.score >= primary.score * 0.45);
        const relatedHtml = related.length
            ? `<div class="mt-3 pt-3 border-t border-slate-200">
                <p class="font-semibold text-slate-700 mb-2">Também pode ajudar:</p>
                <ul class="list-disc pl-5 space-y-1">${related.map(item =>
                    `<li>${escapeHtml(item.title)}</li>`
                ).join('')}</ul>
            </div>`
            : '';

        return {
            found: true,
            html: `<div>
                <p class="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2">${escapeHtml(primary.section)}</p>
                <p>${formatText(primary.content)}</p>
                ${relatedHtml}
            </div>`,
            results
        };
    }

    function buildContext(query, limit = 6) {
        return search(query, limit)
            .map((item, index) =>
                `[TRECHO ${index + 1} | ${item.section}]\n${item.title}\n${item.content}`
            )
            .join('\n\n');
    }

    window.PlatinoKnowledge = {
        initialize,
        search,
        localAnswer,
        buildContext,
        normalize,
        getStats: () => ({
            characters: sourceText.length,
            documents: documents.length,
            questions: documents.filter(doc => doc.type === 'qa').length
        })
    };

    if (window.conhecimentoEmpresa) initialize(window.conhecimentoEmpresa);
})();
