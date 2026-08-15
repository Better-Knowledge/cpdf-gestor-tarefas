/**
 * Lê o `.env` sem depender de biblioteca.
 *
 * O Node tem `--env-file`, mas ele exige a flag na linha de comando e some
 * quando alguém roda o script de outro jeito. Ler aqui é mais chato de
 * escrever e mais difícil de quebrar — e todo script do projeto começa por
 * esta linha.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

export function carregarEnv() {
  const caminho = join(RAIZ, '.env')
  if (!existsSync(caminho)) return
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const limpa = linha.trim()
    if (!limpa || limpa.startsWith('#')) continue
    const igual = limpa.indexOf('=')
    if (igual < 1) continue
    const chave = limpa.slice(0, igual).trim()
    const valor = limpa
      .slice(igual + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
    // Variável já definida no ambiente ganha do arquivo.
    if (!(chave in process.env)) process.env[chave] = valor
  }
}
