# FROM nginx:latest
# COPY ./src/index.html /usr/share/nginx/html/index.html

FROM node:14.19.1

WORKDIR /usr/src/app

COPY package*.json ./
COPY .env ./.env
RUN yarn install

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]