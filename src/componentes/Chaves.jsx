import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Botao, Etiqueta } from './Pecas.jsx'

/**
 * As chaves de API dos agentes.
 *
 * A chave inteira aparece UMA vez, aqui, no momento em que é criada. Depois
 * disso nem o sistema sabe qual era — o banco guarda só o hash. Por isso a
 * faixa de "copie agora" é grande e não some sozinha.
 */
export default function Chaves({ aoFechar, aoAvisar }) {
  const [lista, setLista] = useState(null)
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState('convidado')
  const [podeIa, setPodeIa] = useState(false)
  const [recemCriada, setRecemCriada] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const recarregar = () => api.chaves().then(setLista)

  useEffect(() => {
    recarregar().catch((e) => aoAvisar({ tom: 'erro', texto: e.message }))
  }, [aoAvisar])

  async function executar(acao) {
    setOcupado(true)
    try {
      const resultado = await acao()
      await recarregar()
      return resultado
    } catch (erro) {
      aoAvisar({ tom: 'erro', texto: erro.message })
    } finally {
      setOcupado(false)
    }
  }

  async function criar() {
    const criada = await executar(() =>
      api.criarChave({ nome, papel, pode_ia: podeIa }),
    )
    if (criada) {
      setRecemCriada(criada)
      setNome('')
    }
  }

  return (
    <div className="modal">
      <div className="modal-conteudo max-w-2xl">
        <header className="border-b border-borda px-7 py-5">
          <p className="eyebrow">Acesso dos agentes</p>
          <h2 className="titulo-tela mt-1.5 text-2xl">
            Chaves de <span className="serifa">API</span>
          </h2>
          <p className="mt-1.5 text-sm text-grafite">
            Uma chave por agente. Assim dá para revogar um sem derrubar os outros — e para
            saber quem escreveu o quê no quadro.
          </p>
        </header>

        <div className="space-y-6 px-7 py-6">
          {recemCriada && (
            <div className="rounded-xl border-2 border-terracota bg-terracota/6 p-4">
              <p className="text-sm font-medium text-terracota">
                Copie agora — esta chave não aparece de novo.
              </p>
              <code className="mt-2 block rounded-lg border border-borda bg-superficie px-3 py-2 font-mono text-[13px] break-all">
                {recemCriada.chave}
              </code>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Botao
                  variante="primario"
                  miudo
                  onClick={() => {
                    navigator.clipboard?.writeText(recemCriada.chave)
                    aoAvisar({ tom: 'ok', texto: 'Chave copiada.' })
                  }}
                >
                  copiar
                </Botao>
                <Botao variante="fantasma" miudo onClick={() => setRecemCriada(null)}>
                  já copiei
                </Botao>
              </div>
              <p className="mt-3 text-[11px] leading-snug text-grafite">
                No agente, mande no cabeçalho{' '}
                <code className="font-mono">Authorization: Bearer …</code>
              </p>
            </div>
          )}

          <section>
            <h3 className="eyebrow mb-3">Criar uma chave</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-52 flex-1">
                <label className="rotulo">De quem é</label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && nome.trim() && criar()}
                  placeholder="agente da Maria"
                  className="campo"
                />
              </div>
              <div>
                <label className="rotulo">Papel</label>
                <div className="flex gap-1.5">
                  {['convidado', 'dono'].map((valor) => (
                    <Botao
                      key={valor}
                      variante={papel === valor ? 'escuro' : 'neutro'}
                      onClick={() => setPapel(valor)}
                    >
                      {valor}
                    </Botao>
                  ))}
                </div>
              </div>
              <div>
                <label className="rotulo">Escopo de IA</label>
                <Botao
                  variante={podeIa ? 'primario' : 'neutro'}
                  onClick={() => setPodeIa((v) => !v)}
                >
                  {podeIa ? 'pode gastar IA' : 'sem IA'}
                </Botao>
              </div>
              <Botao variante="escuro" disabled={ocupado || !nome.trim()} onClick={criar}>
                criar
              </Botao>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-pedra">
              <strong>Convidado</strong> registra, conclui, adia e move — não apaga e não mexe em
              projeto. O <strong>escopo de IA</strong> é separado do papel de propósito: as rotinas
              de IA gastam a sua conta da Anthropic, então elas são liberadas chave a chave.
            </p>
          </section>

          <section>
            <h3 className="eyebrow mb-3">As que existem</h3>
            {!lista && <p className="text-sm text-pedra">Carregando…</p>}
            {lista?.length === 0 && (
              <p className="font-serifa text-sm text-pedra italic">
                Nenhuma ainda. O painel e a chave do .env continuam funcionando.
              </p>
            )}
            <ul className="space-y-2">
              {lista?.map((chave) => (
                <li
                  key={chave.id}
                  className={`flex flex-wrap items-center gap-2 rounded-xl border border-borda
                    bg-superficie px-3 py-2.5 ${chave.revogada ? 'opacity-45' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-titulo text-sm font-semibold">{chave.nome}</span>
                    <code className="ml-2 font-mono text-[11px] text-pedra">{chave.prefixo}</code>
                    <span className="mt-0.5 block text-[11px] text-pedra">
                      {chave.revogada
                        ? 'revogada'
                        : chave.ultimo_uso
                          ? `último uso ${chave.ultimo_uso.replace('T', ' ')}`
                          : 'nunca usada'}
                    </span>
                  </span>

                  <Etiqueta tom={chave.papel === 'dono' ? 'realce' : 'neutro'}>
                    {chave.papel}
                  </Etiqueta>
                  {chave.pode_ia && <Etiqueta tom="calmo">IA</Etiqueta>}

                  {!chave.revogada && (
                    <>
                      <Botao
                        miudo
                        disabled={ocupado}
                        onClick={() =>
                          executar(() => api.alterarChave(chave.id, { pode_ia: !chave.pode_ia }))
                        }
                      >
                        {chave.pode_ia ? 'tirar IA' : 'dar IA'}
                      </Botao>
                      <Botao
                        variante="perigo"
                        miudo
                        disabled={ocupado}
                        onClick={() => {
                          if (confirm(`Revogar a chave "${chave.nome}"? O agente perde o acesso.`)) {
                            executar(() => api.revogarChave(chave.id))
                          }
                        }}
                      >
                        revogar
                      </Botao>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="flex justify-end border-t border-borda px-7 py-4">
          <Botao onClick={aoFechar}>fechar</Botao>
        </footer>
      </div>
    </div>
  )
}
