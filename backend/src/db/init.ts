import { initStore } from './store';

export function initDb(dbPath: string = './data/store.json'): void {
  initStore(dbPath);
}

export function closeDb(): void {
  // JSON file store doesn't need explicit closing
}


