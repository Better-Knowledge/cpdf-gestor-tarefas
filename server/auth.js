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
  return {
    usuario,
    senha,
    chave,
    exigeSenha: Boolean(usuario && senha),
    exigeChave: Boolean(chave),
    ligada: Boolean((usuario && senha) || chave),
  }
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
  if (!config.ligada) return proximo()

  const chave = chaveDaRequisicao(req)
  if (chave !== null) {
    if (config.exigeChave && iguais(chave, config.chave)) return proximo()
    return res.status(401).json({ erro: 'Chave de API inválida.' })
  }

  if (config.exigeSenha) {
    const basic = basicDaRequisicao(req)
    if (basic && iguais(basic.usuario, config.usuario) && iguais(basic.senha, config.senha)) {
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
  if (config.exigeChave) partes.push('chave de API para o agente')
  return `  Tranca ligada: ${partes.join(' · ')}.`
}
