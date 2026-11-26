import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CAR_SHOP_CATALOG,
  createInitialCharacter,
  GENDER_CATALOG,
  PALETTES,
  TURBO_UPGRADE_PRICE,
  type CharacterConfig,
  type GameStage,
  type GenderKey,
  type PlayerStats,
  type ShopCarSpec,
  type SpawnKey,
  type WorldHudSnapshot,
} from './types/game';
import { isMuted, playSFX, playTaxiComplete, setMuted } from './audio/sfx';
import { useDeviceInfo } from './utils/device';
import { loadSavedState, saveGameState } from './utils/storage';
import { createViceCoastRuntime } from './engine/viceCoastRuntime';
import { GenderSelectScreen } from './components/GenderSelectScreen';
import { CustomizerScreen } from './components/CustomizerScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { WorldHud } from './components/WorldHud';
import { FullMapModal } from './components/FullMapModal';
import { CarShopModal } from './components/CarShopModal';
import { GarageModal } from './components/GarageModal';

export function App() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<ReturnType<typeof createViceCoastRuntime> | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const initialSave = useRef(loadSavedState()).current;

  const [stage, setStage] = useState<GameStage>('gender');
  const [character, setCharacter] = useState<CharacterConfig>(
    () => initialSave?.character ?? createInitialCharacter()
  );
  const [stats, setStats] = useState<PlayerStats>(() => ({
    level: 1,
    xp: 0,
    cash: initialSave?.cash ?? 250,
  }));
  const [spawnKey, setSpawnKey] = useState<SpawnKey>('ocean_drive');
  const [todIndex, setTodIndex] = useState(0);
  const [muted, setMutedState] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [ownedCarIds, setOwnedCarIds] = useState<string[]>(() => initialSave?.ownedCarIds ?? []);
  const [selectedGarageCarId, setSelectedGarageCarId] = useState<string | null>(
    () => initialSave?.selectedGarageCarId ?? null
  );
  const [carColors, setCarColors] = useState<Record<string, number>>(
    () => initialSave?.carColors ?? {}
  );
  const [turboCarIds, setTurboCarIds] = useState<string[]>(() => initialSave?.turboCarIds ?? []);

  const [garageOpen, setGarageOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);

  const deviceInfo = useDeviceInfo();
  const [mobileOverride, setMobileOverride] = useState<boolean | null>(null);
  const isMobile = mobileOverride !== null ? mobileOverride : deviceInfo.isMobile;

  const [hud, setHud] = useState<WorldHudSnapshot>(() => ({
    district: 'Ocean Drive',
    speedKmh: 0,
    fps: 60,
    inVehicle: false,
    vehicleName: null,
    vehicleStyle: null,
    nearbyVehicleName: null,
    cash: initialSave?.cash ?? 250,
    taxiJob: {
      active: false,
      phase: 'pickup',
      tier: 'Short',
      distanceMeters: 0,
      fareRupees: 0,
      streak: 0,
    },
    race: {
      active: false,
      checkpoint: 1,
      totalCheckpoints: 6,
      timeLeft: 0,
      reward: 2000,
    },
    carShopRouteActive: false,
    nearCarShop: false,
    playerX: 178,
    playerZ: 12,
    playerYaw: Math.PI,
  }));

  // Auto-save progress to localStorage whenever wallet, garage, or character changes
  useEffect(() => {
    saveGameState({
      cash: stats.cash,
      ownedCarIds,
      selectedGarageCarId,
      carColors,
      turboCarIds,
      character,
    });
  }, [stats.cash, ownedCarIds, selectedGarageCarId, carColors, turboCarIds, character]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const handleSelectGender = useCallback((gender: GenderKey) => {
    playSFX('select');
    setCharacter((prev) => {
      const cat = GENDER_CATALOG[gender];
      const isFirst = prev.gender === null;
      const next: CharacterConfig = {
        ...prev,
        gender,
        hairstyle:
          isFirst || !cat.hairstyles.some((h) => h.id === prev.hairstyle)
            ? cat.hairstyles[0].id
            : prev.hairstyle,
        outfit:
          isFirst || !cat.outfits.some((o) => o.id === prev.outfit)
            ? cat.outfits[0].id
            : prev.outfit,
        accessory:
          isFirst || !cat.accessories.some((a) => a.id === prev.accessory)
            ? 'none'
            : prev.accessory,
        name:
          prev.name === 'Alex' || prev.name === 'Maya' || !prev.name.trim()
            ? gender === 'boy'
              ? 'Leo'
              : 'Maya'
            : prev.name,
      };
      runtimeRef.current?.setCharacter(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const runtime = createViceCoastRuntime(host, {
      onGenderPicked: (g) => handleSelectGender(g),
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
        setStats((prev) => (prev.cash !== snapshot.cash ? { ...prev, cash: snapshot.cash } : prev));
      },
      onToast: (msg) => showToast(msg),
      onTimeOfDayChanged: (idx) => setTodIndex(idx),
    });
    runtimeRef.current = runtime;

    if (initialSave?.cash !== undefined) {
      runtime.setCash(initialSave.cash);
    }
    if (initialSave?.character?.gender) {
      runtime.setCharacter(initialSave.character);
    }

    return () => {
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, [handleSelectGender, initialSave, showToast]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (stage === 'world' && e.code === 'KeyM') {
        setMapOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stage]);

  const handleChangeCharacter = (next: CharacterConfig) => {
    setCharacter(next);
    runtimeRef.current?.setCharacter(next);
  };

  const handleRandomize = () => {
    playSFX('select');
    const g = character.gender || 'boy';
    const cat = GENDER_CATALOG[g];
    const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const next: CharacterConfig = {
      ...character,
      hairstyle: pick(cat.hairstyles).id,
      outfit: pick(cat.outfits).id,
      accessory: pick(cat.accessories).id,
      skin: pick(PALETTES.skin),
      hair: pick(PALETTES.hair),
      eyes: pick(PALETTES.eyes),
      primary: pick(PALETTES.primary),
      secondary: pick(PALETTES.secondary),
      shoes: pick(PALETTES.shoes),
    };
    handleChangeCharacter(next);
    showToast('Randomized character look!');
  };

  const goToStage = (nextStage: GameStage) => {
    setStage(nextStage);
    runtimeRef.current?.setStage(nextStage);
  };

  const handleToggleMute = () => {
    const next = !isMuted();
    setMuted(next);
    setMutedState(next);
  };

  const handleBuyCar = (car: ShopCarSpec) => {
    if (stats.cash < car.price || ownedCarIds.includes(car.id)) return;
    const nextCash = stats.cash - car.price;
    setStats((prev) => ({ ...prev, cash: nextCash }));
    setHud((prev) => ({ ...prev, cash: nextCash }));
    runtimeRef.current?.setCash(nextCash);
    setOwnedCarIds((prev) => [...prev, car.id]);
    setSelectedGarageCarId(car.id);
    runtimeRef.current?.spawnPurchasedCar(car, carColors[car.id], turboCarIds.includes(car.id));
    playTaxiComplete();
    setShopOpen(false);
    showToast(`Bought ${car.brand} ${car.name}! Parked outside the showroom — press E to drive!`);
  };

  const handleBuyTurbo = (carId: string) => {
    if (stats.cash < TURBO_UPGRADE_PRICE || turboCarIds.includes(carId)) return;
    const nextCash = stats.cash - TURBO_UPGRADE_PRICE;
    setStats((prev) => ({ ...prev, cash: nextCash }));
    setHud((prev) => ({ ...prev, cash: nextCash }));
    runtimeRef.current?.setCash(nextCash);
    setTurboCarIds((prev) => [...prev, carId]);
    playTaxiComplete();
    showToast('Turbo +25% Upgrade installed!');
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={canvasHostRef} className="fixed inset-0 z-[1] touch-none" />

      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 glass px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold text-white shadow-2xl pointer-events-none">
          {toast}
        </div>
      )}

      <GenderSelectScreen
        active={stage === 'gender'}
        selectedGender={character.gender}
        muted={muted}
        onSelectGender={handleSelectGender}
        onContinue={() => {
          if (!character.gender) return;
          playSFX('click');
          goToStage('customize');
        }}
        onToggleMute={handleToggleMute}
      />

      <CustomizerScreen
        active={stage === 'customize'}
        character={character}
        muted={muted}
        onChangeCharacter={handleChangeCharacter}
        onRandomize={handleRandomize}
        onBackToGender={() => {
          playSFX('click');
          goToStage('gender');
        }}
        onGoToLobby={() => {
          playSFX('select');
          runtimeRef.current?.setCharacter(character);
          goToStage('lobby');
        }}
        onToggleMute={handleToggleMute}
      />

      <LobbyScreen
        active={stage === 'lobby'}
        character={character}
        stats={stats}
        spawnKey={spawnKey}
        ownedCount={ownedCarIds.length}
        muted={muted}
        onSelectSpawn={(key) => {
          playSFX('click');
          setSpawnKey(key);
        }}
        onOpenGarage={() => {
          playSFX('click');
          setGarageOpen(true);
        }}
        onEditCharacter={() => {
          playSFX('click');
          goToStage('customize');
        }}
        onEnterWorld={() => {
          playSFX('select');
          const garageCar =
            CAR_SHOP_CATALOG.find((c) => c.id === selectedGarageCarId) ?? null;
          runtimeRef.current?.setCharacter(character);
          runtimeRef.current?.enterOpenWorld(
            spawnKey,
            garageCar,
            garageCar ? carColors[garageCar.id] : undefined,
            garageCar ? turboCarIds.includes(garageCar.id) : false
          );
          goToStage('world');
          showToast(
            garageCar
              ? `Welcome to Vice Coast! Your ${garageCar.brand} ${garageCar.name} is parked beside you.`
              : `Welcome to Vice Coast, ${character.name}!`
          );
        }}
        onToggleMute={handleToggleMute}
      />

      <WorldHud
        active={stage === 'world'}
        isMobile={isMobile}
        hud={hud}
        todIndex={todIndex}
        muted={muted}
        onSetMinimapCanvas={(el) => runtimeRef.current?.setMinimapCanvas(el)}
        onToggleDeviceMode={() => setMobileOverride(!isMobile)}
        onOpenMap={() => setMapOpen(true)}
        onOpenCarShop={() => setShopOpen(true)}
        onToggleStreetRace={() => runtimeRef.current?.toggleStreetRace()}
        onCycleTimeOfDay={() => {
          playSFX('click');
          runtimeRef.current?.cycleTimeOfDay();
        }}
        onToggleMute={handleToggleMute}
        onReturnToLobby={() => {
          playSFX('click');
          setMapOpen(false);
          setShopOpen(false);
          runtimeRef.current?.returnToLobby();
          goToStage('lobby');
        }}
        onToggleVehicle={() => runtimeRef.current?.toggleVehicle()}
        onToggleTaxiJob={() => runtimeRef.current?.toggleTaxiJob()}
        onStartHorn={() => runtimeRef.current?.startHorn()}
        onStopHorn={() => runtimeRef.current?.stopHorn()}
        onTouchMove={(x, y) => runtimeRef.current?.setTouchMove(x, y)}
        onTouchSprint={(s) => runtimeRef.current?.setTouchSprint(s)}
        onJump={() => runtimeRef.current?.triggerJump()}
      />

      <FullMapModal
        open={stage === 'world' && mapOpen}
        playerX={hud.playerX}
        playerZ={hud.playerZ}
        routeActive={hud.carShopRouteActive}
        onSetCarShopRoute={() => {
          runtimeRef.current?.setCarShopRoute(true);
          setMapOpen(false);
        }}
        onCancelRoute={() => runtimeRef.current?.setCarShopRoute(false)}
        onClose={() => setMapOpen(false)}
      />

      <CarShopModal
        open={stage === 'world' && shopOpen}
        cash={stats.cash}
        ownedIds={ownedCarIds}
        onBuyCar={handleBuyCar}
        onClose={() => setShopOpen(false)}
      />

      <GarageModal
        open={stage === 'lobby' && garageOpen}
        cash={stats.cash}
        ownedIds={ownedCarIds}
        selectedCarId={selectedGarageCarId}
        carColors={carColors}
        turboCarIds={turboCarIds}
        onSelectCar={(id) => setSelectedGarageCarId(id)}
        onRepaintCar={(carId, color) => {
          playSFX('click');
          setCarColors((prev) => ({ ...prev, [carId]: color }));
        }}
        onBuyTurbo={handleBuyTurbo}
        onClose={() => setGarageOpen(false)}
      />
    </div>
  );
}
export default App;
