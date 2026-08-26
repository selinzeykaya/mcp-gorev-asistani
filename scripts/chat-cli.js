// Basit bir terminal sohbet istemcisi. Amaci: /chat endpoint'ini test
// etmek icin her seferinde PowerShell/curl sozdizimi yazmak zorunda
// kalmadan, duz metin yazip Enter'a basarak "normal bir sohbet" gibi
// denemene izin vermek.
//
// Bu script Docker container'in DISINDA, kendi bilgisayarinda calisir -
// container'a sadece disariya acik HTTP portu (varsayilan 3001) uzerinden
// baglanir, container'in icini bilmez.
//
// Calistirmak icin: node scripts/chat-cli.js  (ya da: npm run chat)

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const baseUrl = process.env.CHAT_URL || "http://localhost:3001";
const rl = readline.createInterface({ input, output });

console.log(`MCP Gorev Asistani - terminal sohbet (${baseUrl}/chat)`);
console.log('Cikmak icin "exit" yaz ya da Ctrl+C.\n');

while (true) {
  let message;
  try {
    message = await rl.question("Sen: ");
  } catch {
    // stdin kapandi (orn. terminal kapatildi) - devam eden bir istek
    // yokken sessizce cikiyoruz.
    break;
  }

  if (message.trim().toLowerCase() === "exit") break;
  if (message.trim() === "") continue;

  try {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await response.json();

    if (!response.ok) {
      console.log(`Hata: ${data.error ?? JSON.stringify(data)}\n`);
      continue;
    }

    console.log(`Asistan: ${data.answer}`);
    if (data.trace) {
      const ozet = data.trace.map((step) => step.tool).join(" -> ");
      console.log(`  (arac izi: ${ozet})`);
    }
    console.log();
  } catch (error) {
    console.log(`Baglanti hatasi: ${error.message}\n`);
  }
}

rl.close();
console.log("Gorusuruz!");
