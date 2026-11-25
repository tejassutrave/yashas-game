import { CAR_SHOP_CATALOG, type ShopCarSpec } from '../types/game';

interface CarShopModalProps {
  open: boolean;
  cash: number;
  ownedIds: string[];
  onBuyCar: (car: ShopCarSpec) => void;
  onClose: () => void;
}

export function CarShopModal({
  open,
  cash,
  ownedIds,
  onBuyCar,
  onClose,
}: CarShopModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass rounded-3xl p-5 sm:p-6 w-full max-w-4xl max-h-[88vh] flex flex-col gap-4 border border-sky-400/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-sky-300">
              Vice Coast Showroom
            </div>
            <h2 className="font-display text-2xl font-extrabold text-white">THE CAR SHOP</h2>
            <p className="text-xs text-slate-300">
              Bought cars spawn outside in the showroom parking and unlock in your Lobby Garage!
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="glass px-4 py-2 rounded-xl text-sm font-extrabold text-emerald-300 border border-emerald-400/30">
              Wallet: ₹{cash.toLocaleString()}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="glass px-3.5 py-2 rounded-xl text-sm font-bold text-white hover:bg-slate-800"
            >
              Exit Shop
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 overflow-y-auto custom-scroll pr-1">
          {CAR_SHOP_CATALOG.map((car, index) => {
            const owned = ownedIds.includes(car.id);
            const canAfford = cash >= car.price;
            const cssColor = '#' + car.color.toString(16).padStart(6, '0');
            const isSuper = car.category === 'Supercar';

            return (
              <div
                key={car.id}
                className={`rounded-2xl p-4 border flex items-center justify-between gap-3 ${
                  isSuper
                    ? 'bg-gradient-to-r from-slate-900/90 to-amber-950/35 border-amber-400/30'
                    : 'bg-slate-900/75 border-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl border border-white/25 flex items-center justify-center font-display font-extrabold text-xs shadow-lg shrink-0"
                    style={{ backgroundColor: cssColor, color: car.color === 0xf8fafc || car.color === 0xe2e8f0 || car.color === 0xfacc15 ? '#0f172a' : '#ffffff' }}
                  >
                    #{index + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold text-sm sm:text-base text-white">
                        {car.brand} {car.name}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          isSuper
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                            : 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                        }`}
                      >
                        {car.category}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Top Speed: <strong className="text-slate-200">{car.topSpeedKmh} km/h</strong>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="font-display font-extrabold text-sm text-emerald-300">
                    ₹{car.price.toLocaleString()}
                  </div>
                  {owned ? (
                    <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-bold">
                      Owned ✓
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={!canAfford}
                      onClick={() => onBuyCar(car)}
                      className="btn-glow px-4 py-1.5 rounded-xl text-xs font-bold text-white"
                    >
                      {canAfford ? 'Buy Car' : 'Need ₹'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

