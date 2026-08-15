# Design System — Gestor de tarefas

**Documento normativo · 15 de agosto de 2026**
Companheiro de [`PRD-RECONSTRUCAO.md`](./PRD-RECONSTRUCAO.md), Parte 11.

O sistema visual se chama **ink + cream + terracota**. Ele foi portado do CRM da mentoria
(`Better-Knowledge/crm-mentoria`), que por sua vez é o design dos slides da Imersão
traduzido de apresentação para aplicação. Reconstruir o gestor com outra linguagem visual
quebra essa continuidade — o quadro e o slide precisam parecer a mesma coisa quando estão
lado a lado no telão.

---

## Parte 0 · Os cinco princípios

**1 · Papel, não tela.** O fundo é creme, não branco puro, e não é cinza. A referência é
papel de caderno com uma grade quente muito discreta por baixo. Um gestor de tarefas é onde
a pessoa pensa; a tela precisa parecer superfície de escrita, não painel de controle.

**2 · Uma cor de acento, e ela é escassa.** O terracota marca **a coisa** — o que está
selecionado, o que precisa de decisão, a palavra da marca. Se três coisas na tela estão em
terracota, nenhuma está. Sucesso, alerta e perigo existem, mas aparecem quase nunca.

**3 · Atraso não é vermelho.** Card vencido usa terracota discreto e uma faixa de oferta,
nunca alarme. Culpa acumulada é o que faz as pessoas abandonarem gerenciador de tarefas — e
a que faz abandonarem mais rápido é a lista vermelha de segunda de manhã. *Esta regra é de
produto antes de ser de design.*

**4 · A serifa itálica é a assinatura.** Uma palavra por contexto, em Libre Baskerville
itálico terracota. É o que amarra a aplicação ao material da mentoria. Duas palavras em
serifa na mesma tela já é excesso.

**5 · Nada vem da rede.** Fontes locais, sem Google Fonts, sem CDN de ícone. O sistema é
projetado ao vivo e o plano B é a instância local — que precisa funcionar sem rede. *(A
única exceção conhecida é o renderizador da página `/docs`, e ela está documentada como
exceção no PRD, RT-16.)*

---

## Parte 1 · Onde ele vive

**Um arquivo:** `src/index.css`. Ele é o design system inteiro — tokens em `@theme` do
Tailwind 4, mais as classes de componente. Não existe `tailwind.config.js`, não existe
arquivo de tema separado, não existe biblioteca de componentes de terceiros.

```css
@import 'tailwindcss';
@import './fontes.css';

@theme { /* os tokens */ }
/* as classes de componente */
```

Os tokens declarados em `@theme` viram **duas coisas ao mesmo tempo**: variáveis CSS
(`var(--color-terracota)`) e utilitários do Tailwind (`bg-terracota`, `text-tinta`,
`border-borda`). É o que permite usar utilitário na maior parte do código e cair para CSS
quando o componente merece nome próprio.

---

## Parte 2 · Os tokens

### 2.1 · Cor

```css
--color-tinta:        #1a1918;   /* o preto do sistema — quente, nunca #000 */
--color-grafite:      #30302e;   /* texto secundário, títulos de coluna */
--color-pedra:        #b1ada1;   /* texto terciário, placeholder, metadado */
--color-papel:        #f4f3ee;   /* o fundo da aplicação */
--color-papel-fundo:  #eceae2;   /* o fundo mais fundo: hover, pílulas, blocos citados */
--color-superficie:   #ffffff;   /* o que se levanta do papel: card, modal, campo */
--color-terracota:    #e26546;   /* O acento. Um por tela. */

--color-borda:        rgba(26, 25, 24, 0.10);
--color-borda-forte:  rgba(26, 25, 24, 0.16);

--color-sucesso:      #4f7a5a;   /* verde apagado — o desbloqueio */
--color-alerta:       #d6a24e;
--color-perigo:       #c0432d;   /* SÓ ação destrutiva. Nunca atraso. */
```

**A hierarquia de texto tem três degraus, e só três:**

| Token | Para quê |
|---|---|
| `tinta` | O título do card, o texto que a pessoa lê |
| `grafite` | Rótulo de coluna, texto de apoio dentro de bloco |
| `pedra` | Data, contagem, placeholder, "mais 3 depois desta" |

**A hierarquia de superfície também tem três:**

| Token | Para quê |
|---|---|
| `papel` | O fundo da aplicação |
| `superficie` (branco) | O que se levanta: card, modal, campo, botão neutro |
| `papel-fundo` | O que se afunda: hover de fantasma, bloco citado, pílula de exemplo |

**Regras de cor que não se negociam:**

- `perigo` só em ação **destrutiva** (apagar card, revogar chave). **Atraso não usa perigo.**
- `sucesso` aparece essencialmente num lugar: o aviso de desbloqueio. É o único momento em
  que o sistema comemora, e comemora porque a pessoa destravou outra coisa.
- Terracota com opacidade baixa (`/6`, `/8`, `/12`) é o preenchimento de destaque; terracota
  cheio é borda, texto de acento e botão primário.
- Nada de gradiente. Nada de sombra colorida.

### 2.2 · Tipografia

Quatro famílias, cada uma com um trabalho:

```css
--font-titulo:  'Fira Sans', system-ui, sans-serif;        /* interface: botão, aba, título, rótulo */
--font-serifa:  'Libre Baskerville', Georgia, serif;       /* a assinatura, e a justificativa da IA */
--font-corpo:   'Inter', system-ui, sans-serif;            /* corpo, campo, parágrafo */
--font-mono:    'JetBrains Mono', ui-monospace, monospace; /* o contexto do projeto, chave, id */
```

**O par Fira Sans / Inter não é decorativo.** Fira carrega a interface — ela é o que a pessoa
clica. Inter carrega o texto — é o que a pessoa lê. Trocar as duas por uma só apaga a
diferença entre controle e conteúdo.

**A serifa tem dois usos, e só dois:**
1. A palavra da marca (`de *tarefas*`) e a contagem de cards na coluna.
2. **A justificativa da IA no card.** É o que faz a frase escrita pela máquina parecer uma
   nota à margem em vez de mais um campo do formulário.

**O mono tem um uso principal:** o **contexto do projeto**. O campo é `font-mono` de
propósito — é o único texto do sistema que a pessoa escreve para uma máquina ler, e a fonte
avisa isso sem precisar de instrução.

**Escala em uso:**

| Tamanho | Onde |
|---|---|
| `11px` | rótulo, chip, metadado, marca-pill |
| `12px` | eyebrow, título de coluna, justificativa |
| `13–14px` | botão, campo, corpo |
| `15px` | título do card, campo de registro |
| `text-3xl` (30px) | o card no modo "e agora?" |
| `text-4xl` (36px) | título de tela |

### 2.3 · Forma, sombra e movimento

```css
--radius-carta: 12px;   /* card, modal pequeno, bloco */
--radius-bloco: 18px;   /* coluna do quadro, modal grande */

--shadow-baixa: 0 1px 2px rgba(26,25,24,.06), 0 1px 1px rgba(26,25,24,.04);
--shadow-media: 0 4px 14px rgba(26,25,24,.08), 0 1px 2px rgba(26,25,24,.04);
--shadow-alta:  0 18px 48px rgba(26,25,24,.16), 0 3px 8px rgba(26,25,24,.06);

--ease-suave: cubic-bezier(0.22, 1, 0.36, 1);
```

**A sombra é a régua de elevação:** card em repouso é `baixa`; card sob o cursor é `media`;
modal é `alta`. A sombra é sempre da cor da tinta com opacidade — nunca preto puro, que
produz aquele cinza sujo sobre fundo quente.

**Botões pequenos (8px) e superfícies grandes (12/18px).** Raio pequeno em coisa clicável e
raio grande em coisa que contém: a diferença ajuda a distinguir controle de container sem
usar cor.

**Todo movimento usa `--ease-suave`, em 0.16–0.28s.** Nada mais lento que 0.3s. Duas
animações nomeadas, e só duas: `surgir` (fade do fundo do modal) e `pipocar` (o conteúdo do
modal entrando com escala 0.97 → 1).

---

## Parte 3 · As fontes locais

`src/fontes.css` declara `@font-face` apontando para `.woff2` em `src/fontes/`. **Nenhuma
requisição sai da máquina.**

| Família | Pesos | Subsets |
|---|---|---|
| Inter | 400, 500, 600 | latin, latin-ext |
| Fira Sans | 400, 500, 600 | latin, latin-ext |
| Libre Baskerville | 400, 400 itálico, 700 | latin, latin-ext |
| JetBrains Mono | 400, 500 | latin, latin-ext |

Todas com `font-display: swap`. `latin-ext` não é opcional — é o subset que carrega os
acentos do português nas fontes que não os têm em `latin`.

---

## Parte 4 · Os componentes

Cada componente é uma classe CSS no `index.css`, e um wrapper React fino em
`src/componentes/Pecas.jsx`. **O wrapper existe para o app não depender do nome da classe:**
trocar o design system não deveria obrigar a reescrever cada chamada de botão. Por isso o
mapa de variantes aceita nomes antigos e novos.

### 4.1 · Tipografia de marca

| Classe | O que é | Uso |
|---|---|---|
| `.eyebrow` | 12px Fira 500, `letter-spacing: .22em`, caixa alta, terracota | O rótulo miúdo acima de um título de tela |
| `.titulo-tela` | Fira 600, `tracking -.025em`, `line-height 1.02` | O título grande |
| `.serifa` | Libre Baskerville itálico terracota | **Uma palavra por contexto** |
| `.marca-pill` | 11px Fira, caixa alta, borda 1.5px terracota, `border-radius: 999px` | O selo "Gestor" no cabeçalho |
| `.textura` | Grade de 44px em `rgba(tinta,.025)`, com máscara radial sumindo para baixo | O fundo. `position: fixed`, `z-index: -1`, `pointer-events: none` |

A máscara da textura não é enfeite: sem ela a grade compete com o conteúdo na parte de baixo
da tela, onde ficam os cards.

### 4.2 · `.btn` — o botão

```
.btn              neutro   — branco, borda forte, tinta
.btn.primario     ação     — terracota cheio, texto branco
.btn.escuro       ênfase   — tinta cheio, texto papel  ("E agora?")
.btn.fantasma     terciário— sem borda, sem fundo, grafite
.btn.perigo       destrói  — texto e borda perigo, fundo transparente
.btn.miudo        modificador de tamanho (12px / padding 4×10)
```

Hover do neutro: borda vira tinta, `translateY(-1px)`, sombra baixa. Hover do fantasma:
fundo `papel-fundo`, **sem** movimento e **sem** sombra — ele é terciário e não deve
competir. `:disabled` é `opacity .4` e `cursor: not-allowed`.

**Quando usar qual:**

| Variante | Regra |
|---|---|
| `escuro` | **Uma por tela.** É a ação de mudar de modo ("E agora?", "salvar o contexto") |
| `primario` | A ação afirmativa dentro de um bloco de decisão ("é isso", "Feito") |
| neutro | Tudo o mais que é ação |
| `fantasma` | Sair, fechar, "agora não", "me mostra outra" — o que não deve chamar atenção |
| `perigo` | Apagar, revogar. E nada além disso |

### 4.3 · `.chip` — a etiqueta

Pílula de 11px, borda fina, `white-space: nowrap`. Três tons:

| Tom | Cor | Para quê |
|---|---|---|
| neutro | grafite / borda-forte | tags, projeto, contagens |
| `accent` | terracota, fundo `/6` | "hoje", data vencida |
| `calmo` | sucesso, fundo `/8` | "ideia" — o que está guardado e não cobra |

Tag sempre aparece com `#` na frente na interface, mesmo que o `#` não seja guardado no
banco (PRD, RN-26).

### 4.4 · `.campo` e `.rotulo` — a entrada

`.campo` tem fundo `papel` (não branco) e borda forte. No foco: borda terracota + halo
`0 0 0 3px rgba(terracota,.12)`. **O halo substitui o `outline` do navegador, e é a única
coisa que indica foco** — então ele não pode ser removido, e é ele que atende o requisito de
acessibilidade.

`.rotulo` é 11px Fira 500, caixa alta, `letter-spacing .06em`, cor `pedra`.

**O campo de registro é a exceção deliberada:** fundo branco (`superficie`), 15px, padding
maior e sombra baixa. É o campo mais importante do sistema e o único que se levanta do
papel. *Se registrar voltar a custar caro, o sistema morre* — e o desenho precisa dizer isso.

### 4.5 · `.aba` — a navegação de projeto

Pílula de 14px Fira 500, transparente. Hover: fundo `papel-fundo`. Ativa: **fundo tinta,
texto papel** — a inversão total, não a borda inferior. Num quadro cheio de terracota
discreto, a aba ativa precisa de contraste de superfície, não de cor.

### 4.6 · `.coluna` — a coluna do quadro

Fundo `rgba(255,255,255,.5)` — meio transparente, deixando a textura passar. Borda `borda`,
raio `bloco`.

`.coluna.sobre` (o card sendo arrastado está por cima): borda terracota + fundo
`rgba(terracota,.06)`. É o único feedback de drop, e ele é suficiente.

`.coluna-titulo` é 12px Fira 600 caixa alta grafite, com `.conta` à direita: **a contagem em
serifa itálica terracota, 17px**. Aquele número é o detalhe que faz o quadro parecer feito à
mão em vez de gerado.

### 4.7 · `.cartao` — o card

Branco, raio `carta`, sombra `baixa`, `cursor: grab`. Hover: borda mais forte, sombra
`media`, `translateY(-2px)`. `:active` vira `grabbing`.

| Estado | Aparência |
|---|---|
| `.arrastando` | `opacity .35` + `rotate(1.5deg)` |
| `.do-dia` | borda terracota + halo `0 0 0 3px rgba(terracota,.12)` — é uma das três coisas de hoje |

**A anatomia do card, de cima para baixo:**

1. **Ponto de prioridade** — 8×8 à esquerda: `terracota` (alta), `pedra` (média),
   `borda-forte` (baixa). Um ponto, não uma etiqueta escrita: a prioridade precisa ser lida
   de relance, e uma coluna com quinze etiquetas "média" é ruído.
2. **Título** — 15px Fira 600 tinta.
3. **Justificativa da IA** — 12px serifa itálica `pedra`. A nota à margem.
4. **Etiquetas** — hoje · ideia · tags · "N relação a confirmar".
5. **Bloco de sugestão de prioridade** (se houver) — caixa terracota `/6` com borda `/30`,
   a sugestão escrita e dois botões: `primario miudo` "é isso" e `fantasma miudo` "não".
6. **Aviso de aguardando** (se houver) — bloco `papel-fundo`, 11px grafite, dizendo
   **aguardando o quê**. Card travado nunca some.
7. **Rodapé** — a data (terracota médio se vencida, `pedra` se não) e `· via <origem>`.

### 4.8 · `.modal` — a sobreposição

Fundo `rgba(tinta,.45)` + `backdrop-filter: blur(4px)`. Alinhado ao **topo** (`flex-start`)
com padding de 48px, e a área inteira rola — modal centralizado com conteúdo alto fica
inalcançável em tela baixa.

`.modal-conteudo` é branco, raio `bloco`, sombra `alta`, e entra com `pipocar`.

**A estrutura padrão de modal grande** — cabeçalho fixo, corpo rolante, rodapé fixo:

```
<header>  título + linha de apoio 12px pedra   border-b
<div>     conteúdo, overflow-y auto, flex-1
<footer>  ações à direita                      border-t
```

### 4.9 · Avisos (as notificações)

Canto inferior direito, coluna de 320px, `pointer-events: none` no container e `auto` em
cada aviso. Somem sozinhos em ~9 segundos.

| Tom | Aparência |
|---|---|
| `ok` | branco, borda `borda`, texto tinta |
| `erro` | branco, borda `terracota/30`, texto terracota |
| `destravou` | fundo `sucesso/10`, borda `sucesso/30`, texto sucesso, **com a lista do que foi destravado** |

O `destravou` é o único aviso que carrega uma lista, e é o único que usa verde. Ele é o
fechamento de loop do produto — a diferença entre riscar item de lista e sentir que a semana
andou.

### 4.10 · Estados

| Componente | Aparência |
|---|---|
| `<Vazio>` | Serifa itálica `pedra`, centralizado, padding vertical generoso. **Nunca ilustração, nunca ícone triste.** |
| `<Carregando>` | Uma linha: "Abrindo…" em 14px `pedra`. Sem spinner. |
| Botão de IA ocupado | O próprio rótulo vira gerúndio: `priorizando…`, `procurando…`, `montando…`, `olhando…`. Sem spinner separado. |

O sistema não tem spinner em lugar nenhum, de propósito. Uma palavra que muda diz o que está
acontecendo; um círculo girando diz só que algo está.

---

## Parte 5 · Padrões de tela

### O cabeçalho

`sticky top-0`, fundo `papel/85` com `backdrop-blur-md`, borda inferior. Duas faixas:

1. **Identidade e navegação** — `marca-pill` + título com a palavra em serifa · as abas de
   projeto · à direita (`ml-auto`) as ações: contexto (com um ponto terracota se o projeto
   não tiver contexto escrito), chaves e telegram (**só para dono**), e o botão `escuro` de
   trocar de modo.
2. **Filtros** — grupo segmentado de status, seletor de tag, busca · e à direita, **só se a
   IA estiver disponível**, os quatro botões das rotinas.

O ponto terracota ao lado de "contexto" é o padrão de *affordance silenciosa* do sistema:
uma marca de 4px que diz "aqui falta algo" sem nenhuma frase de cobrança.

### O quadro

`grid` de colunas, uma por etapa, com rolagem horizontal quando não couber. Cada coluna rola
verticalmente sozinha. Não existe densidade alternativa nem modo compacto — a densidade é
uma só.

### A tela "e agora?"

Centralizada, `max-width` estreita (`max-w-xl`), tudo em coluna:

```
E AGORA?              ← eyebrow, 12px caixa alta pedra
<o título>            ← text-3xl, text-balance, tinta
<o porquê>            ← 14px pedra, max-w-md
<etiquetas>           ← data · projeto · tags
[Feito] [Não dá agora] [Me mostra outra]
mais N depois desta   ← 12px pedra
ver o quadro inteiro  ← fantasma
```

O espaço vertical é o componente principal desta tela. `mt-10` antes dos botões e `mt-8`
antes da contagem não são arbitrários: a tela precisa parecer vazia. Uma tela cheia é a tela
que trava.

---

## Parte 6 · Acessibilidade

Requisitos, não recomendações:

| # | Requisito |
|---|---|
| **A-01** | Todo card tem `aria-label` com título, etapa, prioridade e o que aguarda. O dnd-kit entrega `role="button"` **sem nome** — sem o label, a coluna vira "botão, botão, botão" na leitura de tela. |
| **A-02** | Card abre por teclado: Enter e Espaço, com `preventDefault`. |
| **A-03** | O drag & drop tem **distância mínima de ativação**. Sem ela, clicar vira um arrasto de zero pixel e o card nunca abre. |
| **A-04** | O foco é visível em tudo. O halo terracota do `.campo` substitui o `outline` — nunca `outline: none` sozinho. |
| **A-05** | `@media (prefers-reduced-motion: reduce)` zera **todas** as animações e transições (`0.01ms !important`). Já está no `index.css` e não sai. |
| **A-06** | Contraste: `tinta` sobre `papel` ≈ 15,8:1. `grafite` sobre `papel` ≈ 11,9:1. **`pedra` sobre `papel` ≈ 2,0:1 — reprovado em qualquer critério WCAG.** Por isso `pedra` é **só** para metadado de 11–12px que repete informação já disponível na tela (a data que também está no detalhe, a contagem que também está na lista). Nunca para texto que carrega informação única, nunca para rótulo de campo sem `<label>` associado, nunca para mensagem de erro. |
| **A-07** | O ponto de prioridade tem `title`, porque cor sozinha não é informação. |
| **A-08** | Botões dentro de um card interativo chamam `stopPropagation` — senão a ação secundária dispara a primária junto. |

---

## Parte 7 · O que não fazer

| Não | Por quê |
|---|---|
| Modo escuro | O sistema é papel. Um papel escuro é outro produto, e não existe versão dele desenhada. |
| Segunda cor de acento | O terracota deixa de significar "aqui" no instante em que tem companhia. |
| Vermelho para atraso | Princípio 3. É decisão de produto. |
| Gradiente, glass, neon, sombra colorida | Nada disso existe no material da mentoria. |
| Biblioteca de componentes (MUI, shadcn, Chakra) | O sistema tem oito componentes. A biblioteca traz mil e a sua própria opinião visual. |
| Ícone de biblioteca externa | Nada vem da rede. O sistema usa texto, e onde precisa de símbolo usa caractere (`★`, `⏳`, `→`, `·`). |
| Fonte de CDN | Princípio 5. |
| Spinner | Uma palavra em gerúndio diz mais. |
| Ilustração de estado vazio | Uma frase em serifa itálica basta, e não infantiliza. |
| Toast que exige clique para fechar | Aviso some sozinho. O que exige ação é modal. |
| Mais de um `.btn.escuro` por tela | Deixa de ser a ação principal. |
| Duas palavras em `.serifa` na mesma tela | A assinatura vira decoração. |

---

## Parte 8 · Portar para outro stack

Se a reconstrução não usar Tailwind 4 ou React, o que precisa sobreviver, em ordem de
importância:

1. **Os tokens da Parte 2, com os nomes em português.** `tinta`, `papel`, `terracota`,
   `pedra` — os nomes carregam a intenção. `--color-primary-500` não diz que é terracota nem
   por que ele é escasso.
2. **As quatro famílias tipográficas com os quatro papéis** da Parte 2.2, servidas
   localmente.
3. **Os oito componentes da Parte 4**, com os mesmos estados e os mesmos gatilhos.
4. **Os requisitos de acessibilidade da Parte 6.** Estes são obrigatórios em qualquer stack.
5. **As proibições da Parte 7.**

O que pode mudar sem perder o sistema: a sintaxe (CSS Modules, styled-components, `@theme`),
a biblioteca de drag & drop (desde que mantenha A-01 a A-03), e a estrutura de arquivos.

**O teste de que a porta deu certo:** abrir o quadro reconstruído ao lado de um slide da
mentoria e não conseguir dizer que foram feitos por ferramentas diferentes.

---

## Parte 9 · Estado da adoção no código atual

**Esta parte não é normativa.** As Partes 0 a 8 dizem como o sistema *deve* ser; esta diz
como o código de `src/` estava quando o levantamento foi feito. Ela existe para quem for
reconstruir saber o que herdaria — e envelhece, ao contrário do resto do documento.

O sistema entrou depois de a interface já existir, e a conversão não terminou. Parte da tela
ainda desenha à mão com utilitários crus (`bg-white`, `rounded-2xl`, `shadow-2xl`) em vez das
classes e dos tokens. Funciona e parece certo, mas não responde quando um token muda.

| Arquivo | Classes do DS | Utilitários crus | Situação |
|---|---:|---:|---|
| `componentes/Pecas.jsx` | 8 | 0 | convertido |
| `componentes/Quadro.jsx` | 5 | 0 | convertido |
| `componentes/Cartao.jsx` | 5 | 0 | convertido |
| `componentes/Chaves.jsx` | 12 | 2 | convertido |
| `componentes/Telegram.jsx` | 8 | 4 | convertido |
| `componentes/EAgora.jsx` | 0 | 0 | só tokens — correto assim |
| `App.jsx` | 11 | 15 | misto |
| `componentes/PainelProjeto.jsx` | 1 | 6 | fora do DS |
| `componentes/DetalheCard.jsx` | 0 | 2 | fora do DS |

`EAgora.jsx` é caso à parte: não usa nenhuma classe de componente, mas também não usa nada
cru — é só tipografia e tokens, exatamente como a Parte 5 descreve a tela.

**A dívida concreta — cinco sobreposições redesenhadas à mão.** Os três modais definidos
dentro de `App.jsx` (`OfertaDeContexto`, `OrdemDoDia`, `Quebras`), mais `PainelProjeto` e
`DetalheCard`, repetem o que `.modal` e `.modal-conteudo` já fazem, e com valores que não
batem com a Parte 2.3 nem com a 4.8:

| Onde eles usam | O sistema define |
|---|---|
| `rounded-2xl` (16px) | `--radius-bloco` (18px) |
| `shadow-2xl` | `--shadow-alta` |
| `bg-tinta/20`, sem desfoque | `rgba(tinta,.45)` + `backdrop-filter: blur(4px)` |
| centralizado (`items-center`) | alinhado ao topo, com a área rolando (4.8) |

Converter esses cinco para `.modal` / `.modal-conteudo` é a maior aproximação entre código e
documento que se consegue num commit só.

**Dois pontos onde o código ainda não atende o documento:**

- **A-04 não está cumprido.** Só `.campo` tem tratamento de foco próprio. Botão, aba e cartão
  dependem do anel padrão do navegador — que existe, mas não é desenhado e some sob o
  `translateY` do hover em alguns temas de sistema.
- **`--color-alerta` está órfão.** Declarado no `@theme` e sem nenhum uso em `src/`. Ou ganha
  um estado que o justifique, ou sai do tema.

A página `/docs` continua no tema `purple` de fábrica do Scalar (`server/documentacao.js`) —
o que é coerente com a exceção já registrada no Princípio 5, mas vale dizer em voz alta que a
página pública da API não se parece com a aplicação.
