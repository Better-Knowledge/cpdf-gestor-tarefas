/**
 * Testes da tranca.
 *
 * Autenticação é a parte que mais parece certa lendo e mais quebra rodando,
 * então cada regra vira um teste que sobe um servidor de verdade e bate nele
 * por HTTP.
 */

import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'

const { porteiro, configuracao } = await import('../server/auth.js')

/** Sobe um servidor mínimo com o porteiro na frente e devolve a base da URL. */
async function subir() {
  const app = express()
  app.use(porteiro)
  app.get('/api/hoje', (req, res) => res.json({ ok: true }))
  app.get('/', (req, res) => res.send('painel'))
  const servidor = app.listen(0, '127.0.0.1')
  await new Promise((pronto) => servidor.once('listening', pronto))
  return { base: `http://127.0.0.1:${servidor.address().port}`, servidor }
}

const basic = (usuario, senha) =>
  `Basic ${Buffer.from(`${usuario}:${senha}`).toString('base64')}`

function limparCredenciais() {
  delete process.env.AUTH_USUARIO
  delete process.env.AUTH_SENHA
  delete process.env.API_KEY
}

describe('sem nada configurado', () => {
  let base, servidor
  before(async () => {
    limparCredenciais()
    ;({ base, servidor } = await subir())
  })
  after(() => servidor.close())

  test('não há tranca — é o sistema de um usuário só', async () => {
    assert.equal(configuracao().ligada, false)
    assert.equal((await fetch(`${base}/api/hoje`)).status, 200)
  })

  test('o painel também abre', async () => {
    assert.equal((await fetch(`${base}/`)).status, 200)
  })
})

describe('com usuário e senha', () => {
  let base, servidor
  before(async () => {
    limparCredenciais()
    process.env.AUTH_USUARIO = 'admin'
    process.env.AUTH_SENHA = 'cpdf2026'
    ;({ base, servidor } = await subir())
  })
  after(() => {
    servidor.close()
    limparCredenciais()
  })

  test('sem credencial, 401 com o desafio que abre a caixinha do navegador', async () => {
    const resposta = await fetch(`${base}/api/hoje`)
    assert.equal(resposta.status, 401)
    assert.match(resposta.headers.get('www-authenticate') ?? '', /^Basic/)
  })

  test('o painel também é protegido, não só a API', async () => {
    // Sem isto, o HTML e o bundle seriam servidos para qualquer um.
    assert.equal((await fetch(`${base}/`)).status, 401)
  })

  test('a senha certa entra', async () => {
    const resposta = await fetch(`${base}/api/hoje`, {
      headers: { Authorization: basic('admin', 'cpdf2026') },
    })
    assert.equal(resposta.status, 200)
  })

  test('senha errada não entra', async () => {
    const resposta = await fetch(`${base}/api/hoje`, {
      headers: { Authorization: basic('admin', 'cpdf2027') },
    })
    assert.equal(resposta.status, 401)
  })

  test('usuário errado não entra', async () => {
    const resposta = await fetch(`${base}/api/hoje`, {
      headers: { Authorization: basic('root', 'cpdf2026') },
    })
    assert.equal(resposta.status, 401)
  })

  test('senha com prefixo certo mas tamanho errado não entra', async () => {
    // Pega comparação que só olha o começo.
    const resposta = await fetch(`${base}/api/hoje`, {
      headers: { Authorization: basic('admin', 'cpdf') },
    })
    assert.equal(resposta.status, 401)
  })

  test('senha mais longa que a certa não entra', async () => {
    const resposta = await fetch(`${base}/api/hoje`, {
      headers: { Authorization: basic('admin', 'cpdf2026extra') },
    })
    assert.equal(resposta.status, 401)
  })
})

describe('com chave de API', () => {
  let base, servidor
  before(async () => {
    limparCredenciais()
    process.env.AUTH_USUARIO = 'admin'
    process.env.AUTH_SENHA = 'cpdf2026'
    process.env.API_KEY = 'gt_chave-de-teste'
    ;({ base, servidor } = await subir())
  })
  after(() => {
    servidor.close()
    limparCredenciais()
  })

  test('Bearer com a chave certa entra', async () => {
    const resposta = await fetch(`${base}/api/hoje`, {
      headers: { Authorization: 'Bearer gt_chave-de-teste' },
    })
    assert.equal(resposta.status, 200)
  })

  test('X-API-Key também serve', async () => {
    const resposta = await fetch(`${base}/api/hoje`, {
      headers: { 'X-API-Key': 'gt_chave-de-teste' },
    })
    assert.equal(resposta.status, 200)
  })

  test('chave errada NÃO devolve o desafio do navegador', async () => {
    // Se devolvesse, quem estivesse depurando o agente pelo navegador levaria
    // uma caixa de senha na cara sem motivo.
    const resposta = await fetch(`${base}/api/hoje`, {
      headers: { Authorization: 'Bearer errada' },
    })
    assert.equal(resposta.status, 401)
    assert.equal(resposta.headers.get('www-authenticate'), null)
  })

  test('a senha do painel continua valendo em paralelo', async () => {
    const resposta = await fetch(`${base}/api/hoje`, {
      headers: { Authorization: basic('admin', 'cpdf2026') },
    })
    assert.equal(resposta.status, 200)
  })

  test('a chave não é aceita como senha, nem a senha como chave', async () => {
    const comoSenha = await fetch(`${base}/api/hoje`, {
      headers: { Authorization: basic('admin', 'gt_chave-de-teste') },
    })
    assert.equal(comoSenha.status, 401)

    const comoChave = await fetch(`${base}/api/hoje`, {
      headers: { Authorization: 'Bearer cpdf2026' },
    })
    assert.equal(comoChave.status, 401)
  })
})

describe('só chave, sem senha', () => {
  let base, servidor
  before(async () => {
    limparCredenciais()
    process.env.API_KEY = 'gt_so-chave'
    ;({ base, servidor } = await subir())
  })
  after(() => {
    servidor.close()
    limparCredenciais()
  })

  test('a chave entra e quem não manda nada leva 401 explicativo', async () => {
    assert.equal(
      (await fetch(`${base}/api/hoje`, { headers: { Authorization: 'Bearer gt_so-chave' } }))
        .status,
      200,
    )
    const semNada = await fetch(`${base}/api/hoje`)
    assert.equal(semNada.status, 401)
    assert.match((await semNada.json()).erro, /chave de API/i)
  })
})
