import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import Quadro from './componentes/Quadro.jsx'
import EAgora from './componentes/EAgora.jsx'
import DetalheCard from './componentes/DetalheCard.jsx'
import PainelProjeto, { NovoProjeto } from './componentes/PainelProjeto.jsx'
import Chaves from './componentes/Chaves.jsx'
import Telegram from './componentes/Telegram.jsx'
import { Botao, Carregando, Etiqueta } from './componentes/Pecas.jsx'

const hojeISO = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function App() {
  const [projetos, setProjetos] = useState(null)
  const [projetoNome, setProjetoNome] = useState(null)
  const [cards, setCards] = useState([])
  const [tags, setTags] = useState([])
  const [atrasados, setAtrasados] = useState([])
  const [filtros, setFiltros] = useState({ status: 'aberto', tag: '', busca: '' })

  const [modo, setModo] = useState('quadro')
  const [cardAberto, setCardAberto] = useState(null)
  const [editandoProjeto, setEditandoProjeto] = useState(false)
  const [criandoProjeto, setCriandoProjeto] = useState(false)

  const [avisos, setAvisos] = useState([])
  const [iaDisponivel, setIaDisponivel] = useState(false)
  const [iaOcupada, setIaOcupada] = useState(null)
  const [ordem, setOrdem] = useState(null)
  const [quebras, setQuebras] = useState(null)
  const [oferta, setOferta] = useState(null)
  const [vendoChaves, setVendoChaves] = useState(false)
  const [vendoTelegram, setVendoTelegram] = useState(false)
  const [eu, setEu] = useState(null)

  const projeto = projetos?.find((p) => p.nome === projetoNome) ?? null

  const avisar = useCallback((aviso) => {
    const id = crypto.randomUUID()
    setAvisos((atuais) => [...atuais, { ...aviso, id }])
    setTimeout(() => setAvisos((atuais) => atuais.filter((a) => a.id !== id)), 9000)
  }, [])

  const recarregar = useCallback(async () => {
    const [lista, listaTags, vencidos] = await Promise.all([
      api.cards({ projeto: projetoNome, ...filtros }),
      api.tags(),
      api.atrasados(),
    ])
    setCards(lista)
    setTags(listaTags)
    setAtrasados(vencidos)
    if (cardAberto) setCardAberto(lista.find((c) => c.id === cardAberto.id) ?? null)
  }, [projetoNome, filtros, cardAberto])

  useEffect(() => {
    Promise.all([api.projetos(), api.iaDisponivel(), api.eu()])
      .then(([lista, ia, quemSou]) => {
        setProjetos(lista)
        setProjetoNome((atual) => atual ?? lista[0]?.nome ?? null)
        setIaDisponivel(ia.disponivel)
        setEu(quemSou)
      })
      .catch((erro) => avisar({ tom: 'erro', texto: erro.message }))
  }, [avisar])

  useEffect(() => {
    if (projetoNome) recarregar().catch((erro) => avisar({ tom: 'erro', texto: erro.message }))
    // `recarregar` muda a cada render por causa de `cardAberto`; depender dela
    // aqui faria um laço infinito de requisição.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoNome, filtros])

  async function comErro(acao) {
    try {
      return await acao()
    } catch (erro) {
      avisar({ tom: 'erro', texto: erro.message })
    }
  }

  async function registrar(evento) {
    evento.preventDefault()
    const campo = evento.target.elements.titulo
    const titulo = campo.value.trim()
    if (!titulo) return
    campo.value = ''
    await comErro(async () => {
      await api.criarCard({ titulo, projeto: projetoNome })
      await recarregar()
    })
  }

  /** Concluir devolve o que destravou — e isso vira o aviso que fecha o loop. */
  async function concluir(card) {
    await comErro(async () => {
      const { desbloqueadas } = await api.concluir(card.id)
      await recarregar()
      if (desbloqueadas.length) {
        avisar({
          tom: 'destravou',
          texto: `“${card.titulo}” destravou ${desbloqueadas.length} tarefa(s)`,
          itens: desbloqueadas.map((d) => d.titulo),
        })
      }
    })
  }

  async function mover(card, etapa) {
    await comErro(async () => {
      const { desbloqueadas } = await api.mover(card.id, etapa)
      await recarregar()
      if (desbloqueadas.length) {
        avisar({
          tom: 'destravou',
          texto: `“${card.titulo}” destravou ${desbloqueadas.length} tarefa(s)`,
          itens: desbloqueadas.map((d) => d.titulo),
        })
      }
    })
  }

  /**
   * Aceitar ou recusar a prioridade que a IA sugeriu.
   *
   * Aceitar três vezes num projeto sem contexto faz o sistema parar de
   * adivinhar e oferecer escrever a regra de uma vez (PRD v2, 4.1).
   */
  async function decidirPrioridade(card, aceita) {
    await comErro(async () => {
      if (aceita) await api.aceitarSugestao(card.id)
      else await api.recusarSugestao(card.id)
      await recarregar()
      if (aceita && projeto) {
        const proposta = await api.ofertaDeContexto(projeto.id)
        if (proposta) setOferta(proposta)
      }
    })
  }

  async function rodarIA(nome, acao) {
    setIaOcupada(nome)
    try {
      const resultado = await acao()
      await recarregar()
      return resultado
    } catch (erro) {
      avisar({ tom: 'erro', texto: erro.message })
    } finally {
      setIaOcupada(null)
    }
  }

  if (!projetos) return <Carregando />

  return (
    <div className="flex h-full flex-col">
      <div className="textura" />
      <header className="sticky top-0 z-20 border-b border-borda bg-papel/85 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <span className="flex items-center gap-3">
            <span className="marca-pill">Gestor</span>
            <h1 className="font-titulo text-lg font-semibold tracking-tight">
              de <span className="serifa">tarefas</span>
            </h1>
          </span>

          <nav className="flex flex-wrap items-center gap-1">
            {projetos.map((p) => (
              <button
                key={p.id}
                onClick={() => setProjetoNome(p.nome)}
                className={`aba ${p.nome === projetoNome ? 'ativa' : ''}`}
              >
                {p.nome}
              </button>
            ))}
            <button onClick={() => setCriandoProjeto(true)} title="novo projeto" className="aba">
              +
            </button>
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Botao variante="fantasma" onClick={() => setEditandoProjeto(true)}>
              contexto
              {!projeto?.contexto && <span className="ml-1 text-terracota">•</span>}
            </Botao>
            {eu?.papel === 'dono' && (
              <>
                <Botao variante="fantasma" onClick={() => setVendoChaves(true)}>
                  chaves
                </Botao>
                <Botao variante="fantasma" onClick={() => setVendoTelegram(true)}>
                  telegram
                </Botao>
              </>
            )}
            <Botao variante="forte" onClick={() => setModo(modo === 'agora' ? 'quadro' : 'agora')}>
              {modo === 'agora' ? 'ver o quadro' : 'E agora?'}
            </Botao>
          </div>
        </div>

        {modo === 'quadro' && (
          <div className="flex flex-wrap items-center gap-2 border-t border-borda px-5 py-2">
            <div className="flex overflow-hidden rounded-lg border border-borda">
              {[
                ['aberto', 'aberto'],
                ['feito', 'feito'],
                ['todos', 'todos'],
              ].map(([valor, rotulo]) => (
                <button
                  key={valor}
                  onClick={() => setFiltros((f) => ({ ...f, status: valor }))}
                  className={`px-2.5 py-1 text-xs transition-colors ${
                    filtros.status === valor
                      ? 'bg-tinta text-papel'
                      : 'bg-white text-pedra hover:bg-papel-fundo'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            <select
              value={filtros.tag}
              onChange={(e) => setFiltros((f) => ({ ...f, tag: e.target.value }))}
              className="rounded-lg border border-borda bg-white px-2 py-1 text-xs text-pedra"
            >
              <option value="">todas as tags</option>
              {tags.map((t) => (
                <option key={t.nome} value={t.nome}>
                  #{t.nome} ({t.usos})
                </option>
              ))}
            </select>

            <input
              value={filtros.busca}
              onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
              placeholder="procurar…"
              className="w-40 rounded-lg border border-borda px-2 py-1 text-xs
                focus:border-terracota focus:outline-none"
            />

            {iaDisponivel && (
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <Botao
                  disabled={!!iaOcupada}
                  onClick={() =>
                    rodarIA('priorizar', async () => {
                      const r = await api.priorizar(projetoNome)
                      avisar({ tom: 'ok', texto: r.mensagem })
                    })
                  }
                >
                  {iaOcupada === 'priorizar' ? 'priorizando…' : 'priorizar'}
                </Botao>
                <Botao
                  disabled={!!iaOcupada}
                  onClick={() =>
                    rodarIA('relacionar', async () => {
                      const r = await api.relacionar(projetoNome)
                      avisar({ tom: 'ok', texto: r.mensagem })
                    })
                  }
                >
                  {iaOcupada === 'relacionar' ? 'procurando…' : 'achar relações'}
                </Botao>
                <Botao
                  disabled={!!iaOcupada}
                  onClick={() => rodarIA('ordem', async () => setOrdem(await api.ordemDoDia()))}
                >
                  {iaOcupada === 'ordem' ? 'montando…' : 'ordem do dia'}
                </Botao>
                <Botao
                  disabled={!!iaOcupada}
                  onClick={() =>
                    rodarIA('quebrar', async () => {
                      const r = await api.sugerirQuebra()
                      r.quebras.length ? setQuebras(r) : avisar({ tom: 'ok', texto: r.mensagem })
                    })
                  }
                >
                  {iaOcupada === 'quebrar' ? 'olhando…' : 'o que travou?'}
                </Botao>
              </div>
            )}
          </div>
        )}
      </header>

      {atrasados.length > 0 && modo === 'quadro' && (
        <div className="flex flex-wrap items-center gap-3 border-b border-borda bg-terracota/8 px-5 py-2">
          <p className="text-xs text-tinta">
            <strong>{atrasados.length}</strong> card(s) passaram da data.
          </p>
          <Botao
            onClick={() =>
              comErro(async () => {
                const r = await api.replanejar('hoje')
                await recarregar()
                avisar({ tom: 'ok', texto: `${r.adiados} card(s) trazidos para hoje.` })
              })
            }
          >
            trazer tudo para hoje
          </Botao>
          <Botao
            variante="fantasma"
            onClick={() =>
              comErro(async () => {
                const r = await api.replanejar('7d')
                await recarregar()
                avisar({ tom: 'ok', texto: `${r.adiados} card(s) adiados uma semana.` })
              })
            }
          >
            adiar uma semana
          </Botao>
        </div>
      )}

      {modo === 'quadro' && (
        <form onSubmit={registrar} className="border-b border-borda px-5 py-3">
          <input
            name="titulo"
            autoComplete="off"
            placeholder={`Escreva uma frase e dê Enter — vai para "${projetoNome}"`}
            className="campo bg-superficie px-4 py-3 text-[15px] shadow-baixa"
          />
        </form>
      )}

      <main className="min-h-0 flex-1 overflow-hidden p-5">
        {modo === 'agora' ? (
          <EAgora projeto={projetoNome} aoConcluir={concluir} aoSair={() => setModo('quadro')} />
        ) : (
          <Quadro
            projeto={projeto}
            cards={cards}
            aoMover={mover}
            aoAbrir={setCardAberto}
            hoje={hojeISO()}
            aoDecidirPrioridade={decidirPrioridade}
          />
        )}
      </main>

      {cardAberto && (
        <DetalheCard
          card={cardAberto}
          projeto={projeto}
          aoFechar={() => setCardAberto(null)}
          aoMudar={recarregar}
          aoAvisar={avisar}
          aoMover={mover}
        />
      )}

      {editandoProjeto && projeto && (
        <PainelProjeto
          projeto={projeto}
          aoFechar={() => setEditandoProjeto(false)}
          aoMudar={async () => setProjetos(await api.projetos())}
          aoAvisar={avisar}
        />
      )}

      {criandoProjeto && (
        <NovoProjeto
          aoFechar={() => setCriandoProjeto(false)}
          aoCriar={async (novo) => {
            setProjetos(await api.projetos())
            setProjetoNome(novo.nome)
          }}
          aoAvisar={avisar}
        />
      )}

      {oferta && projeto && (
        <OfertaDeContexto
          oferta={oferta}
          projeto={projeto}
          iaDisponivel={iaDisponivel}
          aoAvisar={avisar}
          aoFechar={async () => {
            await api.dispensarOferta(projeto.id).catch(() => {})
            setOferta(null)
          }}
          aoSalvar={async (texto) => {
            await comErro(async () => {
              await api.atualizarProjeto(projeto.id, { contexto: texto })
              await api.dispensarOferta(projeto.id)
              setProjetos(await api.projetos())
              avisar({ tom: 'ok', texto: `Contexto de "${projeto.nome}" escrito.` })
            })
            setOferta(null)
          }}
        />
      )}

      {vendoChaves && <Chaves aoFechar={() => setVendoChaves(false)} aoAvisar={avisar} />}

      {vendoTelegram && (
        <Telegram aoFechar={() => setVendoTelegram(false)} aoAvisar={avisar} />
      )}

      {ordem && <OrdemDoDia ordem={ordem} aoFechar={() => setOrdem(null)} />}

      {quebras && (
        <Quebras
          dados={quebras}
          aoFechar={() => setQuebras(null)}
          aoAplicar={async (card, partes) => {
            await comErro(async () => {
              await api.quebrar(card.id, partes)
              await recarregar()
              avisar({ tom: 'ok', texto: `“${card.titulo}” virou ${partes.length} cards.` })
            })
            setQuebras(null)
          }}
        />
      )}

      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
        {avisos.map((aviso) => (
          <div
            key={aviso.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg ${
              aviso.tom === 'erro'
                ? 'border-terracota/30 bg-white text-terracota'
                : aviso.tom === 'destravou'
                  ? 'border-sucesso/30 bg-sucesso/10 text-sucesso'
                  : 'border-borda bg-white text-tinta'
            }`}
          >
            <p className="font-medium">{aviso.texto}</p>
            {aviso.itens && (
              <ul className="mt-1 space-y-0.5">
                {aviso.itens.map((item) => (
                  <li key={item} className="text-xs">
                    → {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * "Parece que aqui o que tem data marcada vem primeiro. Quer que eu escreva
 * isso no contexto do projeto?"
 *
 * O fim do laço da 4.1: depois de três confirmações, em vez de continuar
 * adivinhando para sempre, o sistema pede para a pessoa escrever a regra uma
 * vez. Com IA ele traz um rascunho; sem IA, a caixa vem em branco — e a caixa
 * em branco já é o ganho, porque o pedido é o que faltava.
 */
function OfertaDeContexto({ oferta, projeto, iaDisponivel, aoFechar, aoSalvar, aoAvisar }) {
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function rascunhar() {
    setOcupado(true)
    try {
      const { rascunho } = await api.escreverContexto(projeto.nome)
      setTexto(rascunho)
    } catch (erro) {
      aoAvisar({ tom: 'erro', texto: erro.message })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/20 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-borda bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold">
          Você já confirmou {oferta.confirmacoes} prioridades em “{projeto.nome}”
        </h2>
        <p className="mt-1 text-sm text-pedra">
          Existe uma regra aí, e ela só está na sua cabeça. Se ela estiver escrita, eu paro de
          perguntar e passo a priorizar sozinho.
        </p>

        <ul className="mt-4 space-y-1">
          {oferta.exemplos.slice(0, 3).map((e) => (
            <li key={e.titulo} className="rounded-lg bg-papel-fundo px-3 py-1.5 text-xs">
              <strong>{e.titulo}</strong> → {e.prioridade}
            </li>
          ))}
        </ul>

        <textarea
          rows={5}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="O que faz uma tarefa ser urgente neste projeto?"
          className="mt-4 w-full resize-none rounded-lg border border-borda px-3 py-2 font-mono
            text-[13px] leading-relaxed focus:border-terracota focus:outline-none"
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {iaDisponivel ? (
            <Botao onClick={rascunhar} disabled={ocupado}>
              {ocupado ? 'escrevendo…' : 'escreve um rascunho pra mim'}
            </Botao>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <Botao variante="fantasma" onClick={aoFechar}>
              agora não
            </Botao>
            <Botao variante="forte" disabled={!texto.trim()} onClick={() => aoSalvar(texto.trim())}>
              salvar o contexto
            </Botao>
          </span>
        </div>
      </div>
    </div>
  )
}

function OrdemDoDia({ ordem, aoFechar }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/20 p-4">
      <div className="flex max-h-full w-full max-w-lg flex-col rounded-2xl border border-borda bg-white shadow-2xl">
        <header className="border-b border-borda px-6 py-4">
          <h2 className="text-lg font-semibold">A ordem sugerida</h2>
          {ordem.recado && <p className="mt-0.5 text-xs text-pedra">{ordem.recado}</p>}
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {ordem.blocos.map((bloco, indice) => (
            <section key={bloco.nome}>
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <span className="text-pedra">{indice + 1}.</span>
                {bloco.nome}
              </h3>
              <p className="mt-0.5 mb-2 text-[11px] text-pedra">{bloco.porque}</p>
              <ul className="space-y-1">
                {bloco.cards.map((card) => (
                  <li key={card.id} className="rounded-lg border border-borda px-3 py-1.5 text-sm">
                    {card.titulo}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!ordem.blocos.length && <p className="text-sm text-pedra">Nada aberto para hoje.</p>}
        </div>
        <footer className="flex justify-end border-t border-borda px-6 py-3">
          <Botao onClick={aoFechar}>fechar</Botao>
        </footer>
      </div>
    </div>
  )
}

function Quebras({ dados, aoFechar, aoAplicar }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/20 p-4">
      <div className="flex max-h-full w-full max-w-lg flex-col rounded-2xl border border-borda bg-white shadow-2xl">
        <header className="border-b border-borda px-6 py-4">
          <h2 className="text-lg font-semibold">Talvez estes estejam grandes demais</h2>
          <p className="mt-0.5 text-xs text-pedra">
            Card parado há dias quase nunca é preguiça — quase sempre é uma tarefa grande disfarçada
            de tarefa.
          </p>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {dados.quebras.map(({ card, partes }) => (
            <section key={card.id}>
              <h3 className="text-sm font-medium">{card.titulo}</h3>
              <ul className="mt-2 space-y-1">
                {partes.map((parte) => (
                  <li key={parte} className="rounded-lg bg-papel-fundo px-3 py-1.5 text-sm">
                    {parte}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center gap-2">
                <Botao onClick={() => aoAplicar(card, partes)}>trocar por estes</Botao>
                <Etiqueta>o card original é apagado</Etiqueta>
              </div>
            </section>
          ))}
        </div>
        <footer className="flex justify-end border-t border-borda px-6 py-3">
          <Botao onClick={aoFechar}>deixar como está</Botao>
        </footer>
      </div>
    </div>
  )
}
