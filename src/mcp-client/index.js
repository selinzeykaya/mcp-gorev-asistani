// mcp-server'i alt surec (child process) olarak baslatip stdio
// uzerinden ona baglanan MCP istemcisi. Baglanti singleton (tek ornek)
// olarak tutulur: mcp-server surecinin RAM'indeki gorev verisinin
// /chat istekleri arasinda kaybolmamasi icin, ayni surecle boyunca
// konusmamiz lazim - her istekte yeniden baslatmiyoruz.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

// mcp-server/index.js dosyasinin gercek dosya sistemi yolu.
// import.meta.url: bu modulun kendi "file://..." adresi.
// fileURLToPath: bu adresi normal bir OS yoluna cevirir (spawn icin gerekli).
const MCP_SERVER_PATH = fileURLToPath(new URL("../mcp-server/index.js", import.meta.url));

let client = null;

export async function connectMcpClient() {
  if (client) return client;

  const transport = new StdioClientTransport({
    // process.execPath: su an calisan Node calistirilabilirinin tam yolu.
    // Sabit "node" stringi yerine bunu kullanmak, container icindeki
    // PATH ayarlarindan bagimsiz, daha guvenilir bir cozum.
    command: process.execPath,
    args: [MCP_SERVER_PATH],
  });

  client = new Client(
    { name: "gorev-asistani-mcp-client", version: "0.1.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  return client;
}

export async function listMcpTools() {
  if (!client) {
    throw new Error("MCP istemcisi henuz baglanmadi. Once connectMcpClient() cagirin.");
  }
  const { tools } = await client.listTools();
  return tools;
}

export async function callMcpTool(name, args) {
  if (!client) {
    throw new Error("MCP istemcisi henuz baglanmadi. Once connectMcpClient() cagirin.");
  }
  return client.callTool({ name, arguments: args });
}
