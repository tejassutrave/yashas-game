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

export interface TaxiJobHud {
  active: boolean;
  phase: 'pickup' | 'dropoff';
  tier: 'Short' | 'Medium' | 'Long';
  distanceMeters: number;
  fareRupees: number;
  streak: number;
}

export interface RaceHud {
  active: boolean;
  checkpoint: number;
  totalCheckpoints: number;
  timeLeft: number;
  reward: number;
}

export const TURBO_UPGRADE_PRICE = 2500;
export const REPAINT_PALETTE = [
  0x38bdf8, 0xef4444, 0xfacc15, 0x10b981, 0xec4899, 0xa855f7, 0xf97316, 0xf8fafc, 0x1e293b,
] as const;

export interface ShopCarSpec {
  id: string;
  name: string;
  brand: string;
  category: 'Normal' | 'Supercar';
  style: 'sedan' | 'suv' | 'convertible' | 'coupe' | 'supercar';
  color: number;
  price: number;
  topSpeedKmh: number;
}

function randomSuperPrice(minK: number, maxK: number): number {
  const thousands = Math.floor(minK + Math.random() * (maxK - minK + 1));
  return thousands * 1000 + (Math.random() > 0.5 ? 500 : 0);
}

export const CAR_SHOP_CATALOG: readonly ShopCarSpec[] = [
  {
    id: 'car_1',
    name: 'Coastal Hatchback',
    brand: 'Daily Compact',
    category: 'Normal',
    style: 'sedan',
    color: 0x38bdf8,
    price: 5000,
    topSpeedKmh: 110,
  },
  {
    id: 'car_2',
    name: 'Urban Trail SUV',
    brand: 'City SUV',
    category: 'Normal',
    style: 'suv',
    color: 0x10b981,
    price: 7500,
    topSpeedKmh: 118,
  },
  {
    id: 'car_3',
    name: 'Vice Open-Roof',
    brand: 'Convertible',
    category: 'Normal',
    style: 'convertible',
    color: 0xec4899,
    price: 10000,
    topSpeedKmh: 125,
  },
  {
    id: 'car_4',
    name: 'Metro GT Coupe',
    brand: 'Sport Coupe',
    category: 'Normal',
    style: 'coupe',
    color: 0xf97316,
    price: 12000,
    topSpeedKmh: 132,
  },
  {
    id: 'car_5',
    name: 'Horizon Open Cruiser',
    brand: 'Open-Roof SUV',
    category: 'Normal',
    style: 'convertible',
    color: 0xf59e0b,
    price: randomSuperPrice(16, 19),
    topSpeedKmh: 138,
  },
  {
    id: 'car_6',
    name: 'Aventador V12',
    brand: 'Lamborghini',
    category: 'Supercar',
    style: 'supercar',
    color: 0xfacc15,
    price: randomSuperPrice(18, 26),
    topSpeedKmh: 185,
  },
  {
    id: 'car_7',
    name: 'Rosso Corsa F8',
    brand: 'Ferrari',
    category: 'Supercar',
    style: 'supercar',
    color: 0xdc2626,
    price: randomSuperPrice(22, 32),
    topSpeedKmh: 192,
  },
  {
    id: 'car_8',
    name: '911 Turbo GT',
    brand: 'Porsche',
    category: 'Supercar',
    style: 'supercar',
    color: 0xe2e8f0,
    price: randomSuperPrice(20, 29),
    topSpeedKmh: 188,
  },
  {
    id: 'car_9',
    name: 'Apex 720S',
    brand: 'McLaren',
    category: 'Supercar',
    style: 'supercar',
    color: 0xf97316,
    price: randomSuperPrice(25, 36),
    topSpeedKmh: 196,
  },
  {
    id: 'car_10',
    name: 'Chiron Noir',
    brand: 'Bugatti',
    category: 'Supercar',
    style: 'supercar',
    color: 0x1e293b,
    price: randomSuperPrice(32, 48),
    topSpeedKmh: 210,
  },
];

export const CAR_SHOP_LOCATION = { x: 92, z: -42 };

export interface WorldHudSnapshot {
  district: string;
  speedKmh: number;
  fps: number;
  inVehicle: boolean;
  vehicleName: string | null;
  vehicleStyle: string | null;
  nearbyVehicleName: string | null;
  cash: number;
  taxiJob: TaxiJobHud;
  race: RaceHud;
  carShopRouteActive: boolean;
  nearCarShop: boolean;
  playerX: number;
  playerZ: number;
  playerYaw: number;
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

