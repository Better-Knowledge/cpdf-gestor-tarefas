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
