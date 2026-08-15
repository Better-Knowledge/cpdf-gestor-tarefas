/**
 * O Telegram, com allowlist e pareamento.
 *
 * Um bot do Telegram é público por natureza: qualquer pessoa que descubra o
 * nome dele abre uma conversa e começa a falar. O token protege o bot de ser
 * *operado* por terceiros — não protege de ser *conversado* por terceiros.
 *
 * Então:
 *
 *   · o bot só atende chat que está na allowlist;
 *   · entrar na allowlist exige um código gerado no painel;
 *   · quem tem acesso ao painel é quem autoriza.
 *
 * O código é curto porque vai ser digitado no celular, e é de uso único e
 * curta duração porque código curto que vale para sempre é senha fraca.
 */

import { randomInt } from 'node:crypto'
import { banco, agora, hoje, lerConfig, gravarConfig, ErroDeRegra } from './db.js'
import * as regras from './regras.js'

const VALIDADE_MINUTOS = 15

export const temBot = () => Boolean(process.env.TELEGRAM_BOT_TOKEN)

function api(metodo, corpo) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new ErroDeRegra('Sem TELEGRAM_BOT_TOKEN no .env.', 503)
  return fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo ?? {}),
  }).then((r) => r.json())
}

// ---------------------------------------------------------------------------
// Pareamento
// ---------------------------------------------------------------------------

/**
 * Gera um código de pareamento.
 *
 * Seis dígitos, quinze minutos, uso único. `randomInt` e não `Math.random`:
 * este número é uma credencial, mesmo que curta e efêmera.
 */
export function gerarCodigo() {
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expira = new Date(Date.now() + VALIDADE_MINUTOS * 60_000)
  banco()
    .prepare('INSERT INTO pareamentos (codigo, criado_em, expira_em) VALUES (?, ?, ?)')
    .run(codigo, agora(), agora(expira))
  limparExpirados()
  return { codigo, expira_em: agora(expira), validade_minutos: VALIDADE_MINUTOS }
}

function limparExpirados() {
  banco()
    .prepare('DELETE FROM pareamentos WHERE usado_por IS NOT NULL OR expira_em < ?')
    .run(agora())
}

/** Consome o código e põe o chat na allowlist. Erra dizendo por quê. */
function parear(codigo, chat) {
  const bd = banco()
  const linha = bd.prepare('SELECT * FROM pareamentos WHERE codigo = ?').get(String(codigo).trim())

  if (!linha) return { ok: false, motivo: 'Código não existe. Gere um novo no painel.' }
  if (linha.usado_por) return { ok: false, motivo: 'Este código já foi usado.' }
  if (linha.expira_em < agora()) {
    return { ok: false, motivo: `Código expirado — ele vale ${VALIDADE_MINUTOS} minutos.` }
  }

  const nome = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || chat.id

  bd.prepare('UPDATE pareamentos SET usado_por = ? WHERE codigo = ?').run(String(chat.id), codigo)
  bd.prepare(
    `INSERT INTO telegram_chats (chat_id, nome, pareado_em, ativo) VALUES (?, ?, ?, 1)
     ON CONFLICT(chat_id) DO UPDATE SET nome = excluded.nome, ativo = 1`,
  ).run(String(chat.id), nome, agora())

  return { ok: true, nome }
}

export function listarChats() {
  return banco()
    .prepare('SELECT * FROM telegram_chats ORDER BY ativo DESC, pareado_em DESC')
    .all()
    .map((c) => ({ ...c, ativo: !!c.ativo }))
}

export function removerChat(chatId) {
  const { changes } = banco()
    .prepare('UPDATE telegram_chats SET ativo = 0 WHERE chat_id = ?')
    .run(String(chatId))
  if (!changes) throw new ErroDeRegra('Esta conversa não está pareada.', 404)
  return { chat_id: String(chatId) }
}

const estaAutorizado = (chatId) =>
  banco()
    .prepare('SELECT 1 FROM telegram_chats WHERE chat_id = ? AND ativo = 1')
    .get(String(chatId)) !== undefined

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

export async function enviarPara(chatId, texto) {
  const resposta = await api('sendMessage', {
    chat_id: chatId,
    text: texto,
    parse_mode: 'Markdown',
  })
  if (!resposta.ok) throw new Error(`Telegram recusou: ${resposta.description}`)
  return resposta
}

/**
 * Manda para todo mundo que está na allowlist.
 *
 * `TELEGRAM_CHAT_ID` no `.env` ainda funciona e ganha de tudo — é a saída para
 * quem não quer parear nada e só quer o resumo caindo num lugar fixo.
 */
export async function transmitir(texto) {
  const fixo = process.env.TELEGRAM_CHAT_ID?.trim()
  const destinos = fixo ? [fixo] : listarChats().filter((c) => c.ativo).map((c) => c.chat_id)

  if (!destinos.length) {
    throw new Error(
      'Nenhuma conversa pareada. Abra o painel, gere um código em "Telegram" e mande ' +
        '/parear <código> para o bot.',
    )
  }

  const falhas = []
  for (const chat of destinos) {
    try {
      await enviarPara(chat, texto)
    } catch (erro) {
      falhas.push(`${chat}: ${erro.message}`)
    }
  }
  return { enviados: destinos.length - falhas.length, falhas }
}

// ---------------------------------------------------------------------------
// Recepção
// ---------------------------------------------------------------------------

const AJUDA = `Eu sou o seu gestor de tarefas.

*Ainda não te conheço.* Para me autorizar:
1. abra o painel do sistema
2. vá em *Telegram* e gere um código
3. me mande aqui: \`/parear 123456\``

const BEM_VINDO = `Pronto — agora a gente se conhece.

Me manda qualquer frase e eu registro como tarefa.
\`/hoje\` mostra a lista de hoje.`

/**
 * Responde uma mensagem.
 *
 * Chat fora da allowlist recebe SÓ a instrução de pareamento. Nada de
 * conteúdo, nada de "não autorizado" com detalhe: para quem não está na lista,
 * o sistema não conta o que existe do outro lado.
 */
export async function processarMensagem(mensagem) {
  const chat = mensagem.chat
  const texto = (mensagem.text ?? '').trim()
  if (!chat?.id || !texto) return

  const pedido = texto.match(/^\/parear\s+(\S+)/i)
  if (pedido) {
    const resultado = parear(pedido[1], chat)
    await enviarPara(chat.id, resultado.ok ? BEM_VINDO : `Não deu: ${resultado.motivo}`)
    return
  }

  if (!estaAutorizado(chat.id)) {
    await enviarPara(chat.id, AJUDA)
    return
  }

  banco()
    .prepare('UPDATE telegram_chats SET ultimo_uso = ? WHERE chat_id = ?')
    .run(agora(), String(chat.id))

  if (/^\/(hoje|start|ajuda|help)/i.test(texto)) {
    if (/^\/(start|ajuda|help)/i.test(texto)) {
      await enviarPara(chat.id, BEM_VINDO)
      return
    }
    const lista = regras.listaDeHoje()
    await enviarPara(
      chat.id,
      lista.length
        ? `*Hoje* (${lista.length})\n` + lista.map((c) => `• ${c.titulo}`).join('\n')
        : 'Nada aberto para hoje.',
    )
    return
  }

  // Qualquer outra frase vira card. É a promessa do produto — registrar custa
  // uma frase — chegando pelo celular sem precisar de aplicativo nenhum.
  const nome = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || 'telegram'
  const card = regras.criarCard({ titulo: texto, origem: `telegram ${nome}` })
  await enviarPara(chat.id, `Registrado: *${card.titulo}* (${card.data === hoje() ? 'hoje' : card.data})`)
}

/**
 * Um ciclo de long polling.
 *
 * O `offset` fica no banco: sem ele, reiniciar o processo faria o bot
 * reprocessar mensagens antigas e registrar tudo de novo.
 */
export async function receberUmaVez({ timeout = 30 } = {}) {
  const offset = Number(lerConfig('telegram_offset', '0'))
  const resposta = await api('getUpdates', { offset, timeout, allowed_updates: ['message'] })

  if (!resposta.ok) {
    throw new Error(
      `getUpdates recusado: ${resposta.description}. ` +
        'Se o bot tem webhook configurado, remova antes de usar o modo de escuta.',
    )
  }

  for (const atualizacao of resposta.result) {
    gravarConfig('telegram_offset', atualizacao.update_id + 1)
    if (atualizacao.message) {
      try {
        await processarMensagem(atualizacao.message)
      } catch (erro) {
        console.error(`  [telegram] falhei ao responder: ${erro.message}`)
      }
    }
  }
  return resposta.result.length
}
