import axios from "axios";
import { MessageStatus, RecipientType } from "@prisma/client";
import { STORE_ID } from "../consts.js";
import db from "../../prisma/db.js";

// === Constantes da API W-API ===
const API_URL = "https://api-01-a.w-api.io";
const API_TOKEN = "Y3OWADU3FYZRDC5E";
const ENDPOINT_TEXT = "send/text";
const ENDPOINT_IMAGE = "send/image";

const ALLOWED_PHONES = new Set([
  "5567992696705",
  "556792696705",
  "5511981765250",
]);

// === Função base para envio ===
async function wApi(body, path, client = null, attrToMessage = {}) {
  try {
    let response;

    if (!ALLOWED_PHONES.has(body.Phone)) {
      console.log(`[!] Número ${body.Phone} não autorizado para envio.`);
      response = {
        data: {
          message: `[!] Número ${body.Phone} não autorizado para envio.`,
          success: false,
          data: {
            Id: "fake-id",
          },
        },
      };
    } else {
      console.log("Enviando para W-API:", { path, body });

      response = await axios.post(`${API_URL}/${path}`, body, {
        headers: {
          token: API_TOKEN,
        },
      });
    }

    const recipient = {};
    if (client?.id) {
      Object.assign(recipient, {
        recipientId: client.id,
        recipientType: RecipientType.CLIENT,
      });
    }

    await db.message.create({
      data: {
        storeId: STORE_ID,
        message: body.Body,
        externalId: response.data?.data?.Id || null,
        status: MessageStatus.SENT,
        ...recipient,
        ...attrToMessage,
        attrs: {
          phone: body.Phone,
          responseApi: response.data,
        },
      },
    });

    return response.data;
  } catch (error) {
    console.error("Erro ao enviar mensagem via W-API:", {
      message: error.message,
      response: error.response?.data,
    });
    throw error;
  }
}

// === Envia mensagem de texto ===
export async function sendText(body, client = {}) {
  return await wApi(body, ENDPOINT_TEXT, client);
}

export async function sendTextRecommendation(
  body,
  client,
  recommendationDispatchId
) {
  return await wApi(body, ENDPOINT_TEXT, client, { recommendationDispatchId });
}

// === Envia imagem ===
export async function sendImage(body) {
  return await wApi(body, ENDPOINT_IMAGE);
}
