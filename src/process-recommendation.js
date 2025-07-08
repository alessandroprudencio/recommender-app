import db from "../prisma/db.js";
import { sendTextRecommendation } from "./providers/w-api.js";
const storeName = "Cristina Confecções";
const assistantName = "Cristi";

export default async function processRecommendation(message) {
  const {
    message: messageTemplate,
    selectedClients,
    rfvCategories,
    recommendationDispatchId,
  } = message;

  let clientsToSend = [];

  if (selectedClients && selectedClients.length > 0) {
    // ✅ Cenário 1: Clientes selecionados manualmente
    clientsToSend = selectedClients;
  } else if (rfvCategories) {
    // ✅ Cenário 2: Filtrar clientes por categoria RFV
    const clients = await getClientsByRFVCategories(rfvCategories);

    // Reformatar clientes para ter o mesmo formato de selectedClients
    clientsToSend = clients.map((client) => {
      const recommendation = client.ClientRecommendation[0];
      const products = Array.isArray(recommendation?.recommendedProducts)
        ? recommendation.recommendedProducts
        : [];

      return {
        clientId: client.id,
        products: products.map((p) => ({
          snapshot: p.snapshot, // já inclui tudo que você precisa
        })),
      };
    });
  } else {
    return res.status(400).send({
      error: "É necessário informar selectedClients ou rfvCategories.",
    });
  }

  for await (const selectedClient of clientsToSend) {
    try {
      const client = await db.client.findUnique({
        where: { id: selectedClient.clientId },
      });

      if (!client || !client.active) {
        console.log(
          "Cliente inativo ou não encontrado:",
          selectedClient.clientId
        );
        continue;
      }

      let products;

      // 🔄 Fluxo 1: selectedClients com productId (precisa buscar no banco)
      if (selectedClient.products?.[0]?.productId) {
        products = await Promise.all(
          selectedClient.products.map(async (p) => {
            const product = await db.product.findUnique({
              where: { id: p.productId },
              select: { productName: true, collection: true, category: true },
            });

            if (!product) {
              throw new Error(`Produto não encontrado: ${p.productId}`);
            }

            return {
              productName: product.productName,
              product: {
                collection: product.collection,
                category: product.category,
              },
            };
          })
        );
      }
      // 🔄 Fluxo 2: produtos já vêm com snapshot (via rfvCategories)
      else {
        products = selectedClient.products.map((p) => ({
          productName: p.snapshot.productName,
          product: {
            collection: p.snapshot.collection,
            category: p.snapshot.category,
          },
        }));
      }

      const reply = buildMessage({
        recommendedProducts: products,
        storeName,
        username: client.name,
        assistantName,
        messageTemplate,
      });

      await sendTextRecommendation(
        {
          Phone: client.phone,
          Body: reply,
        },
        client,
        recommendationDispatchId
      );
    } catch (error) {
      console.error(
        "Erro ao processar cliente:",
        selectedClient.clientId,
        error
      );
    }
  }

  return { success: true };
}

async function getClientsByRFVCategories(rfvCategories) {
  return await db.client.findMany({
    where: {
      rfvClassificationLabel: {
        in: rfvCategories,
      },
      active: true,
      ClientRecommendation: {
        some: {}, // <- pega apenas quem tem pelo menos um item no array
      },
    },
    include: {
      ClientRecommendation: {
        orderBy: { processedAt: "desc" },
        take: 1,
      },
    },
  });
}

function buildMessage({
  recommendedProducts,
  storeName,
  username,
  assistantName,
  messageTemplate,
}) {
  let processedMessage = messageTemplate;

  recommendedProducts.forEach((item, index) => {
    const productNumber = index + 1;
    const productText = `✨ ${item.productName} - da coleção ${
      item.product.collection
    } - estilo ${item.product.category.toLowerCase()}`;
    processedMessage = processedMessage.replace(
      new RegExp(`{{produto${productNumber}}}`, "g"),
      productText
    );
  });

  return processedMessage
    .replace(/{{nome}}/g, username)
    .replace(/{{storeName}}/g, storeName)
    .replace(/{{assistantName}}/g, assistantName)
    .replace(/{{loja}}/g, storeName);
}
