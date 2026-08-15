/**
 * O teste que mantém a documentação verdadeira.
 *
 * Documentação de API não erra na hora em que é escrita — erra seis meses
 * depois, quando alguém acrescenta uma rota e não volta no `openapi.js`. A
 * partir daí ela é pior que documentação nenhuma: quem lê passa a confiar em
 * algo errado.
 *
 * Então a comparação é feita contra a fonte que não mente: as rotas que o
 * Express de fato registrou. Rota nova sem documentação **quebra o teste**, e
 * rota documentada que não existe mais também.
 *
 * O que este teste NÃO consegue garantir: que a descrição de cada rota esteja
 * certa. Isso continua sendo leitura humana. Ele garante que a lista está
 * completa e que o documento é OpenAPI válido de estrutura.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// O `rotas.js` importa o banco em cadeia; um arquivo descartável evita encostar
// no `tarefas.db` de verdade.
process.env.BANCO = join(tmpdir(), `gestor-openapi-${process.pid}.db`)

const { documento } = await import('../server/openapi.js')
const { rotas } = await import('../server/rotas.js')

const METODOS = ['get', 'post', 'patch', 'delete', 'put']
const doc = documento()

/** As rotas que o Express registrou, como "POST /cards/:id/adiar". */
function rotasDoExpress() {
  const encontradas = new Set()
  for (const camada of rotas.stack) {
    if (!camada.route) continue
    for (const [metodo, ligado] of Object.entries(camada.route.methods)) {
      if (ligado) encontradas.add(`${metodo.toUpperCase()} ${camada.route.path}`)
    }
  }
  return encontradas
}

/** As rotas do spec, traduzidas de `{id}` para `:id` para poderem ser comparadas. */
function rotasDoSpec() {
  const encontradas = new Set()
  for (const [caminho, item] of Object.entries(doc.paths)) {
    for (const metodo of METODOS) {
      if (item[metodo]) {
        encontradas.add(`${metodo.toUpperCase()} ${caminho.replace(/\{(\w+)\}/g, ':$1')}`)
      }
    }
  }
  return encontradas
}

/** Todas as operações do documento, achatadas. */
function operacoes() {
  const lista = []
  for (const [caminho, item] of Object.entries(doc.paths)) {
    for (const metodo of METODOS) {
      if (item[metodo]) lista.push({ caminho, metodo, op: item[metodo] })
    }
  }
  return lista
}

describe('o spec cobre a API inteira', () => {
  test('toda rota do Express está documentada', () => {
    const faltando = [...rotasDoExpress()].filter((r) => !rotasDoSpec().has(r)).sort()
    assert.deepEqual(
      faltando,
      [],
      `Rota sem documentação em server/openapi.js:\n  ${faltando.join('\n  ')}`,
    )
  })

  test('toda rota documentada existe de verdade', () => {
    const inventadas = [...rotasDoSpec()].filter((r) => !rotasDoExpress().has(r)).sort()
    assert.deepEqual(
      inventadas,
      [],
      `Documentada em server/openapi.js mas inexistente:\n  ${inventadas.join('\n  ')}`,
    )
  })
})

describe('o documento é bem formado', () => {
  test('é OpenAPI 3.1 com título, versão e servidores', () => {
    assert.match(doc.openapi, /^3\.1\./)
    assert.ok(doc.info.title)
    assert.ok(doc.info.version)
    assert.ok(doc.servers.length)
  })

  test('nenhum $ref aponta para o vazio', () => {
    const texto = JSON.stringify(doc)
    const refs = new Set([...texto.matchAll(/"\$ref":"([^"]+)"/g)].map((m) => m[1]))
    assert.ok(refs.size > 0, 'o spec deveria usar $ref')

    const quebrados = [...refs].filter((referencia) => {
      let no = doc
      for (const parte of referencia.replace(/^#\//, '').split('/')) {
        no = no?.[parte]
        if (no === undefined) return true
      }
      return false
    })
    assert.deepEqual(quebrados, [], `$ref sem destino: ${quebrados.join(', ')}`)
  })

  test('cada operação tem operationId único, resumo e tag conhecida', () => {
    const tagsValidas = new Set(doc.tags.map((t) => t.name))
    const ids = new Set()

    for (const { caminho, metodo, op } of operacoes()) {
      const onde = `${metodo.toUpperCase()} ${caminho}`
      assert.ok(op.operationId, `${onde} está sem operationId`)
      assert.ok(!ids.has(op.operationId), `operationId repetido: ${op.operationId}`)
      ids.add(op.operationId)

      assert.ok(op.summary, `${onde} está sem summary`)
      for (const tag of op.tags ?? []) {
        assert.ok(tagsValidas.has(tag), `${onde} usa a tag "${tag}", que não está declarada`)
      }
    }
  })

  test('toda operação diz o que devolve no sucesso', () => {
    for (const { caminho, metodo, op } of operacoes()) {
      const onde = `${metodo.toUpperCase()} ${caminho}`
      assert.ok(op.responses?.['200'], `${onde} não documenta a resposta 200`)
      assert.ok(
        op.responses['200'].content?.['application/json'],
        `${onde} devolve JSON, mas o spec não diz qual`,
      )
    }
  })

  test('todo parâmetro de caminho aparece no caminho', () => {
    for (const [caminho, item] of Object.entries(doc.paths)) {
      const noCaminho = new Set([...caminho.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
      const declarados = [...(item.parameters ?? [])]
      for (const metodo of METODOS) {
        if (item[metodo]) declarados.push(...(item[metodo].parameters ?? []))
      }
      for (const p of declarados.filter((p) => p.in === 'path')) {
        assert.ok(noCaminho.has(p.name), `${caminho} declara "${p.name}", que não está no caminho`)
        assert.equal(p.required, true, `${caminho}: parâmetro de caminho tem que ser required`)
      }
      for (const nome of noCaminho) {
        assert.ok(
          declarados.some((p) => p.in === 'path' && p.name === nome),
          `${caminho} usa {${nome}} e não declara o parâmetro`,
        )
      }
    }
  })
})

describe('o spec não inventa valores que o sistema não aceita', () => {
  /**
   * Os enums vêm de `db.js` por import, então não há como divergirem. O que
   * este teste protege é o import continuar existindo: alguém que troque
   * `enum: TIPOS` por uma lista escrita à mão volta a ter documentação que
   * envelhece sozinha.
   */
  test('tipo e prioridade batem com o que as regras aceitam', async () => {
    const { TIPOS, PRIORIDADES } = await import('../server/db.js')
    const { PAPEIS } = await import('../server/chaves.js')

    assert.deepEqual(doc.components.schemas.Card.properties.tipo.enum, TIPOS)
    assert.deepEqual(doc.components.schemas.Card.properties.prioridade.enum, PRIORIDADES)
    assert.deepEqual(doc.components.schemas.Chave.properties.papel.enum, PAPEIS)
  })

  test('as três formas de entrar estão declaradas', () => {
    const esquemas = doc.components.securitySchemes
    assert.equal(esquemas.senhaDoPainel.scheme, 'basic')
    assert.equal(esquemas.chaveDeAgente.scheme, 'bearer')
    assert.equal(esquemas.chaveNoCabecalho.name, 'X-API-Key')
  })
})
