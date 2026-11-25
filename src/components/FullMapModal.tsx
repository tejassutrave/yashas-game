import { useEffect, useRef } from 'react';
import { CAR_SHOP_LOCATION } from '../types/game';

interface FullMapModalProps {
  open: boolean;
  playerX: number;
  playerZ: number;
  routeActive: boolean;
  onSetCarShopRoute: () => void;
  onCancelRoute: () => void;
  onClose: () => void;
}

const ROAD_COORDS = [-168, -84, 0, 84, 168];

export function FullMapModal({
  open,
  playerX,
  playerZ,
  routeActive,
  onSetCarShopRoute,
  onCancelRoute,
  onClose,
}: FullMapModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shopScreenRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const span = 540;
    const scale = w / span;
    const toX = (wx: number) => w / 2 + wx * scale;
    const toY = (wz: number) => h / 2 + wz * scale;

    // Background & Ocean/Beach
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#d4bc8b';
    ctx.fillRect(toX(195), 0, 90 * scale, h);
    ctx.fillStyle = '#0c7fa8';
    ctx.fillRect(toX(275), 0, w, h);

    // City Parks
    ctx.fillStyle = '#2e6f40';
    ctx.fillRect(toX(-24), toY(-24), 48 * scale, 48 * scale);
    ctx.fillRect(toX(-146), toY(-146), 40 * scale, 40 * scale);
    ctx.fillRect(toX(106), toY(106), 40 * scale, 40 * scale);

    // Road Grid
    ctx.fillStyle = '#0f172a';
    ROAD_COORDS.forEach((rc) => {
      ctx.fillRect(toX(rc - 8), toY(-230), 16 * scale, 460 * scale);
      ctx.fillRect(toX(-230), toY(rc - 8), 415 * scale, 16 * scale);
    });

    // Outer Ring Road
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 14 * scale;
    ctx.beginPath();
    ctx.arc(toX(-10), toY(0), 278 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Blue GPS Road Route to The Car Shop (when active)
    if (routeActive) {
      const nearestRoad = (val: number) => {
        let best = ROAD_COORDS[0];
        let bestD = Infinity;
        for (const rc of ROAD_COORDS) {
          const d = Math.abs(val - rc);
          if (d < bestD) {
            bestD = d;
            best = rc;
          }
        }
        return best;
      };
      const startX = nearestRoad(playerX);
      const startZ = nearestRoad(playerZ);
      const pts = [
        { x: playerX, z: playerZ },
        { x: startX, z: playerZ },
        { x: startX, z: startZ },
        { x: 84, z: startZ },
        { x: 84, z: CAR_SHOP_LOCATION.z },
        { x: CAR_SHOP_LOCATION.x, z: CAR_SHOP_LOCATION.z },
      ];
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(toX(pts[0].x), toY(pts[0].z));
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(toX(pts[i].x), toY(pts[i].z));
      }
      ctx.stroke();
    }

    // THE CAR SHOP Pin & Label
    const sx = toX(CAR_SHOP_LOCATION.x);
    const sy = toY(CAR_SHOP_LOCATION.z);
    shopScreenRef.current = { x: sx, y: sy };

    ctx.fillStyle = '#0ea5e9';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sx, sy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(sx - 54, sy - 32, 108, 19);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - 54, sy - 32, 108, 19);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THE CAR SHOP', sx, sy - 19);

    // Player Marker
    const px = toX(playerX);
    const py = toY(playerZ);
    ctx.fillStyle = '#22c55e';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, [open, playerX, playerZ, routeActive]);

  if (!open) return null;

  const handleMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const dist = Math.hypot(cx - shopScreenRef.current.x, cy - shopScreenRef.current.y);
    if (dist < 65) {
      onSetCarShopRoute();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass rounded-3xl p-4 sm:p-6 w-full max-w-2xl space-y-3 border border-white/20">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-extrabold text-white">Vice Coast City Map</h2>
            <p className="text-xs text-slate-300">
              Left-click <strong className="text-sky-300">THE CAR SHOP</strong> to set a blue road route
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="glass px-3.5 py-1.5 rounded-xl text-sm font-bold text-white hover:bg-slate-800"
          >
            Close (M)
          </button>
        </div>

        <div className="relative rounded-2xl overflow-hidden border border-white/15 bg-slate-900">
          <canvas
            ref={canvasRef}
            width={620}
            height={520}
            onClick={handleMapClick}
            className="w-full h-auto block cursor-crosshair"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3 text-slate-300">
            <span>🟢 You</span>
            <span>🔵 Blue Route</span>
            <span>🏪 THE CAR SHOP</span>
          </div>
          <div className="flex gap-2">
            {routeActive ? (
              <button
                type="button"
                onClick={onCancelRoute}
                className="glass px-3.5 py-1.5 rounded-xl font-bold text-rose-300 border border-rose-400/40"
              >
                Cancel Blue Route
              </button>
            ) : (
              <button
                type="button"
                onClick={onSetCarShopRoute}
                className="btn-glow px-4 py-1.5 rounded-xl font-bold text-white"
              >
                Route to THE CAR SHOP
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

