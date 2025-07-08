import { filtrarEstoquePorTermos } from "./generate-prompt-by-intention.js";
import sendPromptToLlama from "../providers/ollama.js";

/**
 * Recebe uma mensagem e o estoque atual,
 * verifica se o usuário quer fotos e retorna os produtos com imagem.
 */
export default async function checkWantsReceivePhoto(mensagem, estoqueJSON) {
  const isReceived = await verificarSeDesejaFoto(mensagem);

  const palavrasChave = await extractProductsFromMessage(mensagem);

  console.log("[Receive Photo] extrairPalavrasChave", palavrasChave);
  // console.log("[Receive Photo] estoqueJSON", estoqueJSON);

  const produtosDesejados = filtrarEstoquePorTermos(estoqueJSON, palavrasChave);

  console.log("[Receive Photo] produtosDesejados", produtosDesejados);

  const products = produtosDesejados
    .filter((item) => item.imageUrl)
    .map((item) => ({
      nome_produto: item.productName,
      imageUrl: item.imageUrl,
    }));

  return {
    isReceived,
    products,
  };
}

async function verificarSeDesejaFoto(mensagem) {
  const prompt = `
Você deve responder apenas com "SIM" ou "NÃO".

O cliente quer receber uma foto de produto?

Mensagem do cliente:
"${mensagem}"

Resposta:
`;

  const response = await sendPromptToLlama(prompt, 0, 1, 0, 1.0);
  console.log("O cliente pediu foto sim ou nao:", response);
  return response.trim().toUpperCase().includes("SIM");
}

async function extractProductsFromMessage(mensagem) {
  const prompt = `
Você é Cris , uma atendente virtual no WhatsApp da loja de roupas Cristina Confecções
Extraia quais produtos o cliente disse a partir da seguinte mensagem:

Mensagem do cliente: "${mensagem}"

Responda apenas com um JSON com os seguintes campos:

{
  "produtos": string[]          // Palavras importantes da mensagem, como tipos de produtos, cores, estilos
}

NUNCA invente termos que não aparecem na mensagem. Não adicione comentários ou explicações, apenas o JSON.

Agora, gere a resposta.
`;

  const response = await sendPromptToLlama(prompt, 0, 1, 0, 1.0, 300);
  console.log("O cliente pediu foto dos seguintes produtos:", response);
  return JSON.parse(response).produtos;
}

function extrairPalavrasChave(mensagem) {
  return normalizarTexto(mensagem)
    .split(/\s+/)
    .filter((p) => p.length > 2); // ignora palavras muito curtas
}

function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^\w\s]/g, "")
    .replace(/a$/, "o"); // converte final 'a' para 'o' (branca → branco, etc.)
}

function correspondeAoProduto(palavrasChave, itemEstoque) {
  const nome = normalizarTexto(itemEstoque.nome_produto || "");
  const cor = normalizarTexto(itemEstoque.cor || "");
  const colecao = normalizarTexto(itemEstoque.colecao || "");

  const textoCompleto = `${nome} ${cor} ${colecao}`;

  const palavrasNormalizadas = palavrasChave.map(simplificarPalavra);

  const palavrasRelevantes = palavrasNormalizadas.filter((palavra) =>
    textoCompleto.includes(palavra)
  );

  // Considere relevante se pelo menos 1 ou 2 palavras-chave forem encontradas
  return palavrasRelevantes.length >= Math.min(2, palavrasNormalizadas.length);
}

function simplificarPalavra(palavra) {
  return palavra.replace(/s$/, ""); // remove plural simples (camisetas → camiseta)
}
