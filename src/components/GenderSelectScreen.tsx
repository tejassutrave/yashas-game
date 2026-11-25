import type { GenderKey } from '../types/game';

interface GenderSelectScreenProps {
  active: boolean;
  selectedGender: GenderKey | null;
  muted: boolean;
  onSelectGender: (gender: GenderKey) => void;
  onContinue: () => void;
  onToggleMute: () => void;
}

export function GenderSelectScreen({
  active,
  selectedGender,
  muted,
  onSelectGender,
  onContinue,
  onToggleMute,
}: GenderSelectScreenProps) {
  return (
    <section
      className={`fixed inset-0 flex flex-col justify-between p-4 sm:p-8 transition-all duration-300 pointer-events-none ${
        active ? 'opacity-100 translate-y-0 z-20' : 'opacity-0 translate-y-3 z-10'
      }`}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between w-full max-w-6xl mx-auto">
        <div
          className={`glass px-4 py-2 rounded-2xl flex items-center gap-3 ${
            active ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center font-display font-extrabold text-white text-sm shadow">
            VC
          </div>
          <div>
            <div className="font-display font-bold text-sm sm:text-base leading-none text-white">
              VICE COAST
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-sky-300 font-semibold mt-0.5">
              3D Open World
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          className={`glass px-3.5 py-2 rounded-2xl text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 ${
            active ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <span>{muted ? '🔇' : '🔊'}</span>
          <span className="hidden sm:inline">Sound</span>
        </button>
      </div>

      {/* Center Title */}
      <div className="text-center max-w-xl mx-auto my-auto">
        <div className="glass inline-block px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.22em] text-sky-300 mb-3">
          Step 1 of 3 • Character Select
        </div>
        <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.65)]">
          Choose Your Hero
        </h1>
        <p className="text-xs sm:text-sm text-slate-200/90 mt-2 drop-shadow">
          Click a character in the 3D scene or use the cards below. Drag anywhere to orbit.
        </p>
      </div>

      {/* Bottom Cards & CTA */}
      <div className="w-full max-w-3xl mx-auto flex flex-col items-center gap-3.5">
        <div className="grid grid-cols-2 gap-3 sm:gap-5 w-full">
          <button
            type="button"
            onClick={() => onSelectGender('boy')}
            className={`glass rounded-2xl p-3 sm:p-4 text-left transition-all border-2 ${
              selectedGender === 'boy'
                ? 'border-sky-400 bg-sky-500/15'
                : 'border-transparent hover:border-sky-400/50'
            } ${active ? 'pointer-events-auto' : 'pointer-events-none'}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-300">
                Character 01
              </span>
              <span
                className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] ${
                  selectedGender === 'boy'
                    ? 'bg-sky-400 border-sky-400 text-slate-950 font-bold'
                    : 'border-white/30'
                }`}
              >
                {selectedGender === 'boy' ? '✓' : ''}
              </span>
            </div>
            <div className="font-display text-lg sm:text-2xl font-bold text-white mt-1">Boy</div>
            <div className="text-[11px] sm:text-xs text-slate-300/80 mt-0.5">
              Streetwear, Jackets, Caps &amp; Visors
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectGender('girl')}
            className={`glass rounded-2xl p-3 sm:p-4 text-left transition-all border-2 ${
              selectedGender === 'girl'
                ? 'border-pink-400 bg-pink-500/15'
                : 'border-transparent hover:border-pink-400/50'
            } ${active ? 'pointer-events-auto' : 'pointer-events-none'}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-pink-300">
                Character 02
              </span>
              <span
                className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] ${
                  selectedGender === 'girl'
                    ? 'bg-pink-400 border-pink-400 text-slate-950 font-bold'
                    : 'border-white/30'
                }`}
              >
                {selectedGender === 'girl' ? '✓' : ''}
              </span>
            </div>
            <div className="font-display text-lg sm:text-2xl font-bold text-white mt-1">Girl</div>
            <div className="text-[11px] sm:text-xs text-slate-300/80 mt-0.5">
              Trendy Coats, Ponytails, Berets &amp; Shades
            </div>
          </button>
        </div>

        <button
          type="button"
          disabled={!selectedGender}
          onClick={onContinue}
          className={`btn-glow w-full sm:w-auto px-10 py-3.5 rounded-2xl font-display font-bold text-base sm:text-lg text-white tracking-wide flex items-center justify-center gap-2.5 ${
            active ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <span>Customize Character</span>
          <span>→</span>
        </button>
      </div>
    </section>
  );
}

