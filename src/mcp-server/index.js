// task-store'daki 4 fonksiyonu, MCP protokolu uzerinden disariya
// "arac" (tool) olarak sunan MCP sunucusu.
//
// Bu dosya bagimsiz bir Node sureci olarak calisir (mcp-client onu
// child process olarak baslatir) ve stdio uzerinden JSON-RPC konusur.
// ONEMLI: bu yuzden burada ASLA console.log kullanilmaz - stdout,
// JSON-RPC mesajlari icin ayrilmis. Debug icin console.error kullanilir.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  listTasks,
  listTasksByPriority,
  createTask,
  updateTask,
  deleteTask,
} from "../task-store/index.js";

// Aciliyet seviyeleri icin tek bir liste - hem taskSchema hem giris
// semalarinda tekrar tekrar yazmamak icin ayri bir degiskende tutuyoruz.
const PRIORITY_LEVELS = ["dusuk", "orta", "yuksek"];

// Tek bir gorevin JSON Schema tanimi - hem cikis semalarinda tekrar
// tekrar yazmamak icin ayri bir degiskende tutuyoruz.
const taskSchema = {
  type: "object",
  properties: {
    id: { type: "integer", description: "Gorevin benzersiz kimligi" },
    title: { type: "string", description: "Gorev basligi" },
    completed: { type: "boolean", description: "Gorev tamamlandi mi" },
    priority: {
      type: "string",
      enum: PRIORITY_LEVELS,
      description: "Gorevin aciliyet duzeyi",
    },
  },
  required: ["id", "title", "completed", "priority"],
};

// tools/list cagrisinda disariya ilan edilecek 5 aracin sozlesmesi.
// Her biri: isim, aciklama, giris semasi (inputSchema), cikis semasi
// (outputSchema). LLM bu bilgiyle "hangi araci ne zaman, hangi
// parametrelerle cagirabilirim" bilgisini ediniyor.
const TOOL_DEFINITIONS = [
  {
    name: "list_tasks",
    description: "Tum gorevleri listeler.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        tasks: { type: "array", items: taskSchema },
      },
      required: ["tasks"],
    },
  },
  {
    name: "list_tasks_by_priority",
    description: "Gorevleri aciliyet sirasina gore (yuksekten dusuge) listeler.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        tasks: { type: "array", items: taskSchema },
      },
      required: ["tasks"],
    },
  },
  {
    name: "create_task",
    description: "Yeni bir gorev olusturur.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, description: "Gorev basligi" },
        priority: {
          type: "string",
          enum: PRIORITY_LEVELS,
          description: "Gorevin aciliyet duzeyi (belirtilmezse 'orta')",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    // Cikis, gorevin KENDISI - {task: {...}} diye sarilmiyor. Sartnamedeki
    // ornek trace'te "result" alaninin duz bir gorev objesi oldugunu
    // gorup buna gore ayarladik.
    outputSchema: taskSchema,
  },
  {
    name: "update_task",
    description: "Var olan bir gorevin baslik ve/veya tamamlanma durumunu degistirir.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Guncellenecek gorevin id'si" },
        title: { type: "string", minLength: 1, description: "Yeni baslik (opsiyonel)" },
        completed: { type: "boolean", description: "Yeni tamamlanma durumu (opsiyonel)" },
        priority: {
          type: "string",
          enum: PRIORITY_LEVELS,
          description: "Yeni aciliyet duzeyi (opsiyonel)",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    outputSchema: taskSchema,
  },
  {
    name: "delete_task",
    description: "Var olan bir gorevi siler.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Silinecek gorevin id'si" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    outputSchema: taskSchema,
  },
];

// Protokolun gordugu sey (yukaridaki semalar) ile gercekte calisan kod
// (asagidaki fonksiyonlar) bilinçli olarak ayri tutuluyor.
const TOOL_HANDLERS = {
  list_tasks: () => ({ tasks: listTasks() }),
  list_tasks_by_priority: () => ({ tasks: listTasksByPriority() }),
  create_task: (args) => createTask(args),
  update_task: (args) => updateTask(args),
  delete_task: (args) => deleteTask(args),
};

const server = new Server(
  { name: "gorev-asistani-mcp-server", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const handler = TOOL_HANDLERS[name];

  if (!handler) {
    return {
      content: [{ type: "text", text: `Bilinmeyen arac: ${name}` }],
      isError: true,
    };
  }

  try {
    const structuredContent = handler(args);
    return {
      content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
    };
  } catch (error) {
    // task-store'dan gelen "Gorev bulunamadi" gibi is mantigi hatalari
    // buraya duser. isError:true ile isaretleyerek LLM'in bu hatayi
    // gorup kullaniciya anlatabilmesini sagliyoruz.
    return {
      content: [{ type: "text", text: `Hata: ${error.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
