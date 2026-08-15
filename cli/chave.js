#!/usr/bin/env node
/**
 * Gera uma chave de API para o agente.
 *
 *   npm run chave
 *
 * Existe para ninguém inventar `chave123`. A chave é aleatória de verdade
 * (`randomBytes`), e o comando só imprime — quem cola no `.env` é você, porque
 * script que edita `.env` sozinho um dia apaga a chave de alguém.
 */

import { randomBytes } from 'node:crypto'

const chave = `gt_${randomBytes(24).toString('base64url')}`

console.log(`
  Chave nova:

    API_KEY=${chave}

  Cole essa linha no seu .env e reinicie o servidor.

  Depois disso o agente entra assim:

    curl -H "Authorization: Bearer ${chave}" http://localhost:${process.env.PORTA || 3000}/api/hoje

  A CLI deste projeto lê a chave do .env sozinha — não precisa passar nada.
`)
