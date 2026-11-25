export type GameStage = 'gender' | 'customize' | 'lobby' | 'world';
export type GenderKey = 'boy' | 'girl';
export type CustomTab = 'hair' | 'outfit' | 'gear';
export type SpawnKey = 'ocean_drive' | 'downtown' | 'palm_beach';

export interface CatalogOption {
  id: string;
  name: string;
}

export interface GenderCatalogEntry {
  label: string;
  hairstyles: CatalogOption[];
  outfits: CatalogOption[];
  accessories: CatalogOption[];
}

export const GENDER_CATALOG: Record<GenderKey, GenderCatalogEntry> = {
  boy: {
    label: 'Boy',
    hairstyles: [
      { id: 'quiff', name: 'Textured Quiff' },
      { id: 'crew', name: 'Short Crew' },
      { id: 'curtains', name: 'Middle Part' },
      { id: 'buzz', name: 'Clean Fade' },
    ],
    outfits: [
      { id: 'jacket_tee', name: 'Bomber & Tee' },
      { id: 'hoodie_cargo', name: 'Street Hoodie' },
      { id: 'polo_chinos', name: 'Resort Polo' },
      { id: 'tank_shorts', name: 'Beach Tank' },
    ],
    accessories: [
      { id: 'none', name: 'None' },
      { id: 'cap', name: 'Snapback Cap' },
      { id: 'sunglasses', name: 'Aviator Shades' },
      { id: 'backpack', name: 'Daypack' },
    ],
  },
  girl: {
    label: 'Girl',
    hairstyles: [
      { id: 'ponytail', name: 'High Ponytail' },
      { id: 'bob', name: 'Sleek Bob' },
      { id: 'waves', name: 'Long Waves' },
      { id: 'buns', name: 'Space Buns' },
    ],
    outfits: [
      { id: 'cardigan_skirt', name: 'Cardigan & Skirt' },
      { id: 'crop_jacket', name: 'Crop Jacket & Jeans' },
      { id: 'sundress', name: 'Coastal Sundress' },
      { id: 'sport_set', name: 'Active Track Set' },
    ],
    accessories: [
      { id: 'none', name: 'None' },
      { id: 'headband', name: 'Style Headband' },
      { id: 'sunglasses', name: 'Cat-Eye Shades' },
      { id: 'tote', name: 'Shoulder Bag' },
    ],
  },
};

export const PALETTES = {
  skin: [0xf7d5ba, 0xe8b892, 0xd19a6e, 0xa86f44, 0x6e4426],
  hair: [0x1f1916, 0x4a2e1b, 0x8d5524, 0xd4a359, 0x9e2a2b, 0x334155],
  eyes: [0x2b5b84, 0x3b7a57, 0x5c3a21, 0x4b5563, 0x0e7490],
  primary: [0x0284c7, 0xe11d48, 0x059669, 0xd97706, 0x7c3aed, 0xf8fafc, 0x1e293b],
  secondary: [0x1e293b, 0xf1f5f9, 0x334155, 0x0f172a, 0x991b1b, 0x1d4ed8],
  shoes: [0xf8fafc, 0x1e293b, 0xef4444, 0x0ea5e9, 0x78350f],
} as const;

export interface CharacterConfig {
  gender: GenderKey | null;
  name: string;
  hairstyle: string;
  outfit: string;
  accessory: string;
  skin: number;
  hair: number;
  eyes: number;
  primary: number;
  secondary: number;
  shoes: number;
}

export interface PlayerStats {
  level: number;
  xp: number;
  cash: number;
}

export interface TimePresetMeta {
  id: 'day' | 'sunset' | 'night';
  icon: string;
  label: string;
}

export const TIME_PRESETS_META: readonly TimePresetMeta[] = [
  { id: 'day', icon: '☀️', label: 'Sunny Day' },
  { id: 'sunset', icon: '🌅', label: 'Golden Sunset' },
  { id: 'night', icon: '🌙', label: 'Coastal Night' },
];

export interface WorldHudSnapshot {
  district: string;
  speedKmh: number;
  fps: number;
  inVehicle: boolean;
  vehicleName: string | null;
  nearbyVehicleName: string | null;
}

export function createInitialCharacter(): CharacterConfig {
  return {
    gender: null,
    name: 'Alex',
    hairstyle: 'quiff',
    outfit: 'jacket_tee',
    accessory: 'none',
    skin: PALETTES.skin[1],
    hair: PALETTES.hair[0],
    eyes: PALETTES.eyes[0],
    primary: PALETTES.primary[0],
    secondary: PALETTES.secondary[0],
    shoes: PALETTES.shoes[0],
  };
}

