import sqsInstance from "../sqs-instance.js";

export default async function enqueueWebhook(req, res) {
  console.log(
    "Eqnueue webhook",
    // SQSInstance.queueUrl,
    "recebido body:",
    JSON.stringify(req.body).slice(0, 200)
  );

  await sqsInstance.enqueue(req.body);

  res.send("Enqueued webhook");
}
