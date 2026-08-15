/**
 * O contrato da API, em OpenAPI 3.1.
 *
 * Isto é um MÓDULO e não um `openapi.json` parado numa pasta — de propósito.
 * Os valores que a API aceita (tipos, prioridades, papéis, o teto do dia) são
 * importados de `db.js` e `chaves.js`, os mesmos que as regras usam. Um arquivo
 * JSON escrito à mão começa correto e envelhece errado: alguém acrescenta uma
 * prioridade em `db.js` e a documentação continua jurando que existem três.
 * Aqui isso não dá para acontecer sem quebrar o import.
 *
 * O que continua sendo trabalho humano: descrever o que cada rota FAZ. Isso
 * nenhum gerador tira do código — e é a parte que o leitor, gente ou agente,
 * realmente lê.
 */

import {
  TIPOS,
  PRIORIDADES,
  PIPELINE_PADRAO,
  PROJETO_PADRAO,
  TETO_DO_DIA,
  DIAS_ATE_SUGERIR_QUEBRA,
} from './db.js'
import { PAPEIS } from './chaves.js'

// ---------------------------------------------------------------------------
// Atalhos — o spec é repetitivo por natureza, e repetição escrita à mão erra
// ---------------------------------------------------------------------------

const json = (schema) => ({ 'application/json': { schema } })
const ok = (description, schema) => ({ description, content: json(schema) })
const corpo = (schema, required = true) => ({ required, content: json(schema) })
const ref = (nome) => ({ $ref: `#/components/schemas/${nome}` })
const lista = (nome) => ({ type: 'array', items: ref(nome) })
const resposta = (nome) => ({ $ref: `#/components/responses/${nome}` })

const texto = (description, extra = {}) => ({ type: 'string', description, ...extra })
const inteiro = (description, extra = {}) => ({ type: 'integer', description, ...extra })
const booleano = (description, extra = {}) => ({ type: 'boolean', description, ...extra })

/** Data no formato do banco: sempre local, nunca UTC. Ver o comentário em db.js. */
const data = (description) =>
  texto(description, { format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$', examples: ['2026-08-15'] })

const dataHora = (description) =>
  texto(description, { examples: ['2026-08-15T09:30:00'] })

/**
 * Texto que o sistema interpreta como data.
 *
 * É o mesmo interpretador em `adiar` e em `replanejar`, então a descrição
 * também é uma só.
 */
const dataEmPortugues = (description) =>
  texto(description, {
    examples: ['amanha', 'sexta', '3d', '16/08', '2026-08-16'],
  })

const idDoCard = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'O id do card.',
  schema: { type: 'integer' },
}

const idDoProjeto = {
  name: 'id',
  in: 'path',
  required: true,
  description:
    'O id **ou o nome** do projeto. O nome não diferencia maiúscula: `curso` acha `Curso`.',
  schema: { type: 'string' },
  examples: { porNome: { value: PROJETO_PADRAO }, porId: { value: '1' } },
}

// ---------------------------------------------------------------------------
// Esquemas
// ---------------------------------------------------------------------------

const Erro = {
  type: 'object',
  description:
    'Todo erro tem esta forma, e a mensagem é escrita em português para ser lida — por gente ' +
    'ou por agente. Quando um card ou projeto não é encontrado pelo nome, a mensagem diz quais ' +
    'existem, para o agente perguntar em vez de criar um parecido.',
  required: ['erro'],
  properties: {
    erro: texto('O que deu errado, em português.', {
      examples: ['Não existe projeto "Curos". Os que existem: Dia a dia, Curso.'],
    }),
  },
}

const Etapa = {
  type: 'object',
  description: 'Uma coluna do pipeline de um projeto.',
  required: ['id', 'projeto_id', 'nome', 'posicao'],
  properties: {
    id: inteiro('O id da etapa.'),
    projeto_id: inteiro('O projeto a que ela pertence.'),
    nome: texto('O nome da etapa.', { examples: PIPELINE_PADRAO }),
    posicao: inteiro(
      'A ordem dentro do pipeline, começando em 0. A **última** etapa é a de conclusão: ' +
        'entrar nela é concluir o card.',
    ),
  },
}

const Projeto = {
  type: 'object',
  required: ['id', 'nome', 'arquivado', 'criado_em', 'etapas'],
  properties: {
    id: inteiro('O id do projeto.'),
    nome: texto('O nome, único no sistema.', { examples: ['Curso'] }),
    contexto: {
      type: ['string', 'null'],
      description:
        'O texto onde você diz o que faz uma tarefa ser urgente **aqui dentro**. É ele que faz ' +
        'a priorização ser sua e não genérica: sem contexto escrito, a IA marca o que decide ' +
        'como *sugestão* e pede confirmação em vez de mudar as coisas por conta própria.',
    },
    arquivado: booleano(`Projeto arquivado some das listas. "${PROJETO_PADRAO}" não pode ser arquivado.`),
    criado_em: dataHora('Quando o projeto foi criado.'),
    etapas: lista('Etapa'),
  },
}

const CardResumo = {
  type: 'object',
  description: 'A referência curta a um card — só o que basta para exibir e para ir buscar.',
  required: ['id', 'titulo'],
  properties: {
    id: inteiro('O id do card.'),
    titulo: texto('O título do card.'),
  },
}

const Dependencia = {
  type: 'object',
  description: 'Um card do qual este card depende.',
  required: ['id', 'titulo', 'status', 'confirmada'],
  properties: {
    id: inteiro('O id do card do qual se depende.'),
    titulo: texto('O título dele.'),
    status: texto('O estado dele.', { enum: ['aberta', 'feita'] }),
    confirmada: booleano(
      '**Só a dependência confirmada bloqueia.** A que a IA propôs entra como `false` e não ' +
        'trava nada até você confirmar — é o que impede um palpite de parar o trabalho de alguém.',
    ),
  },
}

const Card = {
  type: 'object',
  description: 'Um card do quadro. Tarefa ou ideia — a única coisa obrigatória é o título.',
  required: ['id', 'titulo', 'tipo', 'data', 'status', 'prioridade', 'criado_em'],
  properties: {
    id: inteiro('O id do card.'),
    titulo: texto('O título. Nunca vazio.', { examples: ['gravar a aula 3'] }),
    descricao: { type: ['string', 'null'], description: 'O texto longo, se houver.' },
    tipo: texto(
      'Ideia é guardada, mas **não aparece na lista de hoje** — ela não tem quando, só tem se.',
      { enum: TIPOS },
    ),
    data: data('Para quando o card está marcado.'),
    status: texto(
      'Derivado da etapa, **nunca digitado**: card na última etapa do pipeline é `feita`. ' +
        'Repare que o filtro de `GET /cards` usa outras palavras (`aberto`/`feito`).',
      { enum: ['aberta', 'feita'] },
    ),
    prioridade: texto('A prioridade atual.', { enum: PRIORIDADES }),
    prioridade_origem: texto(
      'Quem decidiu a prioridade. **`usuario` é definitivo**: a IA nunca sobrescreve prioridade ' +
        'posta na mão — no máximo discorda por escrito.',
      { enum: ['usuario', 'ia'] },
    ),
    prioridade_sugerida: booleano(
      'A prioridade é uma sugestão esperando resposta. Acontece quando a IA priorizou um card de ' +
        'projeto **sem contexto escrito**. Responda com `prioridade/aceitar` ou `prioridade/recusar`.',
    ),
    justificativa: {
      type: ['string', 'null'],
      description: 'Por que a IA escolheu esta prioridade, em uma frase.',
    },
    hoje: booleano(
      `Uma das no máximo ${TETO_DO_DIA} coisas de hoje. O teto é a regra: um dia com ` +
        `${TETO_DO_DIA} coisas possíveis é um dia que termina inteiro.`,
    ),
    projeto_id: { type: ['integer', 'null'], description: 'O id do projeto.' },
    projeto: { type: ['string', 'null'], description: 'O nome do projeto, já resolvido.' },
    etapa_id: { type: ['integer', 'null'], description: 'O id da etapa.' },
    etapa: { type: ['string', 'null'], description: 'O nome da etapa, já resolvido.' },
    etapa_posicao: { type: ['integer', 'null'], description: 'A posição da etapa no pipeline.' },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description:
        'As tags, já normalizadas: `#Ligação`, `ligacao` e ` LIGAÇÃO ` são a mesma tag.',
      examples: [['ligacao', '5min']],
    },
    aguardando: {
      ...lista('CardResumo'),
      description:
        'Dependências **confirmadas** que ainda estão abertas. Lista não vazia significa card ' +
        'travado: ele sai da fila do `/proxima` até destravar.',
    },
    dependencias: {
      ...lista('Dependencia'),
      description: 'Tudo de que este card depende — confirmado ou só proposto.',
    },
    origem: {
      type: ['string', 'null'],
      description:
        'Qual chave registrou o card. Vem do porteiro, **nunca do corpo da requisição** — se ' +
        'viesse do corpo, qualquer agente poderia se apresentar como outro. Também vira tag ' +
        '(`via-agente-da-maria`), para o filtro de sempre servir para "só o que fulano escreveu".',
    },
    criado_em: dataHora('Quando o card nasceu.'),
    movido_em: { type: ['string', 'null'], description: 'Quando ele mudou de etapa pela última vez.' },
    tema: {
      type: ['string', 'null'],
      deprecated: true,
      description: 'Sobra da v1 do esquema, anterior a projetos e tags. Não use.',
    },
  },
}

const CardComDesbloqueadas = {
  type: 'object',
  description:
    'O card depois do movimento, mais **o que aquele movimento destravou**. É consulta ao ' +
    'banco, sem IA nenhuma — e é o que fecha o loop para quem precisa ver progresso.',
  required: ['card', 'desbloqueadas'],
  properties: {
    card: ref('Card'),
    desbloqueadas: {
      ...lista('CardResumo'),
      description:
        'Cards que estavam esperando por este e agora não esperam mais ninguém. Vem vazia ' +
        'quando o movimento não foi uma conclusão, ou quando o card já estava concluído.',
    },
  },
}

const Chave = {
  type: 'object',
  description:
    'Uma chave de API. **O segredo não está aqui** — o banco guarda só o hash, e a chave em ' +
    'texto aparece uma única vez, na resposta de `POST /chaves`.',
  required: ['id', 'nome', 'prefixo', 'papel', 'pode_ia', 'criada_em', 'revogada'],
  properties: {
    id: inteiro('O id da chave.'),
    nome: texto('Como você reconhece esta chave depois.', { examples: ['agente da Maria'] }),
    prefixo: texto('Os primeiros caracteres, só para a tela dizer qual chave é qual.', {
      examples: ['gt_Xk2p9Qa…'],
    }),
    papel: texto(
      '`dono` faz tudo. `convidado` registra, conclui, adia, move e lê — não apaga, não mexe em ' +
        'projeto e não replaneja em bloco.',
      { enum: PAPEIS },
    ),
    pode_ia: booleano(
      'Se a chave pode disparar as rotinas de IA. **É independente do papel**, de propósito: dá ' +
        'para ter um convidado de confiança que roda IA e um agente dono que nunca gasta a sua ' +
        'conta da Anthropic.',
    ),
    criada_em: dataHora('Quando foi criada.'),
    ultimo_uso: {
      type: ['string', 'null'],
      description:
        'A última vez que esta chave entrou. É o que permite olhar a lista depois do evento e ' +
        'revogar as outras sem medo.',
    },
    revogada: booleano('Chave revogada não entra mais. Não há como desrevogar.'),
  },
}

const ChaveCriada = {
  allOf: [
    ref('Chave'),
    {
      type: 'object',
      required: ['chave'],
      properties: {
        chave: texto(
          'O segredo, **em texto e uma única vez**. Guarde agora: depois desta resposta nem o ' +
            'sistema sabe qual era.',
          { examples: ['gt_Xk2p9QaLm3vR7tYw1sZbNc4dEfGh'] },
        ),
      },
    },
  ],
}

const ChatDoTelegram = {
  type: 'object',
  required: ['chat_id', 'nome', 'pareado_em', 'ativo'],
  properties: {
    chat_id: texto('O id da conversa no Telegram.'),
    nome: texto('O nome de quem pareou.'),
    pareado_em: dataHora('Quando entrou na allowlist.'),
    ultimo_uso: { type: ['string', 'null'], description: 'A última mensagem que mandou.' },
    ativo: booleano('Conversa desativada deixa de ser atendida na hora.'),
  },
}

const schemas = {
  Erro,
  Etapa,
  Projeto,
  Card,
  CardResumo,
  CardComDesbloqueadas,
  Dependencia,
  Chave,
  ChaveCriada,
  ChatDoTelegram,
}

// ---------------------------------------------------------------------------
// Respostas de erro reaproveitadas
// ---------------------------------------------------------------------------

const responses = {
  Invalido: ok(
    'A requisição fere uma regra do sistema — título vazio, prioridade inexistente, teto do dia ' +
      'estourado, dependência circular.',
    ref('Erro'),
  ),
  NaoAutorizado: ok('Falta credencial, ou ela não confere.', ref('Erro')),
  Proibido: ok(
    'A credencial é válida mas não alcança esta rota: chave de convidado onde só dono entra, ou ' +
      'chave sem escopo de IA numa rota de IA.',
    ref('Erro'),
  ),
  NaoEncontrado: ok(
    'Não existe. Quando a busca foi por nome, a mensagem lista os que existem.',
    ref('Erro'),
  ),
  Conflito: ok('Já existe outro com esse nome.', ref('Erro')),
  MuitasChamadas: ok(
    'Passou do limite por minuto (600 para dono, 60 para convidado). O cabeçalho `Retry-After` ' +
      'diz quanto esperar. Não é defesa contra ataque: é defesa contra agente em laço.',
    ref('Erro'),
  ),
  SemIa: ok(
    'Não há `ANTHROPIC_API_KEY` no `.env`. O resto do sistema continua funcionando igual.',
    ref('Erro'),
  ),
}

/** Os erros que qualquer rota pode devolver. */
const sempre = {
  401: resposta('NaoAutorizado'),
  429: resposta('MuitasChamadas'),
}

/** Os erros de qualquer rota de IA — a chave da Anthropic pode faltar ou recusar. */
const errosDeIa = {
  ...sempre,
  403: resposta('Proibido'),
  502: ok('O modelo não devolveu resposta no formato esperado.', ref('Erro')),
  503: resposta('SemIa'),
}

// ---------------------------------------------------------------------------
// As rotas
// ---------------------------------------------------------------------------

const paths = {
  '/operacoes': {
    get: {
      operationId: 'listarOperacoes',
      tags: ['O sistema'],
      summary: 'O que o sistema sabe fazer, em português',
      description:
        'A lista das operações principais, cada uma com uma frase dizendo para que serve. O ' +
        'agente lê esta lista e escolhe — do mesmo jeito que lê a descrição de uma ferramenta e ' +
        'decide usá-la.\n\nÉ o índice de bolso; este documento OpenAPI é a referência completa.',
      security: [],
      responses: {
        200: ok(
          'As operações e como chamá-las.',
          {
            type: 'object',
            required: ['sistema', 'comoUsar', 'operacoes'],
            properties: {
              sistema: texto('O nome do sistema.'),
              comoUsar: texto('As convenções da API, em uma frase.'),
              operacoes: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['rota', 'descricao'],
                  properties: {
                    rota: texto('O método e o caminho.', { examples: ['GET /api/hoje'] }),
                    descricao: texto('O que ela faz.'),
                  },
                },
              },
            },
          },
        ),
        ...sempre,
      },
    },
  },

  '/eu': {
    get: {
      operationId: 'quemSouEu',
      tags: ['O sistema'],
      summary: 'Quem sou eu, na visão do servidor',
      description:
        'O que a credencial usada nesta requisição alcança. O painel chama para saber o que ' +
        'mostrar; um agente chama para saber o que nem tentar.',
      responses: {
        200: ok('O papel e o escopo desta credencial.', {
          type: 'object',
          required: ['papel', 'pode_ia'],
          properties: {
            papel: texto('O papel desta credencial.', { enum: PAPEIS }),
            pode_ia: booleano('Se ela pode disparar as rotinas de IA.'),
            origem: {
              type: ['string', 'null'],
              description:
                'A etiqueta que os cards criados por ela vão receber. É `null` para gente no ' +
                'painel — pessoa não vira etiqueta de origem.',
            },
          },
        }),
        ...sempre,
      },
    },
  },

  // -------------------------------------------------------------------------
  // O dia
  // -------------------------------------------------------------------------

  '/hoje': {
    get: {
      operationId: 'listaDeHoje',
      tags: ['O dia'],
      summary: 'A lista de hoje',
      description:
        'Tarefas abertas com data até hoje — o que venceu entra junto, mais urgente primeiro.\n\n' +
        '**Ideia não entra**: ela é guardada, mas não tem quando.',
      responses: { 200: ok('As tarefas de hoje.', lista('Card')), ...sempre },
    },
  },

  '/proxima': {
    get: {
      operationId: 'proximaTarefa',
      tags: ['O dia'],
      summary: 'UMA tarefa — a próxima, com o porquê',
      description:
        'O modo "e agora?": uma tarefa na tela em vez de uma lista.\n\nA fila pula o que está ' +
        'aguardando dependência confirmada — não adianta mandar alguém fazer o que está travado.\n\n' +
        'A ordem é: marcada como hoje, depois prioridade, depois a mais antiga.',
      parameters: [
        {
          name: 'projeto',
          in: 'query',
          description: 'Limita a escolha a um projeto (id ou nome).',
          schema: { type: 'string' },
        },
        {
          name: 'pular',
          in: 'query',
          description:
            'Ids separados por vírgula para não sugerir de novo. É como o botão "essa não agora" ' +
            'insiste sem repetir.',
          schema: { type: 'string' },
          examples: { duas: { value: '12,17' } },
        },
      ],
      responses: {
        200: ok('A próxima tarefa, ou `card: null` se não houver nenhuma.', {
          type: 'object',
          required: ['card', 'restantes', 'porque'],
          properties: {
            card: { oneOf: [ref('Card'), { type: 'null' }] },
            restantes: inteiro('Quantas sobram depois desta.'),
            porque: {
              type: ['string', 'null'],
              description:
                'Por que esta e não outra — a justificativa da IA, se houver, ou o motivo que o ' +
                'próprio sistema consegue explicar.',
              examples: ['Você marcou como uma das três coisas de hoje.'],
            },
          },
        }),
        ...sempre,
      },
    },
  },

  '/atrasados': {
    get: {
      operationId: 'cardsAtrasados',
      tags: ['O dia'],
      summary: 'O que venceu e continua aberto',
      responses: { 200: ok('As tarefas vencidas.', lista('Card')), ...sempre },
    },
  },

  '/replanejar': {
    post: {
      operationId: 'replanejar',
      tags: ['O dia'],
      summary: 'Adiar em bloco tudo que venceu',
      description:
        'Existe para que atraso não vire uma tela vermelha acumulando culpa. Um comando, e o ' +
        'passado sai da frente.\n\nConvidado não pode: é reestruturação em massa.',
      requestBody: corpo(
        {
          type: 'object',
          properties: { data: dataEmPortugues('Para quando levar tudo. O padrão é hoje.') },
        },
        false,
      ),
      responses: {
        200: ok('Quantos foram e para quando.', {
          type: 'object',
          required: ['adiados', 'para'],
          properties: {
            adiados: inteiro('Quantos cards mudaram de data.'),
            para: data('A data em que todos ficaram.'),
          },
        }),
        ...sempre,
        403: resposta('Proibido'),
      },
    },
  },

  // -------------------------------------------------------------------------
  // Cards
  // -------------------------------------------------------------------------

  '/cards': {
    get: {
      operationId: 'listarCards',
      tags: ['Cards'],
      summary: 'Listar cards',
      description: 'A mesma consulta que o quadro, os filtros e o agente usam. Os filtros somam.',
      parameters: [
        {
          name: 'projeto',
          in: 'query',
          description: 'O id ou o nome do projeto.',
          schema: { type: 'string' },
        },
        {
          name: 'status',
          in: 'query',
          description:
            'Repare nas palavras: aqui é `aberto`/`feito`, enquanto o campo `status` do card vem ' +
            'como `aberta`/`feita`.',
          schema: { type: 'string', enum: ['aberto', 'feito', 'todos'], default: 'aberto' },
        },
        {
          name: 'tag',
          in: 'query',
          description: 'Uma tag. É normalizada antes de comparar, então `#Ligação` acha `ligacao`.',
          schema: { type: 'string' },
        },
        { name: 'tipo', in: 'query', description: 'Só tarefas ou só ideias.', schema: { type: 'string', enum: TIPOS } },
        {
          name: 'busca',
          in: 'query',
          description: 'Trecho de texto procurado no título e na descrição.',
          schema: { type: 'string' },
        },
        {
          name: 'hoje',
          in: 'query',
          description: `Só os cards marcados como as ${TETO_DO_DIA} coisas de hoje.`,
          schema: { type: 'string', enum: ['true'] },
        },
      ],
      responses: { 200: ok('Os cards encontrados.', lista('Card')), ...sempre },
    },
    post: {
      operationId: 'criarCard',
      tags: ['Cards'],
      summary: 'Criar um card',
      description:
        '**Registrar custa uma frase.** Só o título é obrigatório — projeto, prioridade e tags ' +
        'vêm depois, pela IA ou por ninguém.\n\nSem projeto, o card nasce em ' +
        `"${PROJETO_PADRAO}", na primeira etapa, com data de hoje e prioridade média.`,
      requestBody: corpo({
        type: 'object',
        required: ['titulo'],
        properties: {
          titulo: texto('A única coisa obrigatória.', { examples: ['ligar pro contador'] }),
          descricao: texto('O texto longo, se houver.'),
          projeto: texto(`O id ou o nome do projeto. O padrão é "${PROJETO_PADRAO}".`),
          etapa: texto('O nome ou o id da etapa. O padrão é a primeira do pipeline.'),
          tipo: texto('O padrão é `tarefa`.', { enum: TIPOS, default: 'tarefa' }),
          data: data('O padrão é hoje. Aqui a data é literal — não interpreta "amanhã".'),
          tags: { type: 'array', items: { type: 'string' }, description: 'Normalizadas ao entrar.' },
          prioridade: texto(
            'Prioridade posta aqui é **decisão sua**, e a IA não encosta mais nela. Sem este ' +
              'campo, o card nasce em `media` e fica disponível para a IA priorizar.',
            { enum: PRIORIDADES },
          ),
        },
      }),
      responses: {
        200: ok('O card criado.', ref('Card')),
        400: resposta('Invalido'),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  '/cards/{id}': {
    get: {
      operationId: 'buscarCard',
      tags: ['Cards'],
      summary: 'Um card',
      parameters: [idDoCard],
      responses: { 200: ok('O card.', ref('Card')), 404: resposta('NaoEncontrado'), ...sempre },
    },
    patch: {
      operationId: 'atualizarCard',
      tags: ['Cards'],
      summary: 'Mudar campos de um card',
      description:
        'Só o que vier no corpo muda. Campo ausente fica como está — mandar `null` não é o ' +
        'mesmo que omitir.\n\nMudar `prioridade` aqui carimba a prioridade como **sua**, e a ' +
        'partir daí nenhuma rodada de IA a sobrescreve.',
      parameters: [idDoCard],
      requestBody: corpo({
        type: 'object',
        properties: {
          titulo: texto('O novo título. Vazio é recusado.'),
          descricao: { type: ['string', 'null'], description: 'A nova descrição.' },
          tipo: texto('Tarefa ou ideia.', { enum: TIPOS }),
          data: data('A nova data. Literal — para adiar em português, use `/cards/{id}/adiar`.'),
          prioridade: texto('Passa a ser decisão sua.', { enum: PRIORIDADES }),
          projeto: texto(
            'Move o card para outro projeto. Sem `etapa` junto, ele entra na primeira etapa do ' +
              'pipeline novo.',
          ),
          etapa: texto('A etapa de destino. Sozinho, equivale a `POST /cards/{id}/mover`.'),
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: '**Substitui** todas as tags do card. Lista vazia limpa.',
          },
        },
      }),
      responses: {
        200: ok('O card atualizado.', ref('Card')),
        400: resposta('Invalido'),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
    delete: {
      operationId: 'excluirCard',
      tags: ['Cards'],
      summary: 'Apagar um card',
      description:
        'Apaga de verdade, junto com as tags e as dependências dele. Convidado não pode — um ' +
        'agente confuso não some com o card que você ia mostrar.',
      parameters: [idDoCard],
      responses: {
        200: ok('O que foi apagado.', ref('CardResumo')),
        403: resposta('Proibido'),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  '/cards/{id}/concluir': {
    post: {
      operationId: 'concluirCard',
      tags: ['Cards'],
      summary: 'Concluir — e ver o que isso destravou',
      description:
        'Move o card para a última etapa do pipeline, que é a de conclusão, e devolve **o que ' +
        'aquela conclusão liberou**.\n\nRecusa em projeto de etapa única: sem uma segunda etapa ' +
        'não existe etapa de conclusão.',
      parameters: [idDoCard],
      responses: {
        200: ok('O card concluído e o que ele destravou.', ref('CardComDesbloqueadas')),
        400: resposta('Invalido'),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  '/cards/{id}/reabrir': {
    post: {
      operationId: 'reabrirCard',
      tags: ['Cards'],
      summary: 'Reabrir',
      description: 'Devolve o card para a primeira etapa do pipeline do projeto dele.',
      parameters: [idDoCard],
      responses: {
        200: ok('O card reaberto.', ref('Card')),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  '/cards/{id}/mover': {
    post: {
      operationId: 'moverCard',
      tags: ['Cards'],
      summary: 'Mover para outra etapa',
      description:
        'Move dentro do pipeline do projeto do card. Entrar na **última** etapa é concluir — e ' +
        'aí a resposta traz o que foi destravado.\n\nSair da última etapa reabre.',
      parameters: [idDoCard],
      requestBody: corpo({
        type: 'object',
        required: ['etapa'],
        properties: {
          etapa: texto('O nome ou o id da etapa de destino.', { examples: ['Fazendo'] }),
        },
      }),
      responses: {
        200: ok('O card na etapa nova.', ref('CardComDesbloqueadas')),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  '/cards/{id}/adiar': {
    post: {
      operationId: 'adiarCard',
      tags: ['Cards'],
      summary: 'Adiar para outro dia',
      description:
        '**Adiar muda a data. Não conclui e não apaga nada** — e tira o card do teto do dia, ' +
        'porque adiar é justamente dizer "hoje não".\n\nCard já concluído não é adiado: reabra ' +
        'antes, se for o caso.',
      parameters: [idDoCard],
      requestBody: corpo(
        {
          type: 'object',
          properties: {
            data: dataEmPortugues('Para quando. O padrão é amanhã. Dia da semana pula para o próximo.'),
          },
        },
        false,
      ),
      responses: {
        200: ok('O card com a data nova.', ref('Card')),
        400: resposta('Invalido'),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  '/cards/{id}/hoje': {
    post: {
      operationId: 'marcarHoje',
      tags: ['Cards'],
      summary: 'Marcar (ou desmarcar) como uma das coisas de hoje',
      description:
        `No máximo ${TETO_DO_DIA} cards ao mesmo tempo. Passar disso é recusado com uma ` +
        'mensagem pedindo para tirar um antes — o dia tem teto, e é ele que faz o dia terminar ' +
        'inteiro em vez de terminar em dívida.\n\nCard concluído não entra.',
      parameters: [idDoCard],
      requestBody: corpo(
        {
          type: 'object',
          properties: { valor: booleano('`false` desmarca. O padrão é `true`.', { default: true }) },
        },
        false,
      ),
      responses: {
        200: ok('O card.', ref('Card')),
        400: resposta('Invalido'),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  '/cards/{id}/prioridade/aceitar': {
    post: {
      operationId: 'aceitarSugestao',
      tags: ['Cards'],
      summary: 'Aceitar a prioridade que a IA sugeriu',
      description:
        'A sugestão vira **decisão sua**: a partir daqui nenhuma rodada de IA encosta nesta ' +
        'prioridade. É a diferença entre um sistema que pergunta e um que insiste.\n\nRecusa se ' +
        'o card não tem sugestão pendente.',
      parameters: [idDoCard],
      responses: {
        200: ok('O card, agora com prioridade sua.', ref('Card')),
        400: resposta('Invalido'),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  '/cards/{id}/prioridade/recusar': {
    post: {
      operationId: 'recusarSugestao',
      tags: ['Cards'],
      summary: 'Recusar a prioridade sugerida',
      description:
        'Volta para média, apaga a justificativa e tira o pedido de confirmação da tela. Também ' +
        'carimba a prioridade como sua — recusar é decidir.',
      parameters: [idDoCard],
      responses: {
        200: ok('O card.', ref('Card')),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  // -------------------------------------------------------------------------
  // Projetos
  // -------------------------------------------------------------------------

  '/projetos': {
    get: {
      operationId: 'listarProjetos',
      tags: ['Projetos'],
      summary: 'Os projetos, com pipeline e contexto',
      parameters: [
        {
          name: 'arquivados',
          in: 'query',
          description: 'Inclui os arquivados na lista.',
          schema: { type: 'string', enum: ['true'] },
        },
      ],
      responses: { 200: ok('Os projetos.', lista('Projeto')), ...sempre },
    },
    post: {
      operationId: 'criarProjeto',
      tags: ['Projetos'],
      summary: 'Criar um projeto',
      description:
        'Cada projeto tem o **pipeline dele**. Um projeto de curso pode ser ' +
        '`Ideia → Roteiro → Gravado → Editado → Publicado` — a última etapa é sempre a de ' +
        'conclusão.\n\nConvidado não pode.',
      requestBody: corpo({
        type: 'object',
        required: ['nome'],
        properties: {
          nome: texto('Único no sistema, sem diferenciar maiúscula.', { examples: ['Curso'] }),
          contexto: texto('O que faz uma tarefa ser urgente aqui dentro.'),
          pipeline: {
            type: 'array',
            items: { type: 'string' },
            description: `As etapas, em ordem. O padrão é ${PIPELINE_PADRAO.join(' → ')}.`,
            examples: [['Ideia', 'Roteiro', 'Gravado', 'Publicado']],
          },
        },
      }),
      responses: {
        200: ok('O projeto criado.', ref('Projeto')),
        400: resposta('Invalido'),
        403: resposta('Proibido'),
        409: resposta('Conflito'),
        ...sempre,
      },
    },
  },

  '/projetos/{id}': {
    patch: {
      operationId: 'atualizarProjeto',
      tags: ['Projetos'],
      summary: 'Mudar contexto, pipeline ou arquivar',
      description:
        'Os três campos são independentes e podem vir juntos.\n\n**Redefinir o pipeline não ' +
        'perde card**: etapa que continua existindo com o mesmo nome mantém os cards dela. ' +
        'Tirar uma etapa que ainda tem card é recusado — para onde eles vão é decisão sua, não ' +
        'do sistema.\n\nConvidado não pode.',
      parameters: [idDoProjeto],
      requestBody: corpo({
        type: 'object',
        properties: {
          contexto: { type: ['string', 'null'], description: 'O texto de contexto do projeto.' },
          pipeline: {
            type: 'array',
            items: { type: 'string' },
            description: 'As etapas, em ordem. Substitui as atuais.',
          },
          arquivado: booleano(`Arquiva ou desarquiva. "${PROJETO_PADRAO}" não pode ser arquivado.`),
        },
      }),
      responses: {
        200: ok('O projeto atualizado.', ref('Projeto')),
        400: resposta('Invalido'),
        403: resposta('Proibido'),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  '/projetos/{id}/oferta-contexto': {
    get: {
      operationId: 'ofertaDeContexto',
      tags: ['Projetos'],
      summary: 'O projeto já merece um contexto escrito?',
      description:
        'Depois de três sugestões de prioridade aceitas num projeto **sem contexto**, o sistema ' +
        'para de adivinhar e oferece escrever a regra uma vez.\n\nDevolve `null` quando ainda ' +
        'não é hora — ou quando o projeto já tem contexto. A contagem é da sessão do servidor: ' +
        'reiniciou, recomeça, de propósito, para não perseguir a pessoa entre um dia e outro.',
      parameters: [idDoProjeto],
      responses: {
        200: ok('A oferta, ou `null`.', {
          oneOf: [
            {
              type: 'object',
              required: ['projeto', 'confirmacoes', 'exemplos'],
              properties: {
                projeto: texto('O nome do projeto.'),
                confirmacoes: inteiro('Quantas sugestões você já aceitou aqui.'),
                exemplos: {
                  type: 'array',
                  description: 'O que sustenta a oferta — é com isso que a IA escreve o rascunho.',
                  items: {
                    type: 'object',
                    properties: {
                      titulo: texto('O card.'),
                      prioridade: texto('A prioridade confirmada.', { enum: PRIORIDADES }),
                      porque: texto('A justificativa registrada na hora.'),
                    },
                  },
                },
              },
            },
            { type: 'null' },
          ],
        }),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  '/projetos/{id}/oferta-contexto/dispensar': {
    post: {
      operationId: 'dispensarOferta',
      tags: ['Projetos'],
      summary: 'Dispensar a oferta',
      description: 'Zera a contagem. A oferta volta depois das próximas três confirmações.',
      parameters: [idDoProjeto],
      responses: {
        200: ok('O projeto dispensado.', {
          type: 'object',
          required: ['projeto'],
          properties: { projeto: texto('O nome do projeto.') },
        }),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  // -------------------------------------------------------------------------
  // Dependências
  // -------------------------------------------------------------------------

  '/cards/{id}/dependencias': {
    post: {
      operationId: 'criarDependencia',
      tags: ['Dependências'],
      summary: 'Este card depende de outro',
      description:
        '**Dependência circular é recusada na hora**, com as duas pontas na mensagem — e a ' +
        'verificação atravessa a cadeia inteira, não só o vizinho.\n\nRepetir a mesma dupla não ' +
        'duplica: atualiza o `confirmada`.',
      parameters: [idDoCard],
      requestBody: corpo({
        type: 'object',
        required: ['dependeDeId'],
        properties: {
          dependeDeId: inteiro('O card que precisa acontecer antes.'),
          confirmada: booleano(
            '`true` trava o card até a outra ponta ficar pronta. O padrão é `false` — que é como ' +
              'a IA propõe, sem travar nada.',
            { default: false },
          ),
        },
      }),
      responses: {
        200: ok('As dependências do card, já com a nova.', lista('Dependencia')),
        400: resposta('Invalido'),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  '/cards/{id}/dependencias/{outroId}': {
    parameters: [
      idDoCard,
      {
        name: 'outroId',
        in: 'path',
        required: true,
        description: 'O card do qual este depende.',
        schema: { type: 'integer' },
      },
    ],
    patch: {
      operationId: 'confirmarDependencia',
      tags: ['Dependências'],
      summary: 'Confirmar ou desconfirmar',
      description:
        'É aqui que uma proposta da IA vira bloqueio de verdade — ou deixa de ser. **A IA propõe, ' +
        'você confirma.**',
      requestBody: corpo(
        {
          type: 'object',
          properties: {
            confirmada: booleano('O padrão é `true`.', { default: true }),
          },
        },
        false,
      ),
      responses: {
        200: ok('As dependências do card.', lista('Dependencia')),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
    delete: {
      operationId: 'removerDependencia',
      tags: ['Dependências'],
      summary: 'Remover a dependência',
      description: 'Convidado não pode — é uma rota de apagar.',
      responses: {
        200: ok('As dependências que sobraram.', lista('Dependencia')),
        403: resposta('Proibido'),
        ...sempre,
      },
    },
  },

  // -------------------------------------------------------------------------
  // Tags
  // -------------------------------------------------------------------------

  '/tags': {
    get: {
      operationId: 'listarTags',
      tags: ['Tags'],
      summary: 'As tags, com quantas vezes cada uma é usada',
      description: 'Mais usadas primeiro. Inclui as etiquetas de origem (`via-...`).',
      responses: {
        200: ok('As tags.', {
          type: 'array',
          items: {
            type: 'object',
            required: ['nome', 'usos'],
            properties: {
              nome: texto('A tag, normalizada.', { examples: ['ligacao'] }),
              usos: inteiro('Em quantos cards ela está.'),
            },
          },
        }),
        ...sempre,
      },
    },
  },

  // -------------------------------------------------------------------------
  // IA
  // -------------------------------------------------------------------------

  '/ia/disponivel': {
    get: {
      operationId: 'iaDisponivel',
      tags: ['IA'],
      summary: 'As rotinas de IA estão ligadas para mim?',
      description:
        'Junta as duas condições: existe `ANTHROPIC_API_KEY` no servidor **e** esta chave tem ' +
        'escopo de IA. Pergunte antes de oferecer os botões.',
      responses: {
        200: ok('Se dá para chamar as rotinas de IA.', {
          type: 'object',
          required: ['disponivel'],
          properties: { disponivel: booleano('') },
        }),
        ...sempre,
      },
    },
  },

  '/ia/priorizar': {
    post: {
      operationId: 'priorizar',
      tags: ['IA'],
      summary: 'Repriorizar os cards abertos contra o contexto do projeto',
      description:
        'Roda em lote e escreve a justificativa de cada escolha.\n\nDuas garantias:\n\n' +
        '· **Card com prioridade posta por você fica de fora do lote.** A IA não sobrescreve ' +
        'decisão de gente.\n· **Projeto sem contexto escrito só recebe sugestão** — a prioridade ' +
        'entra marcada como `prioridade_sugerida`, aparecendo no painel para confirmar, em vez ' +
        'de mudar as coisas por conta própria.',
      requestBody: corpo(
        {
          type: 'object',
          properties: { projeto: texto('Limita a um projeto. Sem isso, roda em todos.') },
        },
        false,
      ),
      responses: {
        200: ok('O que a rodada fez.', {
          type: 'object',
          required: ['priorizados', 'sugestoes', 'mensagem'],
          properties: {
            priorizados: inteiro('Quantos cards a rodada tocou.'),
            sugestoes: inteiro('Destes, quantos ficaram esperando a sua confirmação.'),
            mensagem: texto('O resumo em uma frase, pronto para mostrar.'),
          },
        }),
        ...errosDeIa,
      },
    },
  },

  '/ia/relacionar': {
    post: {
      operationId: 'relacionar',
      tags: ['IA'],
      summary: 'Procurar dependências entre os cards abertos',
      description:
        'As propostas entram **não confirmadas**, então não travam nada até você confirmar uma ' +
        'a uma em `PATCH /cards/{id}/dependencias/{outroId}`.\n\nO que fecharia ciclo é ' +
        'descartado em silêncio. Com menos de dois cards abertos, não chama o modelo.',
      requestBody: corpo(
        {
          type: 'object',
          properties: { projeto: texto('Limita a um projeto.') },
        },
        false,
      ),
      responses: {
        200: ok('As dependências propostas.', {
          type: 'object',
          required: ['propostas', 'mensagem'],
          properties: {
            propostas: inteiro('Quantas foram criadas.'),
            dependencias: {
              type: 'array',
              description:
                'As duplas propostas. Vem ausente quando não houve rodada — cards abertos de menos.',
              items: {
                type: 'object',
                properties: {
                  card_id: inteiro('O card que espera.'),
                  depende_de_id: inteiro('O card que precisa vir antes.'),
                  porque: texto('Por que a IA acha que uma depende da outra.'),
                },
              },
            },
            mensagem: texto('O resumo em uma frase.'),
          },
        }),
        ...errosDeIa,
      },
    },
  },

  '/ia/ordem-do-dia': {
    get: {
      operationId: 'ordemDoDia',
      tags: ['IA'],
      summary: 'A ordem sugerida para hoje, agrupada',
      description:
        'Agrupa por **contexto de execução**, não por assunto: as ligações juntas, o que exige ' +
        'foco num bloco só, o que é de cinco minutos encaixado entre as coisas. Troca de ' +
        'contexto é o custo que ela está tentando reduzir.\n\nNo máximo quatro blocos, e o que ' +
        'bloqueia outra tarefa vem cedo. Cards travados por dependência ficam de fora.',
      responses: {
        200: ok('Os blocos do dia.', {
          type: 'object',
          required: ['blocos', 'recado'],
          properties: {
            blocos: {
              type: 'array',
              items: {
                type: 'object',
                required: ['nome', 'porque', 'cards'],
                properties: {
                  nome: texto('O bloco, em duas ou três palavras.', { examples: ['as ligações'] }),
                  porque: texto('Por que agrupar assim.'),
                  cards: lista('Card'),
                },
              },
            },
            recado: texto('Uma frase prática para o dono do dia. Sem motivação genérica.'),
            total: inteiro(
              'Quantas tarefas entraram na conta. Ausente quando não havia nada aberto para hoje.',
            ),
          },
        }),
        ...errosDeIa,
      },
    },
  },

  '/ia/quebrar': {
    post: {
      operationId: 'sugerirQuebra',
      tags: ['IA'],
      summary: 'Sugerir quebrar os cards parados',
      description:
        'Card parado na mesma etapa há dias quase nunca é preguiça: quase sempre é uma tarefa ' +
        'grande demais disfarçada de tarefa, e a pessoa trava porque não sabe onde começar.\n\n' +
        '**Esta rota não altera nada** — quebrar é decisão sua, em `POST /cards/{id}/quebrar`.',
      requestBody: corpo(
        {
          type: 'object',
          properties: {
            dias: inteiro('Quantos dias parado contam como parado.', {
              default: DIAS_ATE_SUGERIR_QUEBRA,
            }),
          },
        },
        false,
      ),
      responses: {
        200: ok('As quebras sugeridas.', {
          type: 'object',
          required: ['quebras', 'mensagem'],
          properties: {
            quebras: {
              type: 'array',
              items: {
                type: 'object',
                required: ['card', 'partes'],
                properties: {
                  card: ref('Card'),
                  partes: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'De dois a quatro títulos, cada um fazível numa sentada. A primeira parte ' +
                      'é sempre a mais fácil de começar.',
                  },
                },
              },
            },
            mensagem: texto('O resumo em uma frase.'),
          },
        }),
        ...errosDeIa,
      },
    },
  },

  '/cards/{id}/quebrar': {
    post: {
      operationId: 'aplicarQuebra',
      tags: ['IA'],
      summary: 'Aplicar a quebra: virar vários cards',
      description:
        'Cria um card por parte — mesmo projeto, etapa, tipo, data e tags do original — e ' +
        '**apaga o original**. Por isso convidado não pode.\n\nNão chama o modelo: as partes vêm ' +
        'no corpo, revisadas por você.',
      parameters: [idDoCard],
      requestBody: corpo({
        type: 'object',
        required: ['partes'],
        properties: {
          partes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Os títulos dos cards que substituem o original. Pelo menos um.',
            examples: [['escrever o roteiro da aula 3', 'gravar a aula 3', 'editar a aula 3']],
          },
        },
      }),
      responses: {
        200: ok('Os cards criados e o que saiu do lugar.', {
          type: 'object',
          required: ['criados', 'removido'],
          properties: {
            criados: lista('Card'),
            removido: texto('O título do card que deixou de existir.'),
          },
        }),
        400: resposta('Invalido'),
        403: resposta('Proibido'),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  '/ia/escrever-contexto': {
    post: {
      operationId: 'escreverContexto',
      tags: ['IA'],
      summary: 'Escrever o contexto do projeto a partir do que você confirmou',
      description:
        'A IA observa as prioridades que você confirmou e escreve, no seu lugar, a regra que ' +
        'você está seguindo sem ter escrito.\n\n**Volta como rascunho** — quem salva é você, em ' +
        '`PATCH /projetos/{id}`. Exige que a oferta de contexto já esteja de pé.',
      requestBody: corpo({
        type: 'object',
        required: ['projeto'],
        properties: { projeto: texto('O id ou o nome do projeto.') },
      }),
      responses: {
        200: ok('O rascunho, para você corrigir antes de salvar.', {
          type: 'object',
          required: ['rascunho', 'projeto'],
          properties: {
            rascunho: texto('De duas a quatro frases, em primeira pessoa.'),
            projeto: texto('O nome do projeto.'),
          },
        }),
        400: resposta('Invalido'),
        404: resposta('NaoEncontrado'),
        ...errosDeIa,
      },
    },
  },

  // -------------------------------------------------------------------------
  // Chaves
  // -------------------------------------------------------------------------

  '/chaves': {
    get: {
      operationId: 'listarChaves',
      tags: ['Chaves'],
      summary: 'As chaves de API',
      description: 'Sem os segredos — o banco guarda só o hash. Só dono vê.',
      responses: { 200: ok('As chaves.', lista('Chave')), 403: resposta('Proibido'), ...sempre },
    },
    post: {
      operationId: 'criarChave',
      tags: ['Chaves'],
      summary: 'Criar uma chave',
      description:
        '**Esta é a única resposta que traz o segredo em texto.** Depois daqui nem o sistema ' +
        'sabe qual era.\n\nUma chave por agente: assim dá para revogar uma sem derrubar as ' +
        'outras, e cada card mostra de quem veio.',
      responses: {
        200: ok('A chave criada, com o segredo.', ref('ChaveCriada')),
        400: resposta('Invalido'),
        403: resposta('Proibido'),
        ...sempre,
      },
      requestBody: corpo({
        type: 'object',
        required: ['nome'],
        properties: {
          nome: texto('Como você reconhece esta chave depois.', { examples: ['agente da Maria'] }),
          papel: texto('O padrão é `convidado`.', { enum: PAPEIS, default: 'convidado' }),
          pode_ia: booleano(
            'Se pode gastar a sua conta da Anthropic. O padrão é `false`.',
            { default: false },
          ),
        },
      }),
    },
  },

  '/chaves/{id}': {
    patch: {
      operationId: 'alterarEscopo',
      tags: ['Chaves'],
      summary: 'Mudar o papel ou o escopo de IA',
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'O id da chave.', schema: { type: 'integer' } },
      ],
      requestBody: corpo({
        type: 'object',
        properties: {
          papel: texto('O papel novo.', { enum: PAPEIS }),
          pode_ia: booleano('Se pode disparar as rotinas de IA.'),
        },
      }),
      responses: {
        200: ok('A chave atualizada.', ref('Chave')),
        400: resposta('Invalido'),
        403: resposta('Proibido'),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  '/chaves/{id}/revogar': {
    post: {
      operationId: 'revogarChave',
      tags: ['Chaves'],
      summary: 'Revogar',
      description:
        'A chave deixa de entrar, na hora e para sempre. Não há como desrevogar.\n\nO `API_KEY` ' +
        'do `.env` não aparece aqui: ele é a chave-mestra, a apólice para o caso de você revogar ' +
        'a última chave de dono por engano.',
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'O id da chave.', schema: { type: 'integer' } },
      ],
      responses: {
        200: ok('A chave revogada.', ref('Chave')),
        403: resposta('Proibido'),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },

  // -------------------------------------------------------------------------
  // Telegram
  // -------------------------------------------------------------------------

  '/telegram': {
    get: {
      operationId: 'estadoDoTelegram',
      tags: ['Telegram'],
      summary: 'O bot e quem está na allowlist',
      description:
        'Um bot do Telegram é **público**: qualquer pessoa que descubra o nome dele abre uma ' +
        'conversa. Por isso ele só atende quem está nesta lista.',
      responses: {
        200: ok('O estado do bot.', {
          type: 'object',
          required: ['bot', 'chats'],
          properties: {
            bot: booleano('Se há `TELEGRAM_BOT_TOKEN` no `.env`. Sem token, `chats` vem vazia.'),
            chats: lista('ChatDoTelegram'),
          },
        }),
        ...sempre,
      },
    },
  },

  '/telegram/codigo': {
    post: {
      operationId: 'gerarCodigoDePareamento',
      tags: ['Telegram'],
      summary: 'Gerar um código de pareamento',
      description:
        'Seis dígitos, quinze minutos, **uso único**. Quem recebe manda `/parear 123456` para o ' +
        'bot e entra na allowlist.\n\nQuem tem o painel é quem autoriza — por isso convidado não ' +
        'pode gerar código.',
      responses: {
        200: ok('O código, para digitar no celular.', {
          type: 'object',
          required: ['codigo', 'expira_em', 'validade_minutos'],
          properties: {
            codigo: texto('Os seis dígitos.', { examples: ['481907'] }),
            expira_em: dataHora('Quando ele deixa de valer.'),
            validade_minutos: inteiro('Quanto tempo ele vale.'),
          },
        }),
        403: resposta('Proibido'),
        503: ok('Não há `TELEGRAM_BOT_TOKEN` no `.env` — não existe bot para parear.', ref('Erro')),
        ...sempre,
      },
    },
  },

  '/telegram/chats/{id}': {
    delete: {
      operationId: 'removerChat',
      tags: ['Telegram'],
      summary: 'Tirar alguém da allowlist',
      description: 'O bot para de responder na hora. Convidado não pode.',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'O `chat_id` da conversa.',
          schema: { type: 'string' },
        },
      ],
      responses: {
        200: ok('A conversa removida.', {
          type: 'object',
          required: ['chat_id'],
          properties: { chat_id: texto('O chat que saiu da lista.') },
        }),
        403: resposta('Proibido'),
        404: resposta('NaoEncontrado'),
        ...sempre,
      },
    },
  },
}

// ---------------------------------------------------------------------------
// O documento
// ---------------------------------------------------------------------------

const DESCRICAO = `
Um gestor de tarefas pessoal que o **seu agente de IA sabe operar**.

Esta é a mesma API que o painel React usa. Não existe uma segunda porta feita só
para o agente — se existisse, uma das duas ficaria desatualizada.

## Quem pode entrar

Duas portas separadas, de propósito:

| Quem | Como |
|---|---|
| **Gente** | HTTP Basic — o navegador pede usuário e senha ao abrir o painel |
| **Agente** | \`Authorization: Bearer <chave>\` ou \`X-API-Key: <chave>\` |

A senha é sua e você digita; a chave é do agente, vive em arquivo de
configuração e pode ser trocada sem você mudar nada do seu lado. Uma não vale
pela outra.

**Sem \`.env\`, não há tranca** — e não precisa haver: o servidor escuta só em
\`127.0.0.1\`, então o sistema não existe para o resto da rede. A tranca acende
no momento em que existe \`.env\` com credenciais. Exposto na rede e sem
nenhuma credencial, o servidor **recusa subir**.

### O que muda conforme a chave

O escopo tem duas dimensões **independentes**: o papel (\`dono\` ou
\`convidado\`) e o escopo de IA. Separadas porque dá para querer um convidado de
confiança que roda IA, e um agente organizador que é dono mas nunca gasta a sua
conta da Anthropic.

Convidado registra, conclui, adia, move e lê tudo. Não apaga, não mexe em
projeto nem pipeline, e não replaneja em bloco.

## As convenções

- Toda resposta é JSON. Todo erro é \`{ "erro": "mensagem em português" }\` com
  status 4xx ou 5xx.
- **Onde o sistema pede um projeto ou uma etapa, o nome vale tanto quanto o id**,
  e maiúscula não importa.
- Quando um nome não é encontrado, a mensagem diz quais existem. Se você é um
  agente: **pergunte ao usuário em vez de criar um parecido.**
- As datas são do fuso local, nunca UTC. Um card criado às 22h no Brasil nasce
  com a data de hoje, não com a de amanhã.
- O limite é de 600 chamadas por minuto para dono e 60 para convidado. Não é
  defesa contra ataque: é defesa contra agente em laço.

## As regras que o sistema garante

Elas moram num arquivo só (\`server/regras.js\`) e valem igual para o painel,
para a CLI e para você:

- Não existe card sem título.
- Adiar muda a data. Não conclui e não apaga nada.
- O status vem da etapa, nunca é digitado: a última etapa do pipeline é a de
  conclusão.
- **Prioridade posta na mão nunca é sobrescrita pela IA.**
- No máximo ${TETO_DO_DIA} cards podem ser "hoje de verdade".
- Dependência sugerida não trava nada; só a confirmada trava.
- Dependência circular é recusada na hora, mostrando as duas pontas.
- Ideia é guardada, mas não aparece na lista de hoje.
- Sem chave de IA, tudo acima continua valendo.
`.trim()

/**
 * Monta o documento.
 *
 * É função e não constante porque o `.env` só é lido quando o servidor sobe: a
 * porta em que ele responde não existe no momento em que este módulo é
 * importado.
 */
export function documento({ porta = Number(process.env.PORTA || 3000) } = {}) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Gestor de tarefas',
      version: '2.0.0',
      summary: 'Cards, projetos, pipelines e priorização por IA — operável pelo seu agente.',
      description: DESCRICAO,
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [
      { url: '/api', description: 'Este servidor, seja ele qual for.' },
      { url: `http://localhost:${porta}/api`, description: 'A sua máquina.' },
    ],
    // Vale para tudo: qualquer uma das três credenciais serve. As rotas de
    // `/operacoes` sobrescrevem com `security: []` porque um agente precisa
    // conseguir ler o índice antes de saber o que apresentar.
    security: [{ senhaDoPainel: [] }, { chaveDeAgente: [] }, { chaveNoCabecalho: [] }],
    tags: [
      { name: 'O dia', description: 'O que fazer agora — a lista de hoje, a próxima, o atraso.' },
      { name: 'Cards', description: 'Registrar, mudar, mover, concluir, adiar.' },
      { name: 'Projetos', description: 'Os projetos, os pipelines e o contexto de cada um.' },
      {
        name: 'Dependências',
        description: 'O que precisa vir antes. A IA propõe, você confirma — só a confirmada trava.',
      },
      { name: 'Tags', description: 'As etiquetas que atravessam projetos.' },
      {
        name: 'IA',
        description:
          'As rotinas em lote. Todas correm na chave da Anthropic do dono do sistema, por isso ' +
          'são liberadas chave a chave.',
      },
      { name: 'Chaves', description: 'As credenciais dos agentes, criadas de dentro da aplicação.' },
      { name: 'Telegram', description: 'O celular, pelo bot — com allowlist e pareamento.' },
      { name: 'O sistema', description: 'O que existe e quem sou eu.' },
    ],
    paths,
    components: {
      schemas,
      responses,
      securitySchemes: {
        senhaDoPainel: {
          type: 'http',
          scheme: 'basic',
          description:
            'Para **gente**. `AUTH_USUARIO` e `AUTH_SENHA` do `.env` — o navegador cuida do ' +
            'resto ao abrir o painel.\n\nBasic auth manda usuário e senha em base64, que é texto ' +
            'claro: fora da sua máquina, só atrás de HTTPS.',
        },
        chaveDeAgente: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Para **agente**. A chave criada no painel (em *chaves*), ou o `API_KEY` do `.env`, ' +
            'que é a chave-mestra.\n\nNunca a sua senha: senha é sua, chave é revogável, e as ' +
            'duas têm ciclos de vida diferentes.',
        },
        chaveNoCabecalho: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'A mesma chave de agente, para clientes a quem `Authorization` não serve.',
        },
      },
    },
  }
}
