// import { PrismaClient } from "@prisma/client";
// const prisma = new PrismaClient();

// const BATCH_SIZE = 1000;

// export default async function calculateRfv(req, res) {
//   try {
//     console.log("start calculate RFV");

//     let skip = 0;
//     let totalProcessed = 0;

//     while (true) {
//       const clients = await prisma.client.findMany({
//         skip,
//         take: BATCH_SIZE,
//       });

//       if (clients.length === 0) break;

//       console.log(
//         `Processando lote de ${clients.length} clientes (offset ${skip})`
//       );

//       const clientsWithRfv = determineRFV(clients);

//       const updatePromises = clientsWithRfv.map(async (client) => {
//         const rfvData = {
//           recency: client.recency,
//           frequency: client.frequency,
//           value: client.value,
//           rScore: client.rScore,
//           fScore: client.fScore,
//           vScore: client.vScore,
//           totalScore: client.totalScore,
//           calculatedAt: new Date(),
//           rfvClassificationLabel: client.rfvClassificationLabel,
//         };

//         const updateClient = prisma.client.update({
//           where: { id: client.id },
//           data: {
//             rfvClassificationLabel: client.rfvClassificationLabel,
//             rfv: rfvData,
//           },
//         });

//         const createHistory = prisma.clientRfvHistory.create({
//           data: {
//             clientId: client.id,
//             storeId: client.storeId,
//             ...rfvData,
//           },
//         });

//         return Promise.all([updateClient, createHistory]);
//       });

//       await Promise.all(updatePromises.flat());

//       totalProcessed += clients.length;
//       skip += BATCH_SIZE;
//     }

//     console.log(`✅ RFV calculado para ${totalProcessed} clientes`);
//     res
//       .status(200)
//       .json({ message: `RFV calculado para ${totalProcessed} clientes.` });
//   } catch (err) {
//     console.error("Erro ao calcular RFV", err);
//     res.status(500).json({ error: "Erro ao calcular RFV" });
//   }
// }

// export function determineRFV(clients) {
//   const today = getDateOnly(new Date());

//   const clientsWithRfv = clients.map((client) => {
//     const purchases = client.purchaseHistory;

//     if (!purchases || purchases.length === 0) {
//       return {
//         ...client,
//         recency: null,
//         frequency: 0,
//         value: 0,
//       };
//     }

//     // console.log("purchases do cliente", client.id, purchases);

//     // Extract valid purchase dates (convert nested $date strings or ISO strings)
//     const purchaseDates = purchases
//       .map((p) => parseNestedDate(p.purchaseDate))
//       .filter((date) => date !== null)
//       .map(getDateOnly);

//     if (purchaseDates.length === 0) {
//       // No valid purchase dates found
//       return {
//         ...client,
//         recency: null,
//         frequency: purchases.length,
//         value: purchases.reduce((total, purchase) => {
//           if (!purchase.items || !Array.isArray(purchase.items)) return total;
//           const purchaseTotal = purchase.items.reduce(
//             (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
//             0
//           );
//           return total + purchaseTotal;
//         }, 0),
//       };
//     }

//     const lastPurchaseDate = new Date(
//       Math.max(...purchaseDates.map((d) => d.getTime()))
//     );
//     const recency = Math.max(
//       0,
//       Math.floor(
//         (today.getTime() - lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24)
//       )
//     );

//     const frequency = purchases.length;

//     // Sum total monetary value from all items in all purchases
//     const value = purchases.reduce((total, purchase) => {
//       if (!purchase.items || !Array.isArray(purchase.items)) return total;

//       const purchaseTotal = purchase.items.reduce((sum, item) => {
//         const price = item.price || 0;
//         const quantity = item.quantity || 0;
//         return sum + price * quantity;
//       }, 0);

//       return total + purchaseTotal;
//     }, 0);

//     return {
//       ...client,
//       recency,
//       frequency,
//       value: parseFloat(value.toFixed(2)),
//     };
//   });

//   return scoreRFV(clientsWithRfv);
// }

// function parseNestedDate(dateInput) {
//   if (!dateInput) return null;

//   if (dateInput instanceof Date) {
//     return isNaN(dateInput.getTime()) ? null : dateInput;
//   }

//   if (typeof dateInput === "string") {
//     const d = new Date(dateInput);
//     return isNaN(d.getTime()) ? null : d;
//   }

//   // Caso formato desconhecido, tenta extrair $date só por segurança
//   if (typeof dateInput === "object" && dateInput.$date) {
//     const d = new Date(dateInput.$date);
//     return isNaN(d.getTime()) ? null : d;
//   }

//   return null;
// }

// function getDateOnly(date) {
//   return new Date(date.getFullYear(), date.getMonth(), date.getDate());
// }

// function getScore(value, sortedList) {
//   const total = sortedList.length;
//   const position = sortedList.findIndex((v) => v === value);
//   const quintile = Math.floor((position / total) * 5);

//   return 5 - Math.min(quintile, 4); // 5 = best, 1 = worst
// }

export function classifyCustomer(r, f, v, totalScore) {
  if (r === 1 && f === 1 && v === 1) return "inactive";
  if (totalScore <= 6) return "weak";
  if (totalScore <= 9) return "average";
  if (totalScore <= 12) return "good";
  return "excellent";
}

// function scoreRFV(customers) {
//   const recencies = customers
//     .map((c) => (c.recency !== null ? c.recency : Number.MAX_SAFE_INTEGER))
//     .sort((a, b) => a - b); // lower is better

//   const frequencies = customers.map((c) => c.frequency).sort((a, b) => b - a); // higher is better

//   const values = customers.map((c) => c.value).sort((a, b) => b - a); // higher is better

//   return customers.map((c) => {
//     const rScore = getScore(
//       -c.recency,
//       recencies.map((r) => -r)
//     );

//     const fScore = getScore(c.frequency, frequencies);
//     const vScore = getScore(c.value, values);

//     const totalScore = rScore + fScore + vScore;

//     return {
//       ...c,
//       rScore: rScore,
//       fScore: fScore,
//       vScore: vScore,
//       rfvClassificationLabel: classifyCustomer(
//         rScore,
//         fScore,
//         vScore,
//         totalScore
//       ),
//       totalScore,
//     };
//   });
// }
