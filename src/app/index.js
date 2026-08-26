// Chat sunucusu (host): /chat endpoint'ini sunar, mcp-client ve groq
// katmanlarini birbirine baglayip arac cagirma dongusunu yonetir,
// gorunur gelistirme izini (trace) uretir.

import express from "express";
import Ajv from "ajv";
import { connectMcpClient, listMcpTools, callMcpTool } from "../mcp-client/index.js";
import { mcpToolsToGroqTools, sendChatRequest } from "../groq/index.js";

const ajv = new Ajv();

const SYSTEM_PROMPT = `Sen bir gorev yonetim asistanisin. Kullanicinin gorev
listesiyle ilgili isteklerini karsilamak icin sana verilen araclari (tools)
kullanabilirsin. Bir gorevin id'sini bilmiyorsan (kullanici sadece basliktan
bahsediyorsa), once list_tasks ile mevcut gorevleri gorup dogru id'yi kendin
bul, sonra ilgili araci o id ile cagir. Bir arac cagirman gerekmiyorsa
dogrudan cevap ver. Bir araci calistirdiktan sonra sonucunu kullaniciya
kisa, dogal bir Turkce cumleyle anlat; ham JSON veya alan adlarini (id,
completed gibi) gosterme.`;

// Guvenlik siniri: model beklenmedik sekilde surekli arac cagirmaya
// devam ederse (sonsuz donguye girerse), bir yerde durdurmamiz lazim.
const MAX_TOOL_CALLS = 5;

const app = express();
app.use(express.json());

app.post("/chat", async (req, res) => {
  const userMessage = req.body?.message;
  if (typeof userMessage !== "string" || userMessage.trim() === "") {
    return res.status(400).json({ error: "'message' alani zorunlu ve bos olmayan bir metin olmalidir." });
  }

  try {
    const mcpTools = await listMcpTools();
    const groqTools = mcpToolsToGroqTools(mcpTools);

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ];

    // Arac cagirma dongusu: model gerektigi kadar (id bulmak icin once
    // list_tasks, sonra asil islemi yapan arac gibi) art arda arac
    // cagirabilir. Her adimi trace dizisine ekliyoruz, model daha fazla
    // arac cagirmayip duz metin donene kadar donuyoruz.
    const trace = [];

    while (true) {
      const assistantMessage = await sendChatRequest({ messages, tools: groqTools });

      // Model arac cagirmadan cevap verdiyse dongu biter.
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        return res.json({
          answer: assistantMessage.content,
          trace: trace.length > 0 ? trace : null,
        });
      }

      if (trace.length >= MAX_TOOL_CALLS) {
        return res.status(500).json({
          error: "Arac cagirma dongusu guvenlik sinirini asti.",
          trace,
        });
      }

      // Bu proje her adimda tek arac cagrisini isliyor - Groq ayni anda
      // birden fazla arac istese bile sadece ilkini calistiriyoruz
      // (bilinen bir sinirlama, README'de belirtilecek).
      const toolCall = assistantMessage.tool_calls[0];
      const toolName = toolCall.function.name;

      let parsedArguments;
      try {
        parsedArguments = JSON.parse(toolCall.function.arguments);
      } catch {
        return res.status(502).json({
          error: `Groq gecersiz JSON argumani dondurdu: ${toolCall.function.arguments}`,
        });
      }

      const toolDefinition = mcpTools.find((tool) => tool.name === toolName);
      if (!toolDefinition) {
        return res.status(502).json({ error: `Groq bilinmeyen bir arac cagirdi: ${toolName}` });
      }

      const validate = ajv.compile(toolDefinition.inputSchema);
      const isValid = validate(parsedArguments);

      const step = {
        tool: toolName,
        arguments: parsedArguments,
        validation: isValid ? "passed" : "failed",
      };
      trace.push(step);

      // Assistant'in bu adimda ne istedigini konusmaya ekliyoruz -
      // model kendi gecmisini gormeli.
      messages.push({
        role: "assistant",
        content: assistantMessage.content ?? null,
        tool_calls: [toolCall],
      });

      if (!isValid) {
        // Gecersiz argumanlari task-store'a hic gondermiyoruz. Hatayi
        // modele gosteriyoruz ki isterse duzeltip tekrar denesin ya da
        // kullaniciya aciklasin - konusma burada kesilmiyor.
        step.validationErrors = validate.errors;
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: "Gecersiz arguman", details: validate.errors }),
        });
        continue;
      }

      const toolResult = await callMcpTool(toolName, parsedArguments);

      // Modele geri gosterecegimiz sonuc: basariliysa yapilandirilmis
      // veri, hataliysa (isError) mcp-server'in dondurdugu okunabilir
      // hata metni.
      let resultForGroq;
      if (toolResult.isError) {
        step.error = toolResult.content?.[0]?.text ?? "Bilinmeyen hata";
        resultForGroq = { error: step.error };
      } else {
        step.result = toolResult.structuredContent;
        resultForGroq = toolResult.structuredContent;
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(resultForGroq),
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const port = Number(process.env.PORT) || 3000;

// Once mcp-server'a baglan, ANCAK ONDAN SONRA HTTP isteklerini dinlemeye
// basla - aksi halde ilk istek mcp-client henuz baglanmadan gelebilir.
connectMcpClient()
  .then(() => {
    app.listen(port, () => {
      console.log(`Chat sunucusu http://localhost:${port} adresinde calisiyor.`);
    });
  })
  .catch((error) => {
    console.error("MCP istemcisine baglanilamadi:", error);
    process.exit(1);
  });
