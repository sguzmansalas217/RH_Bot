FROM node:22-slim

WORKDIR /app

# Dependencias
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Código
COPY . .

# Carpetas persistentes (montadas como volúmenes)
RUN mkdir -p .baileys_auth uploads

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
