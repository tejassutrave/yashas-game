import { useEffect, useRef } from 'react';
import { TIME_PRESETS_META, type WorldHudSnapshot } from '../types/game';

interface WorldHudProps {
  active: boolean;
  hud: WorldHudSnapshot;
  todIndex: number;
  muted: boolean;
  onSetMinimapCanvas: (el: HTMLCanvasElement | null) => void;
  onOpenMap: () => void;
  onOpenCarShop: () => void;
  onCycleTimeOfDay: () => void;
  onToggleMute: () => void;
  onReturnToLobby: () => void;
  onToggleVehicle: () => void;
  onToggleTaxiJob: () => void;
  onStartHorn: () => void;
  onStopHorn: () => void;
  onTouchMove: (x: number, y: number) => void;
  onTouchSprint: (sprint: boolean) => void;
  onJump: () => void;
}

export function WorldHud({
  active,
  hud,
  todIndex,
  muted,
  onSetMinimapCanvas,
  onOpenMap,
  onOpenCarShop,
  onCycleTimeOfDay,
  onToggleMute,
  onReturnToLobby,
  onToggleVehicle,
  onToggleTaxiJob,
  onStartHorn,
  onStopHorn,
  onTouchMove,
  onTouchSprint,
  onJump,
}: WorldHudProps) {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const joyIdRef = useRef<number | null>(null);

  useEffect(() => {
    onSetMinimapCanvas(minimapRef.current);
    return () => onSetMinimapCanvas(null);
  }, [onSetMinimapCanvas]);

  const tod = TIME_PRESETS_META[todIndex] || TIME_PRESETS_META[0];
  const showVehiclePrompt = hud.inVehicle || Boolean(hud.nearbyVehicleName);

  const handleJoyUpdate = (zone: HTMLDivElement, clientX: number, clientY: number) => {
    const r = zone.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const maxR = 34;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    onTouchMove(dx / maxR, dy / maxR);
  };

  return (
    <section
      className={`fixed inset-0 transition-all duration-300 pointer-events-none ${
        active ? 'opacity-100 z-20' : 'opacity-0 z-10'
      }`}
    >
      {/* Top-Left Live Minimap & FPS (Click to Open Full Map) */}
      <div
        className={`fixed top-3 left-3 sm:top-5 sm:left-5 flex flex-col gap-2 ${
          active ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={onOpenMap}
          title="Click or press M to open City Map"
          className="glass rounded-2xl p-2 border border-white/20 hover:border-sky-400/60 shadow-2xl text-left cursor-pointer"
        >
          <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-xl overflow-hidden bg-slate-950/90">
            <canvas ref={minimapRef} className="w-full h-full block" />
            <div className="absolute top-1.5 left-1.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-slate-950/75 text-sky-300">
              MAP (M)
            </div>
            <div className="absolute top-1.5 right-1.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-slate-950/70 text-emerald-300">
              {hud.fps} FPS
            </div>
            <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-white/90 bg-slate-950/70 px-1.5 py-0.5 rounded">
              <span className="truncate text-sky-300">{hud.district}</span>
              <span className="text-emerald-300 ml-1">{hud.speedKmh} km/h</span>
            </div>
          </div>
        </button>
      </div>

      {/* Top-Right Quick Controls & Wallet */}
      <div
        className={`fixed top-3 right-3 sm:top-5 sm:right-5 flex items-center gap-2 ${
          active ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <div className="glass px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold text-emerald-300 border border-emerald-400/30">
          ₹{hud.cash}
        </div>
        <button
          type="button"
          onClick={onCycleTimeOfDay}
          className="glass px-3 py-2 rounded-xl text-xs font-bold text-amber-200 hover:text-white flex items-center gap-1.5"
          title="Cycle Time of Day"
        >
          <span>{tod.icon}</span>
          <span className="hidden sm:inline">{tod.label}</span>
        </button>
        <button
          type="button"
          onClick={onToggleMute}
          className="glass px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:text-white"
        >
          <span>{muted ? '🔇' : '🔊'}</span>
        </button>
        <button
          type="button"
          onClick={onReturnToLobby}
          className="glass px-3.5 py-2 rounded-xl text-xs font-bold text-white hover:bg-slate-800/80 flex items-center gap-1.5"
        >
          <span>←</span>
          <span>Lobby</span>
        </button>
      </div>

      {/* Taxi Job Dispatch Banner */}
      {hud.taxiJob.active && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 glass px-4 py-2 rounded-2xl border border-amber-400/40 flex items-center gap-3 text-xs sm:text-sm shadow-2xl">
          <span className="text-lg">🚕</span>
          <div>
            <div className="font-bold text-white">
              {hud.taxiJob.phase === 'pickup' ? 'Pick up Passenger' : 'Drop off Passenger'}
              <span className="ml-2 text-amber-300">({hud.taxiJob.tier})</span>
            </div>
            <div className="text-[11px] text-slate-300">
              Distance: <strong className="text-sky-300">{hud.taxiJob.distanceMeters}m</strong> • Fare:{' '}
              <strong className="text-emerald-300">₹{hud.taxiJob.fareRupees}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Vehicle & Car Shop Interaction Prompt */}
      {(showVehiclePrompt || hud.nearCarShop) && (
        <div
          className={`fixed bottom-24 sm:bottom-8 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-2.5 ${
            active ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          {hud.nearCarShop && (
            <button
              type="button"
              onClick={onOpenCarShop}
              className="btn-glow px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-white flex items-center gap-2 shadow-xl"
            >
              <span>🏪</span>
              <span>Enter THE CAR SHOP</span>
            </button>
          )}
          {showVehiclePrompt && (
            <>
              <button
                type="button"
                onClick={onToggleVehicle}
                className="glass px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-white border border-sky-400/50 hover:bg-sky-500/20 flex items-center gap-2 shadow-xl"
              >
                <span className="px-2 py-0.5 rounded bg-sky-500/30 text-sky-200 font-extrabold text-xs">
                  E
                </span>
                <span>
                  {hud.inVehicle
                    ? `Exit ${hud.vehicleName || 'Vehicle'}`
                    : `Enter ${hud.nearbyVehicleName || 'Vehicle'}`}
                </span>
              </button>

              {hud.inVehicle && hud.vehicleStyle === 'taxi' && (
                <button
                  type="button"
                  onClick={onToggleTaxiJob}
                  className="glass px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-yellow-300 border border-yellow-400/50 hover:bg-yellow-500/20 flex items-center gap-1.5 shadow-xl"
                >
                  <span>🚕</span>
                  <span>{hud.taxiJob.active ? 'Cancel Job (CapsLock)' : 'Taxi Job (CapsLock)'}</span>
                </button>
              )}

              {hud.inVehicle && (
                <button
                  type="button"
                  onPointerDown={onStartHorn}
                  onPointerUp={onStopHorn}
                  onPointerLeave={onStopHorn}
                  onPointerCancel={onStopHorn}
                  className="glass px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-amber-300 border border-amber-400/40 hover:bg-amber-500/20 flex items-center gap-1.5 shadow-xl"
                >
                  <span>{hud.vehicleStyle === 'cycle' ? '🔔' : '📢'}</span>
                  <span>{hud.vehicleStyle === 'cycle' ? 'Bell (H)' : 'Horn (H)'}</span>
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Desktop Controls Hint */}
      <div className="hidden md:flex fixed bottom-5 left-5 glass px-4 py-2 rounded-2xl text-[11px] text-slate-200/90 items-center gap-3">
        <span>
          <strong className="text-white">WASD</strong> Move / Drive
        </span>
        <span>•</span>
        <span>
          <strong className="text-white">Shift</strong> Sprint / Boost
        </span>
        <span>•</span>
        <span>
          <strong className="text-white">Space</strong> Jump / Brake
        </span>
        <span>•</span>
        <span>
          <strong className="text-white">Drag</strong> Orbit Camera
        </span>
      </div>

      {/* Mobile Touch Controls */}
      <div className="md:hidden fixed inset-0 pointer-events-none">
        <div
          onPointerDown={(e) => {
            joyIdRef.current = e.pointerId;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Ignore
            }
            handleJoyUpdate(e.currentTarget, e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (e.pointerId === joyIdRef.current) {
              handleJoyUpdate(e.currentTarget, e.clientX, e.clientY);
            }
          }}
          onPointerUp={(e) => {
            if (e.pointerId === joyIdRef.current) {
              joyIdRef.current = null;
              onTouchMove(0, 0);
              if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)';
            }
          }}
          onPointerCancel={(e) => {
            if (e.pointerId === joyIdRef.current) {
              joyIdRef.current = null;
              onTouchMove(0, 0);
              if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)';
            }
          }}
          className={`fixed bottom-5 left-5 w-28 h-28 rounded-full glass flex items-center justify-center touch-none ${
            active ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <div
            ref={knobRef}
            className="w-11 h-11 rounded-full bg-white/30 border border-white/50 shadow-lg"
          />
        </div>

        <div
          className={`fixed bottom-6 right-5 flex flex-col gap-2.5 ${
            active ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          {showVehiclePrompt && (
            <button
              type="button"
              onClick={onToggleVehicle}
              className="glass px-4 py-2.5 rounded-2xl text-xs font-bold text-sky-300 border border-sky-400/50"
            >
              {hud.inVehicle ? 'Exit' : 'Enter'}
            </button>
          )}
          <div className="flex gap-2.5">
            <button
              type="button"
              onPointerDown={() => onTouchSprint(true)}
              onPointerUp={() => onTouchSprint(false)}
              onPointerCancel={() => onTouchSprint(false)}
              className="glass w-14 h-14 rounded-2xl text-xs font-bold text-amber-300"
            >
              RUN
            </button>
            <button
              type="button"
              onClick={onJump}
              className="glass w-14 h-14 rounded-2xl text-xs font-bold text-white"
            >
              JUMP
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

