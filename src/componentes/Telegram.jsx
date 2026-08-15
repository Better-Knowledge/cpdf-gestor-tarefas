import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Botao, Etiqueta } from './Pecas.jsx'

/**
 * O pareamento do Telegram.
 *
 * Um bot é público: qualquer um que descubra o nome dele abre uma conversa. O
 * token protege o bot de ser *operado* por terceiros, não de ser *conversado*.
 * Por isso existe allowlist, e entrar nela custa um código gerado aqui — quem
 * tem o painel é quem autoriza.
 */
export default function Telegram({ aoFechar, aoAvisar }) {
  const [estado, setEstado] = useState(null)
  const [codigo, setCodigo] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const recarregar = () => api.telegram().then(setEstado)

  useEffect(() => {
    recarregar().catch((e) => aoAvisar({ tom: 'erro', texto: e.message }))
  }, [aoAvisar])

  async function executar(acao) {
    setOcupado(true)
    try {
      const r = await acao()
      await recarregar()
      return r
    } catch (erro) {
      aoAvisar({ tom: 'erro', texto: erro.message })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="modal">
      <div className="modal-conteudo max-w-xl">
        <header className="border-b border-borda px-7 py-5">
          <p className="eyebrow">O celular, sem aplicativo</p>
          <h2 className="titulo-tela mt-1.5 text-2xl">
            Quem pode falar com o <span className="serifa">bot</span>
          </h2>
        </header>

        <div className="space-y-6 px-7 py-6">
          {estado && !estado.bot && (
            <p className="rounded-xl border border-borda bg-papel-fundo px-4 py-3 text-sm text-grafite">
              Não há bot configurado. Fale com o <strong>@BotFather</strong> no Telegram, mande{' '}
              <code className="font-mono">/newbot</code>, e ponha o token em{' '}
              <code className="font-mono">TELEGRAM_BOT_TOKEN</code> no <code>.env</code>.
            </p>
          )}

          {estado?.bot && (
            <>
              <section>
                <h3 className="eyebrow mb-3">Autorizar uma conversa</h3>

                {!codigo ? (
                  <>
                    <Botao
                      variante="escuro"
                      disabled={ocupado}
                      onClick={async () => {
                        const novo = await executar(() => api.gerarCodigoTelegram())
                        if (novo) setCodigo(novo)
                      }}
                    >
                      gerar código de pareamento
                    </Botao>
                    <p className="mt-2 text-[11px] leading-snug text-pedra">
                      O código vale {estado.validade ?? 15} minutos e serve uma vez só. Enquanto
                      ninguém parear, o bot responde só a instrução de pareamento — e nada do que
                      está aqui dentro.
                    </p>
                  </>
                ) : (
                  <div className="rounded-xl border-2 border-terracota bg-terracota/6 p-4">
                    <p className="text-sm text-grafite">
                      No Telegram, mande esta mensagem para o bot:
                    </p>
                    <code className="mt-2 block rounded-lg border border-borda bg-superficie px-3 py-2.5 text-center font-mono text-xl tracking-widest">
                      /parear {codigo.codigo}
                    </code>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Botao
                        variante="primario"
                        miudo
                        onClick={() => {
                          navigator.clipboard?.writeText(`/parear ${codigo.codigo}`)
                          aoAvisar({ tom: 'ok', texto: 'Comando copiado.' })
                        }}
                      >
                        copiar
                      </Botao>
                      <Botao variante="fantasma" miudo onClick={() => setCodigo(null)}>
                        gerar outro
                      </Botao>
                      <Botao variante="fantasma" miudo disabled={ocupado} onClick={recarregar}>
                        já pareei — atualizar
                      </Botao>
                    </div>
                    <p className="mt-3 text-[11px] leading-snug text-grafite">
                      Precisa do <code className="font-mono">npm run telegram</code> rodando — é ele
                      que escuta as mensagens.
                    </p>
                  </div>
                )}
              </section>

              <section>
                <h3 className="eyebrow mb-3">Conversas autorizadas</h3>
                {!estado.chats.length && (
                  <p className="font-serifa text-sm text-pedra italic">
                    Nenhuma ainda. Sem isso, o resumo das 18h não tem para onde ir.
                  </p>
                )}
                <ul className="space-y-2">
                  {estado.chats.map((chat) => (
                    <li
                      key={chat.chat_id}
                      className={`flex flex-wrap items-center gap-2 rounded-xl border
                        border-borda bg-superficie px-3 py-2.5 ${chat.ativo ? '' : 'opacity-45'}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-titulo text-sm font-semibold">{chat.nome}</span>
                        <span className="mt-0.5 block text-[11px] text-pedra">
                          {chat.ativo
                            ? chat.ultimo_uso
                              ? `última mensagem ${chat.ultimo_uso.replace('T', ' ')}`
                              : 'pareada, ainda sem mensagem'
                            : 'removida'}
                        </span>
                      </span>
                      {chat.ativo ? (
                        <Botao
                          variante="perigo"
                          miudo
                          disabled={ocupado}
                          onClick={() => {
                            if (confirm(`Remover "${chat.nome}"? O bot deixa de responder.`)) {
                              executar(() => api.removerChatTelegram(chat.chat_id))
                            }
                          }}
                        >
                          remover
                        </Botao>
                      ) : (
                        <Etiqueta>fora da lista</Etiqueta>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <p className="rounded-xl bg-papel-fundo px-4 py-3 text-[12px] leading-relaxed text-grafite">
                Quem está na lista pode: mandar <strong>qualquer frase</strong>, que vira card;{' '}
                <code className="font-mono">/hoje</code>, que devolve a lista do dia. E recebe o
                resumo das 18h.
              </p>
            </>
          )}
        </div>

        <footer className="flex justify-end border-t border-borda px-7 py-4">
          <Botao onClick={aoFechar}>fechar</Botao>
        </footer>
      </div>
    </div>
  )
}
