import db from "../../prisma/db.js";

export default async function generatePromptByIntention({
  intencao,
  termos,
  message,
  username,
}) {
  const assistantName = "Cris";
  const storeName = "Cristina Confecções";

  const stockDb = await db.product.findMany();

  const stock = filtrarEstoquePorTermos(stockDb, termos);

  // console.log(
  //   "Produtos encontraddos no stock com os termos passados",
  //   termos,
  //   stock
  // );

  if (stock.length === 0) {
    throw new Error(gerarMensagemSemEstoque(username, termos));
  }
  // const termosTexto = termos.join(", ");

  switch (intencao) {
    case "buscar_produto":
      return `
Você é ${assistantName}, uma atendente virtual no WhatsApp da loja de roupas ${storeName}. Você conversa de forma informal, amigável, acolhedora e com emojis na resposta(sem exageros), quase como uma amiga falando com o cliente, que se chama ${username}. Use linguagem leve, descontraída e simples, para deixar o atendimento natural, sem parecer formal ou robótico.

O ÚNICO ESTOQUE VÁLIDO está entre os marcadores abaixo. NÃO INVENTE nada que não esteja aqui:

<INVENTÁRIO>
${JSON.stringify(stock, null, 2)}
</INVENTÁRIO>

### Instruções de resposta
1. Saudação curta: “Oi, ${username}! 😊”  
2. Liste cada produto se existir no estoque no formato:
   – Nome do produto: R$ preço
3. Nunca coloque link ou url das imagens na resposta

Mensagem do cliente: "${message}"
`.trim();

    case "elogio":
      return `
Você é uma atendente virtual carinhosa no WhatsApp da loja Cristina Confecções.

O cliente elogiou com a mensagem: "${message}"

Responda de forma informal, simpática e acolhedora, agradecendo o carinho e dizendo que a equipe fica feliz com isso. Use emojis com leveza, como uma amiga respondendo no WhatsApp.
      `.trim();

    case "reclamacao":
      return `
Você é uma atendente virtual atenciosa da loja Cristina Confecções.

Mensagem do cliente: "${message}"

Responda com empatia, pedindo desculpas e dizendo que vai encaminhar para uma atendente resolver com urgência. Use linguagem acolhedora, evite se justificar, e NUNCA culpe o cliente. Mostre que se importa com a insatisfação.

Termine avisando que uma atendente humana será chamada.
      `.trim();

    case "duvida_entrega":
      return `
Você é uma atendente virtual no WhatsApp da loja Cristina Confecções.

Mensagem do cliente: "${message}"

Responda de forma simpática e informal, explicando que esse tipo de dúvida será verificada por uma de nossas vendedoras.

Peça que ele aguarde só um instante e diga que será atendido em breve.
      `.trim();

    case "falar_com_atendente":
      return null; // Você deve tratar isso fora do fluxo de IA

    default:
      return `
Você é uma atendente virtual da loja Cristina Confecções.

Mensagem do cliente: "${message}"

Responda com simpatia dizendo que não entendeu totalmente a pergunta e que está aqui para ajudar. Peça para ele explicar de novo com outras palavras. Seja gentil e informal.
      `.trim();
  }
}

export function filtrarEstoquePorTermos(estoque, termos) {
  const stopWords = new Set([
    "de",
    "da",
    "do",
    "em",
    "para",
    "com",
    "sem",
    "que",
    "voces",
    "vendem",
    "consegue",
    "mandar",
    "foto",
    "dessa",
    "desse",
    "ver",
    "quero",
    "por",
    "pode",
    "favor",
    "alguma",
    "algum",
    "essa",
    "esse",
    "aqui",
    "onde",
  ]);
  // Função para normalizar texto (sem alterar 'a' para 'o')
  // Função para normalizar texto com tratamento de gênero
  const normalizar = (texto) => {
    return texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove acentos
      .toLowerCase()
      .replace(/s$/, "") // Remove plural
      .replace(/(a|ã|á|à)$/, "o"); // Converte final feminino para masculino
  };

  const processarTermos = (termos) => {
    return termos
      .map((termo) => normalizar(termo))
      .filter((termo) => !stopWords.has(termo) && termo.length > 2);
  };

  const normalizarCampo = (texto) => {
    return texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/\s+/)
      .map((p) => p.replace(/(a|ã|á|à)$/, "o")) // Aplica mesma conversão nos campos
      .join(" ");
  };

  const termosProcessados = processarTermos(termos);

  return estoque.filter((item) => {
    const campos = [
      normalizarCampo(item.productName || ""),
      normalizarCampo(item.productType || ""),
      normalizarCampo(item.color || ""),
    ].join(" ");

    return termosProcessados.every((termo) => campos.includes(termo));
  });
}

function gerarMensagemSemEstoque(username, termos) {
  let termosTexto;
  if (termos.length === 1) {
    termosTexto = termos[0];
  } else if (termos.length === 2) {
    termosTexto = termos.join(" e ");
  } else {
    const last = termos.pop();
    termosTexto = `${termos.join(", ")} e ${last}`;
  }

  return `Oi, ${username}! 😊  
No momento não temos ${termosTexto} em estoque. Posso te ajudar a encontrar outra coisa?`;
}
