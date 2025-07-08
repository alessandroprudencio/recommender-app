import sendPromptToLlama from "../providers/ollama.js";
import checkWantsReceivePhoto from "../chat-bot/receive-photo.js";
import speakToAttendant from "../chat-bot/speak-attendant.js";
import { sendImage, sendText } from "../providers/w-api.js";
import https from "https";
import { detectIntention } from "../chat-bot/detect-intention.js";
import generatePromptByIntention from "../chat-bot/generate-prompt-by-intention.js";

const MAX_HISTORY = 5;

export default async function processMessage(event, phone, clientDataset) {
  const message = event.Message.conversation;
  const username = event.Info.PushName;

  console.info("Starting processMessage...");

  console.log("mensagem do cliente", message);

  const storeName = "Cristina Confecções";

  const dataForPrompt = await getDataForPrompt(
    clientDataset,
    storeName,
    username,
    phone
  );

  if (await speakToAttendant(message, dataForPrompt)) {
    console.log("Speak to Attendant because message is", message);

    await sendText({
      Phone: phone,
      Body: "Oi! 😊 Já te coloco em contato com uma de nossas vendedoras, tá bom? Só um instante e ela já te atende por aqui 💁‍♀️✨",
    });
  } else {
    console.log(
      `Cliente`,
      username,
      "mandou a seguinte mensagem:",
      message,
      "do telefone",
      phone
    );

    const reply = await findReplyWithIA(
      message,
      username,
      phone,
      dataForPrompt
    );

    // add to history message
    if (reply) {
      global.conversasPorCliente[phone].push({
        role: "assistant",
        content: reply,
      });
    }

    await sendText({
      Phone: phone,
      Body: reply,
    });
  }
  console.info("Finished generate response with IA.....");
}

async function findReplyWithIA(message, username, phone, dataForPrompt) {
  if (!global.conversasPorCliente[phone]) {
    global.conversasPorCliente[phone] = [];
  }

  // console.log(
  //   "add mensagem ao historico desse cliente",
  //   global.conversasPorCliente[phone]
  // );

  // Adiciona a mensagem do cliente ao histórico
  global.conversasPorCliente[phone].push({
    role: "user",
    content: message,
  });

  const { estoqueJSON, stock } = dataForPrompt;

  const receivePhotoData = await checkWantsReceivePhoto(message, stock);

  if (receivePhotoData.isReceived) {
    console.log("Cliente solicitou fotos", receivePhotoData);

    if (!receivePhotoData?.products.length) {
      console.log(
        "Cliente solicitou foto mas o metodo receivPhoto nao encontrou nenhuma"
      );
    }

    const dataToSend = receivePhotoData.products.map(
      async (product) =>
        await sendImage({
          Phone: phone,
          Image: await imageToBase64(product.imageUrl),
          // Caption: "",
          // Id: String(new Date().getTime()),
        })
    );

    await Promise.all(dataToSend);
  }

  const intention = await detectIntention(message);

  let prompt;

  try {
    prompt = await generatePromptByIntention({
      intencao: intention.intencao,
      termos: intention.termos,
      message,
      username,
      estoqueJSON,
    });
    console.log("result prompt:", prompt);
  } catch (error) {
    console.log(
      "não tem produto no estoque entao retorna prompt fixo",
      error.message
    );
    return error.message;
  }

  try {
    const reply = await sendPromptToLlama(prompt);

    console.log("reply from IA is", reply);

    return reply;
  } catch (error) {
    console.error("Erro ao consultar o modelo de linguagem:", error);
    throw new error("Erro ao consultar o modelo de linguagem.");
  }
}

export async function getDataForPrompt(clientDataset, phone) {
  console.log(
    "[getDataForPrompt] global.conversasPorCliente",
    global.conversasPorCliente
  );

  const historicoFormatado =
    clientDataset?.purchaseHistory
      ?.map(
        (item) =>
          `${item.productName} - (${item.quantity} unid.) - forma de pagamento: ${item.paymentMethod} - data da compra ${item.purchaseDate}`
      )
      .join(", ") ?? "";

  const stock = await db.product.findMany();

  // console.log("stock", stock);

  const estoqueJSON = JSON.stringify(
    stock
      .filter((item) => item.stockQuantity > 0)
      .map(
        (item) =>
          `nome do produto: ${item.productName}, preco: ${item.price}, quantidade em estoque: ${item.stockQuantity}, cor: ${item.color}, tipo: ${item.productType}, Url da Imagem: ${item.imageUrl}`
      ),
    null,
    2
  );

  const historicoMensagens = global.conversasPorCliente[phone]
    ?.slice(-MAX_HISTORY)
    .map((msg) => {
      return `${msg.role === "user" ? "Cliente" : "Assistente"}: ${
        msg.content
      }`;
    })
    .join("\n");

  const date = new Date();
  const dateWithTZ = date.toLocaleString("pt-BR", {
    timeZoneName: "longOffset",
    timeZone: "America/Sao_Paulo",
  });

  return {
    historicoFormatado,
    estoqueJSON,
    stock,
    historicoMensagens,
    dateWithTZ,
  };
}

async function imageToBase64(imageUrl) {
  try {
    const response = await new Promise((resolve, reject) => {
      https
        .get(imageUrl, (res) => {
          if (res.statusCode !== 200) {
            reject(
              new Error(`Failed to fetch image: Status code ${res.statusCode}`)
            );
            return;
          }
          const data = [];
          res.on("data", (chunk) => data.push(chunk));
          res.on("end", () => resolve(Buffer.concat(data)));
          res.on("error", reject);
        })
        .on("error", reject);
    });
    const base64String = response.toString("base64");

    const contentType =
      response.headers && response.headers["content-type"]
        ? response.headers["content-type"]
        : "image/jpeg";

    return `data:${contentType};base64,${base64String}`;
  } catch (error) {
    console.error("Error converting image to base64:", error);
    throw error;
  }
}
