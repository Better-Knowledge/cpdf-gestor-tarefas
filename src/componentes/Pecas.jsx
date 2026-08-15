/** Peças pequenas de interface, usadas em mais de um lugar. */

export const PRIORIDADE_COR = {
  alta: 'bg-amber-500',
  media: 'bg-stone-400',
  baixa: 'bg-stone-300',
}

export const PRIORIDADE_ROTULO = { alta: 'alta', media: 'média', baixa: 'baixa' }

export function Botao({ children, variante = 'neutro', className = '', ...resto }) {
  const estilos = {
    neutro:
      'bg-white border-borda text-tinta hover:bg-stone-50 disabled:opacity-40 disabled:hover:bg-white',
    forte: 'bg-tinta border-tinta text-papel hover:bg-stone-700 disabled:opacity-40',
    calmo: 'bg-calmo border-calmo text-white hover:bg-teal-800 disabled:opacity-40',
    fantasma: 'bg-transparent border-transparent text-suave hover:text-tinta hover:bg-stone-100',
  }[variante]
  return (
    <button
      {...resto}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm
        font-medium transition-colors disabled:cursor-not-allowed ${estilos} ${className}`}
    >
      {children}
    </button>
  )
}

export function Etiqueta({ children, tom = 'neutro', ...resto }) {
  const tons = {
    neutro: 'bg-stone-100 text-suave',
    realce: 'bg-realce-claro text-realce',
    calmo: 'bg-calmo-claro text-calmo',
  }[tom]
  return (
    <span
      {...resto}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]
        font-medium leading-tight ${tons}`}
    >
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
  return <p className="px-1 py-8 text-center text-sm text-suave">{children}</p>
}

export function Carregando() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-suave">Abrindo…</p>
    </div>
  )
}
