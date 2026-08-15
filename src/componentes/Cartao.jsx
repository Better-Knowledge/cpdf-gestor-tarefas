import { useDraggable } from '@dnd-kit/core'
import { Etiqueta, PRIORIDADE_COR, formatarData } from './Pecas.jsx'

/**
 * Um card no quadro.
 *
 * Card aguardando dependência confirmada aparece marcado e dizendo aguardando
 * o quê — mas NÃO some e não é escondido (PRD v2, 4.2). Esconder o que está
 * travado é como fingir que ele não existe.
 */
export default function Cartao({ card, aoAbrir, atrasado }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { etapa: card.etapa },
  })

  const travado = card.aguardando.length > 0
  const sugestoes = card.dependencias.filter((d) => !d.confirmada).length

  return (
    <article
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // O dnd-kit já entrega role="button" e tabIndex, mas sem nome: na leitura
      // de tela a coluna vira uma fileira de "botão, botão, botão".
      aria-label={`${card.titulo} — ${card.etapa}, prioridade ${card.prioridade}${
        travado ? `, aguardando ${card.aguardando[0].titulo}` : ''
      }`}
      onClick={() => aoAbrir(card)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          aoAbrir(card)
        }
      }}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`group cursor-grab touch-none rounded-xl border border-borda bg-white p-3
        text-left shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing
        ${isDragging ? 'arrastando' : ''} ${card.hoje ? 'ring-2 ring-realce/40' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span
          title={`prioridade ${card.prioridade}`}
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORIDADE_COR[card.prioridade]}`}
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm leading-snug font-medium text-tinta">{card.titulo}</h3>

          {card.justificativa && (
            <p className="mt-1 text-[11px] leading-snug text-suave italic">{card.justificativa}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1">
            {card.hoje && <Etiqueta tom="realce">hoje</Etiqueta>}
            {card.tipo === 'ideia' && <Etiqueta tom="calmo">ideia</Etiqueta>}
            {card.tags.map((tag) => (
              <Etiqueta key={tag}>#{tag}</Etiqueta>
            ))}
            {card.prioridade_sugerida && <Etiqueta tom="realce">prioridade sugerida</Etiqueta>}
            {sugestoes > 0 && <Etiqueta>{sugestoes} relação a confirmar</Etiqueta>}
          </div>

          {travado && (
            <p className="mt-2 rounded-md bg-stone-100 px-2 py-1 text-[11px] text-suave">
              aguardando <span className="font-medium">{card.aguardando[0].titulo}</span>
              {card.aguardando.length > 1 && ` e mais ${card.aguardando.length - 1}`}
            </p>
          )}

          <p className={`mt-2 text-[11px] ${atrasado ? 'text-realce' : 'text-suave'}`}>
            {formatarData(card.data)}
          </p>
        </div>
      </div>
    </article>
  )
}
