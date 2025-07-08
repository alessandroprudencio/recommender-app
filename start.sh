#!/bin/sh  
docker compose up --build -d

ollama pull llama3.2

ollama serve

# ./loophole http 8080 --hostname alessandro
# ngrok http 8080
ngrok http --url=robust-endless-pup.ngrok-free.app 80

