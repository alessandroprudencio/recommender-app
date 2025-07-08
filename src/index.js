import express, { json, urlencoded } from "express";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import SQSInstance from "./sqs-instance.js";
import "dotenv/config";
import * as path from "path";
import { processWebhook } from "./wpp-webhooks/process-webhook.js";
const __dirname = path.resolve();
import routesApi from "./routes/api.js";
import dashboardRoutes from "./routes/dashboard.js";
import db from "../prisma/db.js";

global.conversasPorCliente = {}; // chave: clientId, value: array de mensagens [{role, content}]

const app = express();

async function main() {
  await db.$connect();
  console.log("✅ Conectado ao banco");

  app.use(json());
  app.use(urlencoded({ extended: true }));

  const viewsPath = path.join(__dirname, "src/views");

  app.set("view engine", "ejs");
  app.set("views", viewsPath);
  app.use("/public", express.static("public"));

  app.use("/api", routesApi);
  app.use(dashboardRoutes);

  process.on("uncaughtException", (err) => {
    console.error("Erro não tratado:", err);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Rejeição não tratada:", reason);
  });

  process.on("exit", function (e) {
    console.log("Goodbye!", e);
  });

  app.listen(8080, async () => {
    // const company = await prisma.company.upsert({
    //   where: { name: "Cristina Confecções" },
    //   update: {}, // não faz nada se já existir
    //   create: {
    //     name: "Cristina Confecções",
    //   },
    // });

    // await Promise.all([
    //   prisma.store.upsert({
    //     where: {
    //       companyId_name_idx: {
    //         companyId: company.id,
    //         name: "Loja 1",
    //       },
    //     },
    //     update: {}, // não atualiza nada
    //     create: {
    //       companyId: company.id,
    //       name: "Loja 1",
    //     },
    //   }),
    //   prisma.store.upsert({
    //     where: {
    //       companyId_name_idx: {
    //         companyId: company.id,
    //         name: "Loja 2",
    //       },
    //     },
    //     update: {}, // não atualiza nada
    //     create: {
    //       companyId: company.id,
    //       name: "Loja 2",
    //     },
    //   }),
    // ]);

    // console.log("Company criada:", company);

    console.log("Servidor rodando em http://localhost:8080");
  });

  configSQS();

  async function configSQS() {
    const queueName = "MinhaFilaLocal";

    const createQueueCommand = new CreateQueueCommand({ QueueName: queueName });
    const createQueueResponse = await SQSInstance.sqsClient.send(
      createQueueCommand
    );
    const queueUrl = createQueueResponse.QueueUrl;
    console.log(`Fila criada ou existente: ${queueUrl}`);
    SQSInstance.queueUrl = queueUrl;

    // Inicia loop de escuta
    pollMessages(queueUrl);
  }

  async function pollMessages(queueUrl) {
    while (true) {
      try {
        const receiveMessageCommand = new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 5, // Long polling
          VisibilityTimeout: 10,
        });

        const messagesResponse = await SQSInstance.sqsClient.send(
          receiveMessageCommand
        );

        if (messagesResponse.Messages && messagesResponse.Messages.length > 0) {
          for (const message of messagesResponse.Messages) {
            try {
              // Aqui você pode processar a mensagem:
              await SQSInstance.processMessage(JSON.parse(message.Body));
            } finally {
              // Deleta a mensagem após processamento
              const deleteMessageCommand = new DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: message.ReceiptHandle,
              });
              await SQSInstance.sqsClient.send(deleteMessageCommand);
              console.log("Mensagem deletada.");
            }
          }
        } else {
          // Nenhuma mensagem no momento
          // console.log("Nenhuma mensagem recebida.");
        }
      } catch (error) {
        console.error("Erro ao processar mensagens da fila:", error);
      }

      // Aguarda antes de fazer a próxima verificação (evita loop infinito pegando CPU)
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

main();
