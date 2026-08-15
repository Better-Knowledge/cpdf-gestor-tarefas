/**
 * As rotinas de IA — a parte que migrou do agente para a aplicação.
 *
 * No Bloco 2 essas três coisas moravam numa Skill: agrupar por tema, atribuir
 * prioridade e achar relação entre as anotações. Com o sistema de pé elas
 * passam a acontecer toda hora e quase sempre iguais — e pela régua
 * frequência × variação mudam de casa.
 *
 * Duas regras que valem para tudo aqui:
 *
 *   1. UMA chamada por lote, nunca uma por card. O prompt recebe o contexto do
 *      projeto e a lista inteira de cards abertos. Priorizar a cada clique é o
 *      jeito de transformar um gestor de tarefas numa fatura.
 *
 *   2. Sem chave de API, o sistema INTEIRO continua funcionando — só não
 *      prioriza, não sugere dependência e não monta a ordem do dia. O quadro,
 *      os filtros e o registro nunca dependem de IA.
 */

import Anthropic from '@anthropic-ai/sdk'
import { banco, agora, hoje, ErroDeRegra, DIAS_ATE_SUGERIR_QUEBRA } from './db.js'
import * as regras from './regras.js'

const MODELO = process.env.MODELO_IA || 'claude-sonnet-5'
const MAX_TOKENS = 4096

export const temChave = () => Boolean(process.env.ANTHROPIC_API_KEY)

let cliente = null
function anthropic() {
  if (!temChave()) {
    throw new ErroDeRegra(
      'Sem ANTHROPIC_API_KEY no arquivo .env, as rotinas de IA não rodam. ' +
        'O resto do sistema continua funcionando normalmente.',
      503,
    )
  }
  cliente ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return cliente
}

/**
 * Uma chamada ao modelo com saída estruturada.
 *
 * A ferramenta é obrigatória (`tool_choice`), então a resposta sempre volta no
 * formato pedido — nada de tentar ler JSON de dentro de um texto.
 */
async function perguntar({ instrucao, prompt, ferramenta }) {
  const resposta = await anthropic().messages.create({
    model: MODELO,
    max_tokens: MAX_TOKENS,
    system: instrucao,
    tools: [ferramenta],
    tool_choice: { type: 'tool', name: ferramenta.name },
    messages: [{ role: 'user', content: prompt }],
  })
  const uso = resposta.content.find((bloco) => bloco.type === 'tool_use')
  if (!uso) throw new ErroDeRegra('O modelo não devolveu uma resposta no formato esperado.', 502)
  return uso.input
}

/** Descreve um card para o prompt em uma linha. Menos token, mais foco. */
function resumirCard(card) {
  const partes = [`#${card.id} "${card.titulo}"`]
  if (card.descricao) partes.push(`— ${card.descricao}`)
  partes.push(`[projeto: ${card.projeto}, etapa: ${card.etapa}, data: ${card.data}`)
  if (card.tags.length) partes.push(`tags: ${card.tags.join(', ')}`)
  partes.push(`prioridade atual: ${card.prioridade} (${card.prioridade_origem})]`)
  return partes.join(' ')
}

// ---------------------------------------------------------------------------
// 4.1 — Priorização
// ---------------------------------------------------------------------------

const FERRAMENTA_PRIORIZAR = {
  name: 'registrar_prioridades',
  description: 'Registra a prioridade escolhida para cada card, com a justificativa.',
  input_schema: {
    type: 'object',
    properties: {
      prioridades: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'O id do card.' },
            prioridade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
            justificativa: {
              type: 'string',
              description:
                'Uma frase curta dizendo por quê. Quando houver contexto do projeto, cite o ' +
                'trecho do contexto que sustenta a escolha.',
            },
          },
          required: ['id', 'prioridade', 'justificativa'],
        },
      },
    },
    required: ['prioridades'],
  },
}

const INSTRUCAO_PRIORIZAR = `Você prioriza tarefas dentro de um gestor de tarefas pessoal.

Regras:
- Use SOMENTE os ids que aparecerem na lista. Não invente card.
- Quando o projeto tiver contexto, a prioridade sai do contexto — e a justificativa cita ele.
- Sem contexto, use o que dá para inferir: data próxima, dependência, esforço aparente.
- Não use "alta" para tudo. Se mais de um terço da lista for alta, nada é alta.
- A justificativa é uma frase, em português, escrita para o dono da tarefa ler.`

/**
 * Repriorriza os cards abertos.
 *
 * Card com prioridade posta pelo usuário fica de fora do lote: a IA não
 * sobrescreve decisão de gente, no máximo discorda por escrito.
 *
 * Projeto sem contexto tem a prioridade marcada como SUGESTÃO — ela aparece no
 * painel pedindo confirmação, em vez de mudar as coisas por conta própria.
 */
export async function priorizar({ projeto = null } = {}) {
  const bd = banco()
  const abertos = regras
    .listarCards({ projeto, status: 'aberto' })
    .filter((c) => c.prioridade_origem !== 'usuario')

  if (!abertos.length) {
    return { priorizados: 0, sugestoes: 0, mensagem: 'Nada para priorizar.' }
  }

  const projetos = regras.listarProjetos()
  const contextos = projetos
    .map((p) => `Projeto "${p.nome}": ${p.contexto?.trim() || '(sem contexto escrito)'}`)
    .join('\n')

  const resultado = await perguntar({
    instrucao: INSTRUCAO_PRIORIZAR,
    ferramenta: FERRAMENTA_PRIORIZAR,
    prompt: `Hoje é ${hoje()}.

CONTEXTO DOS PROJETOS
${contextos}

CARDS ABERTOS
${abertos.map(resumirCard).join('\n')}

Priorize todos os cards da lista.`,
  })

  const validos = new Map(abertos.map((c) => [c.id, c]))
  const semContexto = new Set(
    projetos.filter((p) => !p.contexto?.trim()).map((p) => p.nome),
  )

  let priorizados = 0
  let sugestoes = 0
  for (const item of resultado.prioridades ?? []) {
    const card = validos.get(item.id)
    if (!card) continue // o modelo inventou um id: ignora em silêncio
    const ehSugestao = semContexto.has(card.projeto)
    bd.prepare(
      `UPDATE tarefas SET prioridade = ?, justificativa = ?, prioridade_origem = 'ia',
         prioridade_sugerida = ? WHERE id = ? AND prioridade_origem != 'usuario'`,
    ).run(item.prioridade, item.justificativa, ehSugestao ? 1 : 0, card.id)
    priorizados += 1
    if (ehSugestao) sugestoes += 1
  }

  return {
    priorizados,
    sugestoes,
    mensagem: sugestoes
      ? `${priorizados} cards priorizados. ${sugestoes} são sugestões — os projetos deles ainda ` +
        `não têm contexto escrito.`
      : `${priorizados} cards priorizados contra o contexto dos projetos.`,
  }
}

// ---------------------------------------------------------------------------
// 4.2 — Relação e dependência
// ---------------------------------------------------------------------------

const FERRAMENTA_RELACIONAR = {
  name: 'registrar_dependencias',
  description: 'Registra os pares de cards em que um precisa acontecer antes do outro.',
  input_schema: {
    type: 'object',
    properties: {
      dependencias: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            card_id: { type: 'integer', description: 'O card que fica esperando.' },
            depende_de_id: { type: 'integer', description: 'O card que precisa acontecer antes.' },
            porque: { type: 'string', description: 'Uma frase explicando a relação.' },
          },
          required: ['card_id', 'depende_de_id', 'porque'],
        },
      },
    },
    required: ['dependencias'],
  },
}

const INSTRUCAO_RELACIONAR = `Você procura dependências reais entre tarefas de um gestor pessoal.

Regras:
- Só proponha o par quando um card REALMENTE não pode ser feito antes do outro.
- Semelhança de assunto NÃO é dependência. Duas gravações do mesmo curso são independentes.
- Use somente ids da lista.
- Na dúvida, não proponha. Uma sugestão errada custa mais que uma sugestão a menos:
  quem recebe dez palpites ruins para de ler os palpites.`

/**
 * Procura dependências e as grava como SUGESTÃO — nunca confirmadas.
 *
 * Sugestão não trava nada; só a dependência confirmada pelo usuário marca um
 * card como aguardando. É o que impede a IA de parar o trabalho de alguém por
 * um palpite.
 */
export async function relacionar({ projeto = null } = {}) {
  const abertos = regras.listarCards({ projeto, status: 'aberto' })
  if (abertos.length < 2) {
    return { propostas: 0, mensagem: 'Poucos cards abertos para procurar relação.' }
  }

  const resultado = await perguntar({
    instrucao: INSTRUCAO_RELACIONAR,
    ferramenta: FERRAMENTA_RELACIONAR,
    prompt: `Hoje é ${hoje()}.

CARDS ABERTOS
${abertos.map(resumirCard).join('\n')}

Encontre as dependências que existirem. Se não existir nenhuma clara, devolva a lista vazia.`,
  })

  const ids = new Set(abertos.map((c) => c.id))
  const jaExistem = new Set(
    banco()
      .prepare('SELECT card_id, depende_de_id FROM dependencias')
      .all()
      .map((d) => `${d.card_id}->${d.depende_de_id}`),
  )

  const propostas = []
  for (const item of resultado.dependencias ?? []) {
    if (!ids.has(item.card_id) || !ids.has(item.depende_de_id)) continue
    if (jaExistem.has(`${item.card_id}->${item.depende_de_id}`)) continue
    try {
      regras.criarDependencia({
        cardId: item.card_id,
        dependeDeId: item.depende_de_id,
        confirmada: false,
      })
      propostas.push(item)
    } catch (erro) {
      // Ciclo ou card sumido no meio do caminho: descarta a proposta e segue.
      if (!(erro instanceof ErroDeRegra)) throw erro
    }
  }

  return {
    propostas: propostas.length,
    dependencias: propostas,
    mensagem: propostas.length
      ? `${propostas.length} possível(is) dependência(s) para você confirmar ou recusar.`
      : 'Nenhuma dependência clara entre os cards abertos.',
  }
}

// ---------------------------------------------------------------------------
// 4.4 — Encadeamento
// ---------------------------------------------------------------------------

const FERRAMENTA_ORDEM = {
  name: 'registrar_ordem',
  description: 'Registra a ordem sugerida para o dia, agrupada por bloco de trabalho.',
  input_schema: {
    type: 'object',
    properties: {
      blocos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nome: {
              type: 'string',
              description: 'O bloco, em duas ou três palavras. Ex.: "as ligações", "bloco de foco".',
            },
            porque: { type: 'string', description: 'Uma frase dizendo por que agrupar assim.' },
            cards: { type: 'array', items: { type: 'integer' } },
          },
          required: ['nome', 'porque', 'cards'],
        },
      },
      recado: {
        type: 'string',
        description: 'Uma frase curta para o dono do dia. Sem motivação genérica.',
      },
    },
    required: ['blocos', 'recado'],
  },
}

const INSTRUCAO_ORDEM = `Você organiza a ordem de um dia de trabalho.

Regras:
- Agrupe por CONTEXTO DE EXECUÇÃO, não por assunto: as ligações juntas, o que exige foco
  num bloco só, o que é de cinco minutos encaixado entre as coisas.
- Troca de contexto é o custo que você está tentando reduzir.
- Máximo de quatro blocos. Um dia com sete blocos não é um dia organizado.
- Nada de frase de motivação. O recado é prático ou não existe.`

export async function ordemDoDia() {
  const cards = regras.listaDeHoje().filter((c) => !c.aguardando.length)
  if (!cards.length) {
    return { blocos: [], recado: 'Nada aberto para hoje.', cards: [] }
  }

  const resultado = await perguntar({
    instrucao: INSTRUCAO_ORDEM,
    ferramenta: FERRAMENTA_ORDEM,
    prompt: `Hoje é ${hoje()}.

TAREFAS ABERTAS DE HOJE
${cards.map(resumirCard).join('\n')}

Monte a ordem do dia.`,
  })

  const porId = new Map(cards.map((c) => [c.id, c]))
  const blocos = (resultado.blocos ?? [])
    .map((bloco) => ({
      ...bloco,
      cards: (bloco.cards ?? []).map((id) => porId.get(id)).filter(Boolean),
    }))
    .filter((bloco) => bloco.cards.length)

  return { blocos, recado: resultado.recado, total: cards.length }
}

// ---------------------------------------------------------------------------
// 4.5 — Sugestão de quebra
// ---------------------------------------------------------------------------

const FERRAMENTA_QUEBRA = {
  name: 'registrar_quebras',
  description: 'Registra, para cada card grande demais, os cards menores que o substituiriam.',
  input_schema: {
    type: 'object',
    properties: {
      quebras: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            partes: {
              type: 'array',
              items: { type: 'string' },
              description: 'De dois a quatro títulos de card, cada um fazível numa sentada.',
            },
          },
          required: ['id', 'partes'],
        },
      },
    },
    required: ['quebras'],
  },
}

const INSTRUCAO_QUEBRA = `Estes cards estão parados há dias.

Quase nunca é preguiça: quase sempre é uma tarefa grande demais disfarçada de tarefa, e a
pessoa trava porque não sabe onde começar.

Regras:
- Cada parte tem que ser fazível numa sentada, e a PRIMEIRA precisa ser fácil de começar.
- De dois a quatro pedaços. Mais que isso é outro projeto, não uma quebra.
- Se um card já for pequeno e específico, não o inclua na resposta.`

/** Não altera nada — só devolve as sugestões. Quebrar é decisão do usuário. */
export async function sugerirQuebra({ dias = DIAS_ATE_SUGERIR_QUEBRA } = {}) {
  const parados = regras.cardsParados(dias)
  if (!parados.length) {
    return { quebras: [], mensagem: `Nenhum card parado há mais de ${dias} dias.` }
  }

  const resultado = await perguntar({
    instrucao: INSTRUCAO_QUEBRA,
    ferramenta: FERRAMENTA_QUEBRA,
    prompt: `Hoje é ${hoje()}.

CARDS PARADOS
${parados.map((c) => `${resumirCard(c)} — parado desde ${(c.movido_em ?? c.criado_em).slice(0, 10)}`).join('\n')}`,
  })

  const porId = new Map(parados.map((c) => [c.id, c]))
  const quebras = (resultado.quebras ?? [])
    .filter((q) => porId.has(q.id) && (q.partes ?? []).length >= 2)
    .map((q) => ({ card: porId.get(q.id), partes: q.partes }))

  return {
    quebras,
    mensagem: quebras.length
      ? `${quebras.length} card(s) parecem grandes demais.`
      : 'Os cards parados são específicos o bastante. Talvez o problema não seja o tamanho.',
  }
}

/** Aplica uma quebra: cria as partes e conclui o card original. */
export function aplicarQuebra(cardId, partes) {
  const card = regras.buscarCard(cardId)
  const criados = partes
    .map((titulo) => String(titulo).trim())
    .filter(Boolean)
    .map((titulo) =>
      regras.criarCard({
        titulo,
        projeto: card.projeto,
        etapa: card.etapa,
        tipo: card.tipo,
        data: card.data,
        tags: card.tags,
      }),
    )
  if (!criados.length) throw new ErroDeRegra('Uma quebra precisa de pelo menos uma parte.')
  regras.excluirCard(card.id)
  return { criados, removido: card.titulo }
}

/** Roda tudo o que é da rotina diária. Usado pelo agendamento de madrugada. */
export async function rotinaDiaria() {
  const relatorio = { em: agora() }
  relatorio.priorizacao = await priorizar()
  relatorio.relacoes = await relacionar()
  return relatorio
}
