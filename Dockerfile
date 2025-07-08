FROM node:22.16-alpine

WORKDIR /app

COPY yarn.lock ./
RUN yarn

COPY . .

RUN npx prisma generate

CMD ["npm", "run", "dev"]
