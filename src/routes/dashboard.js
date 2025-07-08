import { Router } from "express";
import { classifyCustomer } from "../calculate-rfv.js";
import { STORE_ID, timeZone, statusPT, CATEGORY_COLORS } from "../consts.js";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as dateFnsTz from "date-fns-tz";
import { formatBrazilianPhoneIntl } from "../utils/format-phone.js";
import db from "../../prisma/db.js";

const dashboardRoutes = new Router();

const user = {
  name: "Alessandro",
  email: "ale@gmail.com",
  photo: "https://xsgames.co/randomusers/assets/avatars/male/0.jpg",
};

const currentStore = {
  id: "682e7777e5e99eb035208e2f",
  name: "Loja 1",
  companyId: {
    $oid: "682e75f93eb24ffb61118d06",
  },
};

const adminPages = [
  "buttons",
  "tables",
  "charts",
  "forms",
  "cards",
  "forgot-password",
  "login",
  "blank",
  "register",
  "utilities-animation",
  "utilities-border",
  "utilities-color",
  "utilities-other",
  "404",
];

adminPages.forEach(async (page) => {
  dashboardRoutes.get(`/${page === "index" ? "" : page}`, async (req, res) => {
    res.render(`dashboard/${page}`, { user });
  });
});

dashboardRoutes.get("/", async (req, res) => {
  const draw = Number(req.query.draw) || 0;
  const start = Number(req.query.start) || 0;
  const length = Number(req.query.length) || 10;
  const search = req.query["search[value]"] || "";

  const revenue = await calculateGeneratedRevenue();

  const topClients = await db.client.findMany({
    where: {
      rfv: {
        isSet: true,
      },
    },
    orderBy: {
      rfv: {
        totalScore: "desc",
      },
    },
    take: 4,
    include: {
      Store: true, // Opcional: inclui a loja do cliente
    },
  });

  const topProducts = await db.$runCommandRaw({
    aggregate: "purchases",
    pipeline: [
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId", // ← productId é ObjectId
          totalQuantity: { $sum: { $toInt: "$items.quantity" } }, // Garante que a string numérica vira número
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 4 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $project: {
          _id: 0,
          productName: "$product.productName",
          totalQuantity: 1,
          sku: "$product.sku",
        },
      },
    ],
    cursor: {},
  });

  console.log("topProducts", topProducts.cursor.firstBatch);

  // console.time("total"); // tempo total da rota

  // console.time("clientsCount");
  const clientsCount = await db.client.count({
    where: { storeId: STORE_ID },
  });
  // console.timeEnd("clientsCount");

  // console.time("fetchRecommendations");

  const clientRecommendations = await getLatestRecsPerClient();

  // console.timeEnd("fetchRecommendations");

  // console.time("countMessages");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const recommendationsSendToday = await db.message.count({
    where: {
      storeId: STORE_ID,
      createdAt: {
        gte: startOfToday,
        lte: endOfToday,
      },
    },
  });
  // console.timeEnd("countMessages");

  // console.time("groupByMonth");
  const groupClientRecommendation = clientRecommendations.reduce((acc, rec) => {
    // 1) Converta processedAt para Date se for string/objeto:
    const dateValue = rec.processedAt.$date
      ? new Date(rec.processedAt.$date)
      : new Date(rec.processedAt);

    const month = format(dateValue, "LLLL", { locale: ptBR });

    // 2) Use clientId (ou rec._id) como identificador, se desejar
    const entry = { id: rec._id.$oid }; // ou rec.clientId.$oid

    acc[month] = acc[month] || [];
    acc[month].push(entry);
    return acc;
  }, {});

  // console.timeEnd("groupByMonth");

  // console.time("mapChartData");
  const dataForChartRecommendations = Object.entries(
    groupClientRecommendation
  ).map(([month, entries]) => ({
    month,
    count: entries.length,
  }));
  // console.timeEnd("mapChartData");

  // console.time("sumRecommendedProducts");
  const qtyRecommendedProducts = clientRecommendations.reduce(
    (total, doc) => total + (doc.recommendedProducts?.length || 0),
    0
  );
  // console.timeEnd("sumRecommendedProducts");

  const escapedSearch = search ? escapeRegex(search) : undefined;

  const whereClause = {
    storeId: STORE_ID,
    ...(escapedSearch && {
      OR: [
        { id: { contains: escapedSearch, mode: "insensitive" } },
        {
          Message: {
            some: {
              client: {
                name: { contains: escapedSearch, mode: "insensitive" },
              },
            },
          },
        },
        {
          Message: {
            some: {
              client: {
                phone: { contains: escapedSearch, mode: "insensitive" },
              },
            },
          },
        },
      ],
    }),
  };
  const dispatches = await db.recommendationDispatch.findMany({
    where: whereClause,
    orderBy: {
      createdAt: "desc",
    },
    skip: start,
    take: length,
    select: {
      id: true,
      createdAt: true,
      Message: {
        select: {
          status: true,
          recipientId: true,
          attrs: true,
          // products: {
          //   select: {
          //     id: true,
          //   },
          // },
        },
      },
    },
  });

  // Get all unique client IDs from messages
  const clientIds = [
    ...new Set(
      dispatches
        .flatMap((d) => d.Message.map((m) => m.recipientId))
        .filter(Boolean)
    ),
  ];

  // Fetch client details
  const clients = await db.client.findMany({
    where: {
      id: { in: clientIds },
    },
    select: {
      id: true,
      name: true,
      phone: true,
    },
  });

  // Create a map of client details for quick lookup
  const clientMap = clients.reduce((acc, client) => {
    acc[client.id] = client;
    return acc;
  }, {});

  // Formata os dados para a tabela
  const formattedDispatches = dispatches
    .map((dispatch) => {
      // Agrupa mensagens por cliente
      const messagesByClient = dispatch.Message.reduce((acc, message) => {
        const clientId = message.recipientId;
        if (!clientId) return acc;

        if (!acc[clientId]) {
          acc[clientId] = {
            client: clientMap[clientId] || {
              id: clientId,
              phone: message.attrs?.phone || "Unknown",
            },
            messages: [],
            products: new Set(),
          };
        }
        acc[clientId].messages.push(message);
        // message.products.forEach((p) => acc[clientId].products.add(p.id));
        return acc;
      }, {});

      // Converte para array e formata
      return Object.values(messagesByClient).map((clientData) => ({
        id: dispatch.id,
        client_name: clientData.client.name || "Unknown",
        client_phone: clientData.client.phone || "Unknown",
        status: clientData.messages.some((m) => m.status === "failed")
          ? "failed"
          : clientData.messages.every((m) => m.status === "sent")
          ? "completed"
          : "pending",
        created_at: dispatch.createdAt,
        contacts_count: clientData.messages.length,
        products_count: clientData.products.size,
      }));
    })
    .flat();

  // console.timeEnd("resolveMessageNames");

  // console.time("flattenRecommendations");
  const aggroupedClientRecommendations = [];
  clientRecommendations.forEach((item) => {
    aggroupedClientRecommendations.push(...item.recommendedProducts);
  });
  // console.timeEnd("flattenRecommendations");

  // console.time("buildCategoryChartData");
  // Define cores por categoria
  const getCategoryColors = (index) => ({
    color: CATEGORY_COLORS.primary[index % 15],
    hoverColor: CATEGORY_COLORS.hover[index % 15],
  });

  const dataChartEngagementByCategory = Object.entries(
    aggroupedClientRecommendations.reduce(
      (acc, { snapshot: { category } }, index) => {
        if (!acc[category]) {
          const colorIndex = Object.keys(acc).length;
          acc[category] = {
            count: 0,
            ...getCategoryColors(colorIndex),
          };
        }
        acc[category].count++;
        return acc;
      },
      {}
    )
  ).map(([category, { count, color, hoverColor }]) => ({
    category,
    count,
    color,
    hoverColor,
  }));
  // console.timeEnd("buildCategoryChartData");

  // console.timeEnd("total");

  res.render("dashboard/pages/index", {
    user,
    clientsCount,
    qtyRecommendedProducts,
    recommendationsSendToday,
    ratingResponse: 10,
    dataForChartRecommendations,
    dataChartEngagementByCategory,
    formattedDispatches,
    statusPT,
    revenue,
    topClients,
    topProducts: topProducts.cursor.firstBatch,
  });
});

dashboardRoutes.get("/rfv", async (req, res) => {
  res.render("dashboard/pages/rfv", { user });
});

dashboardRoutes.get("/products", async (req, res) => {
  const products = await db.product.findMany({
    where: { storeId: STORE_ID },
  });

  res.render("dashboard/pages/products", { products, user });
});

dashboardRoutes.get("/clients", async (req, res) => {
  res.render("dashboard/pages/clients", {
    user,
    formatBrazilianPhoneIntl,
  });
});

dashboardRoutes.get("/purchase-history", async (req, res) => {
  res.render("dashboard/pages/purchase-history", { user });
});

// dashboardRoutes.get("/recommendations", async (req, res) => {
//   const clientRecommendation = await db.clientRecommendation.findMany({
//     where: { storeId: STORE_ID },
//     include: {
//       Client: {
//         select: {
//           name: true,
//           phone: true,
//           active: true,
//         },
//       },
//     },
//     // select: {
//     //   id: true,
//     //   name: true,
//     //   phone: true,
//     //   purchaseHistory: true,
//     // },
//   });

//   res.render("dashboard/pages/recommendations", {
//     clientRecommendation,
//     user,
//     formatBrazilianPhoneIntl,
//   });
// });

dashboardRoutes.get("/send-recommendations", async (req, res) => {
  const selectedCategory = req.query.category;

  const clientRecommendation = await db.clientRecommendation.findMany({
    take: 5,
    where: {
      storeId: STORE_ID,
      Client: {
        rfvClassificationLabel: selectedCategory,
      },
    },
    include: {
      Client: {
        select: {
          rfvClassificationLabel: true,
          id: true,
          name: true,
          phone: true,
          active: true,
          rfv: true,
        },
      },
    },
    // select: {
    //   id: true,
    //   name: true,
    //   phone: true,
    //   purchaseHistory: true,
    // },
  });

  const clientsWithClassificationRFV = clientRecommendation.map((item) => {
    // console.log(item);

    return {
      id: item.id,
      storeId: item.storeId,
      clientId: item.clientId,
      recommendedProducts: item.recommendedProducts,
      processedAt: item.processedAt,
      Client: {
        id: item.Client.id,
        name: item.Client.name,
        phone: item.Client.phone,
        active: item.Client.active,
        rfvClassificationLabel: item.Client.rfvClassificationLabel,
        rfv: {
          recency: item.Client.rfv.recency,
          frequency: item.Client.rfv.frequency,
          value: item.Client.rfv.value,
          rScore: item.Client.rfv.rScore,
          fScore: item.Client.rfv.fScore,
          vScore: item.Client.rfv.vScore,
          totalScore: item.Client.rfv.totalScore,
          calculatedAt: item.Client.rfv.calculatedAt,
          classificationLabel: classifyCustomer(
            item.Client.rfv.rScore,
            item.Client.rfv.fScore,
            item.Client.rfv.vScore,
            item.Client.rfv.totalScore
          ),
        },
      },
    };
  });

  const templatesFromNode = {
    professional:
      "Olá {{nome}},\nTudo bem? Gostaríamos de compartilhar uma novidade que pode ser interessante para você. Estamos à disposição para qualquer dúvida.\n\nAtenciosamente,\nEquipe {{loja}}",
    friendly:
      "Oi {{nome}}! 😊\nEstamos super felizes em entrar em contato com você! Temos uma novidade que vai te deixar animado(a). Se quiser saber mais, é só responder esta mensagem!\n\nAbraços,\nTime {{loja}}",
    exclusive:
      "Olá {{nome}}! 👋\n\nFicamos muito felizes com sua compra recente em nossa loja! Como você é um cliente especial, selecionamos alguns produtos que combinam perfeitamente com seu estilo:\n\n🎽 {{produto1}} - Conforto e estilo para seu dia a dia\n👕 {{produto2}} - Conforto e estilo para você\n\nAproveite agora mesmo!",
    direct_offer:
      "Oferta imperdível para você, {{nome}}!\nSó hoje: 50% de desconto no produto [X]! Não deixe passar esta chance. Corra, a promoção termina à meia-noite!\n\nCompre agora: [link]",
    solution_benefit:
      "Descubra como nosso produto pode mudar sua vida, {{nome}}.\nCom [Produto], você ganha mais tempo, economiza dinheiro e simplifica suas tarefas diárias. Experimente hoje mesmo!\n\nSaiba mais: [link]",
    elegant:
      "Prezado {{nome}},\nÉ uma honra apresentar nossa nova coleção [Nome], cuidadosamente elaborada para clientes refinados como você. Agende uma apresentação exclusiva.\n\nCordialmente,\n{{loja}}",
    fun: "E aí {{nome}}! 🎉 Vamos animar seu dia com uma super notícia! Você acaba de ganhar um cupom de 30% OFF pra usar hoje! Bora aproveitar? 😍\n\n[link]",
  };

  const labels = {
    professional: "Padrão Profissional – Tom neutro, educado e direto",
    friendly: "Amigável – Mais humanizado, próximo e leve",
    exclusive:
      "Exclusivo – Gera senso de pertencimento e valor (ideal para clientes RFV 'Campeões')",
    direct_offer:
      "Oferta Direta – Foco na conversão rápida com senso de urgência",
    solution_benefit:
      "Solução e Benefício – Destaca o valor do produto na vida do cliente",
    elegant:
      "Sofisticado e Elegante – Linguagem mais refinada, boa para marcas premium",
    fun: "Divertido e Descontraído – Leve, com emojis e tom mais jovem",
  };

  res.render("dashboard/pages/send-recommendations", {
    clientRecommendation: clientsWithClassificationRFV,
    user,
    formatBrazilianPhoneIntl,
    selectedCategory,
    selectedTemplate: "professional",
    templatesFromNode,
    labels,
    currentStore,
  });
});

dashboardRoutes.get("/recommendation-dispatches", async (req, res) => {
  res.render("dashboard/pages/recommendation-dispatches", { user });
});

dashboardRoutes.get("/recommendation-dispatches/:id", async (req, res) => {
  try {
    const recommendationDispatch = await db.recommendationDispatch.findUnique({
      where: { id: req.params.id },
    });

    const data = {
      messagesSent: recommendationDispatch?.totalMessages || 0,
      messagesSentSuccessfully: recommendationDispatch?.messageSentCount || 0,
      errorMessages: recommendationDispatch?.messageFailedCount || 0,
      pendingMessages: recommendationDispatch?.messagePendingCount || 0,
      totalContacts: recommendationDispatch?.totalContacts || 0,
      totalProducts: recommendationDispatch?.totalProducts || 0,
      progress:
        recommendationDispatch?.messageSentCount /
        recommendationDispatch?.totalMessages,
    };

    res.render("dashboard/pages/recommendation-dispatches-details", {
      ...data,
      recommendationDispatchId: req.params.id,
      user,
    });
  } catch (error) {
    console.error("Error fetching recommendation dispatch:", error);
    res.status(500).render("dashboard/pages/error", {
      message: "Erro ao buscar detalhes do envio",
      error: { status: 500 },
      user,
    });
  }
});

async function getLatestRecsPerClient() {
  // 1) Defina seu pipeline do Mongo
  const pipeline = [
    { $match: { storeId: { $oid: STORE_ID } } },
    { $sort: { clientId: 1, processedAt: -1 } },
    {
      $group: {
        _id: "$clientId",
        doc: { $first: "$$ROOT" },
      },
    },
    {
      $replaceRoot: { newRoot: "$doc" },
    },
    {
      $project: {
        clientId: 1,
        processedAt: 1,
        recommendedProducts: {
          $map: {
            input: "$recommendedProducts",
            as: "prod",
            in: {
              snapshot: {
                category: "$$prod.snapshot.category",
              },
            },
          },
        },
      },
    },
  ];

  // 2) Execute o comando raw no Mongo
  const rawResult = await db.$runCommandRaw({
    aggregate: "client_recommendations",
    pipeline,
    cursor: {},
  });

  // 3) O resultado vem em `cursor.firstBatch`
  const latestRecs = rawResult.cursor.firstBatch;

  return latestRecs;
}

export default dashboardRoutes;

async function calculateGeneratedRevenue() {
  const recommendations = await db.clientRecommendation.findMany({
    include: {
      Client: {
        include: {
          Purchase: true,
        },
      },
    },
    where: {
      storeId: STORE_ID,
    },
  });

  let totalRevenue = 0;

  for (const rec of recommendations) {
    const recommendedProductIds = rec.recommendedProducts.map(
      (p) => p.productId
    );

    for (const purchase of rec.Client.Purchase) {
      // console.log("compra de um cliente", new Date(purchase.purchaseDate));
      // console.log("data de reomcendacao", new Date(rec.processedAt));

      // console.log(
      //   "data de compra é menor que a data de recomendação entao continua",
      //   new Date(purchase.purchaseDate) <= new Date(rec.processedAt)
      // );
      if (new Date(purchase.purchaseDate) <= new Date(rec.processedAt))
        continue;

      console.log("passou do if");
      console.log("purchase.items", purchase.items);
      console.log("recommendedProductIds", recommendedProductIds);

      for (const item of purchase.items) {
        const itemProductId = item.productId;
        // console.log(recommendedProductIds[0].$oid);
        // console.log(itemProductId);
        if (recommendedProductIds.some((id) => id.$oid === itemProductId)) {
          totalRevenue += item.price * item.quantity;
        }
      }
    }
  }

  return totalRevenue;
}
