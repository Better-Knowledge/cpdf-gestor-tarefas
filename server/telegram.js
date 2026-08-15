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
import {
  banco,
  agora,
  hoje,
  lerConfig,
  gravarConfig,
  ErroDeRegra,
  PROJETO_PADRAO,
} from './db.js'
import * as regras from './regras.js'
import * as ia from './ia.js'

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

const COMANDOS = `Manda qualquer frase e eu registro como tarefa. Pergunta eu respondo.

*Consultar*
/hoje — a lista de hoje
/proxima — a próxima tarefa, com o porquê
/listar \`[projeto]\` — o que está aberto
/buscar \`texto\` — procura por trecho
/atrasados — o que venceu e continua aberto
/projetos — os projetos e suas etapas

*Mexer*
/concluir \`id\` — conclui e diz o que isso destravou
/adiar \`id\` \`data\` — aceita amanhã, sexta, 3d, 16/08
/foco \`id\` — marca como uma das três coisas de hoje
/registrar — registra a última frase que eu li como pergunta`

const BEM_VINDO = `Pronto — agora a gente se conhece.

${COMANDOS}`

/**
 * Neutraliza o que o Markdown do Telegram interpreta.
 *
 * Título com `_` ou `*` solto faz o `sendMessage` voltar 400 e a resposta some
 * sem deixar rastro na conversa — o card fica criado e a pessoa acha que o bot
 * ignorou. Conteúdo escrito por gente nunca pode quebrar a mensagem que o
 * carrega.
 */
const limpar = (texto) => String(texto ?? '').replace(/[_*`[\]]/g, '')

/** Uma linha por card: o id na frente, porque é por ele que os comandos pegam. */
function linhaDoCard(card) {
  const foco = card.hoje ? '★ ' : ''
  const travado = card.aguardando.length ? ` ⏳ aguarda #${card.aguardando[0].id}` : ''
  const projeto =
    card.projeto && card.projeto !== PROJETO_PADRAO ? ` — ${limpar(card.projeto)}` : ''
  return `${foco}\`#${card.id}\` ${limpar(card.titulo)}${projeto}${travado}`
}

const lista = (cards, titulo, vazio) =>
  cards.length ? `*${titulo}* (${cards.length})\n${cards.map(linhaDoCard).join('\n')}` : vazio

/**
 * Responde uma mensagem.
 *
 * Chat fora da allowlist recebe SÓ a instrução de pareamento. Nada de
 * conteúdo, nada de "não autorizado" com detalhe: para quem não está na lista,
 * o sistema não conta o que existe do outro lado.
 */
/**
 * A última frase que a IA leu como pergunta, por chat.
 *
 * É o que o `/registrar` recupera quando a leitura erra. Fica em memória e
 * morre com o processo, de propósito: oferta de um minuto atrás não precisa
 * sobreviver a um restart, e persistir isso seria criar uma tabela para
 * guardar arrependimento.
 */
const ultimaPergunta = new Map()

function idValido(bruto) {
  const id = Number(bruto)
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErroDeRegra(`"${bruto}" não é um id. O id é o número que aparece antes do título.`)
  }
  return id
}

function textoDaProxima(projeto = null) {
  const { card, porque, restantes } = regras.proxima({ projeto })
  if (!card) {
    return 'Nada disponível agora — ou está tudo feito, ou o que resta aguarda dependência.'
  }
  return (
    `*Agora:* ${limpar(card.titulo)}  \`#${card.id}\`\n` +
    `_${limpar(porque)}_\n\n` +
    `${restantes} depois dessa. \`/concluir ${card.id}\` quando terminar.`
  )
}

function textoDosProjetos() {
  const projetos = regras.listarProjetos()
  if (!projetos.length) return 'Nenhum projeto.'
  return (
    '*Projetos*\n' +
    projetos
      .map((p) => {
        const abertos = regras.listarCards({ projeto: p.id, status: 'aberto' }).length
        const etapas = p.etapas.map((e) => limpar(e.nome)).join(' → ')
        return `• ${limpar(p.nome)} — ${abertos} aberto(s)\n  _${etapas}_`
      })
      .join('\n')
  )
}

/**
 * Os comandos. Devolve o texto da resposta, ou `null` se não conhecer o nome.
 *
 * Tudo aqui é síncrono e sem IA: são as mesmas funções de `regras.js` que o
 * painel usa. É a base que continua de pé com a chave de API fora do ar.
 */
function executarComando(comando, argumento) {
  const arg = argumento.trim()

  switch (comando) {
    case 'start':
    case 'ajuda':
    case 'help':
      return BEM_VINDO

    case 'hoje':
      return lista(regras.listaDeHoje(), 'Hoje', 'Nada aberto para hoje.')

    case 'proxima':
      return textoDaProxima(arg || null)

    case 'listar':
      return lista(
        regras.listarCards({ projeto: arg || null, status: 'aberto' }),
        arg ? `Abertos em ${arg}` : 'Abertos',
        arg ? `Nada aberto em "${arg}".` : 'Nada aberto.',
      )

    case 'buscar':
      if (!arg) return 'Use assim: `/buscar contrato`'
      return lista(
        regras.listarCards({ busca: arg, status: 'todos' }),
        `Contendo "${arg}"`,
        `Não achei nada com "${arg}".`,
      )

    case 'atrasados':
      return lista(regras.cardsAtrasados(), 'Atrasados', 'Nada atrasado.')

    case 'projetos':
      return textoDosProjetos()

    case 'concluir': {
      const { card, desbloqueadas } = regras.concluirCard(idValido(arg))
      const destravou = desbloqueadas.length
        ? '\n\nIsso destravou:\n' +
          desbloqueadas.map((d) => `\`#${d.id}\` ${limpar(d.titulo)}`).join('\n')
        : ''
      return `Feito: *${limpar(card.titulo)}*${destravou}`
    }

    case 'adiar': {
      const [bruto, ...resto] = arg.split(/\s+/)
      const quando = resto.join(' ')
      if (!quando) return 'Use assim: `/adiar 12 amanhã`'
      const card = regras.adiarCard(idValido(bruto), quando)
      return `Adiado: *${limpar(card.titulo)}* para ${card.data}.`
    }

    case 'foco': {
      const card = regras.marcarHoje(idValido(arg), true)
      return `No dia: *${limpar(card.titulo)}*.`
    }

    default:
      return null
  }
}

async function registrarFrase(chat, texto, titulo = null) {
  const nome = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || 'telegram'
  const card = regras.criarCard({
    titulo: (titulo ?? '').trim() || texto,
    origem: `telegram ${nome}`,
  })
  await enviarPara(
    chat.id,
    `Registrado: *${limpar(card.titulo)}* \`#${card.id}\` ` +
      `(${card.data === hoje() ? 'hoje' : card.data})`,
  )
}

/** Executa a consulta que a IA descreveu. Os filtros são dela; a consulta é do banco. */
function responderConsulta({ modo, projeto, tag, busca, tipo, status, so_hoje }) {
  if (modo === 'projetos') return textoDosProjetos()
  if (modo === 'atrasados') return lista(regras.cardsAtrasados(), 'Atrasados', 'Nada atrasado.')
  if (modo === 'proxima') return textoDaProxima()

  // Projeto sai do modelo: se ele inventou um nome, o filtro é descartado em
  // vez de derrubar a resposta com um erro que não é da pessoa.
  const alvo = projeto ? regras.buscarProjeto(projeto, { obrigatorio: false }) : null

  const cards = regras.listarCards({
    projeto: alvo?.id ?? null,
    tag: tag || null,
    busca: busca || null,
    tipo: tipo || null,
    status: status || 'aberto',
    ate: so_hoje ? hoje() : null,
  })

  const filtro = [alvo ? `em ${alvo.nome}` : null, busca ? `sobre "${busca}"` : null, tag ? `#${tag}` : null]
    .filter(Boolean)
    .join(' ')

  return lista(cards, filtro ? `Encontrei ${filtro}` : 'Encontrei', 'Não achei nada com esse filtro.')
}

/**
 * Frase solta: a IA decide se é pergunta ou anotação.
 *
 * Dois caminhos levam ao registro — sem chave, e com a IA fora do ar. É a regra
 * da casa: o sistema inteiro funciona sem IA, e esta porta não é exceção. O
 * pior resultado possível aqui é a anotação sumir, então todo caminho de falha
 * cai no lado que não perde nada.
 */
async function responderFraseSolta(chat, texto) {
  if (!ia.temChave()) return registrarFrase(chat, texto)

  let leitura
  try {
    leitura = await ia.interpretarMensagem(texto)
  } catch (erro) {
    console.error(`  [telegram] a IA não respondeu (${erro.message}) — registrando a frase.`)
    return registrarFrase(chat, texto)
  }

  if (leitura?.intencao !== 'consulta') return registrarFrase(chat, texto, leitura?.titulo)

  ultimaPergunta.set(String(chat.id), texto)
  await enviarPara(
    chat.id,
    `${responderConsulta(leitura)}\n\n_Era para registrar? Manda_ /registrar`,
  )
}

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

  // `/comando@nome_do_bot` é como o Telegram entrega comando dentro de grupo.
  const comando = texto.match(/^\/([a-zA-Z_]+)(?:@\S+)?\s*([\s\S]*)$/)
  if (!comando) return responderFraseSolta(chat, texto)

  const nome = comando[1].toLowerCase()

  // O `/registrar` desfaz uma leitura errada da IA: recupera a frase que ela
  // tratou como pergunta e a anota como deveria ter sido desde o começo.
  if (nome === 'registrar') {
    const guardada = ultimaPergunta.get(String(chat.id))
    if (!guardada) {
      await enviarPara(chat.id, 'Não tenho nenhuma frase esperando. Manda ela de novo.')
      return
    }
    ultimaPergunta.delete(String(chat.id))
    return registrarFrase(chat, guardada)
  }

  try {
    const resposta = executarComando(nome, comando[2] ?? '')
    // Comando desconhecido NÃO vira card: errar o nome de um comando é
    // exatamente como o quadro enche de lixo.
    await enviarPara(chat.id, resposta ?? `Não conheço \`/${limpar(nome)}\`.\n\n${COMANDOS}`)
  } catch (erro) {
    // ErroDeRegra é escrito para a pessoa ler — vai inteiro. O resto sobe.
    if (!(erro instanceof ErroDeRegra)) throw erro
    await enviarPara(chat.id, erro.message)
  }
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
