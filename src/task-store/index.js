// Surec bellegindeki (in-memory) gorev deposu.
// Bu modul MCP, JSON Schema veya Groq hakkinda hicbir sey bilmez -
// sadece "gorev" kavrami uzerinde temel islemleri yapar.

const seedTasks = [
  { id: 1, title: "MCP sartnamesini oku", completed: false, priority: "yuksek" },
  { id: 2, title: "Docker Compose kur", completed: false, priority: "orta" },
  { id: 3, title: "Groq API anahtarini al", completed: true, priority: "dusuk" },
];

// Aciliyet seviyelerinin sayisal agirligi - siralama bunun uzerinden yapilir.
const PRIORITY_WEIGHT = { dusuk: 1, orta: 2, yuksek: 3 };

// Map: anahtar = id, deger = gorev objesi. Boylece "id'si 2 olani getir"
// islemi listeyi baştan sona taramadan, tek adimda yapilir.
const tasks = new Map(seedTasks.map((task) => [task.id, task]));

// Yeni gorevlere verilecek bir sonraki id. Seed verisindeki en buyuk
// id'den bir fazlasiyla basliyoruz ki yeni gorevler seed'lerle çakismasin.
let nextId = Math.max(...seedTasks.map((task) => task.id)) + 1;

export function listTasks() {
  // { ...task } ile her gorevin bir KOPYASINI donuyoruz. Eger dogrudan
  // task objesini donseydik, cagiran taraf onu disaridan degistirebilir
  // ve depo, buradaki fonksiyonlar hic calismadan bozulabilirdi.
  return Array.from(tasks.values()).map((task) => ({ ...task }));
}

// listTasks()'i aynen kullanip sadece siraliyoruz - kopyalama mantigini
// burada tekrar yazmiyoruz. Array.sort() stabildir (JS'in garantisi):
// aciliyeti esit olan gorevler kendi aralarinda eklenme sirasini korur.
export function listTasksByPriority() {
  return listTasks().sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
}

export function createTask({ title, priority = "orta" }) {
  const task = { id: nextId, title, completed: false, priority };
  tasks.set(task.id, task);
  nextId += 1;
  return { ...task };
}

export function updateTask({ id, title, completed, priority }) {
  const task = tasks.get(id);
  if (!task) {
    throw new Error(`Gorev bulunamadi: id=${id}`);
  }
  // undefined kontrolu onemli: cagiran taraf sadece "completed" gonderip
  // "title"a dokunmak istemeyebilir. "if (title)" yazsaydik, birisi
  // baslikta bos string'e ya da 0 gibi "falsy" bir degere gecmek isteseydi
  // bu satir onu yanlislikla yok sayardi.
  if (title !== undefined) task.title = title;
  if (completed !== undefined) task.completed = completed;
  if (priority !== undefined) task.priority = priority;
  return { ...task };
}

export function deleteTask({ id }) {
  const task = tasks.get(id);
  if (!task) {
    throw new Error(`Gorev bulunamadi: id=${id}`);
  }
  tasks.delete(id);
  return { ...task };
}
