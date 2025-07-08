import sendPromptToLlama from "../providers/ollama.js";

/**
 * Esta funcao é responsavel por verificar atravez de uma mensagem recebida do cliente se o mesmo deseja falar com atendente ou nao
 * @param {*} mensagem
 * @param {*} dataForPrompt
 * @returns {boolean}
 */
export default async function speakToAttendant(message, dataForPrompt) {
  const prompt = `
Classifique a mensagem abaixo para saber se o cliente deseja necessariamente falar com um atendente humano ou se é uma solicitação que pode ser tratada por um assistente virtual.

Responda "SIM" se:
  - Nunca responda "SIM" se na mensagem conter a palavra foto.
  - O cliente pede explicitamente para falar com um humano.
  - Há frustração, confusão ou reclamação que o assistente não pode resolver com base nos dados.
  - A solicitação envolve um produto ou informação que não aparece no estoque abaixo.

Importante:
  - Você pode usar as informações do estoque abaixo para decidir se o assistente é capaz de responder à mensagem.
  - Verifique se o produto solicitado está presente no estoque.
  - Se estiver presente ou tiver imagem, responda "NÃO".

Histórico de Vendas: ${
    dataForPrompt.historicoFormatado || "Nenhuma compra recente"
  }
Data e horario atual para caso em algum momento seja necessario: ${
    dataForPrompt.dateWithTZ
  }

Produtos disponíveis:
${dataForPrompt.estoqueJSON}

Mensagem: "${message}"

Responda apenas com "SIM" ou "NÃO".
`;
  console.log("start sendPromptToLlama", prompt);

  const response = await sendPromptToLlama(prompt);

  console.log("response from speakToAttendant", response);

  const formatResponse = response.trim().toUpperCase();

  return formatResponse.includes("SIM");
}
