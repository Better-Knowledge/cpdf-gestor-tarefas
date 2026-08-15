/**
 * As chaves de API, criadas de dentro da aplicação.
 *
 * Duas regras que decidem o desenho todo:
 *
 *   1. **Só o hash é guardado.** A chave inteira aparece UMA vez, na tela em
 *      que ela é criada, e depois não existe mais em lugar nenhum. Chave que dá
 *      para reler no banco é senha em texto claro com outro nome.
 *
 *   2. **A chave do `.env` continua valendo.** Ela é a chave-mestra: se você
 *      revogar por engano a última chave de dono, ainda entra. Um sistema que
 *      consegue se trancar do lado de fora não é seguro, é frágil.
 *
 * Escopo tem duas dimensões independentes, e é isso que o pedido de "Guest ou
 * Admin, com a mudança do escopo de IA" quer dizer:
 *
 *   · PAPEL   — `dono` faz tudo; `convidado` registra, conclui, adia e move.
 *   · pode_ia — se a chave pode disparar as rotinas que gastam a sua conta da
 *               Anthropic. É separada do papel de propósito: dá para ter um
 *               convidado que roda IA (uma pessoa de confiança) e um dono que
 *               não roda (o agente que só organiza).
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { banco, agora, ErroDeRegra } from './db.js'

export const PAPEIS = ['dono', 'convidado']

const hashDe = (chave) => createHash('sha256').update(String(chave), 'utf8').digest('hex')

export function gerarChave() {
  return `gt_${randomBytes(24).toString('base64url')}`
}

/**
 * Cria uma chave e devolve o segredo em texto UMA única vez.
 *
 * Quem chama tem a obrigação de mostrar `chave` para o usuário agora: depois
 * daqui, nem o sistema sabe qual era.
 */
export function criarChave({ nome, papel = 'convidado', podeIa = false }) {
  nome = String(nome ?? '').trim()
  if (!nome) throw new ErroDeRegra('Toda chave precisa de um nome — é como você a reconhece depois.')
  if (!PAPEIS.includes(papel)) {
    throw new ErroDeRegra(`Papel tem que ser "dono" ou "convidado" — veio "${papel}".`)
  }

  const chave = gerarChave()
  const { lastInsertRowid } = banco()
    .prepare(
      `INSERT INTO chaves (nome, prefixo, hash, papel, pode_ia, criada_em)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(nome, chave.slice(0, 11), hashDe(chave), papel, podeIa ? 1 : 0, agora())

  return { ...buscarPorId(Number(lastInsertRowid)), chave }
}

function buscarPorId(id) {
  const linha = banco().prepare('SELECT * FROM chaves WHERE id = ?').get(id)
  if (!linha) throw new ErroDeRegra(`Não existe chave com id ${id}.`, 404)
  return formatar(linha)
}

const formatar = (linha) => ({
  id: linha.id,
  nome: linha.nome,
  prefixo: `${linha.prefixo}…`,
  papel: linha.papel,
  pode_ia: !!linha.pode_ia,
  criada_em: linha.criada_em,
  ultimo_uso: linha.ultimo_uso,
  revogada: !!linha.revogada,
})

export function listarChaves() {
  return banco()
    .prepare('SELECT * FROM chaves ORDER BY revogada, id DESC')
    .all()
    .map(formatar)
}

export function revogarChave(id) {
  const { changes } = banco().prepare('UPDATE chaves SET revogada = 1 WHERE id = ?').run(Number(id))
  if (!changes) throw new ErroDeRegra(`Não existe chave com id ${id}.`, 404)
  return buscarPorId(Number(id))
}

export function alterarEscopo(id, { papel, podeIa }) {
  const chave = buscarPorId(Number(id))
  if (papel !== undefined && !PAPEIS.includes(papel)) {
    throw new ErroDeRegra(`Papel tem que ser "dono" ou "convidado" — veio "${papel}".`)
  }
  banco()
    .prepare('UPDATE chaves SET papel = ?, pode_ia = ? WHERE id = ?')
    .run(papel ?? chave.papel, (podeIa ?? chave.pode_ia) ? 1 : 0, chave.id)
  return buscarPorId(chave.id)
}

/**
 * Encontra a chave apresentada numa requisição.
 *
 * A busca é por hash — comparar em SQL é comparação de tempo constante o
 * suficiente aqui, porque o que viaja é o hash e não o segredo. Ainda assim a
 * confirmação final passa por `timingSafeEqual`.
 */
export function autenticarChave(apresentada) {
  if (!apresentada) return null
  const hash = hashDe(apresentada)
  const linha = banco()
    .prepare('SELECT * FROM chaves WHERE hash = ? AND revogada = 0')
    .get(hash)
  if (!linha) return null

  const a = Buffer.from(linha.hash, 'utf8')
  const b = Buffer.from(hash, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  // Registrar o último uso é o que permite olhar a lista depois do evento e
  // ver qual chave de fato foi usada — e revogar as outras sem medo.
  banco().prepare('UPDATE chaves SET ultimo_uso = ? WHERE id = ?').run(agora(), linha.id)
  return formatar(linha)
}
