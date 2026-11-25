import { CAR_SHOP_CATALOG, type ShopCarSpec } from '../types/game';

interface GarageModalProps {
  open: boolean;
  ownedIds: string[];
  selectedCarId: string | null;
  onSelectCar: (id: string | null) => void;
  onClose: () => void;
}

export function GarageModal({
  open,
  ownedIds,
  selectedCarId,
  onSelectCar,
  onClose,
}: GarageModalProps) {
  if (!open) return null;

  const ownedCars: ShopCarSpec[] = CAR_SHOP_CATALOG.filter((c) => ownedIds.includes(c.id));

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass rounded-3xl p-5 sm:p-6 w-full max-w-2xl max-h-[82vh] flex flex-col gap-4 border border-amber-400/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-amber-300">
              Your Personal Collection
            </div>
            <h2 className="font-display text-2xl font-extrabold text-white">Lobby Garage</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="glass px-3.5 py-2 rounded-xl text-sm font-bold text-white hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        {ownedCars.length === 0 ? (
          <div className="rounded-2xl bg-slate-900/70 border border-white/10 p-8 text-center space-y-2">
            <div className="text-4xl">🏎️</div>
            <div className="font-display font-bold text-lg text-white">Your Garage is Empty</div>
            <p className="text-xs text-slate-300 max-w-sm mx-auto">
              Drive a yellow Taxi in Vice Coast, press <strong>CapsLock</strong> to earn Rupees (₹), then visit <strong>THE CAR SHOP</strong> on the map to buy cars!
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 overflow-y-auto custom-scroll pr-1">
            {ownedCars.map((car) => {
              const selected = selectedCarId === car.id;
              const cssColor = '#' + car.color.toString(16).padStart(6, '0');
              return (
                <div
                  key={car.id}
                  className={`rounded-2xl p-3.5 border flex items-center justify-between gap-3 ${
                    selected
                      ? 'bg-sky-500/20 border-sky-400'
                      : 'bg-slate-900/75 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl border border-white/25 shrink-0"
                      style={{ backgroundColor: cssColor }}
                    />
                    <div>
                      <div className="font-display font-bold text-sm text-white">
                        {car.brand} {car.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {car.category} • {car.topSpeedKmh} km/h
                      </div>
                    </div>
                  </div>
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

