# api.horse.link
NodeJS API for horse link http://api.horse.link

# Introduction
This project allows users to create a signed data to add to Horse Link dapps.

## Starting

```bash
    cp .env.development .env
    yarn install
    yarn start
```

## Building docker

```bash
docker container ls -a
docker build -t horselinkapi .
docker run -p 49160:3000 -d horselinkapi

```

or from Docker
```bash
docker run -it --rm -d -p 127.0.0.1:8080:80 --name web -v ~/GitHub/horse-link/api.horse.link/src:/usr/share/
nginx/html nginx

docker run -it --rm -d -p 127.0.0.1:8080:80 --name web webserver
```

## Requests
