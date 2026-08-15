#!/usr/bin/env node
/**
 * O bot escutando.
 *
 *   npm run telegram
 *
 * Fica aberto, em long polling. É o que atende `/parear`, `/hoje` e transforma
 * qualquer frase mandada por um chat autorizado em card.
 *
 * É um processo separado do servidor de propósito: se o bot cair — internet,
 * token trocado, Telegram fora do ar — o painel e a API não sentem nada.
 */

import { carregarEnv } from './env.js'

carregarEnv()

const { receberUmaVez, temBot } = await import('./telegram.js')
const { banco } = await import('./db.js')

if (!temBot()) {
  console.log('Sem TELEGRAM_BOT_TOKEN no .env. Não há bot para escutar.')
  process.exit(0)
}

banco()

console.log(`
  Bot escutando. Ctrl+C para parar.

  Quem ainda não está na lista recebe só a instrução de pareamento.
  Gere o código no painel, em "Telegram".
`)

let seguir = true
process.on('SIGINT', () => {
  seguir = false
  console.log('\n  Parando…')
  process.exit(0)
})

// Erro de rede não pode derrubar o bot: ele espera e tenta de novo, com uma
// espera que cresce até meio minuto para não martelar a API quando ela cai.
let esperaAposFalha = 1000

while (seguir) {
  try {
    const quantas = await receberUmaVez({ timeout: 30 })
    if (quantas) console.log(`  ${quantas} mensagem(ns) processada(s).`)
    esperaAposFalha = 1000
  } catch (erro) {
    console.error(`  ${erro.message}`)
    await new Promise((r) => setTimeout(r, esperaAposFalha))
    esperaAposFalha = Math.min(esperaAposFalha * 2, 30_000)
  }
}
