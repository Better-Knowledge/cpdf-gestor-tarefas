#!/usr/bin/env node
/**
 * Restaura o quadro de demonstração.
 *
 *   npm run demo -- --sim
 *
 * Serve para a apresentação ao vivo: entre um bloco e outro, o quadro volta ao
 * estado conhecido, com as dependências montadas e uma tarefa esperando ser
 * concluída para mostrar o desbloqueio acontecendo.
 *
 * APAGA TUDO. Por isso exige `--sim` — um comando que zera banco não pode ser
 * disparado por engano no meio de uma apresentação.
 */

import { carregarEnv } from '../server/env.js'

carregarEnv()

const { banco, CAMINHO_BANCO } = await import('../server/db.js')
const r = await import('../server/regras.js')

if (!process.argv.includes('--sim')) {
  console.log(`
  Isto APAGA todos os cards e projetos de:

    ${CAMINHO_BANCO}

  e põe no lugar o quadro de demonstração.

  Se é isso mesmo:  npm run demo -- --sim
`)
  process.exit(0)
}

const bd = banco()
for (const tabela of ['dependencias', 'card_tags', 'tags', 'tarefas', 'etapas', 'projetos']) {
  bd.exec(`DELETE FROM ${tabela}`)
}
bd.exec("DELETE FROM sqlite_sequence WHERE name IN ('tarefas','projetos','etapas','tags')")

r.criarProjeto({ nome: 'Dia a dia' })
r.criarProjeto({
  nome: 'Curso',
  contexto: [
    'Curso de agentes. A turma começa em 3 de setembro e não muda.',
    'Qualquer coisa que bloqueie a gravação das aulas vem antes de divulgação.',
    'Material de aula tem que estar pronto uma semana antes da aula acontecer.',
    'Coisa de plataforma pode esperar — a turma é pequena e eu aguento na mão.',
  ].join(' '),
  pipeline: ['Ideia', 'Roteiro', 'Gravado', 'Editado', 'Publicado'],
})

const criar = (titulo, extra = {}) => r.criarCard({ titulo, ...extra })

// O par que existe só para a demonstração do desbloqueio: conclua o microfone
// e duas gravações acendem na tela, ao vivo.
const microfone = criar('comprar o microfone novo', { projeto: 'Curso', tags: ['compra'] })
const aula3 = criar('gravar a aula 3', { projeto: 'Curso', tags: ['exige-foco'] })
const aula4 = criar('gravar a aula 4', { projeto: 'Curso', tags: ['exige-foco'] })
r.criarDependencia({ cardId: aula3.id, dependeDeId: microfone.id, confirmada: true })
r.criarDependencia({ cardId: aula4.id, dependeDeId: microfone.id, confirmada: true })

criar('escrever o roteiro da aula 5', { projeto: 'Curso', etapa: 'Ideia' })
criar('revisar a aula 2', { projeto: 'Curso', etapa: 'Editado', prioridade: 'alta' })
criar('publicar a aula 1', { projeto: 'Curso', etapa: 'Publicado' })

criar('ligar pro contador', { tags: ['ligacao', '5min'] })
criar('responder a proposta da Dry', { tags: ['5min'], data: '2026-08-11' })
criar('renovar o certificado digital', { tags: ['5min'] })
const foco = criar('fechar o roteiro do domingo', { tags: ['exige-foco'] })
r.marcarHoje(foco.id)
criar('oferecer o diagnóstico como serviço separado', { tipo: 'ideia' })

const abertos = r.listarCards({ status: 'aberto' }).length
console.log(`
  Quadro de demonstração restaurado.

  ${abertos} cards abertos, 2 projetos, 2 dependências montadas.

  Para a demonstração do desbloqueio: conclua "comprar o microfone novo"
  e duas gravações acendem na tela.
`)
