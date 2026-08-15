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

const { porteiro, permissoes, configuracao } = await import('../server/auth.js')

async function montar(app) {
  const servidor = app.listen(0, '127.0.0.1')
  await new Promise((pronto) => servidor.once('listening', pronto))
  return { base: `http://127.0.0.1:${servidor.address().port}`, servidor }
}

/** Sobe um servidor mínimo com o porteiro na frente e devolve a base da URL. */
async function subir() {
  const app = express()
  app.use(porteiro)
  app.get('/api/hoje', (req, res) => res.json({ ok: true }))
  app.get('/', (req, res) => res.send('painel'))
  return montar(app)
}

/** Igual, mas com a camada de permissões — é onde o convidado é barrado. */
async function subirComPermissoes() {
  const app = express()
  app.use(porteiro)
  // Espelha o formato real: as permissões são montadas no prefixo /api, então
  // o `req.path` que elas veem já vem sem ele.
  app.use('/api', permissoes, (req, res) => res.json({ ok: true, papel: req.papel }))
  return montar(app)
}

const basic = (usuario, senha) =>
  `Basic ${Buffer.from(`${usuario}:${senha}`).toString('base64')}`

function limparCredenciais() {
  delete process.env.AUTH_USUARIO
  delete process.env.AUTH_SENHA
  delete process.env.API_KEY
  delete process.env.API_KEY_CONVIDADO
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

describe('convidado', () => {
  let base, servidor
  before(async () => {
    limparCredenciais()
    process.env.API_KEY = 'gt_dono'
    process.env.API_KEY_CONVIDADO = 'gt_convidado'
    ;({ base, servidor } = await subirComPermissoes())
  })
  after(() => {
    servidor.close()
    limparCredenciais()
  })

  const comoConvidado = (caminho, metodo = 'GET') =>
    fetch(`${base}${caminho}`, { method: metodo, headers: { Authorization: 'Bearer gt_convidado' } })
  const comoDono = (caminho, metodo = 'GET') =>
    fetch(`${base}${caminho}`, { method: metodo, headers: { Authorization: 'Bearer gt_dono' } })

  test('convidado lê e registra — é o que faz o card aparecer no telão', async () => {
    assert.equal((await comoConvidado('/api/hoje')).status, 200)
    assert.equal((await comoConvidado('/api/cards', 'POST')).status, 200)
    assert.equal((await comoConvidado('/api/cards/1/concluir', 'POST')).status, 200)
    assert.equal((await comoConvidado('/api/cards/1/adiar', 'POST')).status, 200)
    assert.equal((await comoConvidado('/api/cards/1/mover', 'POST')).status, 200)
  })

  test('convidado não apaga nada', async () => {
    assert.equal((await comoConvidado('/api/cards/1', 'DELETE')).status, 403)
    assert.equal((await comoConvidado('/api/cards/1/quebrar', 'POST')).status, 403)
  })

  test('convidado não gasta o seu budget de IA', async () => {
    const resposta = await comoConvidado('/api/ia/priorizar', 'POST')
    assert.equal(resposta.status, 403)
    assert.match((await resposta.json()).erro, /rodar IA/)
  })

  test('convidado não reestrutura projeto nem adia tudo em bloco', async () => {
    assert.equal((await comoConvidado('/api/projetos', 'POST')).status, 403)
    assert.equal((await comoConvidado('/api/projetos/1', 'PATCH')).status, 403)
    assert.equal((await comoConvidado('/api/replanejar', 'POST')).status, 403)
  })

  test('o dono continua podendo tudo', async () => {
    assert.equal((await comoDono('/api/cards/1', 'DELETE')).status, 200)
    assert.equal((await comoDono('/api/ia/priorizar', 'POST')).status, 200)
    assert.equal((await comoDono('/api/replanejar', 'POST')).status, 200)
  })
})
