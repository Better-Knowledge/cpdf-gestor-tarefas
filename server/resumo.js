/**
 * O resumo do dia, no Telegram.
 *
 * Roda sozinho, na hora marcada — e é por isso que ele mora na aplicação e não
 * no agente: agente não acorda sozinho. Quem faz o despertador é o sistema
 * operacional (Agendador de Tarefas no Windows, launchd ou cron no Mac).
 *
 *   npm run resumo
 *
 * Sem TELEGRAM_BOT_TOKEN no .env, ele imprime o resumo no terminal em vez de
 * mandar. Serve para conferir o texto antes de agendar.
 */

import { carregarEnv } from './env.js'

carregarEnv()

const { concluidosEm, listaDeHoje, cardsAtrasados, desbloqueadasPor } = await import('./regras.js')
const { hoje } = await import('./db.js')
const { transmitir, temBot } = await import('./telegram.js')

function montarTexto() {
  const feitos = concluidosEm(hoje())
  const abertos = listaDeHoje()
  const atrasados = cardsAtrasados()

  // Só o que ficou desbloqueado hoje: é a parte do resumo que mostra que o dia
  // andou, e não só que teve movimento.
  const destravadas = feitos.flatMap((card) => desbloqueadasPor(card.id).map((d) => d.titulo))

  if (!feitos.length && !abertos.length && !atrasados.length) {
    return 'Nada registrado hoje. Dia limpo.'
  }

  const linhas = [`*Resumo de ${new Date().toLocaleDateString('pt-BR')}*`, '']

  if (feitos.length) {
    linhas.push(`*Concluído hoje* (${feitos.length})`)
    linhas.push(...feitos.map((c) => `• ${c.titulo}`), '')
  }

  if (destravadas.length) {
    linhas.push(`*Isso destravou* (${destravadas.length})`)
    linhas.push(...[...new Set(destravadas)].map((t) => `→ ${t}`), '')
  }

  const semAtraso = abertos.filter((c) => c.data >= hoje())
  if (semAtraso.length) {
    linhas.push(`*Ficou aberto* (${semAtraso.length})`)
    linhas.push(...semAtraso.slice(0, 8).map((c) => `• ${c.titulo}`))
    if (semAtraso.length > 8) linhas.push(`…e mais ${semAtraso.length - 8}`)
    linhas.push('')
  }

  if (atrasados.length) {
    // Sem alarme e sem vermelho: informa e oferece a saída, que é replanejar.
    linhas.push(`*Passou da data* (${atrasados.length})`)
    linhas.push(...atrasados.slice(0, 5).map((c) => `• ${c.titulo} — era ${c.data}`))
    if (atrasados.length > 5) linhas.push(`…e mais ${atrasados.length - 5}`)
    linhas.push('', '_Se a semana virou, dá para trazer tudo para hoje no painel._')
  }

  return linhas.join('\n').trim()
}

/**
 * Manda o resumo para quem está na allowlist.
 *
 * O destinatário não vem do `.env`: vem de quem pareou. O token diz QUEM
 * envia; a allowlist diz PARA QUEM — e ela é construída por pareamento, com
 * código gerado no painel, em vez de um chat id copiado na mão.
 */
async function enviar(texto) {
  if (!temBot()) {
    console.log('\n--- resumo (sem Telegram configurado) ---\n')
    console.log(texto)
    console.log('\n--- fim ---\n')
    console.log('Para mandar de verdade, preencha TELEGRAM_BOT_TOKEN no .env.')
    return
  }

  try {
    const { enviados, falhas } = await transmitir(texto)
    console.log(`Resumo enviado para ${enviados} conversa(s).`)
    for (const falha of falhas) console.error(`  falhou — ${falha}`)
    if (falhas.length) process.exitCode = 1
  } catch (erro) {
    console.error(`\n  ${erro.message}\n`)
    process.exitCode = 1
  }
}

await enviar(montarTexto())
