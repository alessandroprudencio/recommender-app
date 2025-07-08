import enqueueWebhook from "../wpp-webhooks/enqueue-webhook.js";
import { Router } from "express";
// import calculateRfv from "../calculate-rfv.js";
import sendRecommendation from "../send-recommendation.js";
import { STORE_ID } from "../consts.js";
import { formatBrazilianPhoneIntl } from "../utils/format-phone.js";
import db from "../../prisma/db.js";
import { orderTable } from "../utils/order-table.js";

const router = new Router();

router.get("/", (req, res) => {
  res.send("API de Atendimento Virtual");
});

router.post("/webhook", enqueueWebhook);
// router.get("/calculate-rfv", calculateRfv);
router.post("/send-recommendation", sendRecommendation);
router.get("/clients", async (req, res) => {
  const draw = Number(req.query.draw) || 0;
  const start = Number(req.query.start) || 0;
  const length = Number(req.query.length) || 10;
  const search = req.query["search[value]"] || "";
  const escapedSearch = search ? escapeRegex(search) : undefined;

  // Filtro
  const where = {
    storeId: STORE_ID,
    OR: search
      ? [
          { name: { contains: escapedSearch, mode: "insensitive" } },
          { phone: { contains: escapedSearch } },
        ]
      : undefined,
  };

  // Total sem filtro
  const recordsTotal = await db.client.count({
    where: { storeId: STORE_ID },
  });

  // Total com filtro
  const recordsFiltered = await db.client.count({ where });

  // ordernar tabela
  const columnsMap = {
    0: "name",
    1: "phone",
    2: "active",
    // 4 é produtos, ignorar
  };
  const orderBy = orderTable(req, columnsMap, { name: "asc" });
  // ordernar tabela

  // console.log(orderBy);
  // Dados paginados
  const clients = await db.client.findMany({
    where,
    skip: start,
    take: length,
    orderBy,
    select: {
      name: true,
      phone: true,
      active: true,
    },
  });

  const data = clients.map((client) => ({
    name: client.name,
    phone: formatBrazilianPhoneIntl(client.phone),
    active: client.active ? "Sim" : "Não",
  }));

  res.json({
    draw,
    recordsTotal,
    recordsFiltered,
    data,
  });
});

router.get(
  "/recommendation-dispatches/:id/messages-status",
  async (req, res) => {
    const draw = Number(req.query.draw) || 0;
    const start = Number(req.query.start) || 0;
    const length = Number(req.query.length) || 10;
    const search = req.query["search[value]"] || "";
    const escapedSearch = search ? escapeRegex(search) : undefined;

    // Buscar as mensagens do recommendation dispatch
    const messages = await db.message.findMany({
      where: {
        recommendationDispatchId: req.params.id,
        ...(escapedSearch && {
          OR: [
            { message: { contains: escapedSearch, mode: "insensitive" } },
            { attrs: { path: ["phone"], string_contains: escapedSearch } },
          ],
        }),
      },
      skip: start,
      take: length,
      orderBy: {
        createdAt: "desc",
      },
    });

    // Total de mensagens sem filtro
    const recordsTotal = await db.message.count({
      where: {
        recommendationDispatchId: req.params.id,
      },
    });

    // Total de mensagens com filtro
    const recordsFiltered = await db.message.count({
      where: {
        recommendationDispatchId: req.params.id,
        ...(escapedSearch && {
          OR: [
            { message: { contains: escapedSearch, mode: "insensitive" } },
            { attrs: { path: ["phone"], string_contains: escapedSearch } },
          ],
        }),
      },
    });

    // Buscar os clientes relacionados às mensagens
    const clientIds = messages
      .filter((m) => m.recipientId)
      .map((m) => m.recipientId);

    const clients = await db.client.findMany({
      where: {
        id: { in: clientIds },
      },
      select: {
        id: true,
        name: true,
        phone: true,
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

    // Criar um mapa de clientes para fácil acesso
    const clientMap = clients.reduce((acc, client) => {
      acc[client.id] = client;
      return acc;
    }, {});

    const data = messages.map((message) => {
      const client = message.recipientId
        ? clientMap[message.recipientId]
        : null;
      const recommendedProducts =
        client?.ClientRecommendation?.[0]?.recommendedProducts || [];

      return {
        name: client?.name || "Cliente não encontrado",
        phone: formatBrazilianPhoneIntl(message.attrs?.phone || ""),
        message: message.message,
        status: message.status,
        createdAt: message.createdAt,
        products: recommendedProducts.map((p) => ({
          name: p.snapshot?.productName || p.productName || "Produto sem nome",
          category: p.snapshot?.category || p.category || "Sem categoria",
        })),
      };
    });

    res.json({
      draw,
      recordsTotal,
      recordsFiltered,
      data,
    });
  }
);

router.get("/rfv", async (req, res) => {
  const draw = parseInt(req.query.draw) || 0;
  const start = parseInt(req.query.start) || 0;
  const length = parseInt(req.query.length) || 10;
  const search = req.query["search[value]"] || "";
  const escapedSearch = search ? escapeRegex(search) : undefined;

  // ordernar tabela
  const columnsMap = {
    0: "name",
    1: "rfvClassificationLabel",
    2: "rfv.recency",
    3: "rfv.frequency",
    4: "rfv.value",
  };
  const orderBy = orderTable(req, columnsMap, { createdAt: "desc" });
  // ordernar tabela

  // console.log("orderBy=>", orderBy);

  const [data, totalRecords] = await Promise.all([
    db.client.findMany({
      skip: start,
      take: length,
      where: {
        storeId: STORE_ID,
        ...(escapedSearch && {
          OR: [
            { name: { contains: escapedSearch, mode: "insensitive" } },
            { phone: { contains: escapedSearch, mode: "insensitive" } },
          ],
        }),
      },
      orderBy,
    }),
    db.client.count({
      where: { storeId: STORE_ID },
    }),
  ]);

  // Mapeia os dados para o formato que a tabela espera
  const formatted = data.map((client) => ({
    name: client.name,
    classificationLabel: client.rfvClassificationLabel,
    recency: client.rfv?.recency ?? 0,
    frequency: client.rfv?.frequency ?? 0,
    value: client.rfv?.value ?? 0,
    score: client.rfv?.totalScore ?? 0,
  }));

  res.json({
    draw,
    recordsTotal: totalRecords,
    recordsFiltered: totalRecords,
    data: formatted,
  });
});
router.get("/purchase-history", async (req, res) => {
  const draw = Number(req.query.draw) || 0;
  const start = Number(req.query.start) || 0;
  const length = Number(req.query.length) || 10;
  const search = req.query["search[value]"] || "";

  // 1. Buscar os IDs dos clientes que batem com o filtro (se houver)
  let matchingClientIds = undefined;

  if (search) {
    const matchingClients = await db.client.findMany({
      where: {
        storeId: STORE_ID,
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
        ],
      },
      select: { id: true },
    });

    matchingClientIds = matchingClients.map((c) => c.id.toString());
  }

  // 2. Criar o filtro de compras
  const purchaseWhere = {
    storeId: STORE_ID,
    ...(matchingClientIds ? { clientId: { in: matchingClientIds } } : {}),
  };

  // 3. Totais
  const [recordsTotal, recordsFiltered, purchases] = await Promise.all([
    db.purchase.count({ where: { storeId: STORE_ID } }),
    db.purchase.count({ where: purchaseWhere }),
    db.purchase.findMany({
      where: purchaseWhere,
      skip: start,
      take: length,
    }),
  ]);

  // 4. Buscar os clientes dessas compras (somente os usados)
  const clientIdsInPage = [
    ...new Set(purchases.map((p) => p.clientId.toString())),
  ];

  const clients = await db.client.findMany({
    where: { id: { in: clientIdsInPage } },
    select: { id: true, name: true, phone: true, active: true },
  });

  const clientMap = new Map(clients.map((c) => [c.id.toString(), c]));

  // 5. Montar resposta
  const data = purchases.map((p) => {
    const client = clientMap.get(p.clientId.toString());
    return {
      externalId: p.externalId,
      purchaseDate: p.purchaseDate,
      clientName: client?.name || "Cliente não encontrado",
      phone: formatBrazilianPhoneIntl(client?.phone),
      clientActive: client?.active ? "Sim" : "Não",
      items: p.items,
    };
  });

  res.json({
    draw,
    recordsTotal,
    recordsFiltered,
    data,
  });
});

router.get("/recommendations", async (req, res) => {
  const draw = Number(req.query.draw) || 0;
  const start = Number(req.query.start) || 0;
  const length = Number(req.query.length) || 10;
  const search = req.query["search[value]"] || "";
  const escapedSearch = search ? escapeRegex(search) : undefined;
  const rfvCategories = req.query.rfvCategories;

  // ordernar tabela
  const columnsMap = {
    0: "Client.name",
    1: "Client.rfvClassificationLabel",
    2: "Client.phone",
    3: "Client.active",
    // 4 é produtos, ignorar
  };
  const orderBy = orderTable(req, columnsMap);
  // ordernar tabela

  const whereClient = {
    storeId: STORE_ID,
    Client: {
      ...(rfvCategories && {
        rfvClassificationLabel: { in: rfvCategories },
      }),
      ...(escapedSearch && {
        OR: [
          { name: { contains: escapedSearch, mode: "insensitive" } },
          { phone: { contains: escapedSearch, mode: "insensitive" } },
        ],
      }),
    },
  };

  const [total, totalFiltered] = await Promise.all([
    db.clientRecommendation.count({
      where: { storeId: STORE_ID },
    }),
    db.clientRecommendation.count({
      where: whereClient,
    }),
  ]);

  const clientRecommendation = await db.clientRecommendation.findMany({
    where: whereClient,
    include: {
      Client: {
        select: {
          id: true,
          name: true,
          phone: true,
          active: true,
          rfvClassificationLabel: true,
          rfv: {
            select: {
              totalScore: true,
            },
          },
        },
      },
    },
    skip: start,
    take: length,
    orderBy,
    distinct: ["clientId"],
  });

  const data = clientRecommendation.map((rec) => ({
    clientId: rec.Client.id,
    name: rec.Client.name,
    rfvClassificationLabel: rec.Client.rfvClassificationLabel,
    phone: formatBrazilianPhoneIntl(rec.Client.phone),
    active: rec.Client.active ? "Sim" : "Não",
    products: rec.recommendedProducts,
    rfvTotalScore: rec.Client.rfv.totalScore,
  }));

  res.json({
    draw,
    recordsTotal: total,
    recordsFiltered: totalFiltered,
    data,
  });
});
// router.get("/send-recommendations", async (req, res) => {
//   const rfvCategories = req.query.category;

//   const whereClause = {
//     storeId: STORE_ID,
//     ...(rfvCategories
//       ? { Client: { rfvClassificationLabel: rfvCategories } }
//       : {}),
//   };

//   const clientRecommendation = await db.clientRecommendation.findMany({
//     take: 5,
//     where: whereClause,
//     include: {
//       Client: {
//         select: {
//           rfvClassificationLabel: true,
//           id: true,
//           name: true,
//           phone: true,
//           active: true,
//           rfv: true,
//         },
//       },
//     },
//   });

//   const clientsWithClassificationRFV = clientRecommendation.map((item) => ({
//     id: item.id,
//     storeId: item.storeId,
//     clientId: item.clientId,
//     recommendedProducts: item.recommendedProducts,
//     processedAt: item.processedAt,
//     Client: {
//       id: item.Client.id,
//       name: item.Client.name,
//       phone: item.Client.phone,
//       active: item.Client.active,
//       rfvClassificationLabel: item.Client.rfvClassificationLabel,
//       rfv: {
//         recency: item.Client.rfv.recency,
//         frequency: item.Client.rfv.frequency,
//         value: item.Client.rfv.value,
//         rScore: item.Client.rfv.rScore,
//         fScore: item.Client.rfv.fScore,
//         vScore: item.Client.rfv.vScore,
//         totalScore: item.Client.rfv.totalScore,
//         calculatedAt: item.Client.rfv.calculatedAt,
//         rfvClassificationLabel: classifyCustomer(
//           item.Client.rfv.rScore,
//           item.Client.rfv.fScore,
//           item.Client.rfv.vScore,
//           item.Client.rfv.totalScore
//         ),
//       },
//     },
//   }));

//   const templatesFromNode = {
//     professional: "...",
//     friendly: "...",
//     exclusive: "...",
//     direct_offer: "...",
//     solution_benefit: "...",
//     elegant: "...",
//     fun: "...",
//   };

//   const labels = {
//     professional: "...",
//     friendly: "...",
//     exclusive: "...",
//     direct_offer: "...",
//     solution_benefit: "...",
//     elegant: "...",
//     fun: "...",
//   };

//   res.json({ clientsWithClassificationRFV, templatesFromNode, labels });
// });

router.get("/dispatches-recommendation", async (req, res) => {
  try {
    const storeId = STORE_ID;
    const draw = Number(req.query.draw) || 0;
    const start = Number(req.query.start) || 0;
    const length = Number(req.query.length) || 10;
    const search = req.query["search[value]"] || "";
    const escapedSearch = search ? escapeRegex(search) : undefined;

    const whereClause = {
      storeId: storeId,
      ...(escapedSearch && {
        OR: [{ id: { contains: escapedSearch, mode: "insensitive" } }],
      }),
    };

    // Get total count without filters
    const recordsTotal = await db.recommendationDispatch.count({
      where: { storeId: storeId },
    });

    // Get filtered count
    const recordsFiltered = await db.recommendationDispatch.count({
      where: whereClause,
    });

    const dispatches = await db.recommendationDispatch.findMany({
      where: whereClause,
      orderBy: {
        createdAt: "desc",
      },
      skip: start,
      take: length,
      select: {
        id: true,
        storeId: true,
        totalMessages: true,
        messageSentCount: true,
        messageFailedCount: true,
        messagePendingCount: true,
        createdAt: true,
        updatedAt: true,
        Message: {
          select: {
            status: true,
          },
        },
      },
    });

    // Formata os dados para a tabela
    const formattedDispatches = dispatches.map((dispatch) => {
      // Calculate status counts from messages
      const statusCounts = dispatch.Message.reduce((acc, message) => {
        acc[message.status] = (acc[message.status] || 0) + 1;
        return acc;
      }, {});

      // Determine overall status
      let status = "pending";
      if (dispatch.messageSentCount === dispatch.totalMessages) {
        status = "completed";
      } else if (dispatch.messageFailedCount > 0) {
        status = "failed";
      }

      return {
        id: dispatch.id,
        total_dispatches: dispatch.totalMessages,
        last_dispatch_date: dispatch.createdAt,
        status: status,
        message_status: {
          sent: statusCounts.sent || 0,
          failed: statusCounts.failed || 0,
          pending: statusCounts.pending || 0,
        },
      };
    });

    res.json({
      draw: draw,
      recordsTotal: recordsTotal,
      recordsFiltered: recordsFiltered,
      data: formattedDispatches,
    });
  } catch (error) {
    console.error("Error fetching recommendation dispatches:", error);
    res.status(500).json({ error: "Erro ao buscar envios de recomendações" });
  }
});

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default router;
