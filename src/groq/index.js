// Groq Chat Completions API'siyle konusan, ince (thin) bir katman.
// Bu modul SADECE "Groq'la nasil konusulur" bilgisini bilir; "ne zaman,
// kac kez konusulur" (arac cagirma dongusu) app katmaninin isidir.

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// mcp-server'in tools/list ile verdigi arac tanimlarini
// ({name, description, inputSchema, outputSchema}) Groq'un bekledigi
// function-calling formatina cevirir. outputSchema Groq'a gonderilmez -
// model sadece "nasil cagiririm"i (girdi) bilmek zorunda.
export function mcpToolsToGroqTools(mcpTools) {
  return mcpTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

// Groq'a bir chat completion istegi atar, modelin urettigi mesaji
// ({role, content, tool_calls?}) dondurur.
export async function sendChatRequest({ messages, tools }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY ortam degiskeni tanimli degil.");
  }
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: "auto",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Groq istegi basarisiz oldu (HTTP ${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.choices[0].message;
}
