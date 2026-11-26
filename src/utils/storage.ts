import type { CharacterConfig } from '../types/game';

const STORAGE_KEY = 'vice_coast_save_v1';

export interface SavedGameState {
  cash: number;
  ownedCarIds: string[];
  selectedGarageCarId: string | null;
  carColors: Record<string, number>;
  turboCarIds: string[];
  character: CharacterConfig | null;
}

export function loadSavedState(): SavedGameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedGameState>;
    return {
      cash: typeof parsed.cash === 'number' ? parsed.cash : 250,
      ownedCarIds: Array.isArray(parsed.ownedCarIds) ? parsed.ownedCarIds : [],
      selectedGarageCarId:
        typeof parsed.selectedGarageCarId === 'string' ? parsed.selectedGarageCarId : null,
      carColors: parsed.carColors && typeof parsed.carColors === 'object' ? parsed.carColors : {},
      turboCarIds: Array.isArray(parsed.turboCarIds) ? parsed.turboCarIds : [],
      character: parsed.character ?? null,
    };
  } catch {
    return null;
  }
}

export function saveGameState(state: SavedGameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}
