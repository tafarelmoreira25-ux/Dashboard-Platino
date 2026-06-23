(function () {
    const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const infoCard = (title, content, icon = 'ph-check-circle') => `
        <div class="rh-module-card rounded-2xl p-4">
            <div class="mb-2 flex items-center gap-2">
                <span class="icon-pill flex h-9 w-9 items-center justify-center rounded-xl"><i class="ph ${icon}"></i></span>
                <h4 class="font-bold text-white">${escapeHtml(title)}</h4>
            </div>
            <div class="text-sm leading-relaxed text-blue-100">${content}</div>
        </div>
    `;

    const data = {
        frequencia: {
            title: 'Frequência',
            description: 'Folgas programadas, exames médicos, day-off de aniversariantes e escala do último sábado do mês.',
            timeOff: [
                { name: 'Marina Alves', area: 'Comercial', type: 'Folga programada', date: '26/06', note: 'Compensação de banco de horas' },
                { name: 'Rafael Nunes', area: 'Jurídico', type: 'Exame médico', date: '27/06', note: 'ASO periódico às 10h' },
                { name: 'Tafarel Moreira', area: 'Gestão', type: 'Day-off aniversário', date: '30/06', note: 'Retorno no próximo dia útil' }
            ],
            saturdayScale: [
                { date: '27/06', team: 'Administrativo', people: 'Giovana Dilena, Lucas Prado', shift: '09h às 13h' },
                { date: '27/06', team: 'Comercial', people: 'Mayara Cardoso, Gabriel Paes', shift: '09h às 13h' },
                { date: '27/06', team: 'Jurídico', people: 'Nicole Martins, Elaine Costa', shift: '09h às 13h' }
            ]
        },
        conduta: {
            title: 'Conduta e Postura',
            description: 'Checklist diário de apresentação e formulário para apontamentos de comportamento.',
            checklist: ['Uniforme alinhado', 'Crachá visível', 'Postura profissional no atendimento', 'Mesa organizada', 'Comunicação respeitosa'],
            occurrences: [
                { area: 'Comercial', type: 'Postura em ligação', status: 'Orientação verbal registrada' },
                { area: 'Administrativo', type: 'Uso de crachá', status: 'Atenção preventiva' }
            ]
        },
        recrutamento: {
            title: 'Recrutamento e Seleção',
            description: 'Kanban de candidatos e checklist de integração para aprovados.',
            columns: [
                { title: 'Vagas em aberto', cards: ['Analista Comercial - SDR', 'Auxiliar Administrativo', 'Assistente Jurídico'] },
                { title: 'Em entrevista', cards: ['Camila Rocha - Comercial', 'Bruno Freitas - Administrativo', 'Lívia Martins - Jurídico'] },
                { title: 'Aprovados', cards: ['Pedro Henrique - Comercial', 'Ana Clara - Jurídico'] },
                { title: 'Reprovados', cards: ['Candidato 014 - Perfil incompatível', 'Candidato 019 - Sem disponibilidade'] }
            ],
            onboarding: ['Contrato e documentos conferidos', 'Acesso ao Sistema Platino criado', 'Apresentação à equipe', 'Treinamento inicial agendado', 'Primeiro feedback em 7 dias']
        },
        desenvolvimento: {
            title: 'Desenvolvimento e Performance',
            description: 'Acompanhamento de novos candidatos em treinamento e registros de feedbacks 1:1.',
            trainees: [
                { name: 'Pedro Henrique', area: 'Comercial', progress: '72%', focus: 'Quebra de objeções e fechamento' },
                { name: 'Ana Clara', area: 'Jurídico', progress: '64%', focus: 'Organização de documentos e CRM' },
                { name: 'Bruno Freitas', area: 'Administrativo', progress: '48%', focus: 'Conferência de dados e prazos' }
            ],
            feedbacks: [
                { name: 'Pedro Henrique', date: '20/06', note: 'Boa evolução na abordagem. Próximo passo: objetividade no fechamento.' },
                { name: 'Ana Clara', date: '21/06', note: 'Atenção positiva à rotina jurídica. Reforçar nomenclatura dos arquivos.' }
            ]
        },
        mural: {
            title: 'Mural da Semana / Central de Avisos',
            description: 'Cadastro e exibição de informativos gerais do DP, dinâmicas de equipe e solicitações internas.',
            notices: [
                { type: 'DP', title: 'Conferência de documentos mensais', text: 'Enviar pendências de folha até quinta-feira às 12h.' },
                { type: 'Dinâmica', title: 'Integração comercial e jurídico', text: 'Atividade rápida na sexta-feira para alinhamento de tratativas.' },
                { type: 'Solicitação', title: 'Atualização cadastral', text: 'Colaboradores devem revisar telefone e endereço no RH.' }
            ]
        }
    };

    function renderModule(panelId, moduleData) {
        if (panelId === 'frequencia') {
            return `
                <div class="grid gap-4 lg:grid-cols-2">
                    ${infoCard('Avisos programados', moduleData.timeOff.map(item => `
                        <div class="mb-3 rounded-xl border border-white/10 bg-white/5 p-3">
                            <p class="employee-name font-bold">${escapeHtml(item.name)}</p>
                            <p>${escapeHtml(item.area)} - ${escapeHtml(item.type)} - <span class="money-value font-black">${escapeHtml(item.date)}</span></p>
                            <p class="text-xs text-blue-100/70">${escapeHtml(item.note)}</p>
                        </div>
                    `).join(''), 'ph-calendar-check')}
                    ${infoCard('Escala do último sábado', moduleData.saturdayScale.map(item => `
                        <div class="mb-3 rounded-xl border border-white/10 bg-white/5 p-3">
                            <p class="font-bold text-white">${escapeHtml(item.team)} - <span class="money-value">${escapeHtml(item.date)}</span></p>
                            <p>${escapeHtml(item.people)}</p>
                            <p class="text-xs text-blue-100/70">${escapeHtml(item.shift)}</p>
                        </div>
                    `).join(''), 'ph-clock-countdown')}
                </div>
            `;
        }

        if (panelId === 'conduta') {
            return `
                <div class="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    ${infoCard('Checklist diário de vestimenta', moduleData.checklist.map(item => `
                        <label class="mb-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                            <input type="checkbox" class="h-4 w-4 rounded border-slate-300"><span>${escapeHtml(item)}</span>
                        </label>
                    `).join(''), 'ph-identification-badge')}
                    <div class="rh-module-card rounded-2xl p-4">
                        <h4 class="mb-3 font-bold text-white">Apontamento de Comportamento</h4>
                        <div class="grid gap-3">
                            <input class="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none" placeholder="Nome do colaborador">
                            <select class="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none"><option>Comercial</option><option>Administrativo</option><option>Jurídico</option></select>
                            <textarea rows="4" class="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none" placeholder="Descreva a ocorrência de forma objetiva"></textarea>
                            <button type="button" class="w-fit rounded-xl px-4 py-2 text-sm font-bold">Registrar apontamento</button>
                        </div>
                    </div>
                </div>
            `;
        }

        if (panelId === 'recrutamento') {
            return `
                <div class="grid gap-4 xl:grid-cols-4">
                    ${moduleData.columns.map(column => `
                        <div class="kanban-column rounded-2xl p-4">
                            <h4 class="mb-3 font-bold text-white">${escapeHtml(column.title)}</h4>
                            <div class="space-y-3">${column.cards.map(card => `<div class="rounded-xl border border-white/10 bg-white/10 p-3 text-sm text-blue-50">${escapeHtml(card)}</div>`).join('')}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="rh-module-card mt-4 rounded-2xl p-4">
                    <h4 class="mb-3 font-bold text-white">Checklist de Integração de Novos Funcionários</h4>
                    <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">${moduleData.onboarding.map(item => `<label class="flex items-center gap-2 rounded-xl bg-white/5 p-3 text-sm"><input type="checkbox" class="h-4 w-4 rounded"> ${escapeHtml(item)}</label>`).join('')}</div>
                </div>
            `;
        }

        if (panelId === 'desenvolvimento') {
            return `
                <div class="grid gap-4 lg:grid-cols-3">${moduleData.trainees.map(item => `
                    <div class="rh-module-card rounded-2xl p-4">
                        <p class="employee-name text-lg font-black">${escapeHtml(item.name)}</p>
                        <p class="text-sm text-blue-100/70">${escapeHtml(item.area)}</p>
                        <p class="money-value mt-4 text-3xl font-black">${escapeHtml(item.progress)}</p>
                        <p class="mt-2 text-sm text-blue-100">${escapeHtml(item.focus)}</p>
                    </div>`).join('')}
                </div>
                <div class="rh-module-card mt-4 rounded-2xl p-4">
                    <h4 class="mb-3 font-bold text-white">Feedbacks 1:1 aplicados</h4>
                    <div class="grid gap-3 lg:grid-cols-2">${moduleData.feedbacks.map(item => `<div class="rounded-xl border border-white/10 bg-white/5 p-3 text-sm"><strong class="employee-name">${escapeHtml(item.name)}</strong> <span class="money-value">${escapeHtml(item.date)}</span><p class="mt-1 text-blue-100/80">${escapeHtml(item.note)}</p></div>`).join('')}</div>
                </div>
            `;
        }

        if (panelId === 'mural') {
            return `
                <div class="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <div class="rh-module-card rounded-2xl p-4">
                        <h4 class="mb-3 font-bold text-white">Cadastrar aviso do DP</h4>
                        <input class="mb-3 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none" placeholder="Título do aviso">
                        <textarea rows="5" class="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none" placeholder="Informativo, dinâmica ou solicitação geral"></textarea>
                        <button type="button" class="mt-3 rounded-xl px-4 py-2 text-sm font-bold">Adicionar aviso</button>
                    </div>
                    <div class="space-y-3">${moduleData.notices.map(item => `<div class="rh-module-card rounded-2xl p-4"><p class="metallic-kicker text-[10px]">${escapeHtml(item.type)}</p><h4 class="mt-1 font-bold text-white">${escapeHtml(item.title)}</h4><p class="mt-2 text-sm text-blue-100/80">${escapeHtml(item.text)}</p></div>`).join('')}</div>
                </div>
            `;
        }

        return '';
    }

    window.PlatinoRhComponents = { data, renderModule };
})();
