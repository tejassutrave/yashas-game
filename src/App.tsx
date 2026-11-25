import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createInitialCharacter,
  GENDER_CATALOG,
  PALETTES,
  type CharacterConfig,
  type GameStage,
  type GenderKey,
  type PlayerStats,
  type SpawnKey,
  type WorldHudSnapshot,
} from './types/game';
import { isMuted, playSFX, setMuted } from './audio/sfx';
import { createViceCoastRuntime } from './engine/viceCoastRuntime';
import { GenderSelectScreen } from './components/GenderSelectScreen';
import { CustomizerScreen } from './components/CustomizerScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { WorldHud } from './components/WorldHud';

export function App() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<ReturnType<typeof createViceCoastRuntime> | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [stage, setStage] = useState<GameStage>('gender');
  const [character, setCharacter] = useState<CharacterConfig>(createInitialCharacter);
  const [stats] = useState<PlayerStats>({ level: 1, xp: 0, cash: 250 });
  const [spawnKey, setSpawnKey] = useState<SpawnKey>('ocean_drive');
  const [todIndex, setTodIndex] = useState(0);
  const [muted, setMutedState] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hud, setHud] = useState<WorldHudSnapshot>({
    district: 'Ocean Drive',
    speedKmh: 0,
    fps: 60,
    inVehicle: false,
    vehicleName: null,
    nearbyVehicleName: null,
  });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
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
      onHudUpdate: (snapshot) => setHud(snapshot),
      onToast: (msg) => showToast(msg),
      onTimeOfDayChanged: (idx) => setTodIndex(idx),
    });
    runtimeRef.current = runtime;

    return () => {
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, [handleSelectGender, showToast]);

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

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* 3D WebGL Canvas Host */}
      <div ref={canvasHostRef} className="fixed inset-0 z-[1] touch-none" />

      {/* Toast Notification */}
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
        muted={muted}
        onSelectSpawn={(key) => {
          playSFX('click');
          setSpawnKey(key);
        }}
        onEditCharacter={() => {
          playSFX('click');
          goToStage('customize');
        }}
        onEnterWorld={() => {
          playSFX('select');
          runtimeRef.current?.setCharacter(character);
          runtimeRef.current?.enterOpenWorld(spawnKey);
          goToStage('world');
          showToast(`Welcome to Vice Coast, ${character.name}!`);
        }}
        onToggleMute={handleToggleMute}
      />

      <WorldHud
        active={stage === 'world'}
        hud={hud}
        todIndex={todIndex}
        muted={muted}
        onSetMinimapCanvas={(el) => runtimeRef.current?.setMinimapCanvas(el)}
        onCycleTimeOfDay={() => {
          playSFX('click');
          runtimeRef.current?.cycleTimeOfDay();
        }}
        onToggleMute={handleToggleMute}
        onReturnToLobby={() => {
          playSFX('click');
          runtimeRef.current?.returnToLobby();
          goToStage('lobby');
        }}
        onToggleVehicle={() => runtimeRef.current?.toggleVehicle()}
        onStartHorn={() => runtimeRef.current?.startHorn()}
        onStopHorn={() => runtimeRef.current?.stopHorn()}
        onTouchMove={(x, y) => runtimeRef.current?.setTouchMove(x, y)}
        onTouchSprint={(s) => runtimeRef.current?.setTouchSprint(s)}
        onJump={() => runtimeRef.current?.triggerJump()}
      />
    </div>
  );
}
export default App;

