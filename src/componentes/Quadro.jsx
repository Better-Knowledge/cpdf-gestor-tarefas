import { DndContext, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import Cartao from './Cartao.jsx'
import { Vazio } from './Pecas.jsx'

function Coluna({ etapa, cards, aoAbrir, hoje, aoDecidirPrioridade }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.nome })

  return (
    <section ref={setNodeRef} className={`coluna flex min-w-72 flex-1 flex-col ${isOver ? 'sobre' : ''}`}>
      <header className="coluna-titulo">
        <span>{etapa.nome}</span>
        <span className="conta">{cards.length}</span>
      </header>

      <div className="flex flex-1 flex-col gap-2.5">
        {cards.map((card) => (
          <Cartao
            key={card.id}
            card={card}
            aoAbrir={aoAbrir}
            atrasado={card.data < hoje}
            aoDecidirPrioridade={aoDecidirPrioridade}
          />
        ))}
        {!cards.length && (
          <p className="font-serifa px-2 py-6 text-center text-xs text-pedra italic">vazio</p>
        )}
      </div>
    </section>
  )
}

/**
 * O quadro: uma coluna por etapa do pipeline do projeto.
 *
 * Arrastar para a última coluna conclui o card — e a conclusão volta dizendo o
 * que destravou, que é o pedaço que fecha o loop.
 */
export default function Quadro({ projeto, cards, aoMover, aoAbrir, hoje, aoDecidirPrioridade }) {
  const sensores = useSensors(
    // Sem a distância mínima, clicar no card viraria um arrasto de zero pixel
    // e o card nunca abriria.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  if (!projeto) return null

  function aoSoltar({ active, over }) {
    if (!over) return
    const card = cards.find((c) => c.id === active.id)
    if (!card || card.etapa === over.id) return
    aoMover(card, over.id)
  }

  if (!cards.length) {
    return <Vazio>Nada por aqui ainda. Escreva uma frase lá em cima e dê Enter.</Vazio>
  }

  return (
    <DndContext sensors={sensores} onDragEnd={aoSoltar}>
      <div className="flex h-full gap-4 overflow-x-auto pb-4">
        {projeto.etapas.map((etapa) => (
          <Coluna
            key={etapa.id}
            etapa={etapa}
            cards={cards.filter((c) => c.etapa === etapa.nome)}
            aoAbrir={aoAbrir}
            hoje={hoje}
            aoDecidirPrioridade={aoDecidirPrioridade}
          />
        ))}
      </div>
    </DndContext>
  )
}
