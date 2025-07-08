import processMessage from "./process-message.js";

export async function processWebhook(message) {
  const body = JSON.parse(message.jsonData);
  // console.log("Webhook recebido body:", body);

  const { event, type } = body;

  const phone = extractPhoneNumber(event?.Chat || event.Info.Chat);

  const client = await checkExistClient(phone);

  if (client && Object.keys(client).length === 0)
    console.log(
      `Cliente com telefone ${phone} não encontrado na base de dados.`
    );

  if (type === "Message" && event.Message?.protocolMessage?.type === 0) {
    console.log("Type message is deleted then ignore");
  } else if (type === "Message" && event.Info?.Type !== "reaction") {
    await processMessage(event, phone, client);
  } else {
    console.log("Type message is reaction then ignore");
  }
}

function extractPhoneNumber(chat) {
  const phoneWithSuffix = chat; // Ex: "559999999999@s.whatsapp.net"

  // Remove o sufixo do domínio e pega só o número
  const telefone = phoneWithSuffix?.split("@")[0];

  return telefone;
}

async function checkExistClient(phone) {
  console.log("buscar por telfone", phone, insertNineIfNeeded(phone));

  return await db.client.findFirst({
    where: {
      active: true,
      OR: [{ phone }, { phone: insertNineIfNeeded(phone) }],
    },
  });
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, "");
}

function insertNineIfNeeded(phone) {
  const onlyNumbers = normalizePhone(phone);

  if (onlyNumbers.length === 12) {
    // Exemplo: 559999999999
    // DDD = 55
    // resto = 6792696705
    const ddd = onlyNumbers.slice(0, 4);
    const rest = onlyNumbers.slice(4);

    // Insere o 9 depois do DDD
    const modified = ddd + "9" + rest;
    return modified;
  }

  // Se não tiver 12 dígitos, retorna o telefone normalizado
  return onlyNumbers;
}
