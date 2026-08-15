import { useDraggable } from '@dnd-kit/core'
import { Etiqueta, PRIORIDADE_COR, PRIORIDADE_ROTULO, formatarData } from './Pecas.jsx'

/**
 * Um card no quadro.
 *
 * Card aguardando dependência confirmada aparece marcado e dizendo aguardando
 * o quê — mas NÃO some e não é escondido (PRD v2, 4.2). Esconder o que está
 * travado é como fingir que ele não existe.
 */
export default function Cartao({ card, aoAbrir, atrasado, aoDecidirPrioridade }) {
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
      className={`cartao touch-none ${isDragging ? 'arrastando' : ''} ${card.hoje ? 'do-dia' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span
          title={`prioridade ${card.prioridade}`}
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORIDADE_COR[card.prioridade]}`}
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-titulo text-[15px] leading-snug font-semibold text-tinta">
            {card.titulo}
          </h3>

          {card.justificativa && (
            <p className="font-serifa mt-1 text-[12px] leading-snug text-pedra italic">
              {card.justificativa}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1">
            {card.hoje && <Etiqueta tom="realce">hoje</Etiqueta>}
            {card.tipo === 'ideia' && <Etiqueta tom="calmo">ideia</Etiqueta>}
            {card.tags.map((tag) => (
              <Etiqueta key={tag}>#{tag}</Etiqueta>
            ))}
            {sugestoes > 0 && <Etiqueta>{sugestoes} relação a confirmar</Etiqueta>}
          </div>

          {/*
            Sem contexto no projeto, a IA sugere em vez de decidir — e o pedido
            de confirmação acontece aqui, no card, não escondido numa gaveta.
            Os botões param a propagação para não abrir o card junto.
          */}
          {card.prioridade_sugerida && (
            <div className="mt-2 rounded-lg border border-terracota/30 bg-terracota/6 px-2 py-1.5">
              <p className="text-[11px] leading-snug text-terracota">
                Sugestão: prioridade <strong>{PRIORIDADE_ROTULO[card.prioridade]}</strong>
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    aoDecidirPrioridade(card, true)
                  }}
                  className="btn primario miudo"
                >
                  é isso
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    aoDecidirPrioridade(card, false)
                  }}
                  className="btn fantasma miudo"
                >
                  não
                </button>
              </div>
            </div>
          )}

          {travado && (
            <p className="mt-2 rounded-lg bg-papel-fundo px-2 py-1 text-[11px] text-grafite">
              aguardando <span className="font-medium">{card.aguardando[0].titulo}</span>
              {card.aguardando.length > 1 && ` e mais ${card.aguardando.length - 1}`}
            </p>
          )}

          <p
            className={`mt-2 text-[11px] ${
              atrasado ? 'font-medium text-terracota' : 'text-pedra'
            }`}
          >
            {formatarData(card.data)}
            {card.origem && <span className="ml-1.5 text-pedra">· via {card.origem}</span>}
          </p>
        </div>
      </div>
    </article>
  )
}
