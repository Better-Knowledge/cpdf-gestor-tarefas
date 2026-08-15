/**
 * A camada de acesso à API.
 *
 * O painel fala exatamente as mesmas rotas que o agente fala. Se uma rota
 * mudar, as duas pontas mudam juntas — que é o motivo de não existir uma
 * segunda API só para o agente.
 */

async function pedir(caminho, opcoes = {}) {
  const resposta = await fetch(`/api${caminho}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
    body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
  })
  const dados = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    // O navegador só mostra a caixa de senha quando ELE inicia a navegação;
    // num fetch o 401 volta calado, e sem esta mensagem a tela diria apenas
    // "não consegui falar com o servidor".
    if (resposta.status === 401) {
      throw new Error('A sessão expirou. Recarregue a página para entrar de novo.')
    }
    throw new Error(dados?.erro ?? 'Não consegui falar com o servidor.')
  }
  return dados
}

const parametros = (objeto) => {
  const busca = new URLSearchParams()
  for (const [chave, valor] of Object.entries(objeto)) {
    if (valor !== null && valor !== undefined && valor !== '') busca.set(chave, valor)
  }
  const texto = busca.toString()
  return texto ? `?${texto}` : ''
}

export const api = {
  projetos: () => pedir('/projetos'),
  criarProjeto: (corpo) => pedir('/projetos', { method: 'POST', corpo }),
  atualizarProjeto: (id, corpo) => pedir(`/projetos/${id}`, { method: 'PATCH', corpo }),

  cards: (filtros) => pedir(`/cards${parametros(filtros)}`),
  hoje: () => pedir('/hoje'),
  proxima: (filtros) => pedir(`/proxima${parametros(filtros)}`),
  tags: () => pedir('/tags'),
  atrasados: () => pedir('/atrasados'),
  replanejar: (data) => pedir('/replanejar', { method: 'POST', corpo: { data } }),

  criarCard: (corpo) => pedir('/cards', { method: 'POST', corpo }),
  atualizarCard: (id, corpo) => pedir(`/cards/${id}`, { method: 'PATCH', corpo }),
  excluirCard: (id) => pedir(`/cards/${id}`, { method: 'DELETE' }),
  mover: (id, etapa) => pedir(`/cards/${id}/mover`, { method: 'POST', corpo: { etapa } }),
  concluir: (id) => pedir(`/cards/${id}/concluir`, { method: 'POST' }),
  reabrir: (id) => pedir(`/cards/${id}/reabrir`, { method: 'POST' }),
  adiar: (id, data) => pedir(`/cards/${id}/adiar`, { method: 'POST', corpo: { data } }),
  marcarHoje: (id, valor) => pedir(`/cards/${id}/hoje`, { method: 'POST', corpo: { valor } }),

  confirmarDependencia: (id, outroId, confirmada) =>
    pedir(`/cards/${id}/dependencias/${outroId}`, { method: 'PATCH', corpo: { confirmada } }),
  removerDependencia: (id, outroId) =>
    pedir(`/cards/${id}/dependencias/${outroId}`, { method: 'DELETE' }),

  aceitarSugestao: (id) => pedir(`/cards/${id}/prioridade/aceitar`, { method: 'POST' }),
  recusarSugestao: (id) => pedir(`/cards/${id}/prioridade/recusar`, { method: 'POST' }),
  ofertaDeContexto: (id) => pedir(`/projetos/${id}/oferta-contexto`),
  dispensarOferta: (id) => pedir(`/projetos/${id}/oferta-contexto/dispensar`, { method: 'POST' }),
  escreverContexto: (projeto) => pedir('/ia/escrever-contexto', { method: 'POST', corpo: { projeto } }),

  eu: () => pedir('/eu'),
  telegram: () => pedir('/telegram'),
  gerarCodigoTelegram: () => pedir('/telegram/codigo', { method: 'POST' }),
  removerChatTelegram: (id) => pedir(`/telegram/chats/${id}`, { method: 'DELETE' }),
  chaves: () => pedir('/chaves'),
  criarChave: (corpo) => pedir('/chaves', { method: 'POST', corpo }),
  alterarChave: (id, corpo) => pedir(`/chaves/${id}`, { method: 'PATCH', corpo }),
  revogarChave: (id) => pedir(`/chaves/${id}/revogar`, { method: 'POST' }),

  iaDisponivel: () => pedir('/ia/disponivel'),
  priorizar: (projeto) => pedir('/ia/priorizar', { method: 'POST', corpo: { projeto } }),
  relacionar: (projeto) => pedir('/ia/relacionar', { method: 'POST', corpo: { projeto } }),
  ordemDoDia: () => pedir('/ia/ordem-do-dia'),
  sugerirQuebra: () => pedir('/ia/quebrar', { method: 'POST', corpo: {} }),
  quebrar: (id, partes) => pedir(`/cards/${id}/quebrar`, { method: 'POST', corpo: { partes } }),
}
