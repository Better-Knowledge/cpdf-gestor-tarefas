/**
 * A rotina de IA de madrugada.
 *
 *   npm run analisar
 *
 * Uma chamada por lote, uma vez por dia. É esta a diferença que faz a conta
 * fechar: priorizar a base inteira de madrugada custa uma chamada; priorizar a
 * cada vez que alguém abre a lista custa mil.
 *
 * Sem ANTHROPIC_API_KEY, sai avisando e não quebra nada — o sistema inteiro
 * continua funcionando sem isto aqui.
 */

import { carregarEnv } from './env.js'

carregarEnv()

const ia = await import('./ia.js')

if (!ia.temChave()) {
  console.log('Sem ANTHROPIC_API_KEY no .env. Nada para analisar — e nada quebrado.')
  process.exit(0)
}

try {
  const relatorio = await ia.rotinaDiaria()
  console.log(`\n  ${relatorio.priorizacao.mensagem}`)
  console.log(`  ${relatorio.relacoes.mensagem}\n`)
} catch (erro) {
  console.error(`\n  A análise falhou: ${erro.message}`)
  console.error('  O sistema continua de pé — só não priorizou hoje.\n')
  process.exitCode = 1
}
