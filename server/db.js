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

/**
 * v3 — as chaves de API saem do `.env` e passam a morar no banco.
 *
 * Só o HASH é guardado. Se este arquivo vazar, ninguém entra com ele: uma
 * chave que dá para ler no banco é uma senha guardada em texto claro com outro
 * nome. O `prefixo` existe só para a tela conseguir dizer QUAL chave é qual.
 */
const ESQUEMA_V3 = `
CREATE TABLE chaves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  prefixo    TEXT NOT NULL,
  hash       TEXT NOT NULL UNIQUE,
  papel      TEXT NOT NULL DEFAULT 'convidado',
  pode_ia    INTEGER NOT NULL DEFAULT 0,
  criada_em  TEXT NOT NULL,
  ultimo_uso TEXT,
  revogada   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_chaves_hash ON chaves(hash);
`

/**
 * v4 — o Telegram passa a ter allowlist com pareamento.
 *
 * Descobrir o chat resolve "para quem mandar". Não resolve "quem pode falar
 * com o bot" — e um bot é público por natureza: qualquer pessoa que descubra o
 * nome dele abre uma conversa.
 *
 * Então o bot só atende chat que está na lista, e entrar na lista exige um
 * código gerado no painel. Quem tem acesso ao painel é quem autoriza.
 */
const ESQUEMA_V4 = `
CREATE TABLE telegram_chats (
  chat_id    TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  pareado_em TEXT NOT NULL,
  ultimo_uso TEXT,
  ativo      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE pareamentos (
  codigo    TEXT PRIMARY KEY,
  criado_em TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  usado_por TEXT
);

CREATE TABLE config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
`

const COLUNAS_V3 = [
  // De onde veio o card: qual chave o registrou. Num quadro compartilhado numa
  // demonstração ao vivo, sem isto ninguém sabe quem escreveu o quê.
  ['origem', 'TEXT'],
]

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
    versao = 2
  }

  if (versao < 3) {
    bd.exec(ESQUEMA_V3)
    for (const [nome, definicao] of COLUNAS_V3) {
      bd.exec(`ALTER TABLE tarefas ADD COLUMN ${nome} ${definicao}`)
    }
    bd.exec('PRAGMA user_version = 3')
    versao = 3
  }

  if (versao < 4) {
    bd.exec(ESQUEMA_V4)
    bd.exec('PRAGMA user_version = 4')
  }
}

/** Guarda-chuva de configuração que vive no banco, não no .env. */
export function lerConfig(chave, padrao = null) {
  return banco().prepare('SELECT valor FROM config WHERE chave = ?').get(chave)?.valor ?? padrao
}

export function gravarConfig(chave, valor) {
  banco()
    .prepare(
      'INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
    )
    .run(chave, valor == null ? null : String(valor))
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
