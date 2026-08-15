/**
 * Testes do pareamento do Telegram.
 *
 * A pergunta que estes testes respondem é uma só: **quem consegue falar com o
 * bot?** Um bot é público — qualquer pessoa que descubra o nome dele abre uma
 * conversa. A allowlist é o que separa isso de um sistema aberto.
 */

import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BANCO_DE_TESTE = join(tmpdir(), `gestor-tg-${process.pid}.db`)
process.env.BANCO = BANCO_DE_TESTE
process.env.TELEGRAM_BOT_TOKEN = 'token-de-teste'
delete process.env.TELEGRAM_CHAT_ID

// Sem chave, a porta do Telegram não chama a IA — os testes exercitam a base
// determinística e nunca saem para a API da Anthropic, mesmo na máquina de
// quem tem a chave exportada no ambiente.
delete process.env.ANTHROPIC_API_KEY

const db = await import('../server/db.js')
const tg = await import('../server/telegram.js')

/** Intercepta as chamadas ao Telegram para o teste não sair para a internet. */
const enviadas = []
const fetchReal = globalThis.fetch
globalThis.fetch = async (url, opcoes) => {
  const corpo = JSON.parse(opcoes?.body ?? '{}')
  if (String(url).includes('/sendMessage')) enviadas.push(corpo)
  return { json: async () => ({ ok: true, result: [] }) }
}

const chatDe = (id, nome) => ({ id, first_name: nome, type: 'private' })

/** Entrega mensagens ao bot como se tivessem chegado pelo Telegram. */
const receber = async (...mensagens) => {
  for (const m of mensagens) await tg.processarMensagem(m)
}

before(() => db.banco())
after(() => {
  globalThis.fetch = fetchReal
  db.fechar()
  for (const s of ['', '-wal', '-shm']) rmSync(BANCO_DE_TESTE + s, { force: true })
})

describe('pareamento', () => {
  test('o código tem seis dígitos e prazo', () => {
    const { codigo, validade_minutos } = tg.gerarCodigo()
    assert.match(codigo, /^\d{6}$/)
    assert.equal(validade_minutos, 15)
  })

  test('código certo entra na lista', async () => {
    const { codigo } = tg.gerarCodigo()
    await receber(
      { text: `/parear ${codigo}`, chat: chatDe(111, 'Maria') },
    )
    const lista = tg.listarChats()
    assert.equal(lista.length, 1)
    assert.equal(lista[0].nome, 'Maria')
    assert.equal(lista[0].ativo, true)
  })

  test('o mesmo código não serve duas vezes', async () => {
    const { codigo } = tg.gerarCodigo()
    await receber({ text: `/parear ${codigo}`, chat: chatDe(222, 'Joao') })
    enviadas.length = 0
    await receber({ text: `/parear ${codigo}`, chat: chatDe(333, 'Estranho') })

    assert.match(enviadas.at(-1).text, /já foi usado/)
    assert.ok(!tg.listarChats().some((c) => c.chat_id === '333'))
  })

  test('código inventado não entra', async () => {
    enviadas.length = 0
    await receber({ text: '/parear 000000', chat: chatDe(444, 'Chute') })
    assert.match(enviadas.at(-1).text, /não existe/i)
    assert.ok(!tg.listarChats().some((c) => c.chat_id === '444'))
  })
})

describe('a allowlist na prática', () => {
  test('quem não está na lista recebe só a instrução — nada do sistema', async () => {
    enviadas.length = 0
    await receber(
      { text: 'me mostra as tarefas de hoje', chat: chatDe(999, 'Desconhecido') },
      { text: '/hoje', chat: chatDe(999, 'Desconhecido') },
    )
    for (const msg of enviadas) {
      assert.match(msg.text, /ainda não te conheço/i)
    }
  })

  test('frase de quem está na lista vira card, com a origem', async () => {
    const r = await import('../server/regras.js')
    enviadas.length = 0
    await receber(
      { text: 'comprar café pro sábado', chat: chatDe(111, 'Maria') },
    )
    const card = r.procurarCards('comprar café')[0]
    assert.ok(card, 'a frase virou card')
    assert.equal(card.origem, 'telegram Maria')
    assert.ok(card.tags.includes('via-telegram-maria'))
    assert.match(enviadas.at(-1).text, /Registrado/)
  })

  test('quem sai da lista deixa de ser atendido', async () => {
    tg.removerChat(111)
    enviadas.length = 0
    await receber({ text: 'outra frase', chat: chatDe(111, 'Maria') })
    assert.match(enviadas.at(-1).text, /ainda não te conheço/i)
  })
})

describe('transmissão do resumo', () => {
  test('vai para quem está ativo na lista, e não para quem saiu', async () => {
    enviadas.length = 0
    const { enviados } = await tg.transmitir('resumo de teste')
    const ativos = tg.listarChats().filter((c) => c.ativo)
    assert.equal(enviados, ativos.length)
    assert.deepEqual(
      enviadas.map((m) => String(m.chat_id)).sort(),
      ativos.map((c) => c.chat_id).sort(),
    )
  })

  test('sem ninguém pareado, avisa em vez de falhar em silêncio', async () => {
    for (const chat of tg.listarChats()) tg.removerChat(chat.chat_id)
    await assert.rejects(() => tg.transmitir('vazio'), /Nenhuma conversa pareada/)
  })
})

/**
 * Os comandos são a base que funciona SEM IA.
 *
 * A pergunta aqui é outra: **dá para usar o sistema pelo celular?** Antes destes
 * comandos o bot só registrava e mostrava o dia — toda outra frase, inclusive
 * pergunta, virava card.
 */
describe('comandos', () => {
  const chat = chatDe(555, 'Fernando')
  const ultima = () => enviadas.at(-1).text
  let r

  before(async () => {
    r = await import('../server/regras.js')
    const { codigo } = tg.gerarCodigo()
    await receber({ text: `/parear ${codigo}`, chat })
  })

  test('/hoje traz o id na frente, que é por onde os outros comandos pegam', async () => {
    r.criarCard({ titulo: 'tarefa de teste do dia' })
    enviadas.length = 0
    await receber({ text: '/hoje', chat })
    assert.match(ultima(), /\*Hoje\*/)
    assert.match(ultima(), /`#\d+` tarefa de teste do dia/)
  })

  test('comando desconhecido NÃO vira card', async () => {
    const antes = r.listarCards({ status: 'todos' }).length
    enviadas.length = 0
    await receber({ text: '/tarefas', chat })
    assert.match(ultima(), /Não conheço/)
    assert.equal(r.listarCards({ status: 'todos' }).length, antes)
  })

  test('/concluir fecha o card e diz o que a conclusão destravou', async () => {
    const base = r.criarCard({ titulo: 'gravar a aula' })
    const dependente = r.criarCard({ titulo: 'publicar a aula' })
    r.criarDependencia({ cardId: dependente.id, dependeDeId: base.id, confirmada: true })

    enviadas.length = 0
    await receber({ text: `/concluir ${base.id}`, chat })
    assert.match(ultima(), /Feito/)
    assert.match(ultima(), /publicar a aula/)
    assert.equal(r.buscarCard(base.id).status, 'feita')
  })

  test('/adiar muda a data e não conclui', async () => {
    const card = r.criarCard({ titulo: 'adiar isto' })
    enviadas.length = 0
    await receber({ text: `/adiar ${card.id} amanhã`, chat })
    assert.match(ultima(), /Adiado/)
    const depois = r.buscarCard(card.id)
    assert.equal(depois.status, 'aberta')
    assert.notEqual(depois.data, card.data)
  })

  test('id que não é número é recusado com mensagem de gente', async () => {
    enviadas.length = 0
    await receber({ text: '/concluir abacaxi', chat })
    assert.match(ultima(), /não é um id/)
  })

  test('/buscar acha por trecho do título', async () => {
    r.criarCard({ titulo: 'levar o cachorro no veterinário' })
    enviadas.length = 0
    await receber({ text: '/buscar cachorro', chat })
    assert.match(ultima(), /cachorro/)
  })

  test('sem chave de IA, frase solta continua virando card', async () => {
    enviadas.length = 0
    await receber({ text: 'comprar guardanapo', chat })
    assert.match(ultima(), /Registrado/)
    assert.ok(r.procurarCards('comprar guardanapo')[0])
  })

  test('/registrar sem nada guardado avisa em vez de inventar card', async () => {
    const antes = r.listarCards({ status: 'todos' }).length
    enviadas.length = 0
    await receber({ text: '/registrar', chat })
    assert.match(ultima(), /nenhuma frase esperando/i)
    assert.equal(r.listarCards({ status: 'todos' }).length, antes)
  })
})
