import { useState } from 'react'
import { api } from '../api.js'
import { Botao } from './Pecas.jsx'

const EXEMPLO_CONTEXTO = `Curso de agentes. A turma começa em 3 de setembro e não muda.
Qualquer coisa que bloqueie a gravação das aulas vem antes de divulgação.
Material de aula tem que estar pronto uma semana antes da aula.
Coisa de plataforma pode esperar — a turma é pequena e eu aguento na mão.`

/**
 * O contexto do projeto e o pipeline dele.
 *
 * O contexto é o campo mais importante do sistema e o menos óbvio: é ele que
 * faz a priorização ser DA PESSOA em vez de genérica. Por isso a caixa é
 * grande, o exemplo está à mão, e não existe formulário — é texto livre.
 */
export default function PainelProjeto({ projeto, aoFechar, aoMudar, aoAvisar }) {
  const [contexto, setContexto] = useState(projeto.contexto ?? '')
  const [etapas, setEtapas] = useState(projeto.etapas.map((e) => e.nome).join(', '))
  const [ocupado, setOcupado] = useState(false)

  async function salvar() {
    setOcupado(true)
    try {
      await api.atualizarProjeto(projeto.id, { contexto: contexto.trim() || null })
      const lista = etapas
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
      const mudouPipeline =
        lista.join('|').toLowerCase() !==
        projeto.etapas
          .map((e) => e.nome)
          .join('|')
          .toLowerCase()
      if (mudouPipeline) await api.atualizarProjeto(projeto.id, { pipeline: lista })
      await aoMudar()
      aoAvisar({ tom: 'ok', texto: `Projeto "${projeto.nome}" atualizado.` })
      aoFechar()
    } catch (erro) {
      aoAvisar({ tom: 'erro', texto: erro.message })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/20 p-4">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-2xl border border-borda bg-white shadow-2xl">
        <header className="border-b border-borda px-6 py-4">
          <h2 className="text-lg font-semibold">{projeto.nome}</h2>
          <p className="text-xs text-suave">
            O que você escrever aqui é o que a IA usa para priorizar este projeto.
          </p>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-suave">
              Contexto — o que faz uma tarefa ser urgente aqui dentro
            </label>
            <textarea
              rows={7}
              value={contexto}
              onChange={(e) => setContexto(e.target.value)}
              placeholder={EXEMPLO_CONTEXTO}
              className="w-full resize-none rounded-lg border border-borda px-3 py-2 font-mono
                text-[13px] leading-relaxed focus:border-realce focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] text-suave">
              Três frases já mudam a priorização de forma visível. Sem contexto o sistema continua
              funcionando — só passa a <strong>sugerir</strong> em vez de decidir.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-suave">
              Pipeline — as colunas do quadro, na ordem, separadas por vírgula
            </label>
            <input
              value={etapas}
              onChange={(e) => setEtapas(e.target.value)}
              className="w-full rounded-lg border border-borda px-3 py-2 text-sm
                focus:border-realce focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] text-suave">
              A última etapa é a de conclusão. Renomear e reordenar não perde card; remover uma
              etapa que tem card dentro é recusado.
            </p>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-borda px-6 py-4">
          <Botao variante="fantasma" onClick={aoFechar}>
            cancelar
          </Botao>
          <Botao variante="forte" onClick={salvar} disabled={ocupado}>
            salvar
          </Botao>
        </footer>
      </div>
    </div>
  )
}

/** Criar projeto: nome e, se quiser, o pipeline. Contexto vem depois. */
export function NovoProjeto({ aoFechar, aoCriar, aoAvisar }) {
  const [nome, setNome] = useState('')
  const [pipeline, setPipeline] = useState('A fazer, Fazendo, Feito')
  const [ocupado, setOcupado] = useState(false)

  async function criar() {
    setOcupado(true)
    try {
      const projeto = await api.criarProjeto({
        nome,
        pipeline: pipeline
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean),
      })
      await aoCriar(projeto)
      aoFechar()
    } catch (erro) {
      aoAvisar({ tom: 'erro', texto: erro.message })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/20 p-4">
      <div className="w-full max-w-md rounded-2xl border border-borda bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold">Novo projeto</h2>

        <label className="mt-4 mb-1 block text-xs font-medium text-suave">Nome</label>
        <input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && nome.trim() && criar()}
          placeholder="Curso, Cliente Dry, Casa…"
          className="w-full rounded-lg border border-borda px-3 py-2 text-sm
            focus:border-realce focus:outline-none"
        />

        <label className="mt-4 mb-1 block text-xs font-medium text-suave">
          Etapas, na ordem
        </label>
        <input
          value={pipeline}
          onChange={(e) => setPipeline(e.target.value)}
          className="w-full rounded-lg border border-borda px-3 py-2 text-sm
            focus:border-realce focus:outline-none"
        />
        <p className="mt-1.5 text-[11px] text-suave">
          Ex.: <em>Ideia, Roteiro, Gravado, Editado, Publicado</em>
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <Botao variante="fantasma" onClick={aoFechar}>
            cancelar
          </Botao>
          <Botao variante="forte" onClick={criar} disabled={ocupado || !nome.trim()}>
            criar
          </Botao>
        </div>
      </div>
    </div>
  )
}
