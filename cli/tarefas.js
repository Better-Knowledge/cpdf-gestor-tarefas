#!/usr/bin/env node
/**
 * A linha de comando — o jeito mais curto de o agente operar o sistema.
 *
 *   npm run tarefas -- hoje
 *   npm run tarefas -- criar "ligar pro contador" --tags ligacao,5min
 *   npm run tarefas -- adiar 12 sexta
 *
 * Ela NÃO tem regra de negócio: chama exatamente as mesmas rotas HTTP que o
 * painel chama. Se a regra mudasse aqui dentro, painel e agente passariam a
 * discordar sobre o que o sistema faz — e o sistema deixaria de ter uma
 * verdade só.
 *
 * Saída em JSON por padrão, porque quem mais usa isto é um agente. Para ler com
 * olho humano, acrescente --texto.
 */

import { carregarEnv } from '../server/env.js'

carregarEnv()

const BASE = `http://localhost:${process.env.PORTA || 3000}/api`

const argumentos = process.argv.slice(2)
const comando = argumentos.shift()

// --chave valor vira opções; o resto é posicional.
const opcoes = {}
const soltos = []
for (let i = 0; i < argumentos.length; i += 1) {
  const item = argumentos[i]
  if (item.startsWith('--')) {
    const chave = item.slice(2)
    const proximo = argumentos[i + 1]
    if (proximo === undefined || proximo.startsWith('--')) opcoes[chave] = true
    else {
      opcoes[chave] = proximo
      i += 1
    }
  } else soltos.push(item)
}

const lista = (valor) =>
  typeof valor === 'string'
    ? valor
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined

/**
 * As credenciais saem do `.env`, então quem usa a CLI nunca digita chave.
 *
 * Preferimos a chave de API à senha: se a CLI mandasse a senha do painel, a
 * senha do dono estaria em toda linha de comando que o agente executa.
 */
function credencial() {
  const chave = process.env.API_KEY?.trim()
  if (chave) return { Authorization: `Bearer ${chave}` }

  const usuario = process.env.AUTH_USUARIO?.trim()
  const senha = process.env.AUTH_SENHA?.trim()
  if (usuario && senha) {
    return { Authorization: `Basic ${Buffer.from(`${usuario}:${senha}`).toString('base64')}` }
  }
  return {}
}

async function chamar(metodo, caminho, corpo) {
  let resposta
  try {
    resposta = await fetch(BASE + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...credencial() },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
  } catch {
    console.error(
      `Não consegui falar com o sistema em ${BASE}.\n` +
        `Ele está rodando? Abra outro terminal e rode: npm start`,
    )
    process.exit(1)
  }
  const dados = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    console.error(dados?.erro ?? `Erro ${resposta.status}.`)
    if (resposta.status === 401) {
      console.error(
        'O sistema está trancado e o .env desta pasta não tem a credencial.\n' +
          'Preencha API_KEY (ou AUTH_USUARIO e AUTH_SENHA) no .env.',
      )
    }
    process.exit(1)
  }
  return dados
}

const busca = (objeto) => {
  const p = new URLSearchParams()
  for (const [chave, valor] of Object.entries(objeto)) {
    if (valor !== undefined && valor !== null && valor !== '') p.set(chave, valor)
  }
  const texto = p.toString()
  return texto ? `?${texto}` : ''
}

const COMANDOS = {
  operacoes: () => chamar('GET', '/operacoes'),

  hoje: () => chamar('GET', '/hoje'),

  proxima: () => chamar('GET', `/proxima${busca({ projeto: opcoes.projeto })}`),

  listar: () =>
    chamar(
      'GET',
      `/cards${busca({
        projeto: opcoes.projeto,
        status: opcoes.status ?? 'aberto',
        tag: opcoes.tag,
        tipo: opcoes.tipo,
        busca: opcoes.busca,
      })}`,
    ),

  buscar: () => chamar('GET', `/cards${busca({ busca: soltos[0], status: 'todos' })}`),

  criar: () =>
    chamar('POST', '/cards', {
      titulo: soltos.join(' '),
      projeto: opcoes.projeto,
      etapa: opcoes.etapa,
      tipo: opcoes.tipo,
      data: opcoes.data,
      prioridade: opcoes.prioridade,
      tags: lista(opcoes.tags) ?? [],
    }),

  concluir: () => chamar('POST', `/cards/${soltos[0]}/concluir`),
  reabrir: () => chamar('POST', `/cards/${soltos[0]}/reabrir`),
  adiar: () => chamar('POST', `/cards/${soltos[0]}/adiar`, { data: soltos[1] ?? 'amanha' }),
  mover: () => chamar('POST', `/cards/${soltos[0]}/mover`, { etapa: soltos.slice(1).join(' ') }),
  apagar: () => chamar('DELETE', `/cards/${soltos[0]}`),

  'marcar-hoje': () =>
    chamar('POST', `/cards/${soltos[0]}/hoje`, { valor: !opcoes.nao }),

  depende: () =>
    chamar('POST', `/cards/${soltos[0]}/dependencias`, {
      dependeDeId: Number(soltos[1]),
      confirmada: opcoes.sugestao ? false : true,
    }),

  projetos: () => chamar('GET', '/projetos'),

  'projeto-criar': () =>
    chamar('POST', '/projetos', {
      nome: soltos.join(' '),
      contexto: typeof opcoes.contexto === 'string' ? opcoes.contexto : null,
      pipeline: lista(opcoes.pipeline),
    }),

  contexto: async () => {
    const projetos = await chamar('GET', '/projetos')
    const alvo = projetos.find((p) => p.nome.toLowerCase() === soltos[0]?.toLowerCase())
    if (!alvo) {
      console.error(
        `Não existe projeto "${soltos[0]}". Os que existem: ${projetos.map((p) => p.nome).join(', ')}.`,
      )
      process.exit(1)
    }
    return chamar('PATCH', `/projetos/${alvo.id}`, { contexto: soltos.slice(1).join(' ') })
  },

  atrasados: () => chamar('GET', '/atrasados'),
  replanejar: () => chamar('POST', '/replanejar', { data: soltos[0] ?? 'hoje' }),
  tags: () => chamar('GET', '/tags'),

  priorizar: () => chamar('POST', '/ia/priorizar', { projeto: opcoes.projeto ?? null }),
  relacionar: () => chamar('POST', '/ia/relacionar', { projeto: opcoes.projeto ?? null }),
  ordem: () => chamar('GET', '/ia/ordem-do-dia'),
  quebrar: () => chamar('POST', '/ia/quebrar', {}),
}

const AJUDA = `
Gestor de tarefas — linha de comando

  hoje                            a lista de hoje
  proxima [--projeto X]           UMA tarefa, a próxima, com o porquê
  listar [--projeto X] [--status aberto|feito|todos] [--tag t] [--tipo ideia]
  buscar <texto>                  procura por trecho do título

  criar "<título>" [--projeto X] [--etapa E] [--tipo ideia] [--data amanha]
                   [--prioridade alta] [--tags a,b]
  concluir <id>                   conclui e diz o que isso destravou
  adiar <id> <quando>             hoje | amanha | sexta | 3d | 16/08
  mover <id> <etapa>
  marcar-hoje <id> [--nao]        entra (ou sai) das três coisas do dia
  reabrir <id>   ·   apagar <id>

  depende <id> <id-do-que-vem-antes> [--sugestao]

  projetos
  projeto-criar "<nome>" [--pipeline "Ideia,Roteiro,Feito"] [--contexto "..."]
  contexto <projeto> "<texto>"    o que faz uma tarefa ser urgente ali

  atrasados   ·   replanejar [quando]   ·   tags
  priorizar   ·   relacionar   ·   ordem   ·   quebrar     (precisam de IA)
  operacoes                       a lista que o agente lê para escolher

  --texto                         saída legível em vez de JSON
`

function imprimirTexto(dados) {
  // Rotas que devolvem um card só (criar, concluir, adiar…) caem no mesmo
  // formato de linha da listagem.
  if (dados && !Array.isArray(dados)) {
    if (dados.card) {
      imprimirTexto([dados.card])
      if (dados.desbloqueadas?.length) {
        console.log(`\n  isso destravou ${dados.desbloqueadas.length}:`)
        for (const d of dados.desbloqueadas) console.log(`  → ${d.titulo}`)
      }
      return
    }
    if (dados.titulo) return imprimirTexto([dados])
  }

  if (Array.isArray(dados)) {
    if (!dados.length) return console.log('(nada)')
    for (const item of dados) {
      if (item.titulo) {
        const marcas = [
          item.hoje ? '★' : ' ',
          item.prioridade?.[0].toUpperCase() ?? ' ',
        ].join('')
        const espera = item.aguardando?.length ? `  ⏸ aguardando ${item.aguardando[0].titulo}` : ''
        const tags = item.tags?.length ? `  ${item.tags.map((t) => `#${t}`).join(' ')}` : ''
        console.log(
          `${String(item.id).padStart(4)} ${marcas}  ${item.titulo}  [${item.etapa ?? item.status}] ${item.data}${tags}${espera}`,
        )
      } else console.log(JSON.stringify(item))
    }
    return
  }
  console.log(JSON.stringify(dados, null, 2))
}

if (!comando || comando === 'ajuda' || comando === '--help' || !COMANDOS[comando]) {
  if (comando && !COMANDOS[comando]) console.error(`Comando desconhecido: ${comando}`)
  console.log(AJUDA)
  process.exit(comando && !COMANDOS[comando] ? 1 : 0)
}

const resultado = await COMANDOS[comando]()
if (opcoes.texto) imprimirTexto(resultado)
else console.log(JSON.stringify(resultado, null, 2))
