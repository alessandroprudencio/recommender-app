import axios from "axios";

export default async function sendPromptToLlama(
  prompt,
  temperature = 0,
  top_p = 1.0,
  frequency_penalty = 1.5,
  repetition_penalty = 1.2,
  max_tokens = 150
) {
  console.info("Start consult in ollama...");

  const response = await axios.post(
    "http://host.docker.internal:11434/api/generate",
    {
      model: "llama3.2",
      prompt: prompt,
      stream: false,
      temperature,
      top_p,
      max_tokens,
      repetition_penalty,
      stop: ["\nAtenciosamente"],
      frequency_penalty,
    }
  );

  return response.data.response;
}
