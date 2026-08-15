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
  { metodo: 'POST', caminho: /^\/ia\//, motivo: 'rodar IA' },
]

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
  if (!config.ligada) {
    req.papel = 'dono'
    return proximo()
  }

  const chave = chaveDaRequisicao(req)
  if (chave !== null) {
    if (config.exigeChave && iguais(chave, config.chave)) {
      req.papel = 'dono'
      return proximo()
    }
    if (config.temConvidado && iguais(chave, config.chaveConvidado)) {
      req.papel = 'convidado'
      return proximo()
    }
    return res.status(401).json({ erro: 'Chave de API inválida.' })
  }

  if (config.exigeSenha) {
    const basic = basicDaRequisicao(req)
    if (basic && iguais(basic.usuario, config.usuario) && iguais(basic.senha, config.senha)) {
      req.papel = 'dono'
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
