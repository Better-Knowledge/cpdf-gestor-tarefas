# Imagem para rodar atrás da Traefik.
#
# Node 24: o `node:sqlite` é embutido, então não há módulo nativo para
# compilar — a imagem não precisa de build tools e sobe em segundos.

FROM node:24-alpine

WORKDIR /app

# As dependências primeiro: enquanto o package.json não mudar, esta camada é
# reaproveitada e o deploy não baixa nada de novo.
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# O banco mora num volume, não na imagem: subir uma versão nova não pode
# apagar as tarefas de ninguém.
ENV BANCO=/dados/tarefas.db
VOLUME /dados

# Dentro do contêiner ele precisa ouvir em todas as interfaces para a Traefik
# alcançar. Seguro porque a porta não é publicada — quem fala com a internet é
# a Traefik, na mesma rede Docker.
ENV HOST=0.0.0.0
ENV PORTA=3000
ENV ATRAS_DE_PROXY=true

EXPOSE 3000
CMD ["node", "server/index.js"]
