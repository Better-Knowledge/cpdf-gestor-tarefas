/**
 * Quem pode entrar.
 *
 * Duas portas, de propósito:
 *
 *   · GENTE entra com usuário e senha (HTTP Basic). O navegador cuida do resto.
 *   · AGENTE entra com uma chave de API, no cabeçalho. Nunca com a sua senha —
 *     senha é sua, chave é revogável, e as duas coisas têm ciclos de vida
 *     diferentes.
 *
 * E uma regra que decide tudo: **sem credencial configurada, não há tranca.**
 * Um clone limpo, sem `.env`, roda aberto e só em `localhost` — que é o
 * sistema de um usuário só que o PRD descreve. A tranca acende no momento em
 * que existe `.env` com credenciais.
 *
 * O que a tranca NÃO é: gestão de usuários. Não existe cadastro, não existe
 * "esqueci minha senha", não existe segundo usuário. É uma fechadura, não uma
 * portaria.
 */

import { timingSafeEqual } from 'node:crypto'
import { autenticarChave } from './chaves.js'

/** Comparação de tempo constante — comparar com === vaza o tamanho do acerto. */
function iguais(a, b) {
  const bufferA = Buffer.from(String(a ?? ''), 'utf8')
  const bufferB = Buffer.from(String(b ?? ''), 'utf8')
  if (bufferA.length !== bufferB.length) {
    // Ainda assim compara, para o tempo não denunciar o tamanho da senha.
    timingSafeEqual(bufferA, bufferA)
    return false
  }
  return timingSafeEqual(bufferA, bufferB)
}

export function configuracao() {
  const usuario = process.env.AUTH_USUARIO?.trim()
  const senha = process.env.AUTH_SENHA?.trim()
  const chave = process.env.API_KEY?.trim()
  const chaveConvidado = process.env.API_KEY_CONVIDADO?.trim()
  return {
    usuario,
    senha,
    chave,
    chaveConvidado,
    exigeSenha: Boolean(usuario && senha),
    exigeChave: Boolean(chave),
    temConvidado: Boolean(chaveConvidado),
    ligada: Boolean((usuario && senha) || chave || chaveConvidado),
  }
}

/**
 * O que um convidado NÃO pode.
 *
 * Existe para a demonstração ao vivo: dezenas de agentes de outras pessoas
 * escrevendo no mesmo quadro projetado. O convidado registra, conclui, adia e
 * move — que é o que faz o card aparecer no telão — e mais nada.
 *
 * Três famílias de bloqueio, e cada uma tem um motivo diferente:
 *
 *   · DESTRUIR — um agente confuso não apaga o card que ia ser mostrado.
 *   · REESTRUTURAR — ninguém renomeia o pipeline nem adia tudo em bloco no
 *     meio da apresentação.
 *   · GASTAR — as rotinas de IA correm na SUA chave da Anthropic. Quarenta
 *     agentes chamando "priorizar" é o seu budget acabando no meio do bloco.
 */
const PROIBIDO_AO_CONVIDADO = [
  { metodo: 'DELETE', caminho: /.*/, motivo: 'apagar' },
  { metodo: 'POST', caminho: /^\/cards\/\d+\/quebrar$/, motivo: 'apagar' },
  { metodo: 'POST', caminho: /^\/replanejar$/, motivo: 'mexer em tudo de uma vez' },
  { metodo: 'POST', caminho: /^\/projetos$/, motivo: 'criar projeto' },
  { metodo: 'PATCH', caminho: /^\/projetos\//, motivo: 'mudar projeto' },
  { metodo: 'GET', caminho: /^\/chaves/, motivo: 'ver as chaves' },
  { metodo: 'POST', caminho: /^\/chaves/, motivo: 'criar chave' },
  { metodo: 'PATCH', caminho: /^\/chaves/, motivo: 'mudar chave' },
]

/** Rotas que gastam a conta da Anthropic — separadas do papel, por escopo. */
const CUSTA_IA = /^\/ia\//

export function convidadoPode(metodo, caminho) {
  const bloqueio = PROIBIDO_AO_CONVIDADO.find(
    (regra) => regra.metodo === metodo && regra.caminho.test(caminho),
  )
  return bloqueio ? { pode: false, motivo: bloqueio.motivo } : { pode: true }
}

function chaveDaRequisicao(req) {
  const cabecalho = req.get('authorization') ?? ''
  if (cabecalho.toLowerCase().startsWith('bearer ')) return cabecalho.slice(7).trim()
  return req.get('x-api-key')?.trim() ?? null
}

function basicDaRequisicao(req) {
  const cabecalho = req.get('authorization') ?? ''
  if (!cabecalho.toLowerCase().startsWith('basic ')) return null
  const texto = Buffer.from(cabecalho.slice(6).trim(), 'base64').toString('utf8')
  const separador = texto.indexOf(':')
  if (separador < 0) return null
  return { usuario: texto.slice(0, separador), senha: texto.slice(separador + 1) }
}

/**
 * O porteiro.
 *
 * A ordem importa: chave de API primeiro, porque quando um agente manda uma
 * chave errada a resposta NÃO pode vir com `WWW-Authenticate` — isso faria o
 * navegador de quem estiver depurando abrir uma caixa de senha do nada.
 */
export function porteiro(req, res, proximo) {
  const config = configuracao()
  const chave = chaveDaRequisicao(req)

  /*
   * A chave é conferida MESMO com a tranca do .env desligada.
   *
   * A versão anterior devolvia "dono" antes de olhar a chave quando não havia
   * `.env`, e três coisas quebravam de uma vez: chave do banco ignorada, card
   * sem etiqueta de origem, e chave revogada continuando a entrar. Ausência de
   * tranca significa "não exijo credencial" — nunca "aceito qualquer uma".
   */
  if (!config.ligada && chave === null) {
    req.papel = 'dono'
    req.podeIa = true
    req.origem = null
    return proximo()
  }

  if (chave !== null) {
    // As duas do .env são chaves-mestras: existem para você não conseguir se
    // trancar do lado de fora revogando a última chave do banco.
    if (config.exigeChave && iguais(chave, config.chave)) {
      req.papel = 'dono'
      req.podeIa = true
      req.origem = 'chave-mestra'
      return proximo()
    }
    if (config.temConvidado && iguais(chave, config.chaveConvidado)) {
      req.papel = 'convidado'
      req.podeIa = false
      req.origem = 'convidado'
      return proximo()
    }

    const doBanco = autenticarChave(chave)
    if (doBanco) {
      req.papel = doBanco.papel
      req.podeIa = doBanco.pode_ia
      req.origem = doBanco.nome
      return proximo()
    }
    return res.status(401).json({ erro: 'Chave de API inválida ou revogada.' })
  }

  if (config.exigeSenha) {
    const basic = basicDaRequisicao(req)
    if (basic && iguais(basic.usuario, config.usuario) && iguais(basic.senha, config.senha)) {
      req.papel = 'dono'
      req.podeIa = true
      req.origem = null // gente no painel não vira etiqueta de origem no card
      return proximo()
    }
    res.set('WWW-Authenticate', 'Basic realm="Gestor de tarefas", charset="UTF-8"')
    return res.status(401).json({ erro: 'Usuário ou senha inválidos.' })
  }

  // Só chave configurada, e a requisição veio sem nenhuma.
  return res.status(401).json({
    erro: 'Falta a chave de API. Mande no cabeçalho: Authorization: Bearer <chave>.',
  })
}

/**
 * Segura o convidado nas rotas que não são dele.
 *
 * Fica depois do porteiro: primeiro se descobre QUEM é, depois o que pode.
 */
export function permissoes(req, res, proximo) {
  // O escopo de IA é independente do papel: dá para ter convidado que roda IA
  // e dono que não roda.
  if (CUSTA_IA.test(req.path) && req.papel !== undefined && req.podeIa === false) {
    return res.status(403).json({
      erro:
        'Esta chave não tem escopo de IA. As rotinas de IA gastam a conta da Anthropic do ' +
        'dono do sistema, então elas são liberadas chave a chave.',
    })
  }

  if (req.papel !== 'convidado') return proximo()

  const { pode, motivo } = convidadoPode(req.method, req.path)
  if (pode) return proximo()
  return res.status(403).json({
    erro:
      `Esta chave é de convidado e não pode ${motivo}. ` +
      `Convidado pode registrar, concluir, adiar e mover card — e ler tudo.`,
  })
}

/**
 * Limite de taxa por chave, janela deslizante de um minuto.
 *
 * Não é defesa contra ataque: é defesa contra agente em laço. Um agente que
 * entra em loop faz centenas de chamadas por minuto sem má intenção nenhuma, e
 * numa demonstração com quarenta deles basta um para derrubar a experiência de
 * todos.
 */
const TETO_POR_MINUTO = { dono: 600, convidado: 60 }
const janelas = new Map()

export function limitarTaxa(req, res, proximo) {
  const papel = req.papel ?? 'convidado'
  const teto = TETO_POR_MINUTO[papel]
  if (!teto) return proximo()

  const agora = Date.now()
  const chave = `${papel}:${req.ip}`
  const recentes = (janelas.get(chave) ?? []).filter((quando) => agora - quando < 60_000)

  if (recentes.length >= teto) {
    res.set('Retry-After', '60')
    janelas.set(chave, recentes)
    return res.status(429).json({
      erro: `Muitas chamadas seguidas (limite de ${teto} por minuto). Espere um minuto.`,
    })
  }

  recentes.push(agora)
  janelas.set(chave, recentes)

  // A janela é em memória e some no restart — de propósito. Persistir isso
  // exigiria mais um armazenamento para resolver um problema de 90 minutos.
  if (janelas.size > 5_000) {
    for (const [k, v] of janelas) if (!v.some((q) => agora - q < 60_000)) janelas.delete(k)
  }
  return proximo()
}

/** O que o servidor imprime ao subir, para ninguém se enganar sobre o estado. */
export function resumoDaTranca({ host }) {
  const config = configuracao()
  const local = host === '127.0.0.1' || host === 'localhost'

  if (!config.ligada) {
    return local
      ? '  Sem senha — e ouvindo só nesta máquina. É o modo de um usuário só.'
      : '  ATENÇÃO: sem senha E aberto na rede. Preencha AUTH_USUARIO e AUTH_SENHA no .env.'
  }

  const partes = []
  if (config.exigeSenha) partes.push(`senha para o painel (usuário "${config.usuario}")`)
  if (config.exigeChave) partes.push('chave de dono')
  if (config.temConvidado) partes.push('chave de convidado (não apaga, não gasta IA)')

  const linhas = [`  Tranca ligada: ${partes.join(' · ')}.`]
  if (!local) {
    linhas.push('  Exposto na rede — confira que há HTTPS na frente. Basic auth em HTTP é texto claro.')
  }
  return linhas.join('\n')
}
