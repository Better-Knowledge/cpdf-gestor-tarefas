/**
 * Testes das regras de negócio.
 *
 * Rode com: npm test
 *
 * Cada teste é uma regra do PRD escrita em código. Se um deles quebrar depois
 * de o agente mexer no sistema, é a pergunta 4 do slide 15 ("o que já
 * funcionava continua funcionando?") sendo respondida de graça.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BANCO_DE_TESTE = join(tmpdir(), `gestor-teste-${process.pid}.db`)
process.env.BANCO = BANCO_DE_TESTE

const db = await import('../server/db.js')
const r = await import('../server/regras.js')

before(() => db.banco())
after(() => {
  db.fechar()
  for (const sufixo of ['', '-wal', '-shm']) {
    rmSync(BANCO_DE_TESTE + sufixo, { force: true })
  }
})

// --- Projeto padrão --------------------------------------------------------

test('nasce com o projeto padrão e o pipeline simples', () => {
  const projetos = r.listarProjetos()
  assert.equal(projetos.length, 1)
  assert.equal(projetos[0].nome, 'Dia a dia')
  assert.deepEqual(
    projetos[0].etapas.map((e) => e.nome),
    ['A fazer', 'Fazendo', 'Feito'],
  )
})

// --- Card: as regras da v1 -------------------------------------------------

test('card sem título é recusado', () => {
  assert.throws(() => r.criarCard({ titulo: '   ' }), /sem título/)
})

test('card nasce no projeto padrão, na primeira etapa, com data de hoje', () => {
  const card = r.criarCard({ titulo: 'ligar pro contador' })
  assert.equal(card.projeto, 'Dia a dia')
  assert.equal(card.etapa, 'A fazer')
  assert.equal(card.status, 'aberta')
  assert.equal(card.data, db.hoje())
})

test('ideia é guardada, mas não entra na lista de tarefas de hoje', () => {
  r.criarCard({ titulo: 'oferecer diagnóstico como serviço', tipo: 'ideia' })
  const titulos = r.listaDeHoje().map((c) => c.titulo)
  assert.ok(!titulos.includes('oferecer diagnóstico como serviço'))
  assert.equal(r.listarCards({ tipo: 'ideia' }).length, 1)
})

test('concluir tira da lista de abertas e não volta no dia seguinte', () => {
  const card = r.criarCard({ titulo: 'mandar a nota fiscal' })
  const { card: feito } = r.concluirCard(card.id)
  assert.equal(feito.status, 'feita')
  assert.equal(feito.etapa, 'Feito')
  assert.ok(!r.listarCards({ status: 'aberto' }).some((c) => c.id === card.id))
  assert.ok(r.listarCards({ status: 'feito' }).some((c) => c.id === card.id))
})

test('adiar muda a data, não conclui e não apaga', () => {
  const card = r.criarCard({ titulo: 'revisar a proposta' })
  const adiado = r.adiarCard(card.id, 'amanha')
  assert.notEqual(adiado.data, db.hoje())
  assert.equal(adiado.status, 'aberta')
  assert.ok(!r.listaDeHoje().some((c) => c.id === card.id))
})

test('a data é do fuso local, não UTC — card criado às 22h ainda é de hoje', () => {
  // Regressão: com toISOString(), "hoje" virava amanhã depois das 21h no Brasil,
  // e o card sumia da lista de hoje no momento em que era criado.
  const noiteLocal = new Date()
  noiteLocal.setHours(22, 30, 0, 0)
  assert.equal(db.hoje(noiteLocal), db.hoje(new Date(noiteLocal.getTime() - 6 * 3600_000)))
  assert.equal(db.hoje(), r.interpretarData('hoje'))
  assert.ok(db.agora().startsWith(db.hoje()))
})

test('interpretar data entende hoje, amanhã, dias, dia da semana e 16/08', () => {
  assert.equal(r.interpretarData('hoje'), db.hoje())
  assert.match(r.interpretarData('amanhã'), /^\d{4}-\d{2}-\d{2}$/)
  assert.match(r.interpretarData('3d'), /^\d{4}-\d{2}-\d{2}$/)
  assert.match(r.interpretarData('sexta'), /^\d{4}-\d{2}-\d{2}$/)
  assert.match(r.interpretarData('sexta-feira'), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(r.interpretarData('16/08/2026'), '2026-08-16')
  assert.equal(r.interpretarData('banana'), null)
})

// --- Projetos e pipelines --------------------------------------------------

test('projeto novo com pipeline próprio', () => {
  const projeto = r.criarProjeto({
    nome: 'Curso',
    contexto: 'A turma começa em 3 de setembro e não muda.',
    pipeline: ['Ideia', 'Roteiro', 'Gravado', 'Editado', 'Publicado'],
  })
  assert.equal(projeto.nome, 'Curso')
  assert.deepEqual(
    r.listarEtapas(projeto.id).map((e) => e.nome),
    ['Ideia', 'Roteiro', 'Gravado', 'Editado', 'Publicado'],
  )
})

test('projeto duplicado é recusado', () => {
  assert.throws(() => r.criarProjeto({ nome: 'curso' }), /Já existe/)
})

test('projeto que não existe erra dizendo quais existem', () => {
  assert.throws(() => r.buscarProjeto('Cursso'), /Não existe projeto/)
})

test('mover para a última etapa conclui o card', () => {
  const card = r.criarCard({ titulo: 'gravar a aula 1', projeto: 'Curso' })
  assert.equal(card.etapa, 'Ideia')
  const { card: movido } = r.moverCard(card.id, 'Gravado')
  assert.equal(movido.status, 'aberta')
  const { card: publicado } = r.moverCard(card.id, 'Publicado')
  assert.equal(publicado.status, 'feita')
})

test('remover etapa com card dentro é recusado', () => {
  r.criarCard({ titulo: 'gravar a aula 2', projeto: 'Curso', etapa: 'Roteiro' })
  assert.throws(
    () => r.definirPipeline('Curso', ['Ideia', 'Gravado', 'Editado', 'Publicado']),
    /tem 1 card/,
  )
})

test('renomear e reordenar etapa não perde card', () => {
  const antes = r.listarCards({ projeto: 'Curso', status: 'todos' }).length
  r.definirPipeline('Curso', ['Ideia', 'Roteiro', 'Gravado', 'Edição', 'Publicado'])
  const depois = r.listarCards({ projeto: 'Curso', status: 'todos' }).length
  assert.equal(antes, depois)
})

// --- Tags ------------------------------------------------------------------

test('tag é normalizada: #Ligação e ligacao viram a mesma', () => {
  const card = r.criarCard({ titulo: 'ligar pro banco', tags: ['#Ligação', 'ligação', '5min'] })
  assert.deepEqual(card.tags.sort(), ['5min', 'ligação'])
})

test('filtro por tag combina com filtro de status', () => {
  const comTag = r.listarCards({ tag: 'ligação', status: 'aberto' })
  assert.equal(comTag.length, 1)
  assert.equal(comTag[0].titulo, 'ligar pro banco')
})

// --- Prioridade ------------------------------------------------------------

test('prioridade posta à mão vira do usuário e não é mais sugestão', () => {
  const card = r.criarCard({ titulo: 'fechar o mês' })
  assert.equal(card.prioridade_origem, 'ia')
  const editado = r.atualizarCard(card.id, { prioridade: 'alta' })
  assert.equal(editado.prioridade, 'alta')
  assert.equal(editado.prioridade_origem, 'usuario')
  assert.equal(editado.prioridade_sugerida, false)
})

test('prioridade inválida é recusada', () => {
  const card = r.criarCard({ titulo: 'teste de prioridade' })
  assert.throws(() => r.atualizarCard(card.id, { prioridade: 'urgentíssima' }), /alta, media ou baixa/)
})

// --- Sugestão de prioridade e a oferta de contexto -------------------------

/** A IA só marca sugestão quando o projeto não tem contexto escrito. */
function simularSugestao(cardId, prioridade = 'alta') {
  db.banco()
    .prepare(
      "UPDATE tarefas SET prioridade = ?, prioridade_origem = 'ia', prioridade_sugerida = 1," +
        ' justificativa = ? WHERE id = ?',
    )
    .run(prioridade, 'tem data marcada e o projeto não tem contexto', cardId)
}

test('aceitar a sugestão carimba a prioridade como do usuário', () => {
  const card = r.criarCard({ titulo: 'sugestão a aceitar' })
  simularSugestao(card.id)
  assert.equal(r.buscarCard(card.id).prioridade_sugerida, true)

  const aceito = r.aceitarSugestao(card.id)
  assert.equal(aceito.prioridade, 'alta')
  assert.equal(aceito.prioridade_origem, 'usuario')
  assert.equal(aceito.prioridade_sugerida, false)
})

test('recusar a sugestão volta para média e não deixa a IA mexer de novo', () => {
  const card = r.criarCard({ titulo: 'sugestão a recusar' })
  simularSugestao(card.id)
  const recusado = r.recusarSugestao(card.id)
  assert.equal(recusado.prioridade, 'media')
  assert.equal(recusado.prioridade_origem, 'usuario')
  assert.equal(recusado.justificativa, null)
})

test('aceitar o que não é sugestão é recusado', () => {
  const card = r.criarCard({ titulo: 'sem sugestão nenhuma' })
  assert.throws(() => r.aceitarSugestao(card.id), /não tem prioridade sugerida/)
})

test('três confirmações num projeto sem contexto disparam a oferta', () => {
  const projeto = r.criarProjeto({ nome: 'Sem contexto' })
  assert.equal(r.ofertaDeContexto(projeto.id), null, 'não oferece do nada')

  for (const n of [1, 2, 3]) {
    const card = r.criarCard({ titulo: `confirmada ${n}`, projeto: 'Sem contexto' })
    simularSugestao(card.id)
    r.aceitarSugestao(card.id)
    if (n < 3) assert.equal(r.ofertaDeContexto(projeto.id), null, `não oferece com ${n}`)
  }

  const oferta = r.ofertaDeContexto(projeto.id)
  assert.ok(oferta, 'na terceira, oferece')
  assert.equal(oferta.projeto, 'Sem contexto')
  assert.equal(oferta.confirmacoes, 3)
  assert.ok(oferta.exemplos.length >= 1, 'a oferta leva exemplos do padrão observado')
})

test('projeto que já tem contexto escrito nunca recebe a oferta', () => {
  const projeto = r.criarProjeto({ nome: 'Com contexto', contexto: 'O que tem data vem antes.' })
  for (const n of [1, 2, 3, 4]) {
    const card = r.criarCard({ titulo: `com contexto ${n}`, projeto: 'Com contexto' })
    simularSugestao(card.id)
    r.aceitarSugestao(card.id)
  }
  assert.equal(r.ofertaDeContexto(projeto.id), null)
})

test('dispensar a oferta zera a contagem', () => {
  const projeto = r.buscarProjeto('Sem contexto')
  assert.ok(r.ofertaDeContexto(projeto.id))
  r.dispensarOferta(projeto.id)
  assert.equal(r.ofertaDeContexto(projeto.id), null)
})

// --- Dependências ----------------------------------------------------------

test('dependência confirmada marca o card como aguardando; sugestão não', () => {
  const editor = r.criarCard({ titulo: 'contratar o editor', projeto: 'Curso' })
  const editar = r.criarCard({ titulo: 'editar a aula 2', projeto: 'Curso' })

  r.criarDependencia({ cardId: editar.id, dependeDeId: editor.id, confirmada: false })
  assert.equal(r.buscarCard(editar.id).aguardando.length, 0, 'sugestão não pode travar')

  r.confirmarDependencia(editar.id, editor.id)
  assert.equal(r.buscarCard(editar.id).aguardando.length, 1)
  assert.equal(r.buscarCard(editar.id).aguardando[0].titulo, 'contratar o editor')
})

test('dependência circular é recusada mostrando as duas pontas', () => {
  const a = r.criarCard({ titulo: 'card A' })
  const b = r.criarCard({ titulo: 'card B' })
  r.criarDependencia({ cardId: b.id, dependeDeId: a.id, confirmada: true })
  assert.throws(
    () => r.criarDependencia({ cardId: a.id, dependeDeId: b.id }),
    /fecharia um ciclo/,
  )
})

test('card não pode depender dele mesmo', () => {
  const card = r.criarCard({ titulo: 'card sozinho' })
  assert.throws(() => r.criarDependencia({ cardId: card.id, dependeDeId: card.id }), /dele mesmo/)
})

test('concluir devolve o que foi destravado — sem IA nenhuma', () => {
  const base = r.criarCard({ titulo: 'comprar o microfone', projeto: 'Curso' })
  const um = r.criarCard({ titulo: 'gravar a aula 3', projeto: 'Curso' })
  const dois = r.criarCard({ titulo: 'gravar a aula 4', projeto: 'Curso' })
  r.criarDependencia({ cardId: um.id, dependeDeId: base.id, confirmada: true })
  r.criarDependencia({ cardId: dois.id, dependeDeId: base.id, confirmada: true })

  const { desbloqueadas } = r.concluirCard(base.id)
  assert.equal(desbloqueadas.length, 2)
  assert.deepEqual(desbloqueadas.map((d) => d.titulo).sort(), [
    'gravar a aula 3',
    'gravar a aula 4',
  ])
})

test('card com duas dependências só é destravado quando as duas caem', () => {
  const a = r.criarCard({ titulo: 'pré-requisito A' })
  const b = r.criarCard({ titulo: 'pré-requisito B' })
  const final = r.criarCard({ titulo: 'a tarefa final' })
  r.criarDependencia({ cardId: final.id, dependeDeId: a.id, confirmada: true })
  r.criarDependencia({ cardId: final.id, dependeDeId: b.id, confirmada: true })

  assert.equal(r.concluirCard(a.id).desbloqueadas.length, 0, 'ainda falta o B')
  assert.equal(r.concluirCard(b.id).desbloqueadas.length, 1)
})

// --- O teto do dia ---------------------------------------------------------

/** O teto é global, então quem marca card no teste tem que desmarcar depois. */
function limparODia() {
  for (const card of r.listarCards({ status: 'aberto', hojeApenas: true })) {
    r.marcarHoje(card.id, false)
  }
}

test('o dia tem teto de três cards', () => {
  const cards = [1, 2, 3, 4].map((n) => r.criarCard({ titulo: `foco ${n}` }))
  cards.slice(0, 3).forEach((c) => r.marcarHoje(c.id))
  assert.throws(() => r.marcarHoje(cards[3].id), /já tem 3 cards/)
  r.marcarHoje(cards[0].id, false)
  assert.doesNotThrow(() => r.marcarHoje(cards[3].id))
  limparODia()
})

test('adiar tira o card do dia', () => {
  const card = r.criarCard({ titulo: 'sai do dia' })
  r.marcarHoje(card.id)
  assert.equal(r.buscarCard(card.id).hoje, true)
  assert.equal(r.adiarCard(card.id, 'amanha').hoje, false)
})

// --- O modo "e agora?" -----------------------------------------------------

test('proxima devolve um card, o porquê, e pula o que está travado', () => {
  const travado = r.criarCard({ titulo: 'travado por dependência', prioridade: 'alta' })
  const bloqueador = r.criarCard({ titulo: 'o bloqueador' })
  r.criarDependencia({ cardId: travado.id, dependeDeId: bloqueador.id, confirmada: true })

  const { card, porque, restantes } = r.proxima()
  assert.ok(card, 'sempre deve haver uma próxima enquanto houver aberta')
  assert.notEqual(card.id, travado.id, 'não manda fazer o que está travado')
  assert.ok(porque && porque.length > 0, 'a escolha sempre vem com um porquê')
  assert.ok(restantes >= 0)
})

test('proxima respeita o teto do dia antes da prioridade', () => {
  const marcado = r.criarCard({ titulo: 'marcado pra hoje', prioridade: 'baixa' })
  r.criarCard({ titulo: 'alta mas não marcada', prioridade: 'alta' })
  r.marcarHoje(marcado.id)
  assert.equal(r.proxima().card.id, marcado.id)
  limparODia()
})

// --- Replanejamento --------------------------------------------------------

test('replanejar adia em bloco tudo que venceu', () => {
  const card = r.criarCard({ titulo: 'venceu faz tempo', data: '2020-01-01' })
  assert.ok(r.cardsAtrasados().some((c) => c.id === card.id))
  const { adiados, para } = r.replanejar('amanha')
  assert.ok(adiados >= 1)
  assert.equal(r.buscarCard(card.id).data, para)
  assert.equal(r.cardsAtrasados().length, 0)
})

// --- Busca -----------------------------------------------------------------

test('procurar devolve todos os parecidos, para o agente perguntar qual é', () => {
  r.criarCard({ titulo: 'ligar pro contador de novo' })
  const achados = r.procurarCards('contador')
  assert.ok(achados.length >= 1)
  assert.ok(achados.every((c) => c.titulo.includes('contador')))
})

test('card que não existe erra com o id na mensagem', () => {
  assert.throws(() => r.buscarCard(99999), /99999/)
})

// --- Chaves de API ---------------------------------------------------------

const ch = await import('../server/chaves.js')

test('a chave criada aparece uma vez e nunca mais', () => {
  const criada = ch.criarChave({ nome: 'agente da Maria', papel: 'convidado' })
  assert.match(criada.chave, /^gt_/)
  assert.equal(criada.papel, 'convidado')
  assert.equal(criada.pode_ia, false)

  // A listagem nunca devolve o segredo — só o prefixo, para reconhecer qual é.
  const listada = ch.listarChaves().find((c) => c.id === criada.id)
  assert.equal(listada.chave, undefined)
  assert.ok(listada.prefixo.endsWith('…'))
  assert.ok(criada.chave.startsWith(listada.prefixo.slice(0, -1)))
})

test('a chave autentica e registra o último uso', () => {
  const { chave, id } = ch.criarChave({ nome: 'agente do João' })
  assert.equal(ch.listarChaves().find((c) => c.id === id).ultimo_uso, null)

  const autenticada = ch.autenticarChave(chave)
  assert.equal(autenticada.nome, 'agente do João')
  assert.ok(ch.listarChaves().find((c) => c.id === id).ultimo_uso)
})

test('chave errada e chave revogada não autenticam', () => {
  const { chave, id } = ch.criarChave({ nome: 'para revogar' })
  assert.ok(ch.autenticarChave(chave))
  ch.revogarChave(id)
  assert.equal(ch.autenticarChave(chave), null)
  assert.equal(ch.autenticarChave('gt_inventada'), null)
  assert.equal(ch.autenticarChave(null), null)
})

test('o escopo de IA é independente do papel', () => {
  const convidadoComIa = ch.criarChave({ nome: 'convidado de confiança', podeIa: true })
  assert.equal(convidadoComIa.papel, 'convidado')
  assert.equal(convidadoComIa.pode_ia, true)

  const donoSemIa = ch.criarChave({ nome: 'agente organizador', papel: 'dono', podeIa: false })
  assert.equal(donoSemIa.papel, 'dono')
  assert.equal(donoSemIa.pode_ia, false)

  const mudada = ch.alterarEscopo(donoSemIa.id, { podeIa: true })
  assert.equal(mudada.pode_ia, true)
  assert.equal(mudada.papel, 'dono', 'mudar o escopo de IA não mexe no papel')
})

test('chave sem nome e papel inválido são recusados', () => {
  assert.throws(() => ch.criarChave({ nome: '  ' }), /precisa de um nome/)
  assert.throws(() => ch.criarChave({ nome: 'x', papel: 'chefe' }), /dono.*convidado/)
})

// --- Origem do card --------------------------------------------------------

test('card criado por uma chave carrega a origem e vira tag', () => {
  const card = r.criarCard({ titulo: 'card do agente', origem: 'agente da Maria' })
  assert.equal(card.origem, 'agente da Maria', 'a origem guarda o nome legível')
  assert.ok(card.tags.includes('via-agente-da-maria'))
})

test('card criado no painel não ganha etiqueta de origem', () => {
  const card = r.criarCard({ titulo: 'card do painel' })
  assert.equal(card.origem, null)
  assert.ok(!card.tags.some((t) => t.startsWith('via-')))
})

test('dá para filtrar o quadro por origem, com o filtro de tag de sempre', () => {
  r.criarCard({ titulo: 'outro do mesmo agente', origem: 'agente da Maria' })
  const doAgente = r.listarCards({ tag: 'via-agente-da-maria', status: 'aberto' })
  assert.equal(doAgente.length, 2)
  assert.ok(doAgente.every((c) => c.origem === 'agente da Maria'))
})

// --- Prioridade sabe o que trava o quê -------------------------------------

test('bloqueia() diz quem está esperando por um card', () => {
  const base = r.criarCard({ titulo: 'o gargalo' })
  const um = r.criarCard({ titulo: 'espera A', prioridade: 'alta' })
  const dois = r.criarCard({ titulo: 'espera B' })
  r.criarDependencia({ cardId: um.id, dependeDeId: base.id, confirmada: true })
  r.criarDependencia({ cardId: dois.id, dependeDeId: base.id, confirmada: false })

  // Só a confirmada conta: sugestão da IA não define prioridade de ninguém.
  const travados = r.bloqueia(base.id)
  assert.equal(travados.length, 1)
  assert.equal(travados[0].titulo, 'espera A')
  assert.equal(travados[0].prioridade, 'alta')
})

test('concluir o bloqueador esvazia a lista de quem ele travava', () => {
  const base = r.criarCard({ titulo: 'gargalo que cai' })
  const preso = r.criarCard({ titulo: 'preso nele' })
  r.criarDependencia({ cardId: preso.id, dependeDeId: base.id, confirmada: true })
  assert.equal(r.bloqueia(base.id).length, 1)
  r.concluirCard(preso.id)
  assert.equal(r.bloqueia(base.id).length, 0, 'card feito não conta como travado')
})
