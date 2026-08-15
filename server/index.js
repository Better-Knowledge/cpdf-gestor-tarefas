/**
 * O servidor.
 *
 * Um processo só, uma porta só: ele serve o painel (o React já compilado em
 * `dist/`) e a API em `/api`. Não existe "sobe o back numa janela e o front em
 * outra" — `npm start` e acabou.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import express from 'express'

import { carregarEnv, RAIZ } from './env.js'
import { rotas, tratarErros } from './rotas.js'
import { porteiro, resumoDaTranca } from './auth.js'
import { banco, CAMINHO_BANCO } from './db.js'

const DIST = join(RAIZ, 'dist')

carregarEnv()

const PORTA = Number(process.env.PORTA || 3000)

// Ouvir só nesta máquina é a tranca que vem antes da senha: por padrão o
// sistema não existe para o resto da rede. Para expor de propósito,
// HOST=0.0.0.0 no .env — e aí a senha deixa de ser opcional.
const HOST = process.env.HOST?.trim() || '127.0.0.1'

const app = express()
app.disable('x-powered-by')
app.use(express.json())

// O porteiro vem antes de tudo, inclusive do painel: sem isso o HTML e o
// bundle seriam servidos para qualquer um, e só a API estaria trancada.
app.use(porteiro)

app.use('/api', rotas)

if (existsSync(DIST)) {
  app.use(express.static(DIST))
  // O painel é uma página só: qualquer rota que não seja /api devolve ela.
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(join(DIST, 'index.html')))
} else {
  app.get('/', (req, res) =>
    res
      .status(503)
      .send(
        '<h1>O painel ainda não foi compilado</h1>' +
          '<p>Rode <code>npm run build</code> — ou <code>npm start</code>, que faz os dois.</p>',
      ),
  )
}

app.use(tratarErros)

banco() // cria e migra o banco antes de aceitar a primeira requisição

app.listen(PORTA, HOST, () => {
  console.log(`\n  Gestor de tarefas no ar em http://localhost:${PORTA}`)
  console.log(`  Banco: ${CAMINHO_BANCO}`)
  console.log(resumoDaTranca({ host: HOST }))
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('  IA desligada (sem ANTHROPIC_API_KEY no .env). O resto funciona igual.')
  }
  console.log()
})
