# MCP Gorev Asistani

Kullanici mesajlarini Groq'taki bir LLM'e gonderen, LLM'in dort MCP
aracini (list_tasks, create_task, update_task, delete_task) kullanarak
bellek ici (in-memory) bir gorev listesini yonetmesini saglayan, tek bir
Docker Compose servisi olarak calisan ogretici bir proje.

## Ne yapiyor?

`POST /chat` ucuna dogal dilde bir mesaj gonderiyorsun (orn. "Docker
gorevini tamamlandi isaretle"). Chat sunucusu bu mesaji Groq'a, elindeki
4 MCP aracinin semasiyla birlikte gonderiyor. Model gerekirse (id bulmak
icin once list_tasks gibi) art arda arac cagirabiliyor; her cagri JSON
Schema'ya karsi dogrulaniyor, gercek MCP sunucusu uzerinden calistirilip
sonucu tekrar modele gosteriliyor. Sonunda dogal dil cevabi ve tum surecin
gorunur bir izini (`trace`) birlikte donuyor.

## Mimari

Iki ayri Node.js sureci, ayni container icinde, stdio uzerinden JSON-RPC
ile konusuyor:

```
[app sureci]                          [mcp-server sureci]
Express (/chat)                       (child process, stdio ile baslatiliyor)
  |- groq/           --HTTP-->  Groq API
  `- mcp-client/     --stdio/JSON-RPC-->  mcp-server/  -->  task-store/
```

| Dosya | Sorumluluk |
|---|---|
| `src/task-store` | Gorev CRUD'u, `Map` tabanli bellek ici depo, seed veri |
| `src/mcp-server` | task-store'u JSON Schema'li 4 MCP aracina cevirir, stdio+JSON-RPC dinler |
| `src/mcp-client` | mcp-server'i child process baslatir, tek (singleton) baglanti tutar |
| `src/groq` | Groq'a istek atar, MCP sema -> Groq tool formati donusumu |
| `src/app` | `/chat` endpoint'i, arac cagirma dongusu, `ajv` dogrulama, trace uretimi |

## Kurulum ve calistirma

### 1) Groq API anahtari al

1. https://console.groq.com/keys adresine git, giris yap.
2. "Create API Key" ile yeni bir anahtar olustur, ismini istedigin gibi ver
   (orn. `mcp-gorev-asistani`).
3. Gosterilen anahtari (`gsk_...`) kopyala - bir daha gosterilmiyor.

### 2) `.env` dosyasini olustur

```
cp .env.example .env
```

`.env` dosyasini acip `GROQ_API_KEY=` satirinin sonuna anahtarini yapistir.

> Not: `GROQ_MODEL` degeri zaman icinde degisebilir - Groq zaman zaman
> modelleri kaldirip yenilerini ekliyor. Guncel listeyi gormek icin:
> `curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"`

### 3) Docker Compose ile calistir

```
docker compose up --build -d
```

Loglari izlemek icin:
```
docker compose logs -f
```
`Chat sunucusu http://localhost:3000 adresinde calisiyor.` satirini
gorunce hazir demektir (container ici port 3000, disariya `compose.yaml`
uzerinden **3001** olarak aciliyor - kendi makinende 3000 mesgulse
`compose.yaml`'daki `ports` satirini degistirebilirsin).

Durdurmak icin:
```
docker compose down
```

## Deneme mesajlari

```
curl -X POST http://localhost:3001/chat -H "Content-Type: application/json" \
  -d '{"message": "Hangi görevlerim var?"}'

curl -X POST http://localhost:3001/chat -H "Content-Type: application/json" \
  -d '{"message": "JSON Schema öğrenmek için bir görev ekle."}'

curl -X POST http://localhost:3001/chat -H "Content-Type: application/json" \
  -d '{"message": "Docker görevini tamamlandı olarak işaretle."}'

curl -X POST http://localhost:3001/chat -H "Content-Type: application/json" \
  -d '{"message": "Tamamlanan görevi sil."}'
```

Ornek cevap (3. mesaj - id'nin once `list_tasks` ile bulunup sonra
`update_task`'a gecirildigine dikkat et):

```json
{
  "answer": "\"Docker Compose kur\" görevi tamamlandı olarak işaretlendi.",
  "trace": [
    { "tool": "list_tasks", "arguments": {}, "validation": "passed",
      "result": { "tasks": [ { "id": 1, "title": "MCP sartnamesini oku", "completed": false },
        { "id": 2, "title": "Docker Compose kur", "completed": false },
        { "id": 3, "title": "Groq API anahtarini al", "completed": true } ] } },
    { "tool": "update_task", "arguments": { "completed": true, "id": 2 }, "validation": "passed",
      "result": { "id": 2, "title": "Docker Compose kur", "completed": true } }
  ]
}
```

4. mesaj (`"Tamamlanan görevi sil."`) test sirasinda ilginc bir davranis
gosterdi: seed veride zaten tamamlanmis bir gorev oldugu icin (id=3) ve
3. mesajdan sonra bir tane daha tamamlanmis gorev (id=2) olustugu icin,
model iki secenek arasinda kaldi ve **tahmin etmek yerine kullaniciya
hangisini kastettigini sordu** - hicbir arac cagirmadan. Bu, projenin
beklenen/istenen bir davranisi (yanlis gorevi silmemek), hata degil.

## Sik sorulan sorular

**Neden veritabani yok, bellek ici veri kullanildi?**
Sartname bunu bilincli olarak istiyor: proje MCP protokolunu ve arac
cagirma akisini ogretmeyi hedefliyor, kalici depolama (persistence) ayri
bir konu ve gereksiz karmasiklik katardi. `Map` + seed veri, "her
baslangicta temiz bir durumdan basla" davranisini bedavaya veriyor.

**Neden Docker Compose, tek bir `node` komutu yeterli degil miydi?**
Docker, "bende calisiyordu" sorununu ortadan kaldirip projenin herhangi
bir makinede ayni sekilde calismasini garanti ediyor. Compose ise
servisleri (burada tek servis olsa da) standart, tek komutla
baslatilabilir hale getiriyor - gercek dunyadaki kurulumlara yakin bir
alistirma.

**Neden JSON Schema dogrulamasi var, Groq'a guvenmek yetmez miydi?**
LLM ciktisi deterministik degil - model bazen eksik/yanlis tipte
argumanlar uretebilir. `ajv` ile dogrulamadan dogrudan task-store'a
gitmek, beklenmedik hatalara veya tutarsiz veriye yol acabilir. Dogrulama,
LLM'e "guvenme, kontrol et" ilkesinin kod karsiligi.

**Arac tanimlari neden sistem mesajina degil `tools` alanina konuyor?**
`tools` alani, Groq/OpenAI API'sinde yapilandirilmis (structured) bir
sozlesme - model bunu gercek, cagirabilir fonksiyonlar olarak gorur ve
cevabi da yapilandirilmis `tool_calls` formatinda uretir. Sistem mesajina
duz metin olarak yazsak, model bunu sadece baglam olarak okur, cagirma
garantisi/yapisi olmazdi.

**mcp-client neden mcp-server'i her istekte yeniden baslatmiyor?**
task-store, mcp-server surecinin RAM'inde yasiyor. Her istekte yeni bir
surec baslatilsaydi, veri her seferinde seed'e donerdi - onceki mesajda
yapilan degisiklikler kaybolurdu. Bu yuzden mcp-client, app sureci ayakta
oldugu surece TEK bir mcp-server baglantisini (singleton) koruyor.

**Neden tek bir Groq cagrisi yetmiyor, dongu (loop) gerekiyor?**
Kullanici "Docker gorevini isaretle" dedigi de model onun id'sini bilmez
- once `list_tasks` cagirip dogru id'yi bulmasi, sonra asil islemi yapan
araci o id ile cagirmasi gerekir. Bu, tek istekte birden fazla ardisik
arac cagrisi demektir; sabit "sor-calistir-anlat" akisi bunu
desteklemez, gercek bir dongu gerekir.

## Bilinen eksikler / production'a hazir olmayan noktalar

- **Kalicilik yok**: Container yeniden baslarsa (ya da coker/yeniden
  deploy edilirse) tum gorev verisi kaybolur. Gercek kullanimda bir
  veritabani (Postgres, SQLite, vs.) gerekir.
- **Coklu kullanici / oturum ayrimi yok**: Tum kullanicilar ayni
  task-store'u paylasir; kullanicilar arasi izolasyon (multi-tenancy)
  yok.
- **Konusma hafizasi yok**: Her `/chat` istegi bagimsiz baslar. Kullanici
  onceki mesajlara atifta bulunamaz ("onu da sil" gibi) - sadece ayni
  istek icindeki arac dongusu boyunca baglam korunur.
- **Tek eszamanli arac cagrisi**: Model ayni turda birden fazla arac
  istese bile (paralel `tool_calls`), sadece ilki isleniyor.
- **Kimlik dogrulama / yetkilendirme yok**: `/chat` ucu herkese acik,
  hicbir erisim kontrolu yok.
- **Girdi boyutu / hiz siniri (rate limiting) yok**: Kotu niyetli ya da
  hatali istemciler sinirsizce istek gonderebilir, Groq faturasi buna
  gore sisebilir.
- **Ajv semasi her istekte yeniden derleniyor**: `ajv.compile(...)`
  performans icin onbelleklenebilirdi (kucuk olcekte fark etmiyor).
- **Model adi zamanla eskiyebilir**: Groq'un model kataloğu degisiyor
  (bu proje sirasinda `llama-3.3-70b-versatile` kaldirilmis oldu) -
  `GROQ_MODEL` periyodik olarak kontrol edilmeli.
