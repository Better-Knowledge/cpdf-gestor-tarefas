import { useState } from 'react'
import { api } from '../api.js'
import { Botao, Etiqueta, PRIORIDADE_ROTULO, formatarData } from './Pecas.jsx'

/**
 * A gaveta de um card.
 *
 * Aqui mora a diferença entre prioridade da IA e prioridade do usuário: mexer
 * no seletor carimba a prioridade como sua, e a partir daí nenhuma rodada de
 * IA encosta nela.
 */
export default function DetalheCard({ card, projeto, aoFechar, aoMudar, aoAvisar, aoMover }) {
  const [titulo, setTitulo] = useState(card.titulo)
  const [descricao, setDescricao] = useState(card.descricao ?? '')
  const [tags, setTags] = useState(card.tags.join(', '))
  const [ocupado, setOcupado] = useState(false)

  const executar = async (acao) => {
    setOcupado(true)
    try {
      await acao()
      await aoMudar()
    } catch (erro) {
      aoAvisar({ tom: 'erro', texto: erro.message })
    } finally {
      setOcupado(false)
    }
  }

  const salvar = () =>
    executar(() =>
      api.atualizarCard(card.id, {
        titulo,
        descricao: descricao || null,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    )

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-borda bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-borda px-5 py-3">
        <span className="text-xs text-suave">
          #{card.id} · {card.projeto} · {card.etapa}
        </span>
        <Botao variante="fantasma" onClick={aoFechar}>
          fechar
        </Botao>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-suave">Título</label>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="w-full rounded-lg border border-borda px-3 py-2 text-sm
              focus:border-realce focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-suave">Descrição</label>
          <textarea
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="opcional"
            className="w-full resize-none rounded-lg border border-borda px-3 py-2 text-sm
              focus:border-realce focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-suave">
            Tags <span className="font-normal">— separadas por vírgula</span>
          </label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="ligacao, 5min, exige-foco"
            className="w-full rounded-lg border border-borda px-3 py-2 text-sm
              focus:border-realce focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-suave">Prioridade</label>
          <div className="flex gap-1.5">
            {['alta', 'media', 'baixa'].map((nivel) => (
              <Botao
                key={nivel}
                variante={card.prioridade === nivel ? 'forte' : 'neutro'}
                disabled={ocupado}
                onClick={() => executar(() => api.atualizarCard(card.id, { prioridade: nivel }))}
              >
                {PRIORIDADE_ROTULO[nivel]}
              </Botao>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-suave">
            {card.prioridade_origem === 'usuario'
              ? 'Você decidiu esta prioridade. A IA não mexe mais nela.'
              : card.prioridade_sugerida
                ? 'Sugestão da IA — o projeto ainda não tem contexto escrito.'
                : 'Definida pela IA contra o contexto do projeto.'}
          </p>
          {card.justificativa && (
            <p className="mt-1 text-[11px] text-suave italic">“{card.justificativa}”</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-suave">Data</label>
          <div className="flex flex-wrap gap-1.5">
            {['hoje', 'amanha', 'sexta', '7d'].map((quando) => (
              <Botao
                key={quando}
                disabled={ocupado}
                onClick={() => executar(() => api.adiar(card.id, quando))}
              >
                {quando === 'amanha' ? 'amanhã' : quando}
              </Botao>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-suave">está para {formatarData(card.data)}</p>
        </div>

        {card.dependencias.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-suave">Depende de</label>
            <ul className="space-y-1.5">
              {card.dependencias.map((dep) => (
                <li
                  key={dep.id}
                  className="flex items-center justify-between gap-2 rounded-lg border
                    border-borda px-2.5 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {dep.titulo}
                    {dep.status === 'feita' && ' ✓'}
                  </span>
                  {dep.confirmada ? (
                    <Botao
                      variante="fantasma"
                      disabled={ocupado}
                      onClick={() =>
                        executar(() => api.confirmarDependencia(card.id, dep.id, false))
                      }
                    >
                      desfazer
                    </Botao>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1">
                      <Etiqueta tom="realce">sugestão</Etiqueta>
                      <Botao
                        disabled={ocupado}
                        onClick={() =>
                          executar(() => api.confirmarDependencia(card.id, dep.id, true))
                        }
                      >
                        é isso
                      </Botao>
                      <Botao
                        variante="fantasma"
                        disabled={ocupado}
                        onClick={() => executar(() => api.removerDependencia(card.id, dep.id))}
                      >
                        não
                      </Botao>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {card.aguardando.length > 0 && (
          <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-suave">
            Este card está aguardando: {card.aguardando.map((a) => a.titulo).join(', ')}.
          </p>
        )}

        {projeto && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-suave">Mover para</label>
            <div className="flex flex-wrap gap-1.5">
              {projeto.etapas.map((etapa) => (
                <Botao
                  key={etapa.id}
                  variante={card.etapa === etapa.nome ? 'forte' : 'neutro'}
                  disabled={ocupado || card.etapa === etapa.nome}
                  // Passa pelo `mover` do App, não pela API direto: é ele que
                  // avisa o que a conclusão destravou.
                  onClick={() => executar(() => aoMover(card, etapa.nome))}
                >
                  {etapa.nome}
                </Botao>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-borda px-5 py-3">
        <Botao
          variante="fantasma"
          disabled={ocupado}
          onClick={() => {
            if (confirm(`Apagar "${card.titulo}"? Isso não volta.`)) {
              executar(() => api.excluirCard(card.id)).then(aoFechar)
            }
          }}
        >
          apagar
        </Botao>
        <span className="flex gap-2">
          <Botao
            disabled={ocupado || card.status === 'feita'}
            onClick={() => executar(() => api.marcarHoje(card.id, !card.hoje))}
          >
            {card.hoje ? 'tirar do dia' : 'é de hoje'}
          </Botao>
          <Botao variante="forte" disabled={ocupado} onClick={salvar}>
            salvar
          </Botao>
        </span>
      </footer>
    </aside>
  )
}
