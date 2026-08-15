/**
 * A API HTTP — a caixa CONVERSA.
 *
 * É a mesma porta para os dois usuários do sistema: o painel React consome
 * estas rotas, e o agente consome exatamente estas rotas. Não existe uma
 * segunda porta feita só para o agente — se existisse, uma das duas ficaria
 * desatualizada.
 *
 * Nenhuma regra de negócio mora aqui. Isto traduz HTTP para `regras.js` e
 * devolve JSON.
 */

import { Router } from 'express'
import { ErroDeRegra, DIAS_ATE_SUGERIR_QUEBRA } from './db.js'
import * as regras from './regras.js'
import * as ia from './ia.js'
import * as chaves from './chaves.js'

export const rotas = Router()

/** Deixa o handler ser async sem espalhar try/catch por todo arquivo. */
const rota = (handler) => async (req, res, proximo) => {
  try {
    res.json(await handler(req, res))
  } catch (erro) {
    proximo(erro)
  }
}

// ---------------------------------------------------------------------------
// O que o sistema sabe fazer, descrito em português
// ---------------------------------------------------------------------------

/**
 * O agente lê esta lista e escolhe a operação — do mesmo jeito que lê a
 * descrição de uma Skill e decide usá-la. É o "padrão de tools" com as mãos.
 */
const OPERACOES = [
  ['GET /api/hoje', 'A lista de hoje: tarefas abertas com data até hoje, mais urgente primeiro.'],
  ['GET /api/proxima', 'UMA tarefa, a próxima a ser feita, com o porquê da escolha.'],
  ['GET /api/cards', 'Lista cards. Filtros: projeto, status (aberto|feito|todos), tag, tipo, busca.'],
  ['POST /api/cards', 'Cria um card. Só o título é obrigatório.'],
  ['PATCH /api/cards/:id', 'Muda campos de um card: título, descrição, tipo, data, prioridade, tags, projeto.'],
  ['POST /api/cards/:id/concluir', 'Conclui o card e devolve o que essa conclusão destravou.'],
  ['POST /api/cards/:id/adiar', 'Adia para outro dia. Aceita "amanhã", "sexta", "3d", "16/08".'],
  ['POST /api/cards/:id/mover', 'Move o card para outra etapa do pipeline do projeto dele.'],
  ['POST /api/cards/:id/hoje', 'Marca ou desmarca como uma das três coisas de hoje.'],
  ['GET /api/projetos', 'Lista os projetos com os pipelines e o contexto de cada um.'],
  ['POST /api/projetos', 'Cria um projeto com nome, contexto e pipeline próprio.'],
  ['PATCH /api/projetos/:id', 'Muda o contexto, o pipeline ou arquiva o projeto.'],
  ['POST /api/cards/:id/dependencias', 'Diz que este card depende de outro.'],
  ['GET /api/atrasados', 'O que venceu e continua aberto.'],
  ['POST /api/replanejar', 'Adia em bloco tudo que venceu, para uma nova data.'],
  ['POST /api/ia/priorizar', 'Repriorriza os cards abertos contra o contexto do projeto.'],
  ['POST /api/ia/relacionar', 'Procura dependências entre os cards abertos e propõe as que achar.'],
  ['GET /api/ia/ordem-do-dia', 'A ordem sugerida para hoje, agrupando o que é parecido.'],
  ['POST /api/ia/quebrar', 'Sugere quebrar em partes os cards parados há muito tempo.'],
]

rotas.get('/operacoes', (req, res) => {
  res.json({
    sistema: 'Gestor de tarefas',
    comoUsar:
      'Todas as rotas devolvem JSON. Se algo der errado, vem { "erro": "mensagem em português" } ' +
      'com status 4xx. Quando não achar um card ou projeto pelo nome, a mensagem diz quais existem — ' +
      'pergunte ao usuário em vez de criar um parecido.',
    operacoes: OPERACOES.map(([rota, descricao]) => ({ rota, descricao })),
  })
})

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------

rotas.get(
  '/projetos',
  rota((req) => regras.listarProjetos({ incluirArquivados: req.query.arquivados === 'true' })),
)

rotas.post(
  '/projetos',
  rota((req) => regras.criarProjeto(req.body ?? {})),
)

rotas.patch(
  '/projetos/:id',
  rota((req) => {
    const { contexto, pipeline, arquivado } = req.body ?? {}
    let projeto = regras.buscarProjeto(req.params.id)
    if (contexto !== undefined) projeto = regras.definirContexto(projeto.id, contexto)
    if (pipeline !== undefined) projeto = regras.definirPipeline(projeto.id, pipeline)
    if (arquivado !== undefined) projeto = regras.arquivarProjeto(projeto.id, arquivado)
    return projeto
  }),
)

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

rotas.get(
  '/cards',
  rota((req) =>
    regras.listarCards({
      projeto: req.query.projeto || null,
      status: req.query.status || 'aberto',
      tag: req.query.tag || null,
      tipo: req.query.tipo || null,
      busca: req.query.busca || null,
      hojeApenas: req.query.hoje === 'true',
    }),
  ),
)

rotas.get(
  '/hoje',
  rota(() => regras.listaDeHoje()),
)

rotas.get(
  '/proxima',
  rota((req) =>
    regras.proxima({
      projeto: req.query.projeto || null,
      pular: req.query.pular ? String(req.query.pular).split(',').filter(Boolean) : [],
    }),
  ),
)

rotas.get(
  '/atrasados',
  rota(() => regras.cardsAtrasados()),
)

rotas.post(
  '/replanejar',
  rota((req) => regras.replanejar(req.body?.data ?? 'hoje')),
)

rotas.get(
  '/tags',
  rota(() => regras.listarTags()),
)

rotas.post(
  '/cards',
  // A origem vem do porteiro, nunca do corpo da requisição: se viesse do
  // corpo, qualquer agente poderia se apresentar como outro.
  rota((req) => regras.criarCard({ ...(req.body ?? {}), origem: req.origem ?? null })),
)

rotas.get(
  '/cards/:id',
  rota((req) => regras.buscarCard(req.params.id)),
)

rotas.patch(
  '/cards/:id',
  rota((req) => regras.atualizarCard(req.params.id, req.body ?? {})),
)

rotas.delete(
  '/cards/:id',
  rota((req) => regras.excluirCard(req.params.id)),
)

rotas.post(
  '/cards/:id/mover',
  rota((req) => regras.moverCard(req.params.id, req.body?.etapa)),
)

rotas.post(
  '/cards/:id/concluir',
  rota((req) => regras.concluirCard(req.params.id)),
)

rotas.post(
  '/cards/:id/reabrir',
  rota((req) => regras.reabrirCard(req.params.id)),
)

rotas.post(
  '/cards/:id/adiar',
  rota((req) => regras.adiarCard(req.params.id, req.body?.data ?? 'amanha')),
)

rotas.post(
  '/cards/:id/hoje',
  rota((req) => regras.marcarHoje(req.params.id, req.body?.valor ?? true)),
)

// A prioridade sugerida vira decisão — ou some. Nos dois casos ela passa a ser
// do usuário, e a IA não encosta mais nela.
rotas.post(
  '/cards/:id/prioridade/aceitar',
  rota((req) => regras.aceitarSugestao(req.params.id)),
)

rotas.post(
  '/cards/:id/prioridade/recusar',
  rota((req) => regras.recusarSugestao(req.params.id)),
)

rotas.get(
  '/projetos/:id/oferta-contexto',
  rota((req) => regras.ofertaDeContexto(regras.buscarProjeto(req.params.id).id)),
)

rotas.post(
  '/projetos/:id/oferta-contexto/dispensar',
  rota((req) => regras.dispensarOferta(req.params.id)),
)

rotas.post(
  '/ia/escrever-contexto',
  rota((req) => ia.escreverContexto({ projeto: req.body?.projeto })),
)

// ---------------------------------------------------------------------------
// Dependências
// ---------------------------------------------------------------------------

rotas.post(
  '/cards/:id/dependencias',
  rota((req) =>
    regras.criarDependencia({
      cardId: req.params.id,
      dependeDeId: req.body?.dependeDeId,
      confirmada: req.body?.confirmada ?? false,
    }),
  ),
)

rotas.patch(
  '/cards/:id/dependencias/:outroId',
  rota((req) =>
    regras.confirmarDependencia(req.params.id, req.params.outroId, req.body?.confirmada ?? true),
  ),
)

rotas.delete(
  '/cards/:id/dependencias/:outroId',
  rota((req) => regras.removerDependencia(req.params.id, req.params.outroId)),
)

// ---------------------------------------------------------------------------
// As rotinas de IA
// ---------------------------------------------------------------------------

rotas.post(
  '/ia/priorizar',
  rota((req) => ia.priorizar({ projeto: req.body?.projeto ?? null })),
)

rotas.post(
  '/ia/relacionar',
  rota((req) => ia.relacionar({ projeto: req.body?.projeto ?? null })),
)

rotas.get(
  '/ia/ordem-do-dia',
  rota(() => ia.ordemDoDia()),
)

rotas.post(
  '/ia/quebrar',
  rota((req) => ia.sugerirQuebra({ dias: req.body?.dias ?? DIAS_ATE_SUGERIR_QUEBRA })),
)

rotas.post(
  '/cards/:id/quebrar',
  rota((req) => ia.aplicarQuebra(req.params.id, req.body?.partes ?? [])),
)

rotas.get('/ia/disponivel', (req, res) =>
  res.json({ disponivel: ia.temChave() && req.podeIa !== false }),
)

// ---------------------------------------------------------------------------
// As chaves de API — criadas de dentro da aplicação
// ---------------------------------------------------------------------------

rotas.get(
  '/chaves',
  rota(() => chaves.listarChaves()),
)

rotas.post(
  '/chaves',
  rota((req) =>
    chaves.criarChave({
      nome: req.body?.nome,
      papel: req.body?.papel ?? 'convidado',
      podeIa: req.body?.pode_ia ?? false,
    }),
  ),
)

rotas.patch(
  '/chaves/:id',
  rota((req) =>
    chaves.alterarEscopo(req.params.id, {
      papel: req.body?.papel,
      podeIa: req.body?.pode_ia,
    }),
  ),
)

rotas.post(
  '/chaves/:id/revogar',
  rota((req) => chaves.revogarChave(req.params.id)),
)

/** Quem sou eu, na visão do servidor. O painel usa para saber o que mostrar. */
rotas.get('/eu', (req, res) =>
  res.json({ papel: req.papel ?? 'dono', pode_ia: req.podeIa !== false, origem: req.origem ?? null }),
)

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/**
 * Erro de regra vira mensagem em português com o status certo. Qualquer outra
 * coisa é bug nosso e vira 500 — sem vazar stack para a tela.
 */
export function tratarErros(erro, req, res, proximo) {
  if (erro instanceof ErroDeRegra) {
    return res.status(erro.status).json({ erro: erro.message })
  }
  console.error('[erro inesperado]', erro)
  res.status(500).json({ erro: 'Alguma coisa quebrou aqui dentro. Olhe o terminal do servidor.' })
}
