// IndexedDB cru (zero deps — CLAUDE.md § Eficiência), promisificado no mínimo
// necessário. Migrações versionadas por SCHEMA_VERSION; abrir é idempotente
// (conexão única reaproveitada).

import {
  SCHEMA_VERSION,
  STORE_ANCORAS,
  STORE_ITENS,
  STORE_LUGARES,
  STORE_OPLOG,
  STORE_PREFS,
} from "./schema";

const DB_NOME = "gbml-luna";

// Janela de dedupe do oplog: reaplicar qualquer uma das últimas 1000 ops é
// no-op; mais antigas que isso já convergiram por LWW nos próprios registros.
export const OPLOG_JANELA = 1000;

let dbAberto: Promise<IDBDatabase> | undefined;

export function abrirDb(): Promise<IDBDatabase> {
  // Reusa a conexão viva — chamadas repetidas não abrem nada de novo.
  if (!dbAberto) dbAberto = abrir();
  return dbAberto;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, SCHEMA_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Guardas de existência: upgrade reexecutado (ex.: versão futura) não
      // tenta recriar store — migração idempotente.
      if (!db.objectStoreNames.contains(STORE_ITENS)) {
        const itens = db.createObjectStore(STORE_ITENS, { keyPath: "id" });
        itens.createIndex("itemKey", "itemKey", { unique: true });
      }
      if (!db.objectStoreNames.contains(STORE_ANCORAS)) {
        const ancoras = db.createObjectStore(STORE_ANCORAS, { keyPath: "id" });
        ancoras.createIndex("itemKey", "itemKey", { unique: true });
      }
      if (!db.objectStoreNames.contains(STORE_LUGARES)) {
        db.createObjectStore(STORE_LUGARES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PREFS)) {
        db.createObjectStore(STORE_PREFS, { keyPath: "chave" });
      }
      if (!db.objectStoreNames.contains(STORE_OPLOG)) {
        const oplog = db.createObjectStore(STORE_OPLOG, { keyPath: "opId" });
        // Índice por tempo: é por ele que a poda acha as ops mais antigas.
        oplog.createIndex("at", "at");
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Outra instância pediu upgrade: cede a conexão e deixa a próxima
      // chamada reabrir já na versão nova.
      db.onversionchange = () => {
        db.close();
        dbAberto = undefined;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("abertura do IndexedDB bloqueada"));
  });
}

function promessa<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGet<T>(
  store: string,
  chave: IDBValidKey,
): Promise<T | undefined> {
  const db = await abrirDb();
  const resultado = await promessa(
    db.transaction(store, "readonly").objectStore(store).get(chave),
  );
  return resultado as T | undefined;
}

export async function dbPut(store: string, valor: unknown): Promise<void> {
  const db = await abrirDb();
  await promessa(
    db.transaction(store, "readwrite").objectStore(store).put(valor),
  );
}

export async function dbGetAll<T>(store: string): Promise<T[]> {
  const db = await abrirDb();
  const resultado = await promessa(
    db.transaction(store, "readonly").objectStore(store).getAll(),
  );
  return resultado as T[];
}

export async function dbDelete(
  store: string,
  chave: IDBValidKey,
): Promise<void> {
  const db = await abrirDb();
  await promessa(
    db.transaction(store, "readwrite").objectStore(store).delete(chave),
  );
}

// Mantém o oplog dentro da janela apagando as ops mais antigas pelo índice
// "at". Tudo em callback numa transação só: requests emitidos fora do handler
// anterior arriscam auto-commit da transação.
export async function podarOplog(): Promise<void> {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_OPLOG, "readwrite");
    const oplog = tx.objectStore(STORE_OPLOG);
    tx.onerror = () => reject(tx.error);
    const contagem = oplog.count();
    contagem.onsuccess = () => {
      let excesso = contagem.result - OPLOG_JANELA;
      if (excesso <= 0) {
        resolve();
        return;
      }
      const cursor = oplog.index("at").openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c && excesso > 0) {
          c.delete();
          excesso -= 1;
          c.continue();
        } else {
          resolve();
        }
      };
    };
  });
}
