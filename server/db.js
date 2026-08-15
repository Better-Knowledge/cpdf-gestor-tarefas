/**
 * Banco de dados do Gestor de tarefas.
 *
 * Um arquivo, `tarefas.db`, na pasta do projeto. Sem servidor e sem nuvem:
 * backup é copiar o arquivo.
 *
 * SQLite vem embutido no Node (`node:sqlite`), então não existe módulo nativo
 * para compilar — que é o que costuma falhar no Windows sem build tools.
 *
 * O esquema tem duas versões, e a v2 é MIGRAÇÃO da v1, não recriação. Quem
 * construiu só a v1 no build ao vivo roda isto e os dados continuam lá, com as
 * colunas novas ao lado.
 */

import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
export const CAMINHO_BANCO = process.env.BANCO || join(AQUI, '..', 'tarefas.db')

export const TIPOS = ['tarefa', 'ideia']
export const PRIORIDADES = ['alta', 'media', 'baixa']
export const ORIGENS = ['usuario', 'ia']

export const PROJETO_PADRAO = 'Dia a dia'
export const PIPELINE_PADRAO = ['A fazer', 'Fazendo', 'Feito']

/** Teto de cards marcados como "hoje de verdade". PRD v2, Parte 5, decisão 2. */
export const TETO_DO_DIA = 3

/** Dias parado na mesma etapa antes de o sistema sugerir quebrar o card. */
export const DIAS_ATE_SUGERIR_QUEBRA = 7

/**
 * Erro de regra de negócio. A mensagem é escrita para o usuário ler, não para
 * o log — ela sobe até a tela e até o agente.
 */
export class ErroDeRegra extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem)
    this.name = 'ErroDeRegra'
    this.status = status
  }
}

/**
 * Data e hora SEMPRE no fuso local, nunca em UTC.
 *
 * `toISOString()` converte para UTC, e no Brasil isso faz "hoje" virar amanhã
 * depois das 21h: card criado às 22h nasceria com a data do dia seguinte e
 * sumiria da lista de hoje. Num gestor de tarefas isso não é detalhe.
 */
function partesLocais(d) {
  const p = (n) => String(n).padStart(2, '0')
  return {
    data: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    hora: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
  }
}

export const hoje = (d = new Date()) => partesLocais(d).data

export const agora = (d = new Date()) => {
  const { data, hora } = partesLocais(d)
  return `${data}T${hora}`
}

let bd = null

export function banco() {
  if (!bd) {
    bd = new DatabaseSync(CAMINHO_BANCO)
    bd.exec('PRAGMA foreign_keys = ON')
    bd.exec('PRAGMA journal_mode = WAL')
    migrar(bd)
  }
  return bd
}

// ---------------------------------------------------------------------------
// Esquema e migração
// ---------------------------------------------------------------------------

const ESQUEMA_V1 = `
CREATE TABLE tarefas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo     TEXT NOT NULL,
  tipo       TEXT NOT NULL DEFAULT 'tarefa',
  data       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'aberta',
  tema       TEXT,
  prioridade TEXT NOT NULL DEFAULT 'media',
  criado_em  TEXT NOT NULL
);
`

const ESQUEMA_V2 = `
CREATE TABLE projetos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL UNIQUE,
  contexto  TEXT,
  arquivado INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);

CREATE TABLE etapas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  posicao    INTEGER NOT NULL,
  UNIQUE (projeto_id, nome)
);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE
);

CREATE TABLE card_tags (
  card_id INTEGER NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, tag_id)
);

CREATE TABLE dependencias (
  card_id       INTEGER NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  depende_de_id INTEGER NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  confirmada    INTEGER NOT NULL DEFAULT 0,
  criada_em     TEXT NOT NULL,
  PRIMARY KEY (card_id, depende_de_id)
);

`

// Os índices vêm depois dos ALTER TABLE: não dá para indexar coluna que ainda
// não existe.
const INDICES_V2 = `
CREATE INDEX IF NOT EXISTS idx_tarefas_projeto ON tarefas(projeto_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_status  ON tarefas(status);
CREATE INDEX IF NOT EXISTS idx_tarefas_data    ON tarefas(data);
`

const COLUNAS_V2 = [
  ['descricao', 'TEXT'],
  ['projeto_id', 'INTEGER REFERENCES projetos(id)'],
  ['etapa_id', 'INTEGER REFERENCES etapas(id)'],
  ['prioridade_origem', "TEXT NOT NULL DEFAULT 'ia'"],
  ['prioridade_sugerida', 'INTEGER NOT NULL DEFAULT 0'],
  ['justificativa', 'TEXT'],
  ['hoje', 'INTEGER NOT NULL DEFAULT 0'],
  ['movido_em', 'TEXT'],
]

function migrar(bd) {
  let versao = bd.prepare('PRAGMA user_version').get().user_version

  if (versao < 1) {
    bd.exec(ESQUEMA_V1)
    bd.exec('PRAGMA user_version = 1')
    versao = 1
  }

  if (versao < 2) {
    bd.exec(ESQUEMA_V2)
    for (const [nome, definicao] of COLUNAS_V2) {
      bd.exec(`ALTER TABLE tarefas ADD COLUMN ${nome} ${definicao}`)
    }
    bd.exec(INDICES_V2)
    bd.exec('PRAGMA user_version = 2')
    criarProjetoPadrao(bd)
    adotarCardsOrfaos(bd)
  }
}

function criarProjetoPadrao(bd) {
  if (bd.prepare('SELECT 1 FROM projetos LIMIT 1').get()) return
  const { lastInsertRowid } = bd
    .prepare('INSERT INTO projetos (nome, contexto, criado_em) VALUES (?, NULL, ?)')
    .run(PROJETO_PADRAO, agora())
  PIPELINE_PADRAO.forEach((nome, posicao) => {
    bd.prepare('INSERT INTO etapas (projeto_id, nome, posicao) VALUES (?, ?, ?)').run(
      lastInsertRowid,
      nome,
      posicao,
    )
  })
}

/**
 * Cards da v1 não tinham projeto. Vão todos para o projeto padrão: card já
 * concluído entra na última etapa, o resto na primeira.
 *
 * Nenhuma linha é perdida na migração — é o ponto inteiro dela.
 */
function adotarCardsOrfaos(bd) {
  const projeto = bd.prepare('SELECT id FROM projetos WHERE nome = ?').get(PROJETO_PADRAO)
  if (!projeto) return
  const etapas = bd
    .prepare('SELECT id FROM etapas WHERE projeto_id = ? ORDER BY posicao')
    .all(projeto.id)
  if (!etapas.length) return
  bd.prepare(
    `UPDATE tarefas SET projeto_id = ?,
       etapa_id = CASE WHEN status = 'feita' THEN ? ELSE ? END
     WHERE projeto_id IS NULL`,
  ).run(projeto.id, etapas.at(-1).id, etapas[0].id)
}

/** Fecha o banco. Só os testes e os scripts avulsos precisam disso. */
export function fechar() {
  if (bd) {
    bd.close()
    bd = null
  }
}
