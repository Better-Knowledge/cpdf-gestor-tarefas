/** Peças pequenas de interface, usadas em mais de um lugar. */

export const PRIORIDADE_COR = {
  alta: 'bg-terracota',
  media: 'bg-pedra',
  baixa: 'bg-borda-forte',
}

export const PRIORIDADE_ROTULO = { alta: 'alta', media: 'média', baixa: 'baixa' }

// Os nomes antigos continuam valendo: trocar o design system não deveria
// obrigar a reescrever cada chamada de botão do app.
const VARIANTES = {
  neutro: '',
  forte: 'escuro',
  escuro: 'escuro',
  calmo: 'primario',
  primario: 'primario',
  fantasma: 'fantasma',
  perigo: 'perigo',
}

export function Botao({ children, variante = 'neutro', miudo = false, className = '', ...resto }) {
  const classe = VARIANTES[variante] ?? ''
  return (
    <button {...resto} className={`btn ${classe} ${miudo ? 'miudo' : ''} ${className}`}>
      {children}
    </button>
  )
}

export function Etiqueta({ children, tom = 'neutro', ...resto }) {
  const classe = { neutro: '', realce: 'accent', calmo: 'calmo' }[tom]
  return (
    <span {...resto} className={`chip ${classe}`}>
      {children}
    </span>
  )
}

/** Data em português, curta. "hoje" e "amanhã" por extenso porque é o que se lê. */
export function formatarData(iso) {
  if (!iso) return ''
  // As duas pontas à meia-noite local: com o alvo ao meio-dia, a diferença de
  // "hoje" dava meio dia, o Math.round subia para 1, e hoje virava amanhã.
  const agora = new Date()
  const inicioDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const alvo = new Date(`${iso}T00:00:00`)
  const dias = Math.round((alvo - inicioDeHoje) / 86_400_000)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias === -1) return 'ontem'
  if (dias < 0) return `${Math.abs(dias)} dias atrás`
  if (dias < 7) return alvo.toLocaleDateString('pt-BR', { weekday: 'long' })
  return alvo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function Vazio({ children }) {
  return (
    <p className="font-serifa px-1 py-8 text-center text-sm text-pedra italic">{children}</p>
  )
}

export function Carregando() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-pedra">Abrindo…</p>
    </div>
  )
}

/** O cabeçalho de uma tela: rótulo miúdo em cima, título grande embaixo. */
export function TituloDeTela({ eyebrow, children, className = '' }) {
  return (
    <header className={className}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="titulo-tela mt-2 text-4xl">{children}</h1>
    </header>
  )
}
