import { useState } from 'react';
import {
  GENDER_CATALOG,
  PALETTES,
  type CharacterConfig,
  type CustomTab,
} from '../types/game';

interface CustomizerScreenProps {
  active: boolean;
  character: CharacterConfig;
  muted: boolean;
  onChangeCharacter: (next: CharacterConfig) => void;
  onRandomize: () => void;
  onBackToGender: () => void;
  onGoToLobby: () => void;
  onToggleMute: () => void;
}

export function CustomizerScreen({
  active,
  character,
  muted,
  onChangeCharacter,
  onRandomize,
  onBackToGender,
  onGoToLobby,
  onToggleMute,
}: CustomizerScreenProps) {
  const [tab, setTab] = useState<CustomTab>('hair');
  const g = character.gender || 'boy';
  const cat = GENDER_CATALOG[g];

  const update = (partial: Partial<CharacterConfig>) => {
    onChangeCharacter({ ...character, ...partial });
  };

  const renderSwatches = (
    label: string,
    colors: readonly number[],
    prop: 'skin' | 'hair' | 'eyes' | 'primary' | 'secondary' | 'shoes'
  ) => (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {colors.map((hex) => {
          const cssHex = '#' + hex.toString(16).padStart(6, '0');
          const isSelected = character[prop] === hex;
          return (
            <button
              key={hex}
              type="button"
              onClick={() => update({ [prop]: hex })}
              style={{ backgroundColor: cssHex }}
              className={`w-7 h-7 rounded-full border border-white/25 transition-transform ${
                isSelected
                  ? 'scale-115 ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-900'
                  : 'hover:scale-110'
              }`}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <section
      className={`fixed inset-0 flex flex-col justify-between p-3 sm:p-6 transition-all duration-300 pointer-events-none ${
        active ? 'opacity-100 translate-y-0 z-20' : 'opacity-0 translate-y-3 z-10'
      }`}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
        <button
          type="button"
          onClick={onBackToGender}
          className={`glass px-4 py-2 rounded-2xl text-xs sm:text-sm font-semibold text-white hover:bg-slate-800/70 flex items-center gap-2 ${
            active ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <span>←</span>
          <span>Change Gender</span>
        </button>

        <div className="glass px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-sky-300">
          Step 2 of 3 • {cat.label} Studio
        </div>

        <div
          className={`flex items-center gap-2 ${
            active ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <button
            type="button"
            onClick={onRandomize}
            className="glass px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-semibold text-amber-300 hover:text-amber-200 flex items-center gap-1.5"
          >
            <span>🎲</span>
            <span className="hidden sm:inline">Randomize</span>
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className="glass px-3 py-2 rounded-2xl text-xs font-semibold text-slate-200"
          >
            <span>{muted ? '🔇' : '🔊'}</span>
          </button>
        </div>
      </div>

      {/* Middle Dock */}
      <div className="w-full max-w-7xl mx-auto my-auto flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div
          className={`glass w-full lg:w-[410px] max-h-[58vh] lg:max-h-[76vh] rounded-3xl p-4 sm:p-5 flex flex-col justify-between overflow-y-auto custom-scroll ${
            active ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Character Name
              </label>
              <input
                type="text"
                maxLength={16}
                value={character.name}
                onChange={(e) => update({ name: e.target.value || 'Explorer' })}
                placeholder="Enter name..."
                className="w-full bg-slate-900/75 border border-white/15 focus:border-sky-400 rounded-xl px-3.5 py-2 text-sm font-semibold text-white outline-none"
              />
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-3 gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-white/10">
              {(
                [
                  ['hair', 'Face & Hair'],
                  ['outfit', 'Outfit'],
                  ['gear', 'Gear'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                    tab === id
                      ? 'bg-sky-500/25 border border-sky-400/50 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'hair' && (
              <div className="space-y-3.5">
                <div>
                  <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    <span>Hairstyle</span>
                    <span className="text-sky-300">
                      {cat.hairstyles.find((h) => h.id === character.hairstyle)?.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {cat.hairstyles.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => update({ hairstyle: item.id })}
                        className={`px-2.5 py-2 rounded-xl text-xs font-semibold text-left border transition-all ${
                          character.hairstyle === item.id
                            ? 'bg-sky-500/25 border-sky-400 text-white'
                            : 'bg-slate-900/55 border-white/10 text-slate-300 hover:bg-slate-800/70'
                        }`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
                {renderSwatches('Hair Color', PALETTES.hair, 'hair')}
                {renderSwatches('Skin Tone', PALETTES.skin, 'skin')}
                {renderSwatches('Eye Color', PALETTES.eyes, 'eyes')}
              </div>
            )}

            {tab === 'outfit' && (
              <div className="space-y-3.5">
                <div>
                  <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    <span>Outfit Style</span>
                    <span className="text-sky-300">
                      {cat.outfits.find((o) => o.id === character.outfit)?.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {cat.outfits.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => update({ outfit: item.id })}
                        className={`px-2.5 py-2 rounded-xl text-xs font-semibold text-left border transition-all ${
                          character.outfit === item.id
                            ? 'bg-sky-500/25 border-sky-400 text-white'
                            : 'bg-slate-900/55 border-white/10 text-slate-300 hover:bg-slate-800/70'
                        }`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
                {renderSwatches('Primary Color', PALETTES.primary, 'primary')}
                {renderSwatches('Secondary Color', PALETTES.secondary, 'secondary')}
              </div>
            )}

            {tab === 'gear' && (
              <div className="space-y-3.5">
                <div>
                  <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    <span>Accessory</span>
                    <span className="text-sky-300">
                      {cat.accessories.find((a) => a.id === character.accessory)?.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {cat.accessories.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => update({ accessory: item.id })}
                        className={`px-2.5 py-2 rounded-xl text-xs font-semibold text-left border transition-all ${
                          character.accessory === item.id
                            ? 'bg-sky-500/25 border-sky-400 text-white'
                            : 'bg-slate-900/55 border-white/10 text-slate-300 hover:bg-slate-800/70'
                        }`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
                {renderSwatches('Footwear Color', PALETTES.shoes, 'shoes')}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onGoToLobby}
            className="btn-glow w-full mt-4 py-3.5 rounded-2xl font-display font-bold text-base text-white tracking-wide flex items-center justify-center gap-2"
          >
            <span>Go to Lobby</span>
            <span>→</span>
          </button>
        </div>

        <div className="hidden lg:flex flex-col items-end text-right pr-4">
          <div className="glass px-4 py-2.5 rounded-2xl text-xs text-slate-200 space-y-1">
            <div className="font-bold text-white">3D Turntable Controls</div>
            <div>Drag anywhere to spin 360°</div>
            <div>Scroll wheel / Pinch to zoom</div>
          </div>
        </div>
      </div>

      <div className="h-2" />
    </section>
  );
}

