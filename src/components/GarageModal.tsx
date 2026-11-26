import {
  CAR_SHOP_CATALOG,
  REPAINT_PALETTE,
  TURBO_UPGRADE_PRICE,
  type ShopCarSpec,
} from '../types/game';

interface GarageModalProps {
  open: boolean;
  cash: number;
  ownedIds: string[];
  selectedCarId: string | null;
  carColors: Record<string, number>;
  turboCarIds: string[];
  onSelectCar: (id: string | null) => void;
  onRepaintCar: (carId: string, color: number) => void;
  onBuyTurbo: (carId: string) => void;
  onClose: () => void;
}

export function GarageModal({
  open,
  cash,
  ownedIds,
  selectedCarId,
  carColors,
  turboCarIds,
  onSelectCar,
  onRepaintCar,
  onBuyTurbo,
  onClose,
}: GarageModalProps) {
  if (!open) return null;

  const ownedCars: ShopCarSpec[] = CAR_SHOP_CATALOG.filter((c) => ownedIds.includes(c.id));

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass rounded-3xl p-5 sm:p-6 w-full max-w-2xl max-h-[85vh] flex flex-col gap-4 border border-amber-400/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-amber-300">
              Your Personal Collection &amp; Tuning
            </div>
            <h2 className="font-display text-2xl font-extrabold text-white">Lobby Garage</h2>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="glass px-3.5 py-1.5 rounded-xl text-xs font-extrabold text-emerald-300 border border-emerald-400/30">
              ₹{cash.toLocaleString()}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="glass px-3.5 py-2 rounded-xl text-sm font-bold text-white hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>

        {ownedCars.length === 0 ? (
          <div className="rounded-2xl bg-slate-900/70 border border-white/10 p-8 text-center space-y-2">
            <div className="text-4xl">🏎️</div>
            <div className="font-display font-bold text-lg text-white">Your Garage is Empty</div>
            <p className="text-xs text-slate-300 max-w-sm mx-auto">
              Drive a yellow Taxi in Vice Coast, press <strong>CapsLock</strong> to earn Rupees (₹), or win <strong>Street Races (R)</strong>, then visit <strong>THE CAR SHOP</strong>!
            </p>
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto custom-scroll pr-1">
            {ownedCars.map((car) => {
              const selected = selectedCarId === car.id;
              const activeColor = carColors[car.id] ?? car.color;
              const hasTurbo = turboCarIds.includes(car.id);
              const cssColor = '#' + activeColor.toString(16).padStart(6, '0');
              return (
                <div
                  key={car.id}
                  className={`rounded-2xl p-4 border space-y-3 ${
                    selected
                      ? 'bg-sky-500/15 border-sky-400'
                      : 'bg-slate-900/75 border-white/10'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl border border-white/25 shrink-0"
                        style={{ backgroundColor: cssColor }}
                      />
                      <div>
                        <div className="font-display font-bold text-sm text-white flex items-center gap-2">
                          <span>
                            {car.brand} {car.name}
                          </span>
                          {hasTurbo && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-300 border border-amber-400/40 font-extrabold">
                              TURBO +25%
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          {car.category} • {hasTurbo ? Math.round(car.topSpeedKmh * 1.25) : car.topSpeedKmh} km/h
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!hasTurbo && (
                        <button
                          type="button"
                          disabled={cash < TURBO_UPGRADE_PRICE}
                          onClick={() => onBuyTurbo(car.id)}
                          className="glass px-3 py-1.5 rounded-xl text-xs font-bold text-amber-300 border border-amber-400/40 disabled:opacity-40"
                        >
                          Turbo ₹{TURBO_UPGRADE_PRICE.toLocaleString()}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectCar(selected ? null : car.id)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold ${
                          selected
                            ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                            : 'btn-glow text-white'
                        }`}
                      >
                        {selected ? 'Active Spawn ✓' : 'Spawn With Car'}
                      </button>
                    </div>
                  </div>

                  {/* Repaint Swatches */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-400 mr-1">Repaint:</span>
                    {REPAINT_PALETTE.map((hex) => {
                      const swCss = '#' + hex.toString(16).padStart(6, '0');
                      return (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => onRepaintCar(car.id, hex)}
                          style={{ backgroundColor: swCss }}
                          className={`w-5 h-5 rounded-full border border-white/25 transition-transform ${
                            activeColor === hex ? 'scale-125 ring-2 ring-sky-400' : 'hover:scale-110'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
