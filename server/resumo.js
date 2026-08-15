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
 * Descobre para qual conversa mandar, quando o chat id não foi informado.
 *
 * O token diz QUEM envia; o chat id diz PARA QUEM. São coisas diferentes, e o
 * Telegram exige as duas: um bot pode estar em muitas conversas e não pode
 * iniciar nenhuma — quem fala primeiro é sempre a pessoa.
 *
 * Mas o segundo valor dá para deduzir: se você já mandou qualquer mensagem
 * para o bot, ela está nas atualizações pendentes, e o chat id vem junto.
 * Então o `.env` precisa mesmo só do token.
 */
async function descobrirChat(token) {
  const resposta = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`)
  const dados = await resposta.json().catch(() => null)

  if (!dados?.ok) {
    // O caso mais comum: existe um webhook configurado, e aí o getUpdates é
    // recusado. Nesse cenário só o chat id explícito resolve.
    throw new Error(
      `O Telegram não deixou eu procurar a conversa (${dados?.description ?? resposta.status}). ` +
        'Preencha TELEGRAM_CHAT_ID no .env.',
    )
  }

  const conversas = dados.result
    .map((u) => u.message?.chat ?? u.channel_post?.chat)
    .filter((c) => c?.id)

  if (!conversas.length) {
    throw new Error(
      'Não achei nenhuma conversa com este bot. Abra o Telegram, mande qualquer mensagem ' +
        'para ele, e rode de novo.',
    )
  }

  // A mais recente, e privada quando houver — é quase sempre você mesmo.
  const escolhida = conversas.filter((c) => c.type === 'private').at(-1) ?? conversas.at(-1)
  const nome = escolhida.first_name ?? escolhida.title ?? escolhida.id
  console.log(`  Conversa encontrada: ${nome} (chat id ${escolhida.id})`)
  if (conversas.length > 1) {
    console.log('  Havia mais de uma. Para fixar, ponha TELEGRAM_CHAT_ID no .env.')
  }
  return escolhida.id
}

async function enviar(texto) {
  const token = process.env.TELEGRAM_BOT_TOKEN

  if (!token) {
    console.log('\n--- resumo (sem Telegram configurado) ---\n')
    console.log(texto)
    console.log('\n--- fim ---\n')
    console.log('Para mandar de verdade, preencha TELEGRAM_BOT_TOKEN no .env.')
    return
  }

  let chat = process.env.TELEGRAM_CHAT_ID
  if (!chat) {
    try {
      chat = await descobrirChat(token)
    } catch (erro) {
      console.error(`\n  ${erro.message}\n`)
      process.exitCode = 1
      return
    }
  }

  const resposta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: texto, parse_mode: 'Markdown' }),
  })

  if (!resposta.ok) {
    const detalhe = await resposta.text()
    console.error(`Telegram recusou (${resposta.status}): ${detalhe}`)
    process.exitCode = 1
    return
  }
  console.log('Resumo enviado.')
}

await enviar(montarTexto())
