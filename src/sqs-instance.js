import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { processWebhook } from "./wpp-webhooks/process-webhook.js";
import processRecommendation from "./process-recommendation.js";

class SQSInstance {
  sqsClient;
  queueUrl;

  constructor() {
    this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION || "us-east-1",
      endpoint: "http://localstack:4566", // aponta para o serviço LocalStack no Docker network
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
      },
    });
  }

  async enqueue(body) {
    console.log(`[SQSInstance] Enqueue message ${JSON.stringify(body)}`);

    const sendMessageCommand = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(body),
    });

    await this.sqsClient.send(sendMessageCommand);
  }

  async processMessage(message) {
    if (message?.jsonData) {
      console.log(`[SQSInstance - processMessage] processWebhookWApi`);
      await processWebhook(message);
    } else if (
      message?.message &&
      message?.rfvCategories &&
      message?.selectedClients
    ) {
      console.log(`[SQSInstance - processMessage] processRecommendation`);
      await processRecommendation(message);
    } else {
      console.warn("SQSInstance not handler message", message);
    }
  }
}

export default new SQSInstance();
