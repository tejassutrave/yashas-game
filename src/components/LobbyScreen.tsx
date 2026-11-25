import {
  GENDER_CATALOG,
  type CharacterConfig,
  type PlayerStats,
  type SpawnKey,
} from '../types/game';

interface LobbyScreenProps {
  active: boolean;
  character: CharacterConfig;
  stats: PlayerStats;
  spawnKey: SpawnKey;
  ownedCount: number;
  muted: boolean;
  onSelectSpawn: (key: SpawnKey) => void;
  onOpenGarage: () => void;
  onEditCharacter: () => void;
  onEnterWorld: () => void;
  onToggleMute: () => void;
}

export function LobbyScreen({
  active,
  character,
  stats,
  spawnKey,
  ownedCount,
  muted,
  onSelectSpawn,
  onOpenGarage,
  onEditCharacter,
  onEnterWorld,
  onToggleMute,
}: LobbyScreenProps) {
  const g = character.gender || 'boy';

  return (
    <section
      className={`fixed inset-0 flex flex-col justify-between p-4 sm:p-7 transition-all duration-300 pointer-events-none ${
        active ? 'opacity-100 translate-y-0 z-20' : 'opacity-0 translate-y-3 z-10'
      }`}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
        <button
          type="button"
          onClick={onEditCharacter}
          className={`glass px-4 py-2 rounded-2xl text-xs sm:text-sm font-semibold text-white hover:bg-slate-800/70 flex items-center gap-2 ${
            active ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <span>←</span>
          <span>Edit Character</span>
        </button>

        <div className="glass px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-emerald-300">
          Step 3 of 3 • Vice Coast Lobby
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          className={`glass px-3.5 py-2 rounded-2xl text-xs font-semibold text-slate-200 ${
            active ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <span>{muted ? '🔇' : '🔊'}</span>
        </button>
      </div>

      {/* Bottom Cards */}
      <div className="w-full max-w-7xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-4">
        <div
          className={`glass rounded-3xl p-4 sm:p-5 w-full sm:w-96 space-y-3 ${
            active ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-sky-300 font-bold">
                Explorer Ready
              </div>
              <h2 className="font-display text-2xl font-extrabold text-white">
                {character.name || 'Explorer'}
              </h2>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${
                g === 'girl'
                  ? 'bg-pink-500/20 text-pink-300 border-pink-400/30'
                  : 'bg-sky-500/20 text-sky-300 border-sky-400/30'
              }`}
            >
              {GENDER_CATALOG[g].label}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-900/65 rounded-xl p-2 border border-white/10">
              <div className="text-[10px] uppercase text-slate-400 font-semibold">Level</div>
              <div className="font-display font-bold text-base text-white">{stats.level}</div>
            </div>
            <div className="bg-slate-900/65 rounded-xl p-2 border border-white/10">
              <div className="text-[10px] uppercase text-slate-400 font-semibold">XP</div>
              <div className="font-display font-bold text-base text-sky-300">{stats.xp}</div>
            </div>
            <div className="bg-slate-900/65 rounded-xl p-2 border border-white/10">
              <div className="text-[10px] uppercase text-slate-400 font-semibold">Cash</div>
              <div className="font-display font-bold text-base text-amber-300">₹{stats.cash}</div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/60 border border-white/10 p-3.5 space-y-1.5 text-xs text-slate-200">
            <div className="flex justify-between">
              <span className="text-slate-400">Mode</span>
              <span className="font-bold text-emerald-300">Open-World Free Roam</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">City Map</span>
              <span className="font-bold text-white">Vice Coast (20,000m × 20,000m)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Graphics</span>
              <span className="font-bold text-cyan-300">Bloom + PBR Reflections</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch sm:items-end gap-2.5">
          <button
            type="button"
            onClick={onOpenGarage}
            className={`glass px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-amber-300 border border-amber-400/40 hover:bg-amber-500/15 flex items-center justify-center gap-2 ${
              active ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            <span>🏎️</span>
            <span>Garage ({ownedCount} Cars)</span>
          </button>

          <div
            className={`glass rounded-2xl p-1.5 flex items-center gap-1 ${
              active ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            {(
              [
                ['ocean_drive', 'Ocean Drive'],
                ['downtown', 'Downtown'],
                ['palm_beach', 'Palm Beach'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onSelectSpawn(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  spawnKey === key
                    ? 'bg-sky-500/30 border border-sky-400/60 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onEnterWorld}
            className={`btn-glow px-9 py-4 rounded-2xl font-display font-extrabold text-lg sm:text-xl text-white tracking-wide flex items-center justify-center gap-3 ${
              active ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            <span>Enter Vice Coast</span>
            <span>🌴</span>
          </button>
        </div>
      </div>
    </section>
  );
}

