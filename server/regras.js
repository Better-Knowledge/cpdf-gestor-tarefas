/**
 * As regras do sistema — a caixa DECIDE.
 *
 * Tudo o que o sistema garante mora aqui, e só aqui: a API HTTP, a CLI e as
 * rotinas de IA chamam estas funções. Nenhuma delas reimplementa regra.
 *
 * As regras, em português:
 *   · não existe card sem título
 *   · adiar muda a data — não conclui e não apaga nada
 *   · card feito não volta para a lista de hoje
 *   · status é derivado da etapa: a última etapa do pipeline é a de conclusão
 *   · prioridade posta pelo usuário nunca é sobrescrita pela IA
 *   · no máximo três cards podem ser "hoje de verdade"
 *   · dependência sugerida não bloqueia nada; só a confirmada bloqueia
 *   · dependência circular é recusada na hora
 *   · ideia não aparece na lista de tarefas de hoje
 */

import {
  banco,
  agora,
  hoje,
  ErroDeRegra,
  PRIORIDADES,
  PROJETO_PADRAO,
  PIPELINE_PADRAO,
  TIPOS,
  TETO_DO_DIA,
} from './db.js'

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------

export function listarProjetos({ incluirArquivados = false } = {}) {
  const bd = banco()
  const projetos = bd
    .prepare(
      `SELECT * FROM projetos ${incluirArquivados ? '' : 'WHERE arquivado = 0'} ORDER BY id`,
    )
    .all()
  return projetos.map((p) => ({ ...p, arquivado: !!p.arquivado, etapas: listarEtapas(p.id) }))
}

export function listarEtapas(projetoId) {
  return banco()
    .prepare('SELECT * FROM etapas WHERE projeto_id = ? ORDER BY posicao')
    .all(projetoId)
}

/**
 * Aceita id ou nome, sem diferenciar maiúscula. Nunca adivinha parecido: se
 * não achar, erra dizendo quais existem — é o que faz o agente perguntar em
 * vez de criar um projeto quase igual.
 */
export function buscarProjeto(nomeOuId, { obrigatorio = true } = {}) {
  const bd = banco()
  let projeto = null
  if (/^\d+$/.test(String(nomeOuId))) {
    projeto = bd.prepare('SELECT * FROM projetos WHERE id = ?').get(Number(nomeOuId))
  }
  if (!projeto) {
    projeto = bd
      .prepare('SELECT * FROM projetos WHERE lower(nome) = lower(?)')
      .get(String(nomeOuId ?? ''))
  }
  if (!projeto && obrigatorio) {
    const nomes = listarProjetos().map((p) => p.nome)
    throw new ErroDeRegra(
      `Não existe projeto "${nomeOuId}". Os que existem: ${nomes.join(', ')}.`,
      404,
    )
  }
  return projeto ? { ...projeto, arquivado: !!projeto.arquivado } : null
}

export function criarProjeto({ nome, contexto = null, pipeline = null }) {
  const bd = banco()
  nome = (nome ?? '').trim()
  if (!nome) throw new ErroDeRegra('Projeto sem nome não é aceito.')
  if (buscarProjeto(nome, { obrigatorio: false })) {
    throw new ErroDeRegra(`Já existe um projeto chamado "${nome}".`, 409)
  }
  const etapas = (pipeline?.length ? pipeline : PIPELINE_PADRAO)
    .map((e) => String(e).trim())
    .filter(Boolean)
  if (!etapas.length) throw new ErroDeRegra('Um projeto precisa de pelo menos uma etapa.')

  const { lastInsertRowid } = bd
    .prepare('INSERT INTO projetos (nome, contexto, criado_em) VALUES (?, ?, ?)')
    .run(nome, contexto, agora())
  etapas.forEach((etapa, posicao) => {
    bd.prepare('INSERT INTO etapas (projeto_id, nome, posicao) VALUES (?, ?, ?)').run(
      lastInsertRowid,
      etapa,
      posicao,
    )
  })
  return buscarProjeto(Number(lastInsertRowid))
}

export function definirContexto(nomeOuId, contexto) {
  const projeto = buscarProjeto(nomeOuId)
  banco().prepare('UPDATE projetos SET contexto = ? WHERE id = ?').run(contexto ?? null, projeto.id)
  return buscarProjeto(projeto.id)
}

/**
 * Redefine as etapas de um projeto sem perder card.
 *
 * Etapa que continua existindo (mesmo nome) mantém os cards. Etapa que sai com
 * card dentro faz a função recusar: para onde os cards vão é decisão do
 * usuário, não do sistema.
 */
export function definirPipeline(nomeOuId, etapasNovas) {
  const bd = banco()
  const projeto = buscarProjeto(nomeOuId)
  const nomes = (etapasNovas ?? []).map((e) => String(e).trim()).filter(Boolean)
  if (!nomes.length) throw new ErroDeRegra('Um projeto precisa de pelo menos uma etapa.')
  if (new Set(nomes.map((n) => n.toLowerCase())).size !== nomes.length) {
    throw new ErroDeRegra('Duas etapas com o mesmo nome no mesmo projeto não são aceitas.')
  }

  const atuais = listarEtapas(projeto.id)
  const mantidas = new Set(nomes.map((n) => n.toLowerCase()))

  for (const etapa of atuais) {
    if (mantidas.has(etapa.nome.toLowerCase())) continue
    const { total } = bd
      .prepare('SELECT count(*) AS total FROM tarefas WHERE etapa_id = ?')
      .get(etapa.id)
    if (total) {
      throw new ErroDeRegra(
        `A etapa "${etapa.nome}" tem ${total} card(s). Mova esses cards antes de remover a etapa.`,
      )
    }
    bd.prepare('DELETE FROM etapas WHERE id = ?').run(etapa.id)
  }

  nomes.forEach((nome, posicao) => {
    const existente = atuais.find((e) => e.nome.toLowerCase() === nome.toLowerCase())
    if (existente) {
      bd.prepare('UPDATE etapas SET nome = ?, posicao = ? WHERE id = ?').run(
        nome,
        posicao,
        existente.id,
      )
    } else {
      bd.prepare('INSERT INTO etapas (projeto_id, nome, posicao) VALUES (?, ?, ?)').run(
        projeto.id,
        nome,
        posicao,
      )
    }
  })

  sincronizarStatus(projeto.id)
  return buscarProjeto(projeto.id)
}

export function arquivarProjeto(nomeOuId, arquivado = true) {
  const projeto = buscarProjeto(nomeOuId)
  if (projeto.nome === PROJETO_PADRAO && arquivado) {
    throw new ErroDeRegra(`O projeto "${PROJETO_PADRAO}" não pode ser arquivado.`)
  }
  banco().prepare('UPDATE projetos SET arquivado = ? WHERE id = ?').run(arquivado ? 1 : 0, projeto.id)
  return buscarProjeto(projeto.id)
}

/**
 * A última etapa do pipeline é a de conclusão — mas só se houver mais de uma.
 *
 * Num projeto de etapa única ela é também a primeira, e card não pode nascer
 * concluído.
 */
function etapaDeConclusao(etapas) {
  return etapas.length > 1 ? etapas.at(-1) : null
}

/** Status é derivado da etapa, nunca digitado. */
function sincronizarStatus(projetoId) {
  const etapas = listarEtapas(projetoId)
  if (!etapas.length) return
  const fim = etapaDeConclusao(etapas)
  if (!fim) {
    banco().prepare("UPDATE tarefas SET status = 'aberta' WHERE projeto_id = ?").run(projetoId)
    return
  }
  banco()
    .prepare(
      `UPDATE tarefas SET status = CASE WHEN etapa_id = ? THEN 'feita' ELSE 'aberta' END
       WHERE projeto_id = ?`,
    )
    .run(fim.id, projetoId)
}

function buscarEtapa(projetoId, nomeOuId) {
  const etapas = listarEtapas(projetoId)
  const alvo = String(nomeOuId ?? '').trim().toLowerCase()
  const etapa = etapas.find((e) => e.nome.toLowerCase() === alvo || String(e.id) === alvo)
  if (!etapa) {
    throw new ErroDeRegra(
      `Não existe etapa "${nomeOuId}" neste projeto. As que existem: ${etapas
        .map((e) => e.nome)
        .join(', ')}.`,
      404,
    )
  }
  return etapa
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/**
 * `#Ligação`, `ligacao` e ` LIGAÇÃO ` são a mesma tag.
 *
 * Sem normalizar, a base enche de variação da mesma coisa e o filtro por tag
 * para de servir para alguma coisa.
 */
/** "agente da Maria" → "agente-da-maria". Sem acento, sem espaço, sem símbolo. */
export function etiquetar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizarTag(nome) {
  return String(nome ?? '')
    .trim()
    .replace(/^#+/, '')
    .trim()
    .toLowerCase()
}

export function aplicarTags(cardId, nomes) {
  const bd = banco()
  for (const bruto of nomes ?? []) {
    const nome = normalizarTag(bruto)
    if (!nome) continue
    bd.prepare('INSERT OR IGNORE INTO tags (nome) VALUES (?)').run(nome)
    const tag = bd.prepare('SELECT id FROM tags WHERE nome = ?').get(nome)
    bd.prepare('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)').run(
      cardId,
      tag.id,
    )
  }
}

export function removerTag(cardId, nome) {
  banco()
    .prepare(
      'DELETE FROM card_tags WHERE card_id = ? AND tag_id = (SELECT id FROM tags WHERE nome = ?)',
    )
    .run(cardId, normalizarTag(nome))
}

export function tagsDoCard(cardId) {
  return banco()
    .prepare(
      `SELECT t.nome FROM tags t JOIN card_tags ct ON ct.tag_id = t.id
       WHERE ct.card_id = ? ORDER BY t.nome`,
    )
    .all(cardId)
    .map((r) => r.nome)
}

export function listarTags() {
  return banco()
    .prepare(
      `SELECT t.nome, count(ct.card_id) AS usos FROM tags t
       LEFT JOIN card_tags ct ON ct.tag_id = t.id
       GROUP BY t.id ORDER BY usos DESC, t.nome`,
    )
    .all()
}

// ---------------------------------------------------------------------------
// Dependências
// ---------------------------------------------------------------------------

function formariaCiclo(cardId, dependeDeId) {
  const bd = banco()
  const vistos = new Set()
  const fila = [dependeDeId]
  while (fila.length) {
    const atual = fila.pop()
    if (atual === cardId) return true
    if (vistos.has(atual)) continue
    vistos.add(atual)
    for (const r of bd
      .prepare('SELECT depende_de_id FROM dependencias WHERE card_id = ?')
      .all(atual)) {
      fila.push(r.depende_de_id)
    }
  }
  return false
}

export function criarDependencia({ cardId, dependeDeId, confirmada = false }) {
  cardId = Number(cardId)
  dependeDeId = Number(dependeDeId)
  buscarCardCru(cardId)
  buscarCardCru(dependeDeId)
  if (cardId === dependeDeId) throw new ErroDeRegra('Um card não pode depender dele mesmo.')
  if (formariaCiclo(cardId, dependeDeId)) {
    const a = buscarCardCru(cardId)
    const b = buscarCardCru(dependeDeId)
    throw new ErroDeRegra(
      `Isso fecharia um ciclo: "${b.titulo}" (${b.id}) já depende, direta ou indiretamente, ` +
        `de "${a.titulo}" (${a.id}).`,
    )
  }
  banco()
    .prepare(
      `INSERT INTO dependencias (card_id, depende_de_id, confirmada, criada_em)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(card_id, depende_de_id) DO UPDATE SET confirmada = excluded.confirmada`,
    )
    .run(cardId, dependeDeId, confirmada ? 1 : 0, agora())
  return dependenciasDoCard(cardId)
}

export function confirmarDependencia(cardId, dependeDeId, confirmada = true) {
  const { changes } = banco()
    .prepare('UPDATE dependencias SET confirmada = ? WHERE card_id = ? AND depende_de_id = ?')
    .run(confirmada ? 1 : 0, Number(cardId), Number(dependeDeId))
  if (!changes) throw new ErroDeRegra('Essa dependência não existe.', 404)
  return dependenciasDoCard(Number(cardId))
}

export function removerDependencia(cardId, dependeDeId) {
  banco()
    .prepare('DELETE FROM dependencias WHERE card_id = ? AND depende_de_id = ?')
    .run(Number(cardId), Number(dependeDeId))
  return dependenciasDoCard(Number(cardId))
}

export function dependenciasDoCard(cardId) {
  return banco()
    .prepare(
      `SELECT d.depende_de_id AS id, t.titulo, t.status, d.confirmada
       FROM dependencias d JOIN tarefas t ON t.id = d.depende_de_id
       WHERE d.card_id = ? ORDER BY d.criada_em`,
    )
    .all(cardId)
    .map((d) => ({ ...d, confirmada: !!d.confirmada }))
}

/**
 * Aguardando = tem dependência CONFIRMADA ainda aberta.
 *
 * Sugestão não confirmada não trava nada — é a regra 4.2 do PRD, e ela é o que
 * impede a IA de parar o trabalho de alguém por um palpite.
 */
export function estaAguardando(cardId) {
  return banco()
    .prepare(
      `SELECT t.id, t.titulo FROM dependencias d JOIN tarefas t ON t.id = d.depende_de_id
       WHERE d.card_id = ? AND d.confirmada = 1 AND t.status = 'aberta'`,
    )
    .all(cardId)
}

/** Quem está esperando por este card. O inverso de `dependenciasDoCard`. */
export function bloqueia(cardId) {
  return banco()
    .prepare(
      `SELECT t.id, t.titulo, t.prioridade FROM dependencias d JOIN tarefas t ON t.id = d.card_id
       WHERE d.depende_de_id = ? AND d.confirmada = 1 AND t.status = 'aberta'`,
    )
    .all(Number(cardId))
}

/** O que a conclusão deste card destravou. Consulta ao banco — sem IA nenhuma. */
export function desbloqueadasPor(cardId) {
  return banco()
    .prepare(
      `SELECT t.id, t.titulo FROM dependencias d JOIN tarefas t ON t.id = d.card_id
       WHERE d.depende_de_id = ? AND d.confirmada = 1 AND t.status = 'aberta'`,
    )
    .all(Number(cardId))
    .filter((c) => estaAguardando(c.id).length === 0)
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function buscarCardCru(id) {
  const card = banco().prepare('SELECT * FROM tarefas WHERE id = ?').get(Number(id))
  if (!card) throw new ErroDeRegra(`Não existe card com id ${id}.`, 404)
  return card
}

function enriquecer(card) {
  const bd = banco()
  const projeto = card.projeto_id
    ? bd.prepare('SELECT nome FROM projetos WHERE id = ?').get(card.projeto_id)
    : null
  const etapa = card.etapa_id
    ? bd.prepare('SELECT nome, posicao FROM etapas WHERE id = ?').get(card.etapa_id)
    : null
  return {
    ...card,
    hoje: !!card.hoje,
    prioridade_sugerida: !!card.prioridade_sugerida,
    projeto: projeto?.nome ?? null,
    etapa: etapa?.nome ?? null,
    etapa_posicao: etapa?.posicao ?? null,
    tags: tagsDoCard(card.id),
    aguardando: estaAguardando(card.id),
    dependencias: dependenciasDoCard(card.id),
  }
}

export function buscarCard(id) {
  return enriquecer(buscarCardCru(id))
}

/**
 * Busca por trecho do título. Devolve TODOS os parecidos, de propósito: quem
 * chama decide o que fazer com mais de um resultado.
 *
 * O agente tem ordem de perguntar qual é — não de escolher o primeiro.
 */
export function procurarCards(texto, { apenasAbertas = true } = {}) {
  return banco()
    .prepare(
      `SELECT * FROM tarefas WHERE titulo LIKE ?
       ${apenasAbertas ? "AND status = 'aberta'" : ''} ORDER BY id`,
    )
    .all(`%${texto}%`)
    .map(enriquecer)
}

export function criarCard({
  titulo,
  descricao = null,
  projeto = null,
  etapa = null,
  tipo = 'tarefa',
  data = null,
  tags = [],
  prioridade = null,
  origem = null,
}) {
  const bd = banco()
  titulo = (titulo ?? '').trim()
  if (!titulo) throw new ErroDeRegra('Card sem título não é aceito.')

  if (!TIPOS.includes(tipo)) {
    throw new ErroDeRegra(`Tipo tem que ser "tarefa" ou "ideia" — veio "${tipo}".`)
  }
  if (prioridade && !PRIORIDADES.includes(prioridade)) {
    throw new ErroDeRegra(`Prioridade tem que ser alta, media ou baixa — veio "${prioridade}".`)
  }

  const proj = projeto ? buscarProjeto(projeto) : buscarProjeto(PROJETO_PADRAO)
  const etapas = listarEtapas(proj.id)
  const et = etapa ? buscarEtapa(proj.id, etapa) : etapas[0]

  const { lastInsertRowid } = bd
    .prepare(
      `INSERT INTO tarefas
         (titulo, descricao, tipo, data, status, prioridade, prioridade_origem,
          prioridade_sugerida, projeto_id, etapa_id, criado_em, movido_em, origem)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    )
    .run(
      titulo,
      descricao,
      tipo,
      data || hoje(),
      et.id === etapaDeConclusao(etapas)?.id ? 'feita' : 'aberta',
      prioridade || 'media',
      prioridade ? 'usuario' : 'ia',
      proj.id,
      et.id,
      agora(),
      agora(),
      origem,
    )

  const id = Number(lastInsertRowid)

  // A origem também vira tag. Num quadro compartilhado numa demonstração ao
  // vivo é o que permite filtrar "só o que o agente da Maria escreveu" com o
  // mesmo filtro de sempre, sem inventar uma tela nova.
  //
  // O nome vira etiqueta: "agente da Maria" → "via-agente-da-maria". Tag com
  // espaço é ruim de digitar no filtro e pior de passar para o agente.
  aplicarTags(id, origem ? [...tags, `via-${etiquetar(origem)}`] : tags)
  return buscarCard(id)
}

export function atualizarCard(id, campos = {}) {
  const bd = banco()
  const card = buscarCardCru(id)
  const mudancas = []
  const valores = []

  if (campos.titulo !== undefined) {
    const titulo = String(campos.titulo).trim()
    if (!titulo) throw new ErroDeRegra('Card sem título não é aceito.')
    mudancas.push('titulo = ?')
    valores.push(titulo)
  }
  if (campos.descricao !== undefined) {
    mudancas.push('descricao = ?')
    valores.push(campos.descricao)
  }
  if (campos.tipo !== undefined) {
    if (!TIPOS.includes(campos.tipo)) {
      throw new ErroDeRegra(`Tipo tem que ser "tarefa" ou "ideia" — veio "${campos.tipo}".`)
    }
    mudancas.push('tipo = ?')
    valores.push(campos.tipo)
  }
  if (campos.data !== undefined) {
    mudancas.push('data = ?')
    valores.push(campos.data)
  }

  // Prioridade posta à mão passa a ser do usuário, e a IA não mexe mais nela.
  if (campos.prioridade !== undefined) {
    if (!PRIORIDADES.includes(campos.prioridade)) {
      throw new ErroDeRegra(
        `Prioridade tem que ser alta, media ou baixa — veio "${campos.prioridade}".`,
      )
    }
    mudancas.push('prioridade = ?', "prioridade_origem = 'usuario'", 'prioridade_sugerida = 0')
    valores.push(campos.prioridade)
  }

  if (campos.projeto !== undefined) {
    const proj = buscarProjeto(campos.projeto)
    const etapas = listarEtapas(proj.id)
    const et = campos.etapa ? buscarEtapa(proj.id, campos.etapa) : etapas[0]
    mudancas.push('projeto_id = ?', 'etapa_id = ?', 'movido_em = ?')
    valores.push(proj.id, et.id, agora())
    mudancas.push('status = ?')
    valores.push(et.id === etapaDeConclusao(etapas)?.id ? 'feita' : 'aberta')
  } else if (campos.etapa !== undefined) {
    return moverCard(id, campos.etapa)
  }

  if (mudancas.length) {
    bd.prepare(`UPDATE tarefas SET ${mudancas.join(', ')} WHERE id = ?`).run(...valores, card.id)
  }
  if (campos.tags !== undefined) {
    bd.prepare('DELETE FROM card_tags WHERE card_id = ?').run(card.id)
    aplicarTags(card.id, campos.tags)
  }
  return buscarCard(card.id)
}

/**
 * Move o card de etapa. Entrar na última etapa é concluir — e concluir devolve
 * o que foi destravado, porque é isso que fecha o loop para quem precisa ver
 * progresso (PRD v2, 4.3).
 */
export function moverCard(id, etapaNomeOuId) {
  const bd = banco()
  const card = buscarCardCru(id)
  const etapas = listarEtapas(card.projeto_id)
  const etapa = buscarEtapa(card.projeto_id, etapaNomeOuId)
  const virouFeita = etapa.id === etapaDeConclusao(etapas)?.id
  const eraFeita = card.status === 'feita'

  bd.prepare('UPDATE tarefas SET etapa_id = ?, status = ?, movido_em = ?, hoje = ? WHERE id = ?').run(
    etapa.id,
    virouFeita ? 'feita' : 'aberta',
    agora(),
    virouFeita ? 0 : card.hoje,
    card.id,
  )

  return {
    card: buscarCard(card.id),
    desbloqueadas: virouFeita && !eraFeita ? desbloqueadasPor(card.id) : [],
  }
}

export function concluirCard(id) {
  const card = buscarCardCru(id)
  const etapas = listarEtapas(card.projeto_id)
  const fim = etapaDeConclusao(etapas)
  if (!fim) {
    throw new ErroDeRegra(
      `O projeto "${buscarProjeto(card.projeto_id).nome}" tem uma etapa só, então não há ` +
        `etapa de conclusão. Adicione uma etapa final ao pipeline.`,
    )
  }
  return moverCard(card.id, fim.id)
}

/**
 * Adiar muda a data. Não conclui, não apaga, e tira o card do teto do dia —
 * adiar é justamente dizer "hoje não".
 */
export function adiarCard(id, novaData) {
  const card = buscarCardCru(id)
  const data = interpretarData(novaData)
  if (!data) throw new ErroDeRegra(`Não entendi a data "${novaData}".`)
  if (card.status === 'feita') {
    throw new ErroDeRegra('Card já concluído não é adiado. Reabra ele antes, se for o caso.')
  }
  banco().prepare('UPDATE tarefas SET data = ?, hoje = 0 WHERE id = ?').run(data, card.id)
  return buscarCard(card.id)
}

export function reabrirCard(id) {
  const card = buscarCardCru(id)
  const etapas = listarEtapas(card.projeto_id)
  return moverCard(card.id, etapas[0].id).card
}

export function excluirCard(id) {
  const card = buscarCardCru(id)
  banco().prepare('DELETE FROM tarefas WHERE id = ?').run(card.id)
  return { id: card.id, titulo: card.titulo }
}

/**
 * Aceita a prioridade que a IA sugeriu.
 *
 * Aceitar carimba a prioridade como do USUÁRIO: a partir daqui nenhuma rodada
 * de IA encosta nela. É o que faz a sugestão virar decisão — e é a diferença
 * entre um sistema que pergunta e um que insiste.
 */
export function aceitarSugestao(id) {
  const card = buscarCardCru(id)
  if (!card.prioridade_sugerida) {
    throw new ErroDeRegra('Este card não tem prioridade sugerida para aceitar.')
  }
  banco()
    .prepare(
      "UPDATE tarefas SET prioridade_origem = 'usuario', prioridade_sugerida = 0 WHERE id = ?",
    )
    .run(card.id)
  registrarConfirmacao(card.projeto_id)
  return buscarCard(card.id)
}

/** Recusa a sugestão: volta para média e tira o pedido de confirmação da tela. */
export function recusarSugestao(id) {
  const card = buscarCardCru(id)
  banco()
    .prepare(
      "UPDATE tarefas SET prioridade = 'media', justificativa = NULL," +
        " prioridade_origem = 'usuario', prioridade_sugerida = 0 WHERE id = ?",
    )
    .run(card.id)
  return buscarCard(card.id)
}

/**
 * Conta as sugestões aceitas por projeto.
 *
 * Ao chegar em três, o sistema passa a oferecer transformar o padrão observado
 * em contexto escrito (PRD v2, 4.1) — em vez de continuar adivinhando para
 * sempre, ele pede para a pessoa escrever a regra uma vez.
 */
const CONFIRMACOES_ATE_OFERECER = 3
const confirmacoesPorProjeto = new Map()

function registrarConfirmacao(projetoId) {
  confirmacoesPorProjeto.set(projetoId, (confirmacoesPorProjeto.get(projetoId) ?? 0) + 1)
}

/**
 * O projeto já acumulou confirmações suficientes e ainda não tem contexto?
 *
 * Devolve o que a tela precisa para fazer a oferta, ou null. A contagem é da
 * sessão: se o servidor reinicia, a oferta espera as próximas três — de
 * propósito, para não perseguir a pessoa entre um dia e outro.
 */
export function ofertaDeContexto(projetoId) {
  const projeto = buscarProjeto(projetoId, { obrigatorio: false })
  if (!projeto || projeto.contexto?.trim()) return null
  const confirmacoes = confirmacoesPorProjeto.get(projeto.id) ?? 0
  if (confirmacoes < CONFIRMACOES_ATE_OFERECER) return null

  const aceitas = listarCards({ projeto: projeto.id, status: 'aberto' })
    .filter((c) => c.prioridade_origem === 'usuario' && c.justificativa)
    .slice(0, 6)
    .map((c) => ({ titulo: c.titulo, prioridade: c.prioridade, porque: c.justificativa }))

  return { projeto: projeto.nome, confirmacoes, exemplos: aceitas }
}

/** Zera a contagem — chamado quando a oferta é aceita ou dispensada. */
export function dispensarOferta(projetoId) {
  const projeto = buscarProjeto(projetoId)
  confirmacoesPorProjeto.set(projeto.id, 0)
  return { projeto: projeto.nome }
}

/**
 * Marca o card como "hoje de verdade". No máximo três — o dia tem teto, e é
 * ele que faz o dia terminar inteiro em vez de terminar em dívida.
 */
export function marcarHoje(id, valor = true) {
  const bd = banco()
  const card = buscarCardCru(id)
  if (valor) {
    if (card.status === 'feita') throw new ErroDeRegra('Card já concluído não entra no dia.')
    const { total } = bd
      .prepare("SELECT count(*) AS total FROM tarefas WHERE hoje = 1 AND status = 'aberta'")
      .get()
    if (!card.hoje && total >= TETO_DO_DIA) {
      throw new ErroDeRegra(
        `O dia já tem ${TETO_DO_DIA} cards. Tire um antes de colocar outro — ` +
          `um dia com três coisas possíveis é um dia que termina inteiro.`,
      )
    }
  }
  bd.prepare('UPDATE tarefas SET hoje = ? WHERE id = ?').run(valor ? 1 : 0, card.id)
  return buscarCard(card.id)
}

/** Entende "hoje", "amanhã", "sexta", "3d" e datas soltas. Devolve YYYY-MM-DD. */
export function interpretarData(texto) {
  if (!texto) return null
  const bruto = String(texto).trim().toLowerCase()
  if (/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return bruto

  const base = new Date()
  base.setHours(12, 0, 0, 0)
  const somar = (dias) => {
    const d = new Date(base)
    d.setDate(d.getDate() + dias)
    return d.toISOString().slice(0, 10)
  }

  if (bruto === 'hoje') return somar(0)
  if (bruto === 'amanha' || bruto === 'amanhã') return somar(1)
  if (bruto === 'depois de amanha' || bruto === 'depois de amanhã') return somar(2)

  const emDias = bruto.match(/^(\d+)\s*d(ias?)?$/)
  if (emDias) return somar(Number(emDias[1]))

  const semanas = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
  const semAcento = bruto.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const alvo = semanas.indexOf(semAcento.replace(/-feira$/, '').trim())
  if (alvo >= 0) {
    const diferenca = (alvo - base.getDay() + 7) % 7 || 7
    return somar(diferenca)
  }

  const brasileira = bruto.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/)
  if (brasileira) {
    const [, dia, mes, ano] = brasileira
    const anoCheio = ano ? (ano.length === 2 ? `20${ano}` : ano) : String(base.getFullYear())
    return `${anoCheio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
  }
  return null
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

const ORDEM_PRIORIDADE = { alta: 0, media: 1, baixa: 2 }

/**
 * A consulta que o quadro, os filtros e o agente usam.
 *
 * `status` aceita aberto | feito | todos — os três filtros do PRD, com os
 * nomes que aparecem na tela.
 */
export function listarCards({
  projeto = null,
  status = 'aberto',
  tag = null,
  tipo = null,
  ate = null,
  hojeApenas = false,
  busca = null,
} = {}) {
  const condicoes = []
  const valores = []

  if (projeto) {
    condicoes.push('t.projeto_id = ?')
    valores.push(buscarProjeto(projeto).id)
  }
  if (status === 'aberto') condicoes.push("t.status = 'aberta'")
  else if (status === 'feito') condicoes.push("t.status = 'feita'")

  if (tipo) {
    condicoes.push('t.tipo = ?')
    valores.push(tipo)
  }
  if (ate) {
    condicoes.push('t.data <= ?')
    valores.push(ate)
  }
  if (hojeApenas) condicoes.push('t.hoje = 1')
  if (busca) {
    condicoes.push('(t.titulo LIKE ? OR t.descricao LIKE ?)')
    valores.push(`%${busca}%`, `%${busca}%`)
  }
  if (tag) {
    condicoes.push(
      `t.id IN (SELECT ct.card_id FROM card_tags ct JOIN tags tg ON tg.id = ct.tag_id
                WHERE tg.nome = ?)`,
    )
    valores.push(normalizarTag(tag))
  }

  const onde = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''
  return banco()
    .prepare(`SELECT t.* FROM tarefas t ${onde} ORDER BY t.data, t.id`)
    .all(...valores)
    .map(enriquecer)
}

/** A lista de hoje: tarefas abertas com data até hoje. Ideia não entra. */
export function listaDeHoje() {
  return listarCards({ status: 'aberto', tipo: 'tarefa', ate: hoje() }).sort(
    (a, b) => ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade],
  )
}

/**
 * O modo "e agora?": UM card, o próximo, com o porquê.
 *
 * A fila pula o que está aguardando dependência confirmada — não adianta
 * mandar alguém fazer o que está travado.
 */
export function proxima({ projeto = null, pular = [] } = {}) {
  const candidatos = listarCards({ projeto, status: 'aberto', tipo: 'tarefa', ate: hoje() })
    .filter((c) => !c.aguardando.length)
    .filter((c) => !pular.map(Number).includes(c.id))
    .sort((a, b) => {
      if (a.hoje !== b.hoje) return a.hoje ? -1 : 1
      const p = ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade]
      if (p) return p
      return a.data.localeCompare(b.data) || a.id - b.id
    })

  const card = candidatos[0] ?? null
  return {
    card,
    restantes: Math.max(0, candidatos.length - 1),
    porque: card ? explicarEscolha(card) : null,
  }
}

function explicarEscolha(card) {
  if (card.justificativa) return card.justificativa
  if (card.hoje) return 'Você marcou como uma das três coisas de hoje.'
  if (card.data < hoje()) return `Estava marcada para ${card.data} e ainda está aberta.`
  if (card.prioridade === 'alta') return 'É a de maior prioridade entre as abertas de hoje.'
  return 'É a mais antiga entre as abertas de hoje.'
}

/**
 * Cards parados na mesma etapa há muito tempo.
 *
 * Quase nunca é preguiça — quase sempre é uma tarefa grande demais disfarçada
 * de tarefa (PRD v2, 4.5).
 */
export function cardsParados(dias) {
  const limite = new Date()
  limite.setDate(limite.getDate() - dias)
  const corte = agora(limite)
  return listarCards({ status: 'aberto' }).filter((c) => (c.movido_em ?? c.criado_em) < corte)
}

/** O que venceu e continua aberto. Alimenta o replanejamento em bloco. */
export function cardsAtrasados() {
  return listarCards({ status: 'aberto', tipo: 'tarefa' }).filter((c) => c.data < hoje())
}

/**
 * Replanejamento em bloco: adia tudo que venceu de uma vez.
 *
 * Existe para que atraso não vire uma tela vermelha acumulando culpa — é a
 * decisão 4 da Parte 5 do PRD.
 */
export function replanejar(novaData) {
  const data = interpretarData(novaData) ?? hoje()
  const atrasados = cardsAtrasados()
  for (const card of atrasados) {
    banco().prepare('UPDATE tarefas SET data = ? WHERE id = ?').run(data, card.id)
  }
  return { adiados: atrasados.length, para: data }
}

export function concluidosEm(data = hoje()) {
  return banco()
    .prepare(
      `SELECT * FROM tarefas WHERE status = 'feita' AND substr(movido_em, 1, 10) = ? ORDER BY id`,
    )
    .all(data)
    .map(enriquecer)
}
