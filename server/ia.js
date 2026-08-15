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

/**
 * Coage a saída do modelo para lista.
 *
 * O `tool_choice` garante que a ferramenta seja chamada; NÃO garante que cada
 * campo venha na forma pedida. Numa das rodadas contra a API real o campo veio
 * como objeto em vez de array e derrubou a rota com 500.
 *
 * Confiar na forma da resposta de um modelo é o mesmo erro de confiar no corpo
 * de uma requisição: valide na entrada, sempre.
 */
function comoLista(valor) {
  if (Array.isArray(valor)) return valor
  if (valor == null) return []
  if (typeof valor === 'object') {
    console.warn('  [ia] o modelo devolveu objeto onde era lista — convertendo.')
    return Object.values(valor)
  }
  console.warn(`  [ia] o modelo devolveu ${typeof valor} onde era lista — descartando.`)
  return []
}

/**
 * Descreve um card para o prompt em uma linha. Menos token, mais foco.
 *
 * O que o card BLOQUEIA entra aqui de propósito. Sem essa linha o modelo
 * priorizava o bloqueador abaixo do que ele bloqueia — e aí a fila do "e
 * agora?" pula as tarefas travadas e nunca sugere destravá-las. Foi um furo
 * real, encontrado rodando contra a API.
 */
function resumirCard(card) {
  const partes = [`#${card.id} "${card.titulo}"`]
  if (card.descricao) partes.push(`— ${card.descricao}`)
  partes.push(`[projeto: ${card.projeto}, etapa: ${card.etapa}, data: ${card.data}`)
  if (card.tags.length) partes.push(`tags: ${card.tags.join(', ')}`)
  partes.push(`prioridade atual: ${card.prioridade} (${card.prioridade_origem})`)

  const travados = regras.bloqueia(card.id)
  if (travados.length) {
    partes.push(
      `BLOQUEIA ${travados.length}: ${travados.map((t) => `"${t.titulo}" (${t.prioridade})`).join(', ')}`,
    )
  }
  if (card.aguardando.length) partes.push(`aguardando "${card.aguardando[0].titulo}"`)

  return `${partes.join(' ')}]`
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
- **Card que BLOQUEIA outro nunca tem prioridade menor que o que ele bloqueia.**
  Ele é o caminho para o outro acontecer: deixá-lo embaixo trava a fila inteira,
  por mais que a tarefa em si pareça pequena.
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
  for (const item of comoLista(resultado.prioridades)) {
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

const FERRAMENTA_CONTEXTO = {
  name: 'registrar_contexto',
  description: 'Registra o contexto do projeto inferido a partir das prioridades confirmadas.',
  input_schema: {
    type: 'object',
    properties: {
      contexto: {
        type: 'string',
        description:
          'De duas a quatro frases, em primeira pessoa, como o dono do projeto escreveria. ' +
          'Diz o que faz uma tarefa ser urgente aqui dentro.',
      },
    },
    required: ['contexto'],
  },
}

const INSTRUCAO_CONTEXTO = `Você observa as prioridades que uma pessoa confirmou num projeto e
escreve, no lugar dela, a regra que ela está seguindo sem ter escrito.

Regras:
- Escreva em primeira pessoa, do jeito que a pessoa falaria. Nada de linguagem de documento.
- Só afirme o que os exemplos sustentam. Não invente prazo, cliente nem meta.
- De duas a quatro frases. É um rascunho para a pessoa corrigir, não um contrato.`

/**
 * Escreve o contexto do projeto a partir do padrão que a pessoa confirmou.
 *
 * É o fim do laço da 4.1: em vez de ficar sugerindo para sempre num projeto sem
 * contexto, o sistema percebe o padrão e oferece escrever a regra uma vez.
 * O texto volta como RASCUNHO — quem salva é o usuário.
 */
export async function escreverContexto({ projeto }) {
  const oferta = regras.ofertaDeContexto(regras.buscarProjeto(projeto).id)
  if (!oferta?.exemplos?.length) {
    throw new ErroDeRegra('Ainda não há confirmações suficientes para inferir um contexto.')
  }

  const resultado = await perguntar({
    instrucao: INSTRUCAO_CONTEXTO,
    ferramenta: FERRAMENTA_CONTEXTO,
    prompt: `Projeto: "${oferta.projeto}".

PRIORIDADES QUE A PESSOA CONFIRMOU
${oferta.exemplos.map((e) => `• "${e.titulo}" → ${e.prioridade}. Motivo registrado: ${e.porque}`).join('\n')}

Escreva o contexto deste projeto.`,
  })

  return { rascunho: resultado.contexto, projeto: oferta.projeto }
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
  for (const item of comoLista(resultado.dependencias)) {
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
- **O que BLOQUEIA outra tarefa vem cedo**, mesmo que pareça pequeno ou
  administrativo. Deixar o gargalo para a tarde é perder o dia das tarefas que
  dependem dele — e contradiz a prioridade que o sistema já mostrou na tela.
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
  const blocos = comoLista(resultado.blocos)
    .map((bloco) => ({
      ...bloco,
      cards: comoLista(bloco.cards).map((id) => porId.get(id)).filter(Boolean),
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
- Se um card já for pequeno e específico, não o inclua na resposta.
- **Se nenhum card precisar ser quebrado, devolva \`quebras\` como lista vazia: []**.
  Não escreva uma frase explicando — o campo é uma lista, sempre.`

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
  const quebras = comoLista(resultado.quebras)
    .filter((q) => porId.has(q.id) && comoLista(q.partes).length >= 2)
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

// ---------------------------------------------------------------------------
// Porta do Telegram — consulta ou registro?
// ---------------------------------------------------------------------------

const FERRAMENTA_INTERPRETAR = {
  name: 'interpretar_mensagem',
  description: 'Decide se a mensagem é uma consulta ao gestor ou uma tarefa para registrar.',
  input_schema: {
    type: 'object',
    properties: {
      intencao: { type: 'string', enum: ['consulta', 'registro'] },
      modo: {
        type: 'string',
        enum: ['cards', 'proxima', 'atrasados', 'projetos'],
        description:
          'Só em consulta. "cards" é a busca com filtros e atende quase tudo; os outros três ' +
          'são as perguntas prontas.',
      },
      projeto: {
        type: 'string',
        description: 'Só quando a mensagem citar um projeto da lista. Nunca invente um nome.',
      },
      tag: { type: 'string', description: 'Só quando a mensagem citar uma tag da lista.' },
      busca: {
        type: 'string',
        description:
          'Trecho a procurar no título e na descrição. É o campo do ASSUNTO: para ' +
          '"tarefas de esporte", `busca` é "esporte".',
      },
      tipo: { type: 'string', enum: ['tarefa', 'ideia'] },
      status: { type: 'string', enum: ['aberto', 'feito', 'todos'] },
      so_hoje: { type: 'boolean', description: 'Limitar ao que vence até hoje.' },
      titulo: {
        type: 'string',
        description: 'Só em registro: a frase limpa, pronta para virar título de card.',
      },
    },
    required: ['intencao'],
  },
}

const INSTRUCAO_INTERPRETAR = `Você é a porta de entrada de um gestor de tarefas pessoal, no Telegram.

Toda mensagem é uma de duas coisas:
- CONSULTA — a pessoa quer saber algo do que já está registrado.
- REGISTRO — a pessoa está anotando algo novo para fazer.

Regras:
- Pergunta é consulta mesmo sem ponto de interrogação: "o que tenho hoje", "tem algo de esporte",
  "o que está atrasado", "me mostra o projeto X".
- Imperativo ou assunto solto é registro: "comprar café", "ligar pro dentista", "revisar o contrato".
- **Na dúvida, escolha REGISTRO.** Perder uma anotação é pior que responder demais: quem quer
  consultar tem os comandos, quem perdeu a anotação não tem nada.
- Consulta sobre um ASSUNTO usa \`busca\` com a palavra do assunto — não invente projeto para ela.
- \`projeto\` e \`tag\` só saem da lista que vier no prompt. Nome que não estiver lá não existe.
- Em registro, \`titulo\` é a frase sem os rodeios: "preciso lembrar de ligar pro dentista"
  vira "ligar pro dentista".`

/**
 * Lê uma frase solta e diz o que ela é.
 *
 * A IA escolhe a intenção e os FILTROS — não executa nada. Quem consulta o
 * banco continua sendo `regras.js`, com as mesmas funções que o painel usa.
 * Modelo escolhendo parâmetro é uma coisa; modelo mexendo em card é outra, e
 * esta porta não abre a segunda.
 */
export async function interpretarMensagem(texto) {
  const projetos = regras.listarProjetos().map((p) => p.nome)
  const tags = regras.listarTags().slice(0, 25).map((t) => t.nome)

  return perguntar({
    instrucao: INSTRUCAO_INTERPRETAR,
    ferramenta: FERRAMENTA_INTERPRETAR,
    prompt: `Hoje é ${hoje()}.

PROJETOS QUE EXISTEM: ${projetos.join(', ') || '(nenhum)'}
TAGS EM USO: ${tags.join(', ') || '(nenhuma)'}

MENSAGEM RECEBIDA:
${texto}`,
  })
}

/** Roda tudo o que é da rotina diária. Usado pelo agendamento de madrugada. */
export async function rotinaDiaria() {
  const relatorio = { em: agora() }
  relatorio.priorizacao = await priorizar()
  relatorio.relacoes = await relacionar()
  return relatorio
}
