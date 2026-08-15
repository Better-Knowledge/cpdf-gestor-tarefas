/**
 * A documentação da API — a caixa se EXPLICA.
 *
 * Duas saídas do mesmo documento, para os dois leitores do sistema:
 *
 *   · `/openapi.json` — o contrato, servido pela própria aplicação. É o que um
 *     agente lê, o que um gerador de cliente consome e o que um teste de
 *     contrato compara. Não depende de rede nenhuma além desta.
 *   · `/docs` — o Scalar, a página bonita de ler e de experimentar.
 *
 * A distinção importa: **o contrato é local, a interface de leitura não é.** O
 * Scalar renderiza no navegador a partir de um bundle de 3,7 MB que vem de um
 * CDN, e vendorizar isso no repositório para sempre custa mais do que resolve
 * num sistema que já precisa de internet para as rotinas de IA. Se a máquina
 * estiver offline, `/docs` fica em branco e `/openapi.json` continua inteiro —
 * que é a parte de que o agente precisa.
 *
 * Quem não quiser o CDN aponta `DOCS_CDN` no `.env` para um arquivo servido em
 * outro lugar.
 */

import { Router } from 'express'
import { apiReference } from '@scalar/express-api-reference'

import { documento } from './openapi.js'

export const documentacao = Router()

/**
 * O contrato.
 *
 * Gerado a cada pedido, e não uma vez na subida, porque ele lê a porta do
 * ambiente — e porque montar um objeto algumas vezes por dia não é um custo
 * que valha um cache para gerenciar.
 */
documentacao.get('/openapi.json', (req, res) => {
  res.type('application/json').send(JSON.stringify(documento(), null, 2))
})

documentacao.get(
  '/docs',
  apiReference({
    url: '/openapi.json',
    pageTitle: 'Gestor de tarefas — a API',
    cdn: process.env.DOCS_CDN?.trim() || undefined,
    theme: 'purple',
    // O painel e a documentação são a mesma aplicação: abrir uma no tema claro
    // e a outra no escuro parece que são dois sistemas.
    darkMode: false,
    // O botão de testar chama esta mesma origem, então a credencial que já
    // abriu o painel vale — e é o que faz a página valer mais que um PDF.
    hideTestRequestButton: false,
    defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
    // Guardar a credencial digitada é conveniência de quem está explorando a
    // API na própria máquina; num sistema de um usuário só, é o caso normal.
    persistAuth: true,
  }),
)
