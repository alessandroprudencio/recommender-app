import sendPromptToLlama from "../providers/ollama.js";

export async function detectIntention(mensagem) {
  const prompt = `
Você é Cris , uma atendente virtual no WhatsApp da loja de roupas Cristina Confecções
Extraia a intenção do cliente a partir da seguinte mensagem:

Mensagem do cliente: "${mensagem}"

Responda apenas com um JSON com os seguintes campos:

{
  "intencao": string,         // Ex: "buscar_produto", "falar_com_atendente", "elogio", "reclamacao", "duvida_entrega"
  "termos": string[]          // Palavras importantes da mensagem, como tipos de produtos, cores, estilos
}

NUNCA invente termos que não aparecem na mensagem. Não adicione comentários ou explicações, apenas o JSON.

Agora, gere a resposta.
`;

  const resposta = await sendPromptToLlama(prompt);
  try {
    console.log("A intencao do usuario é:", resposta);

    const result = JSON.parse(resposta);

    return result;
  } catch (e) {
    console.error("Erro ao interpretar JSON da intenção:", resposta);
    return { intencao: "outro", termos: [] };
  }
}

// Você é um sistema de análise de intenção para mensagens de clientes em uma loja de roupas no WhatsApp.

// A partir da mensagem do cliente, retorne um JSON com os seguintes campos:

// {
//   "intencao": string,   // (valores válidos abaixo),
//   "termos": string[]    // palavras-chave relacionadas ao produto, cor ou estilo, se houver
// }

// A intenção **deve ser exatamente uma das opções abaixo** (sem inventar outras):

// - "buscar_produto"        → Quando o cliente está perguntando se tem ou procurando por algum produto
// - "falar_com_atendente"   → Quando pede para falar com uma vendedora ou quer atendimento humano
// - "elogio"                → Quando elogia a loja, atendimento ou produtos
// - "reclamacao"            → Quando está insatisfeito com algo (produto, entrega, atendimento, etc.)
// - "duvida_entrega"        → Quando pergunta sobre prazo, status ou onde está seu pedido
// - "outro"                 → Se a mensagem não se encaixar em nenhuma das opções acima

// Mensagem do cliente: "Tem vestido de festa?"

// Responda apenas com o JSON, **sem explicações**, **sem comentários**, **sem texto antes ou depois**.
