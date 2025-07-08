import db from "../prisma/db.js";
import sqsInstance from "./sqs-instance.js";

export default async function sendRecommendation(req, res) {
  try {
    if (!req.body.rfvCategories.length) {
      return res.status(400).send({ message: "rfvCategories is not provided" });
    }

    const { totalContacts, totalProducts, currentStoreId, rfvCategories } =
      await handlerData(req.body);

    const recommendationDispatch = await db.recommendationDispatch.create({
      data: {
        totalContacts,
        totalProducts,
        storeId: currentStoreId,
        totalMessages: totalContacts,
        rfvCategories: rfvCategories,
      },
    });

    await sqsInstance.enqueue({
      ...req.body,
      recommendationDispatchId: recommendationDispatch.id,
    });

    return res.send({
      success: true,
      recommendationDispatchId: recommendationDispatch.id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Error to send message" });
  }
}

async function handlerData(body) {
  const { rfvCategories, currentStoreId, selectedClients } = body;

  if (selectedClients?.length) {
    console.log("clientes selecionados=>", selectedClients[0]);

    const initialValue = 0;
    const totalProducts = selectedClients.reduce(
      (accumulator, currentValue) => accumulator + currentValue.products.length,
      initialValue
    );

    const totalContacts = selectedClients.length;

    return {
      totalProducts,
      totalContacts,
      rfvCategories,
      currentStoreId,
    };
  } else {
    const clientsByCategory = await getClientsByRFVCategories(rfvCategories);

    console.log(
      `clientes selecionados por categoria ${rfvCategories}=>`,
      clientsByCategory
    );

    const totalContacts = clientsByCategory.length;

    const uniqueProductIds = new Set();
    clientsByCategory.forEach((client) => {
      const recommendedProducts =
        client.ClientRecommendation?.[0]?.recommendedProducts || [];

      recommendedProducts.forEach((product) => {
        uniqueProductIds.add(product.productId);
      });
    });
    const totalProducts = uniqueProductIds.size;

    console.log("totalProducts", totalProducts);

    return {
      totalProducts,
      totalContacts,
      rfvCategories,
      currentStoreId,
    };
  }
}

async function getClientsByRFVCategories(rfvCategories) {
  console.log(
    JSON.stringify({
      where: {
        rfvClassificationLabel: {
          in: rfvCategories,
        },
        active: true,
        ClientRecommendation: {
          some: {}, // <- pega apenas quem tem pelo menos um item no array
        },
      },
      select: {
        id: true,
        rfvClassificationLabel: true,
        ClientRecommendation: {
          orderBy: {
            processedAt: "desc",
          },
          take: 1,
          select: {
            recommendedProducts: true,
          },
        },
      },
    })
  );

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
    select: {
      id: true,
      rfvClassificationLabel: true,
      ClientRecommendation: {
        orderBy: {
          processedAt: "desc",
        },
        take: 1,
        select: {
          recommendedProducts: true,
        },
      },
    },
  });
}
