(function () {
    'use strict';

    /*
     * PLATINO KNOWLEDGE ENGINE
     * Motor local de busca, chatbot e interação operacional.
     *
     * Compatível com:
     * 1. Base antiga em texto: window.conhecimentoEmpresa
     * 2. Base nova em JSON: window.PlatinoKnowledgeBase
     * 3. Arquivo JSON carregado em window.basePerguntasRespostasPlatino
     *
     * Ordem recomendada no index.html:
     * <script src="cerebro-platino-organizado.js"></script>
     * <script src="base_perguntas_respostas_platino.js"></script>  opcional
     * <script src="knowledge-engine.js"></script>
     */

    const STOP_WORDS = new Set([
        'a', 'ao', 'aos', 'as', 'com', 'como', 'da', 'das', 'de', 'do', 'dos',
        'e', 'ela', 'ele', 'em', 'essa', 'esse', 'esta', 'este', 'eu', 'foi',
        'isso', 'me', 'minha', 'meu', 'na', 'nas', 'no', 'nos', 'o', 'os', 'ou',
        'para', 'por', 'pra', 'qual', 'quando', 'que', 'quem', 'se', 'sem',
        'sobre', 'tem', 'ter', 'um', 'uma', 'uns', 'umas', 'voce', 'você'
    ]);

    const SYNONYMS = {
        'adm': ['administrativo'],
        'administrativa': ['administrativo'],
        'administrativas': ['administrativo'],
        'advogada': ['advogado', 'juridico', 'jurídico'],
        'advogado': ['juridico', 'jurídico', 'processual'],
        'ajuda': ['suporte', 'orientacao', 'orientação'],
        'anexar': ['subir', 'enviar', 'upload', 'adicionar'],
        'anexo': ['documento', 'arquivo'],
        'apreender': ['apreensao', 'apreensão', 'busca'],
        'assinada': ['assinatura', 'assinado'],
        'assinado': ['assinatura', 'contrato'],
        'atrasada': ['atraso', 'inadimplencia', 'inadimplência'],
        'atrasadas': ['atraso', 'inadimplencia', 'inadimplência'],
        'banco': ['instituicao', 'instituição', 'financeira'],
        'boleto': ['parcela', 'pagamento', 'quitacao', 'quitação'],
        'cancelamento': ['cancelar', 'distrato', 'desistir'],
        'cancelar': ['cancelamento', 'distrato', 'desistir'],
        'carro': ['veiculo', 'veículo', 'financiamento'],
        'charge': ['chargeback', 'contestacao', 'contestação'],
        'chargeback': ['charge', 'contestacao', 'contestação', 'cartao', 'cartão'],
        'cobrar': ['cobranca', 'cobrança', 'pagamento'],
        'comprovante': ['documento', 'residencia', 'residência'],
        'contrato': ['financiamento', 'documento'],
        'correcao': ['correção', 'corrigir', 'ajuste'],
        'corrigir': ['correcao', 'correção', 'ajustar'],
        'desistir': ['distrato', 'cancelamento'],
        'documentacao': ['documentação', 'documento', 'documentos'],
        'documento': ['arquivo', 'pdf', 'documentacao', 'documentação'],
        'drive': ['pasta', 'arquivo', 'documento'],
        'extrajudicial': ['notificacao', 'notificação', 'fora', 'processo'],
        'funciona': ['funcionamento', 'processo', 'procedimento'],
        'gov': ['consumidor', 'protocolo', 'reclamacao', 'reclamação'],
        'hipossuficiencia': ['hipossuficiência', 'declaracao', 'declaração'],
        'imposto': ['ir', 'irpf', 'renda'],
        'juridico': ['jurídico', 'advogado', 'processual'],
        'jurídico': ['juridico', 'advogado', 'processual'],
        'juros': ['taxa', 'abusivo', 'revisao', 'revisão'],
        'laudo': ['parecer', 'pericial', 'perito', 'tecnico', 'técnico'],
        'notificacao': ['notificação', 'extrajudicial'],
        'notificação': ['notificacao', 'extrajudicial'],
        'pagar': ['pagamento', 'parcela'],
        'parecer': ['laudo', 'tecnico', 'técnico', 'pericial'],
        'pdf': ['treinamento', 'manual', 'passo', 'documento'],
        'perito': ['laudo', 'parecer', 'tecnico', 'técnico'],
        'processar': ['processual', 'judicial'],
        'processo': ['judicial', 'processual', 'acao', 'ação'],
        'procuracao': ['procuração', 'documento', 'processual'],
        'procuração': ['procuracao', 'documento', 'processual'],
        'protocolo': ['gov', 'comprovante', 'registro'],
        'reclamacao': ['reclamação', 'gov', 'protocolo'],
        'reclamação': ['reclamacao', 'gov', 'protocolo'],
        'reembolso': ['devolucao', 'devolução', 'distrato'],
        'renegociar': ['negociacao', 'negociação', 'acordo'],
        'segunda': ['via', 'contrato'],
        'seguro': ['apolice', 'apólice', 'prestamista'],
        'senha': ['seguranca', 'segurança', 'acesso'],
        'subir': ['anexar', 'enviar', 'movimentar', 'encaminhar'],
        'taxas': ['tarifas', 'cobrancas', 'cobranças'],
        'tomar': ['apreensao', 'apreensão', 'busca'],
        'veiculo': ['veículo', 'carro', 'financiamento'],
        'veículo': ['veiculo', 'carro', 'financiamento']
    };

    const INTERACTION_RULES = [
        {
            id: 'interacao_saudacao',
            priority: 100,
            patterns: [
                'oi',
                'ola',
                'olá',
                'bom dia',
                'boa tarde',
                'boa noite',
                'tudo bem',
                'e ai',
                'e aí',
                'como vai',
                'como estao as coisas',
                'como estão as coisas',
                'como voce esta',
                'como você está'
            ],
            response: `
                <p>Olá! Tudo bem? Eu sou o assistente interno da Platino.</p>
                <p class="mt-2">Posso te ajudar com dúvidas sobre contratos, CRM, Drive, documentos, GOV.BR, taxas, seguros, laudos, processual, homologação, quitação, distrato, chargeback e demais procedimentos da operação.</p>
                <p class="mt-2">Digite sua dúvida de forma simples, por exemplo: <strong>“como preencher o contrato?”</strong>, <strong>“cliente não quer passar GOV”</strong> ou <strong>“como enviar para o processual?”</strong>.</p>
            `
        },
        {
            id: 'interacao_ajuda',
            priority: 95,
            patterns: [
                'pode me ajudar',
                'preciso de ajuda',
                'me ajuda',
                'me ajude',
                'estou perdido',
                'estou perdida',
                'nao sei o que fazer',
                'não sei o que fazer',
                'estou com duvida',
                'estou com dúvida',
                'tenho uma duvida',
                'tenho uma dúvida',
                'o que eu faço',
                'o que fazer agora'
            ],
            response: `
                <p>Claro, posso te ajudar.</p>
                <p class="mt-2">Me diga qual etapa você está executando agora: contrato, CRM, Drive, abertura de grupo, documentos, GOV.BR, laudo, processual, homologação, quitação, distrato ou chargeback.</p>
                <p class="mt-2">Se a dúvida envolver pagamento, banco, processo judicial, documento divergente, dados sensíveis ou risco para o cliente, procure a supervisão antes de avançar.</p>
            `
        },
        {
            id: 'interacao_entendimento',
            priority: 90,
            patterns: [
                'voce entende',
                'você entende',
                'voce esta entendendo',
                'você está entendendo',
                'voce consegue entender',
                'você consegue entender',
                'consegue me entender',
                'entendeu',
                'esta entendendo',
                'está entendendo',
                'voce entendeu',
                'você entendeu'
            ],
            response: `
                <p>Sim. Consigo entender perguntas escritas de formas diferentes e buscar a orientação mais próxima dentro da base da Platino.</p>
                <p class="mt-2">Para melhorar o resultado, escreva a dúvida com contexto: setor, etapa do cliente, documento envolvido ou erro encontrado.</p>
                <p class="mt-2">Se a resposta não parecer adequada ou a situação for sensível, procure a supervisão para validar o procedimento correto.</p>
            `
        },
        {
            id: 'interacao_supervisao',
            priority: 90,
            patterns: [
                'nao entendi',
                'não entendi',
                'nao encontrei',
                'não encontrei',
                'nao apareceu',
                'não apareceu',
                'resposta errada',
                'nao resolveu',
                'não resolveu',
                'estou confuso',
                'estou confusa',
                'tenho medo de errar',
                'posso chamar supervisao',
                'posso chamar supervisão',
                'preciso chamar supervisao',
                'preciso chamar supervisão'
            ],
            response: `
                <p>Sem problema. Quando a dúvida não estiver clara ou a resposta não resolver totalmente, procure a supervisão.</p>
                <p class="mt-2">Antes de avançar, valide principalmente situações com contrato errado, pagamento, banco, processo judicial, documentos divergentes, dados sensíveis ou risco para o cliente.</p>
                <p class="mt-2">É melhor pausar e confirmar do que movimentar a pasta de forma incorreta.</p>
            `
        },
        {
            id: 'interacao_treinamentos',
            priority: 88,
            patterns: [
                'passo a passo',
                'pdf',
                'pdfs',
                'treinamento',
                'treinamentos',
                'material de apoio',
                'material com imagem',
                'quero ver imagem',
                'tem imagem',
                'manual',
                'tutorial',
                'onde vejo os pdf',
                'onde vejo os pdfs',
                'aba de treinamentos'
            ],
            response: `
                <p>Para mais informações, exemplos visuais e passo a passo com imagens, acesse a aba <strong>Treinamentos</strong>.</p>
                <p class="mt-2">Lá ficam os PDFs e materiais de apoio com procedimentos detalhados para consultar durante a execução.</p>
                <p class="mt-2">Use o chat para dúvidas rápidas e os PDFs para acompanhar o processo completo com imagens.</p>
            `
        },
        {
            id: 'interacao_disponibilidade',
            priority: 85,
            patterns: [
                'o que voce faz',
                'o que você faz',
                'como voce pode ajudar',
                'como você pode ajudar',
                'voce pode me ajudar com algo',
                'você pode me ajudar com algo',
                'eu posso perguntar o que',
                'o que posso perguntar',
                'quais perguntas posso fazer',
                'para que serve esse chat',
                'como usar esse chat',
                'quais assuntos voce responde',
                'quais assuntos você responde'
            ],
            response: `
                <p>Eu posso te ajudar a encontrar orientações internas da Platino de forma rápida.</p>
                <p class="mt-2">Você pode perguntar sobre contrato, CRM, Drive, abertura de grupo, documentos, GOV.BR, taxas, seguro, notificação extrajudicial, laudo, processual, homologação, quitação, distrato, chargeback e atendimento ao cliente.</p>
                <p class="mt-2">Para materiais completos com imagens, consulte também os PDFs na aba <strong>Treinamentos</strong>.</p>
            `
        },
        {
            id: 'interacao_agradecimento',
            priority: 80,
            patterns: [
                'obrigado',
                'obrigada',
                'valeu',
                'perfeito',
                'entendi',
                'certo',
                'beleza',
                'show',
                'ok obrigado',
                'ok obrigada'
            ],
            response: `
                <p>Perfeito. Qualquer nova dúvida, me envie a etapa ou o problema que você encontrou.</p>
                <p class="mt-2">Se precisar de passo a passo com imagens, consulte também os PDFs na aba <strong>Treinamentos</strong>.</p>
            `
        }
    ];

    let documents = [];
    let idf = new Map();
    let sourceText = '';
    let sourceMode = 'empty';

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
            base.forEach(token => {
                (SYNONYMS[token] || []).forEach(item => expanded.add(normalize(item)));
            });
        }

        return [...expanded].filter(Boolean);
    }

    function cleanContent(value) {
        return String(value || '')
            .replace(/\n={10,}[\s\S]*$/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
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
        const safe = escapeHtml(value);
        return safe
            .replace(/\r?\n[•*-]\s*/g, '</p><p class="mt-2">• ')
            .replace(/\r?\n/g, '<br>');
    }

    function compactText(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function createDocument(id, section, title, content, type, meta = {}) {
        const normalizedTitle = normalize(title);
        const normalizedContent = normalize(content);
        const keywords = Array.isArray(meta.keywords) ? meta.keywords.join(' ') : '';

        return {
            id: String(id || `doc-${documents.length + 1}`),
            section: section || 'Base Operacional',
            title: title || 'Orientação interna',
            content: content || '',
            type: type || 'generic',
            meta,
            normalizedTitle,
            normalizedContent,
            normalizedKeywords: normalize(keywords),
            titleTokens: tokenize(title, false),
            contentTokens: tokenize(`${content} ${keywords}`, false)
        };
    }

    function buildJsonDocument(item, index) {
        const id = item.id || `json-${index}`;
        const section = item.modulo || item.categoria || item.setor || 'Base Operacional';
        const questions = Array.isArray(item.perguntas) ? item.perguntas : [];
        const keywords = Array.isArray(item.palavrasChave) ? item.palavrasChave : [];
        const title = questions[0] || item.titulo || item.title || id;
        const answer = item.resposta || item.answer || item.conteudo || '';

        const contentParts = [];

        if (answer) {
            contentParts.push(answer);
        }

        if (item.checklist && Array.isArray(item.checklist) && item.checklist.length) {
            contentParts.push(`CHECKLIST:\n${item.checklist.map(line => `• ${line}`).join('\n')}`);
        }

        if (item.errosComuns && Array.isArray(item.errosComuns) && item.errosComuns.length) {
            contentParts.push(`ERROS COMUNS:\n${item.errosComuns.map(line => `• ${line}`).join('\n')}`);
        }

        if (item.oQueNaoFazer && Array.isArray(item.oQueNaoFazer) && item.oQueNaoFazer.length) {
            contentParts.push(`O QUE NÃO FAZER:\n${item.oQueNaoFazer.map(line => `• ${line}`).join('\n')}`);
        }

        if (item.proximaEtapa) {
            contentParts.push(`PRÓXIMA ETAPA:\n${item.proximaEtapa}`);
        }

        if (item.quandoChamarSupervisao) {
            contentParts.push(`QUANDO CHAMAR SUPERVISÃO:\n${item.quandoChamarSupervisao}`);
        }

        const searchableTitle = [
            title,
            id,
            section,
            ...questions,
            ...keywords
        ].join(' | ');

        const searchableContent = [
            contentParts.join('\n\n'),
            questions.join('\n'),
            keywords.join(', ')
        ].join('\n\n');

        return createDocument(id, section, searchableTitle, searchableContent, 'json', {
            raw: item,
            questions,
            keywords,
            answer,
            displayTitle: title
        });
    }

    function parseJsonKnowledge(value) {
        if (!value) return [];

        let data = value;

        if (typeof value === 'string') {
            try {
                data = JSON.parse(value);
            } catch (error) {
                console.warn('[PlatinoKnowledge] JSON inválido. Usando parser de texto.', error);
                return [];
            }
        }

        if (!Array.isArray(data)) return [];

        return data
            .filter(item => item && typeof item === 'object')
            .map((item, index) => buildJsonDocument(item, index))
            .filter(doc => doc.content && doc.content.trim().length > 0);
    }

    function parseTextKnowledge(text) {
        const parsed = [];
        const source = String(text || '');

        if (!source.trim()) return parsed;

        const sections = [];
        const sectionRegex = /={20,}\s*\r?\n([^\r\n]+)\r?\n={20,}\s*\r?\n([\s\S]*?)(?=\r?\n={20,}|$)/g;
        let sectionMatch;

        while ((sectionMatch = sectionRegex.exec(source)) !== null) {
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
        let qaMatch;
        let qaIndex = 0;

        while ((qaMatch = qaRegex.exec(source)) !== null) {
            const question = cleanContent(qaMatch[1]);
            const answer = cleanContent(qaMatch[2]);

            if (!question || !answer) continue;

            parsed.push(createDocument(
                `qa-${qaIndex++}`,
                sectionAt(qaMatch.index),
                question,
                answer,
                'qa',
                { questions: [question], answer }
            ));
        }

        const intentRegex = /INTENÇÃO:\s*(.+?)\r?\n([\s\S]*?)(?=\r?\n---|\r?\nINTENÇÃO:|\r?\n={20,}|$)/gi;
        let intentMatch;
        let intentIndex = 0;

        while ((intentMatch = intentRegex.exec(source)) !== null) {
            const intentId = cleanContent(intentMatch[1]);
            const block = cleanContent(intentMatch[2]);
            const module = extractField(block, 'MÓDULO') || sectionAt(intentMatch.index);
            const setor = extractField(block, 'SETOR');
            const keywords = extractListField(block, 'PALAVRAS-CHAVE');
            const questions = extractListField(block, 'PERGUNTAS');
            const answer = extractLongField(block, 'RESPOSTA') || '[Resposta não preenchida.]';

            const title = questions[0] || intentId;
            const content = [
                answer,
                extractLongField(block, 'CHECKLIST') ? `CHECKLIST:\n${extractLongField(block, 'CHECKLIST')}` : '',
                extractLongField(block, 'ERROS COMUNS') ? `ERROS COMUNS:\n${extractLongField(block, 'ERROS COMUNS')}` : '',
                extractLongField(block, 'O QUE NÃO FAZER') ? `O QUE NÃO FAZER:\n${extractLongField(block, 'O QUE NÃO FAZER')}` : '',
                extractLongField(block, 'PRÓXIMA ETAPA') ? `PRÓXIMA ETAPA:\n${extractLongField(block, 'PRÓXIMA ETAPA')}` : '',
                extractLongField(block, 'QUANDO CHAMAR SUPERVISÃO') ? `QUANDO CHAMAR SUPERVISÃO:\n${extractLongField(block, 'QUANDO CHAMAR SUPERVISÃO')}` : '',
                questions.join('\n'),
                keywords.join(', ')
            ].filter(Boolean).join('\n\n');

            parsed.push(createDocument(
                intentId || `intent-${intentIndex++}`,
                module,
                [title, intentId, module, setor, questions.join(' | '), keywords.join(', ')].filter(Boolean).join(' | '),
                content,
                'intent',
                {
                    intentId,
                    module,
                    setor,
                    questions,
                    keywords,
                    answer,
                    displayTitle: title
                }
            ));
        }

        const topicRegex = /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9\s—–/().-]{4,}):\s*\r?\n?([\s\S]*?)(?=^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9\s—–/().-]{4,}:\s*$|^={20,}|$)/gm;
        let topicMatch;
        let topicIndex = 0;

        while ((topicMatch = topicRegex.exec(source)) !== null) {
            const title = cleanContent(topicMatch[1]);
            const content = cleanContent(topicMatch[2]);

            if (content.length < 25 || /^(PERGUNTA|OBJEÇÃO|RESPOSTA|PERGUNTAS)$/i.test(title)) continue;

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

    function extractField(block, fieldName) {
        const regex = new RegExp(`${fieldName}:\\s*(.+)`, 'i');
        const match = String(block || '').match(regex);
        return match ? cleanContent(match[1]) : '';
    }

    function extractLongField(block, fieldName) {
        const fields = [
            'MÓDULO', 'MODULO', 'SETOR', 'CATEGORIA', 'NÍVEL', 'NIVEL', 'PRIORIDADE',
            'PALAVRAS-CHAVE', 'PALAVRAS CHAVE', 'PERGUNTAS', 'RESPOSTA',
            'CHECKLIST', 'ERROS COMUNS', 'O QUE NÃO FAZER', 'O QUE NAO FAZER',
            'PRÓXIMA ETAPA', 'PROXIMA ETAPA', 'QUANDO CHAMAR SUPERVISÃO',
            'QUANDO CHAMAR SUPERVISAO', 'RELACIONADOS'
        ];

        const fieldPattern = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nextFields = fields
            .filter(item => normalize(item) !== normalize(fieldName))
            .map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|');

        const regex = new RegExp(`${fieldPattern}:\\s*\\r?\\n?([\\s\\S]*?)(?=\\r?\\n(?:${nextFields}):|$)`, 'i');
        const match = String(block || '').match(regex);
        return match ? cleanContent(match[1]) : '';
    }

    function extractListField(block, fieldName) {
        const value = extractLongField(block, fieldName);
        if (!value) return [];

        if (value.includes(',')) {
            return value
                .split(/,|\r?\n/)
                .map(item => cleanContent(item.replace(/^[-•*]\s*/, '')))
                .filter(Boolean);
        }

        return value
            .split(/\r?\n/)
            .map(item => cleanContent(item.replace(/^[-•*]\s*/, '')))
            .filter(Boolean);
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

    function getAvailableKnowledgeSource(input) {
        if (Array.isArray(input)) {
            return { value: input, mode: 'json-array' };
        }

        if (typeof input === 'string' && input.trim()) {
            return { value: input, mode: 'text' };
        }

        if (Array.isArray(window.PlatinoKnowledgeBase)) {
            return { value: window.PlatinoKnowledgeBase, mode: 'json-array' };
        }

        if (Array.isArray(window.basePerguntasRespostasPlatino)) {
            return { value: window.basePerguntasRespostasPlatino, mode: 'json-array' };
        }

        if (Array.isArray(window.basePerguntasRespostas)) {
            return { value: window.basePerguntasRespostas, mode: 'json-array' };
        }

        if (typeof window.conhecimentoEmpresa === 'string' && window.conhecimentoEmpresa.trim()) {
            return { value: window.conhecimentoEmpresa, mode: 'text' };
        }

        return { value: '', mode: 'empty' };
    }

    function initialize(input) {
        const source = getAvailableKnowledgeSource(input);
        sourceMode = source.mode;
        sourceText = typeof source.value === 'string' ? source.value : JSON.stringify(source.value || []);

        if (source.mode === 'json-array') {
            documents = parseJsonKnowledge(source.value);
        } else if (source.mode === 'text') {
            const shouldTryJson = /^[\s\r\n]*[\[{]/.test(source.value);
            const parsedJson = shouldTryJson ? parseJsonKnowledge(source.value) : [];
            documents = parsedJson.length ? parsedJson : parseTextKnowledge(source.value);
        } else {
            documents = [];
        }

        buildIdf();

        return {
            documents: documents.length,
            mode: sourceMode
        };
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

    function scoreDocument(doc, normalizedQuery, queryTokens) {
        let score = 0;

        if (doc.normalizedTitle === normalizedQuery) score += 80;
        if (doc.normalizedTitle.includes(normalizedQuery)) score += 42;
        if (doc.normalizedContent.includes(normalizedQuery)) score += 18;
        if (doc.normalizedKeywords && doc.normalizedKeywords.includes(normalizedQuery)) score += 24;

        const rawQuestions = doc.meta?.questions || [];
        const normalizedQuestions = rawQuestions.map(question => normalize(question));

        normalizedQuestions.forEach(question => {
            if (question === normalizedQuery) score += 90;
            if (question.includes(normalizedQuery)) score += 38;

            const queryWords = normalizedQuery.split(' ').filter(Boolean);
            const questionWords = question.split(' ').filter(Boolean);
            const overlap = queryWords.filter(word => questionWords.includes(word)).length;

            if (queryWords.length && overlap / queryWords.length >= 0.65) {
                score += 25;
            }
        });

        queryTokens.forEach(token => {
            const weight = idf.get(token) || 1;

            if (doc.titleTokens.includes(token)) score += 6 * weight;
            if (doc.contentTokens.includes(token)) score += 1.7 * weight;
        });

        const words = normalizedQuery.split(' ').filter(Boolean);

        for (let index = 0; index < words.length - 1; index += 1) {
            const bigram = `${words[index]} ${words[index + 1]}`;
            score += countMatches(doc.normalizedTitle, bigram) * 9;
            score += countMatches(doc.normalizedContent, bigram) * 3.2;
        }

        if (doc.type === 'json') score *= 1.28;
        if (doc.type === 'intent') score *= 1.22;
        if (doc.type === 'qa') score *= 1.18;

        return score;
    }

    function search(query, limit = 6) {
        if (!documents.length) initialize();

        const normalizedQuery = normalize(query);
        const queryTokens = tokenize(query);

        if (!normalizedQuery || !queryTokens.length) return [];

        return documents
            .map(doc => ({
                ...doc,
                score: scoreDocument(doc, normalizedQuery, queryTokens)
            }))
            .filter(doc => doc.score >= 4)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    function getInteractionAnswer(query) {
        const normalizedQuery = normalize(query);

        if (!normalizedQuery) return null;

        const matches = INTERACTION_RULES
            .map(rule => {
                let score = 0;

                rule.patterns.forEach(pattern => {
                    const normalizedPattern = normalize(pattern);
                    if (!normalizedPattern) return;

                    if (normalizedQuery === normalizedPattern) score += 100;
                    else if (normalizedQuery.includes(normalizedPattern)) score += 55;
                    else {
                        const patternTokens = tokenize(normalizedPattern, false);
                        const queryTokens = tokenize(normalizedQuery, false);
                        const overlap = patternTokens.filter(token => queryTokens.includes(token)).length;

                        if (patternTokens.length && overlap / patternTokens.length >= 0.75) {
                            score += 25;
                        }
                    }
                });

                return {
                    ...rule,
                    score: score + (rule.priority || 0)
                };
            })
            .filter(rule => rule.score >= 120)
            .sort((a, b) => b.score - a.score);

        if (!matches.length) return null;

        const best = matches[0];

        return {
            found: true,
            html: best.response,
            results: [],
            type: 'interaction',
            id: best.id
        };
    }

    function formatJsonAnswer(doc) {
        const raw = doc.meta?.raw || {};
        const answer = raw.resposta || doc.meta?.answer || doc.content || '';
        const title = doc.meta?.displayTitle || raw.titulo || raw.id || doc.title;
        const modulo = raw.modulo || doc.section;
        const id = raw.id || doc.id;

        const extras = [];

        if (Array.isArray(raw.checklist) && raw.checklist.length) {
            extras.push(`
                <div class="mt-3 pt-3 border-t border-slate-200">
                    <p class="font-semibold text-slate-700 mb-2">Checklist:</p>
                    <ul class="list-disc pl-5 space-y-1">
                        ${raw.checklist.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                </div>
            `);
        }

        if (Array.isArray(raw.errosComuns) && raw.errosComuns.length) {
            extras.push(`
                <div class="mt-3 pt-3 border-t border-slate-200">
                    <p class="font-semibold text-slate-700 mb-2">Erros comuns:</p>
                    <ul class="list-disc pl-5 space-y-1">
                        ${raw.errosComuns.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                </div>
            `);
        }

        if (Array.isArray(raw.oQueNaoFazer) && raw.oQueNaoFazer.length) {
            extras.push(`
                <div class="mt-3 pt-3 border-t border-slate-200">
                    <p class="font-semibold text-slate-700 mb-2">O que não fazer:</p>
                    <ul class="list-disc pl-5 space-y-1">
                        ${raw.oQueNaoFazer.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                </div>
            `);
        }

        if (raw.proximaEtapa) {
            extras.push(`
                <div class="mt-3 pt-3 border-t border-slate-200">
                    <p class="font-semibold text-slate-700 mb-1">Próxima etapa:</p>
                    <p>${formatText(raw.proximaEtapa)}</p>
                </div>
            `);
        }

        if (raw.quandoChamarSupervisao) {
            extras.push(`
                <div class="mt-3 pt-3 border-t border-slate-200">
                    <p class="font-semibold text-slate-700 mb-1">Quando chamar supervisão:</p>
                    <p>${formatText(raw.quandoChamarSupervisao)}</p>
                </div>
            `);
        }

        return `
            <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2">${escapeHtml(modulo)}</p>
                <p class="text-[11px] text-slate-400 mb-2">ID: ${escapeHtml(id)}</p>
                <p class="font-semibold text-slate-800 mb-2">${escapeHtml(title)}</p>
                <p>${formatText(answer)}</p>
                ${extras.join('')}
            </div>
        `;
    }

    function buildRelatedHtml(results, primary) {
        const related = results
            .slice(1, 4)
            .filter(item => item.score >= primary.score * 0.45);

        if (!related.length) return '';

        return `
            <div class="mt-3 pt-3 border-t border-slate-200">
                <p class="font-semibold text-slate-700 mb-2">Também pode ajudar:</p>
                <ul class="list-disc pl-5 space-y-1">
                    ${related.map(item => {
                        const title = item.meta?.displayTitle || item.meta?.questions?.[0] || item.title;
                        return `<li>${escapeHtml(title)}</li>`;
                    }).join('')}
                </ul>
            </div>
        `;
    }

    function buildSynthesizedHtml(query, results) {
        const queryTokens = tokenize(query, false);
        const candidates = [];
        const seen = new Set();

        results.slice(0, 4).forEach((doc, documentIndex) => {
            const content = String(doc.meta?.answer || doc.meta?.raw?.resposta || doc.content || '')
                .replace(/\b(?:CHECKLIST|ERROS COMUNS|O QUE NÃƒO FAZER|PRÃ“XIMA ETAPA|QUANDO CHAMAR SUPERVISÃƒO):/gi, '\n')
                .replace(/[•*-]\s*/g, '')
                .trim();
            content
                .split(/(?<=[.!?])\s+|\r?\n+/)
                .map(sentence => compactText(sentence))
                .filter(sentence => sentence.length >= 25 && sentence.length <= 320)
                .forEach((sentence, sentenceIndex) => {
                    const normalizedSentence = normalize(sentence);
                    const key = normalizedSentence.slice(0, 120);
                    if (!key || seen.has(key)) return;
                    seen.add(key);
                    const overlap = queryTokens.filter(token => normalizedSentence.includes(token)).length;
                    candidates.push({
                        sentence,
                        score: overlap * 12 + Math.max(8 - documentIndex * 2, 1) - sentenceIndex * 0.05
                    });
                });
        });

        const selected = candidates
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(item => item.sentence);
        if (!selected.length) return '';

        const lead = selected[0];
        const complements = selected.slice(1);
        return `
            <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2">OrientaÃ§Ã£o resumida</p>
                <p>${formatText(lead)}</p>
                ${complements.length ? `
                    <p class="mt-3 font-semibold text-slate-700">Pontos importantes:</p>
                    <ul class="mt-2 list-disc pl-5 space-y-1">
                        ${complements.map(item => `<li>${formatText(item)}</li>`).join('')}
                    </ul>
                ` : ''}
            </div>
        `;
    }

    function fallbackAnswer() {
        return {
            found: false,
            html: `
                <p>Não encontrei uma orientação específica na base para essa pergunta.</p>
                <p class="mt-2">Tente escrever com mais detalhes, informando o setor, a etapa do cliente e o que aconteceu.</p>
                <p class="mt-2">Exemplos: <strong>“cliente não quer passar GOV”</strong>, <strong>“contrato está sem assinatura”</strong> ou <strong>“como enviar para o processual?”</strong>.</p>
                <p class="mt-2">Se a dúvida envolver pagamento, banco, processo, documento divergente, risco jurídico ou informação sensível, procure a supervisão antes de avançar.</p>
                <p class="mt-2">Para passo a passo com imagens, consulte os PDFs na aba <strong>Treinamentos</strong>.</p>
            `,
            results: []
        };
    }

    function localAnswer(query, options = {}) {
        const interactionAnswer = getInteractionAnswer(query);

        if (interactionAnswer) {
            return interactionAnswer;
        }

        const results = search(query, options.limit || 4);

        if (!results.length) {
            return fallbackAnswer();
        }

        const primary = results[0];
        const relatedHtml = buildRelatedHtml(results, primary);
        const synthesizedHtml = buildSynthesizedHtml(query, results);

        return {
            found: true,
            html: `${synthesizedHtml || formatJsonAnswer(primary)}${relatedHtml}`,
            results
        };
    }

    function buildContext(query, limit = 6) {
        return search(query, limit)
            .map((item, index) => {
                const title = item.meta?.displayTitle || item.meta?.questions?.[0] || item.title;
                return `[TRECHO ${index + 1} | ${item.section} | ${item.id}]\n${title}\n${compactText(item.content)}`;
            })
            .join('\n\n');
    }

    function getStats() {
        return {
            characters: sourceText.length,
            documents: documents.length,
            questions: documents.reduce((total, doc) => {
                const questions = doc.meta?.questions;
                return total + (Array.isArray(questions) ? questions.length : 0);
            }, 0),
            mode: sourceMode,
            jsonDocuments: documents.filter(doc => doc.type === 'json').length,
            textDocuments: documents.filter(doc => doc.type !== 'json').length,
            interactions: INTERACTION_RULES.length
        };
    }

    function reload() {
        return initialize();
    }

    window.PlatinoKnowledge = {
        initialize,
        reload,
        search,
        localAnswer,
        buildContext,
        normalize,
        tokenize,
        getStats
    };

    initialize();
})();
