FROM node:20-bookworm

# Dependências de build para o binding nativo do @tensorflow/tfjs-node
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/models

EXPOSE 3000
CMD ["npm", "run", "dev"]
