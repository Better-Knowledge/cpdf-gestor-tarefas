import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Botao, Etiqueta, formatarData } from './Pecas.jsx'

/**
 * O modo "e agora?" — UMA tarefa na tela.
 *
 * É a tela mais importante do produto para quem trava. Uma lista de vinte
 * itens é a tela que paralisa; uma tarefa com três botões é a tela que
 * destrava. "Me mostra outra" não tem penalidade e não faz pergunta.
 */
export default function EAgora({ projeto, aoConcluir, aoSair }) {
  const [dados, setDados] = useState(null)
  const [pular, setPular] = useState([])
  const [erro, setErro] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let ativo = true
    api
      .proxima({ projeto, pular: pular.join(',') })
      .then((d) => ativo && setDados(d))
      .catch((e) => ativo && setErro(e.message))
    return () => {
      ativo = false
    }
  }, [projeto, pular])

  const card = dados?.card

  async function concluir() {
    setOcupado(true)
    try {
      await aoConcluir(card)
      setPular((atual) => [...atual])
      setDados(await api.proxima({ projeto, pular: pular.join(',') }))
    } finally {
      setOcupado(false)
    }
  }

  async function adiar() {
    setOcupado(true)
    try {
      await api.adiar(card.id, 'amanha')
      setDados(await api.proxima({ projeto, pular: pular.join(',') }))
    } catch (e) {
      setErro(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center px-6 text-center">
      {erro && <p className="mb-4 text-sm text-terracota">{erro}</p>}

      {!dados && !erro && <p className="text-sm text-pedra">Escolhendo…</p>}

      {dados && !card && (
        <>
          <h2 className="text-2xl font-semibold text-tinta">Nada aberto para hoje.</h2>
          <p className="mt-2 text-sm text-pedra">
            Ou o dia acabou, ou o que sobrou está esperando outra coisa acontecer.
          </p>
          <Botao className="mt-6" onClick={aoSair}>
            Ver o quadro
          </Botao>
        </>
      )}

      {card && (
        <>
          <p className="mb-6 text-xs font-semibold tracking-widest text-pedra uppercase">
            E agora?
          </p>

          <h2 className="text-3xl leading-tight font-semibold text-balance text-tinta">
            {card.titulo}
          </h2>

          {dados.porque && <p className="mt-4 max-w-md text-sm text-pedra">{dados.porque}</p>}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            <Etiqueta tom={card.data < new Date().toISOString().slice(0, 10) ? 'realce' : 'neutro'}>
              {formatarData(card.data)}
            </Etiqueta>
            <Etiqueta>{card.projeto}</Etiqueta>
            {card.tags.map((tag) => (
              <Etiqueta key={tag}>#{tag}</Etiqueta>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            <Botao variante="calmo" onClick={concluir} disabled={ocupado}>
              Feito
            </Botao>
            <Botao onClick={adiar} disabled={ocupado}>
              Não dá agora
            </Botao>
            <Botao
              variante="fantasma"
              disabled={ocupado}
              onClick={() => setPular((atual) => [...atual, card.id])}
            >
              Me mostra outra
            </Botao>
          </div>

          <p className="mt-8 text-xs text-pedra">
            {dados.restantes === 0
              ? 'é a última aberta de hoje'
              : `mais ${dados.restantes} depois desta`}
          </p>

          <Botao variante="fantasma" className="mt-2" onClick={aoSair}>
            ver o quadro inteiro
          </Botao>
        </>
      )}
    </div>
  )
}
