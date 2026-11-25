// @ts-nocheck
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { playSFX, playTaxiComplete, playTaxiStart, startContinuousHorn as sfxStartHorn, stopContinuousHorn as sfxStopHorn } from '../audio/sfx';
import { CAR_SHOP_LOCATION, GENDER_CATALOG, PALETTES } from '../types/game';
import type { CharacterConfig, GameStage, GenderKey, ShopCarSpec, SpawnKey, WorldHudSnapshot } from '../types/game';

export interface RuntimeCallbacks {
  onGenderPicked: (gender: GenderKey) => void;
  onHudUpdate: (snapshot: WorldHudSnapshot) => void;
  onToast: (msg: string) => void;
  onTimeOfDayChanged: (idx: number) => void;
}

export function createViceCoastRuntime(container: HTMLElement, callbacks: RuntimeCallbacks) {
  let minimapCanvasEl: HTMLCanvasElement | null = null;
  let disposed = false;
  let rafId = 0;
  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  let lastDistrict = 'Ocean Drive';
  let fpsFrames = 0;
  let fpsLastTime = performance.now();
  let currentFps = 60;
  let playerCash = 250;
  let carShopRouteActive = false;
  let carShopRingMesh: THREE.Mesh | null = null;
  let garageSpawnedCar: any = null;

  const taxiJob = {
    active: false,
    phase: 'pickup' as 'pickup' | 'dropoff',
    tier: 'Short' as 'Short' | 'Medium' | 'Long',
    fareRupees: 0,
    pickupPos: new THREE.Vector3(),
    dropoffPos: new THREE.Vector3(),
    passengerMesh: null as THREE.Group | null,
    beaconMesh: null as THREE.Mesh | null,
    arrowGroup: null as THREE.Group | null,
    seatedInTaxi: null as any,
  };

  const state = {
    stage: 'gender' as GameStage,
    todIndex: 0,
    spawnKey: 'ocean_drive' as SpawnKey,
    character: {
      gender: null as GenderKey | null,
      name: 'Alex',
      hairstyle: 'quiff',
      outfit: 'jacket_tee',
      accessory: 'none',
      skin: 0xe8b892,
      hair: 0x1f1916,
      eyes: 0x2b5b84,
      primary: 0x0284c7,
      secondary: 0x1e293b,
      shoes: 0xf8fafc,
    } as CharacterConfig,
  };

  function showToast(msg: string) {
    callbacks.onToast(msg);
  }
  function selectGender(g: GenderKey) {
    callbacks.onGenderPicked(g);
  }
  function startContinuousHorn() {
    sfxStartHorn(player.drivingCar ? player.drivingCar.style : 'sedan');
  }
  function stopContinuousHorn() {
    sfxStopHorn();
  }

        const TIME_PRESETS = [
            {
                id: 'day',
                icon: '☀️',
                label: 'Sunny Day',
                skyTop: '#2b7de9',
                skyMid: '#7cc4fa',
                skyBot: '#e4f3ff',
                fogColor: 0xcbe6fc,
                fogDensity: 0.0014,
                hemiSky: 0xdbeafe,
                hemiGround: 0x7c6f5b,
                hemiIntensity: 0.72,
                sunColor: 0xfff5dc,
                sunIntensity: 1.45,
                sunDir: new THREE.Vector3(85, 115, 70).normalize(),
                exposure: 0.88
            },
            {
                id: 'sunset',
                icon: '🌅',
                label: 'Golden Sunset',
                skyTop: '#2a2d64',
                skyMid: '#e87a5d',
                skyBot: '#ffd180',
                fogColor: 0xf4b68c,
                fogDensity: 0.0018,
                hemiSky: 0xffcfa3,
                hemiGround: 0x4a3540,
                hemiIntensity: 0.65,
                sunColor: 0xff9e44,
                sunIntensity: 1.35,
                sunDir: new THREE.Vector3(130, 28, 45).normalize(),
                exposure: 0.9
            },
            {
                id: 'night',
                icon: '🌙',
                label: 'Coastal Night',
                skyTop: '#060b19',
                skyMid: '#111e3d',
                skyBot: '#1e355e',
                fogColor: 0x0d1930,
                fogDensity: 0.002,
                hemiSky: 0x3b5998,
                hemiGround: 0x111827,
                hemiIntensity: 0.45,
                sunColor: 0x93c5fd,
                sunIntensity: 0.65,
                sunDir: new THREE.Vector3(-70, 95, 60).normalize(),
                exposure: 0.92
            }
        ];

        const START_SPAWNS = {
            ocean_drive: { x: 178, z: 12, yaw: Math.PI },
            downtown: { x: -42, z: -42, yaw: 0 },
            palm_beach: { x: 224, z: 14, yaw: -Math.PI / 2 }
        };

        // Road Grid Constants (20,000m x 20,000m playable Vice Coast world)
        const WORLD_HALF = 10000;
        const ROAD_COORDS = [-168, -84, 0, 84, 168]; // 5x5 city avenues & streets
        const ROAD_WIDTH = 16;
        const LANE_OFFSET = 3.8;   // Right-hand lane center offset
        const RING_ROAD_RADIUS = 278; // Grand outer Circle Road radius

        const texCache = new Map();

        function makeCanvasTex(key, w, h, drawFn, repeatX = 1, repeatY = 1) {
            if (texCache.has(key)) return texCache.get(key);
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            drawFn(ctx, w, h);
            const tex = new THREE.CanvasTexture(c);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(repeatX, repeatY);
            tex.anisotropy = 8;
            texCache.set(key, tex);
            return tex;
        }

        function getAsphaltTex(repeatX = 1, repeatY = 16) {
            return makeCanvasTex(`asphalt_${repeatX}_${repeatY}`, 512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#262b33';
                ctx.fillRect(0, 0, w, h);

                for (let i = 0; i < 4500; i++) {
                    const gx = (i * 73) % w;
                    const gy = (i * 137) % h;
                    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
                    ctx.fillRect(gx, gy, 2, 2);
                }

                ctx.fillStyle = '#e2e8f0';
                ctx.fillRect(14, 0, 7, h);
                ctx.fillRect(w - 21, 0, 7, h);

                ctx.fillStyle = '#f59e0b';
                ctx.fillRect(w / 2 - 8, 0, 5, h);
                ctx.fillRect(w / 2 + 3, 0, 5, h);

                ctx.fillStyle = 'rgba(248, 250, 252, 0.72)';
                for (let y = 16; y < h; y += 64) {
                    ctx.fillRect(w * 0.25 - 3, y, 6, 34);
                    ctx.fillRect(w * 0.75 - 3, y, 6, 34);
                }
            }, repeatX, repeatY);
        }

        function getSidewalkTex() {
            return makeCanvasTex('sidewalk', 256, 256, (ctx, w, h) => {
                ctx.fillStyle = '#cbd2d9';
                ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = '#9aa5b1';
                ctx.lineWidth = 2;
                const step = 32;
                for (let x = 0; x <= w; x += step) {
                    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
                }
                for (let y = 0; y <= h; y += step) {
                    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
                }
            }, 12, 12);
        }

        function getSandTex() {
            return makeCanvasTex('sand', 512, 512, (ctx, w, h) => {
                const grad = ctx.createLinearGradient(0, 0, w, 0);
                grad.addColorStop(0, '#ead4a2');
                grad.addColorStop(0.65, '#f2dfa9');
                grad.addColorStop(1, '#d8be84');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);

                ctx.strokeStyle = 'rgba(180, 142, 82, 0.16)';
                ctx.lineWidth = 2;
                for (let y = 10; y < h; y += 16) {
                    ctx.beginPath();
                    for (let x = 0; x <= w; x += 16) {
                        const wy = y + Math.sin((x / w) * Math.PI * 6 + y * 0.1) * 2.5;
                        if (x === 0) ctx.moveTo(x, wy);
                        else ctx.lineTo(x, wy);
                    }
                    ctx.stroke();
                }
            }, 8, 90);
        }

        function getGrassTex() {
            return makeCanvasTex('grass', 512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#4e8d47';
                ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 3600; i++) {
                    const gx = (i * 97) % w;
                    const gy = (i * 193) % h;
                    ctx.fillStyle = i % 3 === 0 ? 'rgba(134, 214, 108, 0.18)' : 'rgba(31, 78, 34, 0.18)';
                    ctx.fillRect(gx, gy, 3, 2);
                }
            }, 180, 180);
        }

        function getWaterTex() {
            return makeCanvasTex('water', 512, 512, (ctx, w, h) => {
                const grad = ctx.createLinearGradient(0, 0, w, h);
                grad.addColorStop(0, '#0891b2');
                grad.addColorStop(0.5, '#0284c7');
                grad.addColorStop(1, '#0369a1');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);

                ctx.strokeStyle = 'rgba(224, 242, 254, 0.22)';
                ctx.lineWidth = 2;
                for (let y = 12; y < h; y += 24) {
                    ctx.beginPath();
                    for (let x = 0; x <= w; x += 24) {
                        const wy = y + Math.sin((x / w) * Math.PI * 8 + y * 0.2) * 4;
                        if (x === 0) ctx.moveTo(x, wy);
                        else ctx.lineTo(x, wy);
                    }
                    ctx.stroke();
                }
            }, 90, 180);
        }

        function getBuildingFacadeTex(style, hexColor, floors = 5) {
            const key = `bld_${style}_${hexColor}_${floors}`;
            return makeCanvasTex(key, 512, 512, (ctx, w, h) => {
                ctx.fillStyle = hexColor;
                ctx.fillRect(0, 0, w, h);

                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fillRect(0, 0, 18, h);
                ctx.fillRect(w - 18, 0, 18, h);

                const cols = 6;
                const rows = Math.max(3, Math.min(12, floors));
                const padX = 34;
                const padY = 28;
                const cellW = (w - padX * 2) / cols;
                const cellH = (h - padY * 2) / rows;

                for (let r = 0; r < rows; r++) {
                    if (style === 'artdeco') {
                        ctx.fillStyle = 'rgba(255,255,255,0.22)';
                        ctx.fillRect(14, padY + r * cellH - 4, w - 28, 3);
                    }

                    for (let c = 0; c < cols; c++) {
                        const wx = padX + c * cellW + cellW * 0.18;
                        const wy = padY + r * cellH + cellH * 0.2;
                        const ww = cellW * 0.64;
                        const wh = cellH * 0.58;

                        const lit = ((r * 7 + c * 13) % 5 === 0);
                        if (style === 'glass') {
                            ctx.fillStyle = lit ? '#bae6fd' : '#1e3a5f';
                        } else {
                            ctx.fillStyle = lit ? '#fef08a' : '#26364d';
                        }
                        ctx.fillRect(wx, wy, ww, wh);

                        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
                        ctx.lineWidth = 1.5;
                        ctx.strokeRect(wx, wy, ww, wh);
                    }
                }

                ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
                ctx.fillRect(0, h - 46, w, 46);
            }, 1, 1);
        }

        function getSignTex(text, bg = '#0f172a', fg = '#f8fafc') {
            return makeCanvasTex(`sign_${text}_${bg}_${fg}`, 512, 128, (ctx, w, h) => {
                ctx.fillStyle = bg;
                ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 6;
                ctx.strokeRect(6, 6, w - 12, h - 12);

                ctx.fillStyle = fg;
                ctx.font = '800 44px Outfit, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, w / 2, h / 2 + 2);
            }, 1, 1);
        }

        /* =====================================================================
         * 4. ANATOMICALLY PROPORTIONED HUMAN CHARACTER BUILDER (BOY & GIRL)
         * ===================================================================== */
        function createHumanCharacter(cfg) {
            const root = new THREE.Group();
            const isGirl = cfg.gender === 'girl';

            const skinMat = new THREE.MeshStandardMaterial({ color: cfg.skin, roughness: 0.58, metalness: 0.02 });
            const hairMat = new THREE.MeshStandardMaterial({ color: cfg.hair, roughness: 0.68, metalness: 0.05 });
            const primaryMat = new THREE.MeshStandardMaterial({ color: cfg.primary, roughness: 0.62 });
            const secondaryMat = new THREE.MeshStandardMaterial({ color: cfg.secondary, roughness: 0.72 });
            const shoeMat = new THREE.MeshStandardMaterial({ color: cfg.shoes, roughness: 0.55 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });

            const hipY = isGirl ? 0.88 : 0.92;
            const pelvis = new THREE.Group();
            pelvis.position.y = hipY;
            root.add(pelvis);

            const pelvisMesh = new THREE.Mesh(
                new THREE.CylinderGeometry(isGirl ? 0.145 : 0.155, isGirl ? 0.165 : 0.145, 0.16, 18),
                secondaryMat
            );
            pelvisMesh.castShadow = true;
            pelvis.add(pelvisMesh);

            if (isGirl && (cfg.outfit === 'cardigan_skirt' || cfg.outfit === 'sundress')) {
                const skirtMat = cfg.outfit === 'sundress' ? primaryMat : secondaryMat;
                const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.34, 20, 1, true), skirtMat);
                skirt.position.y = -0.15;
                skirt.castShadow = true;
                pelvis.add(skirt);
            }

            const torsoPivot = new THREE.Group();
            torsoPivot.position.y = 0.08;
            pelvis.add(torsoPivot);

            const torsoLen = isGirl ? 0.44 : 0.48;
            const chestR = isGirl ? 0.145 : 0.175;
            const waistR = isGirl ? 0.115 : 0.142;
            const torsoMesh = new THREE.Mesh(
                new THREE.CylinderGeometry(chestR, waistR, torsoLen, 20),
                primaryMat
            );
            torsoMesh.position.y = torsoLen / 2;
            torsoMesh.scale.set(1.12, 1, 0.76);
            torsoMesh.castShadow = true;
            torsoPivot.add(torsoMesh);

            if (!isGirl && (cfg.outfit === 'jacket_tee' || cfg.outfit === 'hoodie_cargo')) {
                const lapelL = new THREE.Mesh(new THREE.BoxGeometry(0.065, torsoLen * 0.94, 0.03), secondaryMat);
                lapelL.position.set(-0.065, torsoLen * 0.5, chestR * 0.72);
                const lapelR = lapelL.clone();
                lapelR.position.x = 0.065;
                torsoPivot.add(lapelL, lapelR);
                if (cfg.outfit === 'hoodie_cargo') {
                    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.045, 10, 18, Math.PI * 1.3), secondaryMat);
                    hood.rotation.x = Math.PI / 2;
                    hood.position.set(0, torsoLen + 0.01, -0.05);
                    torsoPivot.add(hood);
                }
            } else if (isGirl && (cfg.outfit === 'cardigan_skirt' || cfg.outfit === 'crop_jacket')) {
                const trim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.14), secondaryMat);
                trim.position.set(0, torsoLen * 0.85, chestR * 0.65);
                torsoPivot.add(trim);
            }

            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 14), skinMat);
            neck.position.y = torsoLen + 0.03;
            neck.castShadow = true;
            torsoPivot.add(neck);

            const headPivot = new THREE.Group();
            headPivot.position.y = torsoLen + 0.07;
            torsoPivot.add(headPivot);

            const headR = isGirl ? 0.128 : 0.134;
            const headMesh = new THREE.Mesh(new THREE.SphereGeometry(headR, 28, 24), skinMat);
            headMesh.scale.set(0.92, 1.08, 0.96);
            headMesh.position.y = 0.185;
            headMesh.castShadow = true;
            headPivot.add(headMesh);

            [-1, 1].forEach(side => {
                const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), skinMat);
                ear.scale.set(0.45, 1.05, 0.72);
                ear.position.set(side * (headR * 0.9), 0.18, -0.01);
                headPivot.add(ear);
            });

            // Sculpted, Realistic 3D Facial Features
            const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 });
            const irisMat = new THREE.MeshStandardMaterial({ color: cfg.eyes, roughness: 0.2, metalness: 0.1 });
            const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0b0f19, roughness: 0.1 });
            const catchlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const browMat = new THREE.MeshStandardMaterial({ color: cfg.hair, roughness: 0.7 });
            const lashMat = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.5 });
            const lipMat = new THREE.MeshStandardMaterial({ color: isGirl ? 0xd97384 : 0xb86d60, roughness: 0.45 });
            const blushMat = new THREE.MeshStandardMaterial({
                color: isGirl ? 0xf472b6 : 0xd98a7c,
                transparent: true,
                opacity: isGirl ? 0.22 : 0.1,
                roughness: 0.8
            });

            const noseBridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.022, 6, 8), skinMat);
            noseBridge.position.set(0, 0.174, headR * 0.93);
            noseBridge.rotation.x = -0.18;
            const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), skinMat);
            noseTip.scale.set(1.05, 0.82, 0.95);
            noseTip.position.set(0, 0.162, headR * 0.99);
            headPivot.add(noseBridge, noseTip);

            [-1, 1].forEach(side => {
                const ex = side * 0.043;
                const ey = 0.198;
                const ez = headR * 0.84;

                const eyeGrp = new THREE.Group();
                eyeGrp.position.set(ex, ey, ez);
                eyeGrp.rotation.y = side * 0.22;

                const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.0195, 14, 12), scleraMat);
                sclera.scale.set(1.08, isGirl ? 0.92 : 0.82, 0.58);
                eyeGrp.add(sclera);

                const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 12, 10), irisMat);
                iris.scale.set(1, 1, 0.45);
                iris.position.set(0, 0, 0.0085);
                eyeGrp.add(iris);

                const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 10, 8), pupilMat);
                pupil.scale.set(1, 1, 0.45);
                pupil.position.set(0, 0, 0.0115);
                eyeGrp.add(pupil);

                const catchlight = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 6), catchlightMat);
                catchlight.position.set(0.004, 0.004, 0.0135);
                eyeGrp.add(catchlight);

                const lash = new THREE.Mesh(
                    new THREE.TorusGeometry(0.019, isGirl ? 0.0032 : 0.0022, 6, 12, Math.PI * 0.78),
                    lashMat
                );
                lash.position.set(0, 0.002, 0.006);
                lash.rotation.z = Math.PI * 0.11;
                eyeGrp.add(lash);

                headPivot.add(eyeGrp);

                const brow = new THREE.Mesh(
                    new THREE.CapsuleGeometry(isGirl ? 0.0042 : 0.0058, 0.032, 4, 8),
                    browMat
                );
                brow.rotation.z = Math.PI / 2 - side * 0.1;
                brow.rotation.y = side * 0.22;
                brow.position.set(ex, 0.226, headR * 0.89);
                headPivot.add(brow);

                const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), blushMat);
                cheek.scale.set(1.15, 0.65, 0.25);
                cheek.position.set(side * 0.062, 0.158, headR * 0.82);
                cheek.rotation.y = side * 0.45;
                headPivot.add(cheek);
            });

            const smile = new THREE.Mesh(
                new THREE.TorusGeometry(0.023, isGirl ? 0.0052 : 0.0042, 8, 16, Math.PI * 0.72),
                lipMat
            );
            smile.rotation.z = Math.PI * 1.14;
            smile.position.set(0, 0.146, headR * 0.90);
            headPivot.add(smile);

            // Realistic Hair Meshes
            const hairCap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.04, 24, 20), hairMat);
            hairCap.scale.set(0.95, 1.06, 1.0);
            hairCap.position.set(0, 0.195, -0.012);
            hairCap.castShadow = true;

            if (!isGirl) {
                if (cfg.hairstyle === 'quiff') {
                    hairCap.scale.set(0.95, 1.02, 0.96);
                    hairCap.position.set(0, 0.19, -0.018);
                    const quiff = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.09, 8, 12), hairMat);
                    quiff.rotation.z = Math.PI / 2.3;
                    quiff.position.set(0.01, 0.295, 0.05);
                    quiff.castShadow = true;
                    headPivot.add(hairCap, quiff);
                } else if (cfg.hairstyle === 'crew') {
                    hairCap.scale.set(0.94, 0.98, 0.95);
                    headPivot.add(hairCap);
                } else if (cfg.hairstyle === 'curtains') {
                    headPivot.add(hairCap);
                    [-1, 1].forEach(s => {
                        const swoop = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.11, 6, 10), hairMat);
                        swoop.position.set(s * 0.088, 0.21, 0.06);
                        swoop.rotation.z = s * 0.22;
                        swoop.rotation.x = 0.15;
                        swoop.castShadow = true;
                        headPivot.add(swoop);
                    });
                } else {
                    const buzz = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.005, 20, 16), hairMat);
                    buzz.scale.set(0.92, 1.06, 0.96);
                    buzz.position.set(0, 0.186, -0.004);
                    headPivot.add(buzz);
                }
            } else {
                headPivot.add(hairCap);
                if (cfg.hairstyle === 'ponytail') {
                    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.26, 8, 12), hairMat);
                    tail.position.set(0, 0.16, -0.17);
                    tail.rotation.x = -0.45;
                    tail.castShadow = true;
                    headPivot.add(tail);
                } else if (cfg.hairstyle === 'bob') {
                    [-1, 1].forEach(s => {
                        const sideHair = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.16, 6, 10), hairMat);
                        sideHair.position.set(s * 0.11, 0.14, 0.01);
                        sideHair.castShadow = true;
                        headPivot.add(sideHair);
                    });
                    const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.20, 0.08), hairMat);
                    backHair.position.set(0, 0.13, -0.10);
                    backHair.castShadow = true;
                    headPivot.add(backHair);
                } else if (cfg.hairstyle === 'waves') {
                    [-1, 1].forEach(s => {
                        const wave = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.34, 8, 12), hairMat);
                        wave.position.set(s * 0.115, 0.04, -0.02);
                        wave.castShadow = true;
                        headPivot.add(wave);
                    });
                    const backWave = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.36, 0.09), hairMat);
                    backWave.position.set(0, 0.03, -0.10);
                    backWave.castShadow = true;
                    headPivot.add(backWave);
                } else {
                    [-1, 1].forEach(s => {
                        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 12), hairMat);
                        bun.position.set(s * 0.105, 0.30, -0.02);
                        bun.castShadow = true;
                        headPivot.add(bun);
                    });
                }
            }

            // Accessories
            if (cfg.accessory === 'cap') {
                const capMat = new THREE.MeshStandardMaterial({ color: cfg.primary, roughness: 0.5 });
                const crown = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.07, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), capMat);
                crown.position.set(0, 0.20, -0.005);
                crown.castShadow = true;
                const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.14, 0.016, 16, 1, false, -0.5, 1.0), capMat);
                brim.position.set(0, 0.215, 0.04);
                headPivot.add(crown, brim);
            } else if (cfg.accessory === 'headband') {
                const band = new THREE.Mesh(new THREE.TorusGeometry(headR * 1.03, 0.016, 8, 20, Math.PI * 1.15), primaryMat);
                band.rotation.x = Math.PI / 2 - 0.25;
                band.rotation.z = -Math.PI * 0.57;
                band.position.set(0, 0.225, 0.01);
                headPivot.add(band);
            } else if (cfg.accessory === 'sunglasses') {
                const lensMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.85 });
                [-1, 1].forEach(s => {
                    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.032, 0.014), lensMat);
                    lens.position.set(s * 0.044, 0.198, headR * 0.98);
                    headPivot.add(lens);
                });
                const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.012), darkMat);
                bridge.position.set(0, 0.202, headR * 0.98);
                headPivot.add(bridge);
            } else if (cfg.accessory === 'backpack' || cfg.accessory === 'tote') {
                const bagMat = new THREE.MeshStandardMaterial({ color: cfg.secondary, roughness: 0.65 });
                const bag = new THREE.Mesh(
                    new THREE.BoxGeometry(cfg.accessory === 'tote' ? 0.12 : 0.22, 0.26, 0.12),
                    bagMat
                );
                bag.position.set(cfg.accessory === 'tote' ? -0.19 : 0, torsoLen * 0.55, cfg.accessory === 'tote' ? 0 : -0.14);
                bag.castShadow = true;
                torsoPivot.add(bag);
            }

            // Articulated Arms
            function makeArm(side) {
                const shPivot = new THREE.Group();
                shPivot.position.set(side * (chestR * 1.18), torsoLen - 0.05, 0);
                torsoPivot.add(shPivot);

                const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.19, 8, 12), primaryMat);
                upper.position.y = -0.12;
                upper.castShadow = true;
                shPivot.add(upper);

                const elbowPivot = new THREE.Group();
                elbowPivot.position.y = -0.25;
                shPivot.add(elbowPivot);

                const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.18, 8, 12), skinMat);
                lower.position.y = -0.11;
                lower.castShadow = true;
                elbowPivot.add(lower);

                const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), skinMat);
                hand.scale.set(0.85, 1.1, 0.65);
                hand.position.y = -0.23;
                elbowPivot.add(hand);

                return { shPivot, elbowPivot };
            }

            const leftArm = makeArm(-1);
            const rightArm = makeArm(1);

            // Articulated Legs
            function makeLeg(side) {
                const hipPivot = new THREE.Group();
                hipPivot.position.set(side * 0.088, -0.05, 0);
                pelvis.add(hipPivot);

                const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.26, 8, 12), secondaryMat);
                thigh.position.y = -0.17;
                thigh.castShadow = true;
                hipPivot.add(thigh);

                const kneePivot = new THREE.Group();
                kneePivot.position.y = -0.36;
                hipPivot.add(kneePivot);

                const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.26, 8, 12), skinMat);
                calf.position.y = -0.17;
                calf.castShadow = true;
                kneePivot.add(calf);

                const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.075, 0.21), shoeMat);
                shoe.position.set(0, -0.37, 0.04);
                shoe.castShadow = true;
                kneePivot.add(shoe);

                return { hipPivot, kneePivot };
            }

            const leftLeg = makeLeg(-1);
            const rightLeg = makeLeg(1);

            root.userData = { pelvis, torsoPivot, headPivot, leftArm, rightArm, leftLeg, rightLeg, hipY };
            return root;
        }

        function animateHuman(char, time, speedNorm = 0, grounded = true, seated = false, phase = 0, vehicleType = 'car') {
            if (!char || !char.userData) return;
            const { pelvis, torsoPivot, headPivot, leftArm, rightArm, leftLeg, rightLeg, hipY } = char.userData;

            if (seated) {
                if (vehicleType === 'bike' || vehicleType === 'bicycle') {
                    pelvis.position.y = hipY - 0.34;
                    torsoPivot.rotation.x = vehicleType === 'bike' ? 0.30 : 0.22;
                    torsoPivot.rotation.y = 0;
                    leftArm.shPivot.rotation.set(-1.12, 0, -0.12);
                    rightArm.shPivot.rotation.set(-1.12, 0, 0.12);
                    leftArm.elbowPivot.rotation.x = -0.25;
                    rightArm.elbowPivot.rotation.x = -0.25;

                    if (vehicleType === 'bicycle') {
                        const ped = time * 7.5 + phase;
                        leftLeg.hipPivot.rotation.x = -0.75 + Math.sin(ped) * 0.42;
                        rightLeg.hipPivot.rotation.x = -0.75 - Math.sin(ped) * 0.42;
                        leftLeg.kneePivot.rotation.x = 0.85 + Math.cos(ped) * 0.38;
                        rightLeg.kneePivot.rotation.x = 0.85 - Math.cos(ped) * 0.38;
                    } else {
                        leftLeg.hipPivot.rotation.set(-0.62, 0, 0.24);
                        rightLeg.hipPivot.rotation.set(-0.62, 0, -0.24);
                        leftLeg.kneePivot.rotation.x = 0.95;
                        rightLeg.kneePivot.rotation.x = 0.95;
                    }
                    headPivot.rotation.y = Math.sin(time * 0.8 + phase) * 0.06;
                    return;
                }

                pelvis.position.y = hipY - 0.56;
                torsoPivot.rotation.x = -0.06;
                torsoPivot.rotation.y = 0;
                leftLeg.hipPivot.rotation.set(-1.45, 0, 0);
                rightLeg.hipPivot.rotation.set(-1.45, 0, 0);
                leftLeg.kneePivot.rotation.x = 1.38;
                rightLeg.kneePivot.rotation.x = 1.38;
                leftArm.shPivot.rotation.set(-0.92, 0, -0.18);
                rightArm.shPivot.rotation.set(-0.92, 0, 0.18);
                leftArm.elbowPivot.rotation.x = -0.35;
                rightArm.elbowPivot.rotation.x = -0.35;
                headPivot.rotation.y = Math.sin(time * 0.8) * 0.08;
                return;
            }

            torsoPivot.rotation.x = THREE.MathUtils.lerp(torsoPivot.rotation.x, 0, 0.15);
            leftLeg.hipPivot.rotation.z = 0;
            rightLeg.hipPivot.rotation.z = 0;

            if (!grounded) {
                pelvis.position.y = hipY + 0.03;
                leftLeg.hipPivot.rotation.x = -0.45;
                rightLeg.hipPivot.rotation.x = 0.35;
                leftLeg.kneePivot.rotation.x = 0.65;
                rightLeg.kneePivot.rotation.x = 0.45;
                leftArm.shPivot.rotation.set(-0.6, 0, -0.35);
                rightArm.shPivot.rotation.set(-0.6, 0, 0.35);
                return;
            }

            if (speedNorm > 0.05) {
                const freq = (6.5 + speedNorm * 6.5);
                const t = time * freq + phase;
                const amp = (0.45 + speedNorm * 0.48);

                pelvis.position.y = hipY + Math.abs(Math.sin(t)) * 0.045 * speedNorm;
                leftLeg.hipPivot.rotation.x = Math.sin(t) * amp;
                rightLeg.hipPivot.rotation.x = -Math.sin(t) * amp;
                leftLeg.kneePivot.rotation.x = Math.max(0, -Math.cos(t)) * amp * 1.15;
                rightLeg.kneePivot.rotation.x = Math.max(0, Math.cos(t)) * amp * 1.15;

                leftArm.shPivot.rotation.set(-Math.sin(t) * amp * 0.8, 0, -0.08);
                rightArm.shPivot.rotation.set(Math.sin(t) * amp * 0.8, 0, 0.08);
                leftArm.elbowPivot.rotation.x = -0.25 - Math.max(0, Math.sin(t)) * 0.45;
                rightArm.elbowPivot.rotation.x = -0.25 - Math.max(0, -Math.sin(t)) * 0.45;

                torsoPivot.rotation.y = Math.sin(t) * 0.08 * speedNorm;
                torsoPivot.rotation.x = 0.06 * speedNorm;
                headPivot.rotation.y = -torsoPivot.rotation.y * 0.6;
            } else {
                const b = Math.sin(time * 2.2 + phase);
                pelvis.position.y = hipY + b * 0.008;
                leftLeg.hipPivot.rotation.x = THREE.MathUtils.lerp(leftLeg.hipPivot.rotation.x, 0, 0.15);
                rightLeg.hipPivot.rotation.x = THREE.MathUtils.lerp(rightLeg.hipPivot.rotation.x, 0, 0.15);
                leftLeg.kneePivot.rotation.x = THREE.MathUtils.lerp(leftLeg.kneePivot.rotation.x, 0.04, 0.15);
                rightLeg.kneePivot.rotation.x = THREE.MathUtils.lerp(rightLeg.kneePivot.rotation.x, 0.04, 0.15);

                leftArm.shPivot.rotation.set(b * 0.03, 0, -0.09 - b * 0.015);
                rightArm.shPivot.rotation.set(-b * 0.03, 0, 0.09 + b * 0.015);
                leftArm.elbowPivot.rotation.x = -0.14;
                rightArm.elbowPivot.rotation.x = -0.14;
                torsoPivot.rotation.y = Math.sin(time * 1.1 + phase) * 0.04;
                headPivot.rotation.y = Math.sin(time * 0.9 + phase) * 0.12;
            }
        }

        /* =====================================================================
         * 5. REALISTIC MULTI-PART VEHICLE FACTORY (CARS, SUVS, TRUCKS, BIKES, BICYCLES)
         * ===================================================================== */
        function createBicycleMesh(paintHex) {
            const root = new THREE.Group();
            const frameMat = new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.3, metalness: 0.65 });
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.88 });
            const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.25, metalness: 0.85 });
            const seatMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });

            const wheels = [];
            [-0.58, 0.58].forEach(wz => {
                const wGrp = new THREE.Group();
                wGrp.position.set(0, 0.34, wz);
                const tire = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.036, 8, 20), tireMat);
                tire.rotation.y = Math.PI / 2;
                tire.castShadow = true;
                const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 8), chromeMat);
                hub.rotation.z = Math.PI / 2;
                const spoke1 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.6, 0.015), chromeMat);
                const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.6), chromeMat);
                wGrp.add(tire, hub, spoke1, spoke2);
                root.add(wGrp);
                wheels.push(wGrp);
            });

            const topTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 8), frameMat);
            topTube.rotation.x = Math.PI / 2;
            topTube.position.set(0, 0.76, 0.04);
            const downTube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.82, 8), frameMat);
            downTube.rotation.x = 0.85;
            downTube.position.set(0, 0.54, 0.18);
            const seatTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.56, 8), frameMat);
            seatTube.position.set(0, 0.62, -0.18);
            const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 8), frameMat);
            fork.rotation.x = -0.22;
            fork.position.set(0, 0.62, 0.50);
            const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.56, 8), chromeMat);
            handlebar.rotation.z = Math.PI / 2;
            handlebar.position.set(0, 0.94, 0.44);
            const bell = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), chromeMat);
            bell.position.set(0.16, 0.97, 0.44);
            const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.26), seatMat);
            saddle.position.set(0, 0.91, -0.18);
            root.add(topTube, downTube, seatTube, fork, handlebar, bell, saddle);

            root.userData = {
                wheels,
                frontPivots: [],
                doorPivot: null,
                seatOffset: new THREE.Vector3(0, 0.22, -0.14)
            };
            return root;
        }

        function createVehicleMesh(style, paintHex, hasOpeningDoor = false) {
            const root = new THREE.Group();
            const paintMat = new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.22, metalness: 0.55 });
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e3a52, roughness: 0.08, metalness: 0.85, transparent: true, opacity: 0.78 });
            const trimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.2 });
            const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.9 });
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });
            const headMat = new THREE.MeshStandardMaterial({ color: 0xfef9c3, emissive: 0xfef08a, emissiveIntensity: 0.8 });
            const tailMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.75 });
            const interiorMat = new THREE.MeshStandardMaterial({ color: 0x262930, roughness: 0.8 });

            if (style === 'bike') {
                const wheels = [];
                const frontPivots = [];
                const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.16, 18);
                wheelGeo.rotateZ(Math.PI / 2);
                const rimGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.17, 12);
                rimGeo.rotateZ(Math.PI / 2);

                [[0.78, true], [-0.74, false]].forEach(([wz, isFront]) => {
                    const sp = new THREE.Group();
                    sp.position.set(0, 0.34, wz);
                    const wGrp = new THREE.Group();
                    const tire = new THREE.Mesh(wheelGeo, tireMat);
                    tire.castShadow = true;
                    const rim = new THREE.Mesh(rimGeo, chromeMat);
                    wGrp.add(tire, rim);
                    sp.add(wGrp);
                    root.add(sp);
                    wheels.push(wGrp);
                    if (isFront) frontPivots.push(sp);
                });

                const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.85), trimMat);
                engineBlock.position.set(0, 0.48, 0.02);
                engineBlock.castShadow = true;
                const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.20, 0.46, 8, 12), paintMat);
                tank.rotation.x = Math.PI / 2;
                tank.position.set(0, 0.80, 0.24);
                tank.castShadow = true;
                const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.46), paintMat);
                fairing.position.set(0, 0.86, 0.64);
                fairing.rotation.x = 0.28;
                fairing.castShadow = true;
                const windScreen = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.05), glassMat);
                windScreen.position.set(0, 1.08, 0.66);
                windScreen.rotation.x = -0.52;
                const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.72), interiorMat);
                seat.position.set(0, 0.76, -0.30);
                const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.74, 8), chromeMat);
                handlebar.rotation.z = Math.PI / 2;
                handlebar.position.set(0, 1.02, 0.50);
                const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.06), headMat);
                headlight.position.set(0, 0.86, 0.88);
                const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.09, 0.06), tailMat);
                taillight.position.set(0, 0.80, -0.74);
                const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.78, 8), chromeMat);
                exhaust.rotation.x = Math.PI / 2;
                exhaust.position.set(0.22, 0.38, -0.45);
                root.add(engineBlock, tank, fairing, windScreen, seat, handlebar, headlight, taillight, exhaust);

                root.userData = { wheels, frontPivots, doorPivot: null, seatOffset: new THREE.Vector3(0, 0.34, -0.22), len: 2.2, wid: 0.82, style: 'bike' };
                return root;
            }

            if (style === 'truck') {
                const len = 7.4;
                const wid = 2.48;
                const cargoMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.55, metalness: 0.1 });

                const frame = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.15, 0.42, len), trimMat);
                frame.position.y = 0.62;
                frame.castShadow = true;
                root.add(frame);

                const cabLower = new THREE.Mesh(new THREE.BoxGeometry(wid, 1.15, 2.25), paintMat);
                cabLower.position.set(0, 1.32, 2.42);
                cabLower.castShadow = true;
                root.add(cabLower);

                const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.1, 0.14, 2.1), paintMat);
                cabRoof.position.set(0, 2.74, 2.38);
                cabRoof.castShadow = true;
                root.add(cabRoof);

                const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.14, 0.82, 2.05), glassMat);
                cabGlass.position.set(0, 2.28, 2.40);
                root.add(cabGlass);

                const cargoBox = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.08, 2.35, 4.95), cargoMat);
                cargoBox.position.set(0, 2.02, -1.25);
                cargoBox.castShadow = true;
                cargoBox.receiveShadow = true;
                root.add(cargoBox);

                const stripe = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.12, 0.35, 4.8), paintMat);
                stripe.position.set(0, 1.85, -1.25);
                root.add(stripe);

                const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.06, 0.34, 0.28), chromeMat);
                frontBumper.position.set(0, 0.68, len / 2 + 0.02);
                const grille = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.65, 0.55, 0.08), chromeMat);
                grille.position.set(0, 1.25, len / 2 - 0.12);
                root.add(frontBumper, grille);

                [-1, 1].forEach(s => {
                    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.08), headMat);
                    hl.position.set(s * 0.88, 1.02, len / 2 - 0.1);
                    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), tailMat);
                    tl.position.set(s * 0.92, 0.86, -len / 2 - 0.02);
                    root.add(hl, tl);
                });

                let doorPivot = null;
                if (hasOpeningDoor) {
                    doorPivot = new THREE.Group();
                    doorPivot.position.set(wid / 2 + 0.01, 1.45, 3.25);
                    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 1.15), paintMat);
                    doorPanel.position.set(0, 0, -0.58);
                    doorPivot.add(doorPanel);
                    root.add(doorPivot);
                }

                const wheelR = 0.50;
                const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.34, 18);
                wheelGeo.rotateZ(Math.PI / 2);
                const rimGeo = new THREE.CylinderGeometry(wheelR * 0.58, wheelR * 0.58, 0.36, 12);
                rimGeo.rotateZ(Math.PI / 2);

                const wheels = [];
                const frontPivots = [];
                const truckWheelCoords = [
                    [wid / 2 - 0.04, wheelR, 2.35, true],
                    [-wid / 2 + 0.04, wheelR, 2.35, true],
                    [wid / 2 - 0.04, wheelR, -1.35, false],
                    [-wid / 2 + 0.04, wheelR, -1.35, false],
                    [wid / 2 - 0.04, wheelR, -2.55, false],
                    [-wid / 2 + 0.04, wheelR, -2.55, false]
                ];
                truckWheelCoords.forEach(([wx, wy, wz, isFront]) => {
                    const sp = new THREE.Group();
                    sp.position.set(wx, wy, wz);
                    const wGrp = new THREE.Group();
                    const tire = new THREE.Mesh(wheelGeo, tireMat);
                    tire.castShadow = true;
                    const rim = new THREE.Mesh(rimGeo, chromeMat);
                    wGrp.add(tire, rim);
                    sp.add(wGrp);
                    root.add(sp);
                    wheels.push(wGrp);
                    if (isFront) frontPivots.push(sp);
                });

                root.userData = { wheels, frontPivots, doorPivot, seatOffset: new THREE.Vector3(0.58, 1.25, 2.25), len, wid, style: 'truck' };
                return root;
            }

            const isSUV = style === 'suv';
            const isConv = style === 'convertible';
            const isCoupe = style === 'coupe';
            const isSuper = style === 'supercar';

            const len = isSUV ? 4.75 : (isSuper ? 4.55 : (isCoupe ? 4.45 : 4.65));
            const wid = isSUV ? 2.08 : (isSuper ? 2.04 : 1.96);
            const bodyH = isSUV ? 0.86 : (isSuper ? 0.48 : 0.68);

            const chassis = new THREE.Mesh(new THREE.BoxGeometry(wid, bodyH, len), paintMat);
            chassis.position.y = 0.36 + bodyH / 2;
            chassis.castShadow = true;
            chassis.receiveShadow = true;
            root.add(chassis);

            if (isSuper) {
                // Aerodynamic rear spoiler + dual chrome exhausts for Supercars
                const wing = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.08, 0.06, 0.32), trimMat);
                wing.position.set(0, 0.36 + bodyH + 0.34, -len / 2 + 0.22);
                const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.16), trimMat);
                strutL.position.set(-0.56, 0.36 + bodyH + 0.16, -len / 2 + 0.22);
                const strutR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.16), trimMat);
                strutR.position.set(0.56, 0.36 + bodyH + 0.16, -len / 2 + 0.22);
                const exL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 10), chromeMat);
                exL.rotation.x = Math.PI / 2;
                exL.position.set(-0.42, 0.44, -len / 2 - 0.05);
                const exR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 10), chromeMat);
                exR.rotation.x = Math.PI / 2;
                exR.position.set(0.42, 0.44, -len / 2 - 0.05);
                root.add(wing, strutL, strutR, exL, exR);
            }

            const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.04, 0.26, 0.22), trimMat);
            frontBumper.position.set(0, 0.44, len / 2 + 0.02);
            root.add(frontBumper);
            const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.04, 0.26, 0.22), trimMat);
            rearBumper.position.set(0, 0.44, -len / 2 - 0.02);
            root.add(rearBumper);

            const grille = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.56, 0.22, 0.06), chromeMat);
            grille.position.set(0, 0.68, len / 2 + 0.01);
            root.add(grille);

            [-1, 1].forEach(s => {
                const hl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.08), headMat);
                hl.position.set(s * (wid * 0.34), 0.72, len / 2 + 0.01);
                root.add(hl);
                const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.08), tailMat);
                tl.position.set(s * (wid * 0.33), 0.74, -len / 2 - 0.01);
                root.add(tl);
            });

            const seatBaseY = 0.56;
            const dash = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.24, 0.24, 0.45), interiorMat);
            dash.position.set(0, seatBaseY + 0.35, 0.68);
            root.add(dash);
            const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.024, 8, 16), trimMat);
            steeringWheel.position.set(0.42, seatBaseY + 0.42, 0.42);
            steeringWheel.rotation.x = 0.42;
            root.add(steeringWheel);

            [-0.42, 0.42].forEach(sx => {
                const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.12), interiorMat);
                seatBack.position.set(sx, seatBaseY + 0.28, -0.32);
                seatBack.rotation.x = -0.14;
                root.add(seatBack);
            });

            const cabH = isSUV ? 0.80 : 0.68;
            const cabLen = isSUV ? 2.65 : (isCoupe ? 1.90 : 2.20);
            const cabZ = isSUV ? -0.35 : -0.22;

            if (!isConv) {
                const roof = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.22, 0.1, cabLen * 0.78), paintMat);
                roof.position.set(0, 0.36 + bodyH + cabH, cabZ - 0.05);
                roof.castShadow = true;
                root.add(roof);

                const cabinGlass = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.26, cabH, cabLen), glassMat);
                cabinGlass.position.set(0, 0.36 + bodyH + cabH / 2 - 0.02, cabZ);
                root.add(cabinGlass);

                if (style === 'taxi') {
                    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 });
                    [-1, 1].forEach(s => {
                        const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, len * 0.78), stripeMat);
                        sideStripe.position.set(s * (wid / 2 + 0.005), 0.74, 0);
                        root.add(sideStripe);
                    });
                    const signMat = new THREE.MeshStandardMaterial({
                        color: 0xfef08a,
                        emissive: 0xf59e0b,
                        emissiveIntensity: 0.9,
                        roughness: 0.2,
                    });
                    const taxiTopper = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.2, 0.28), signMat);
                    taxiTopper.position.set(0, 0.36 + bodyH + cabH + 0.14, cabZ + 0.15);
                    root.add(taxiTopper);
                }
            } else {
                const ws = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.24, 0.56, 0.06), glassMat);
                ws.position.set(0, 0.36 + bodyH + 0.24, 0.72);
                ws.rotation.x = -0.45;
                root.add(ws);
            }

            let doorPivot = null;
            if (hasOpeningDoor) {
                doorPivot = new THREE.Group();
                doorPivot.position.set(wid / 2 + 0.01, 0.36 + bodyH / 2, 0.65);
                const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.08, bodyH - 0.08, 1.15), paintMat);
                doorPanel.position.set(0, 0, -0.58);
                doorPanel.castShadow = true;
                doorPivot.add(doorPanel);

                const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.14), chromeMat);
                handle.position.set(0.04, 0.12, -0.95);
                doorPivot.add(handle);
                root.add(doorPivot);
            }

            const wheelR = isSUV ? 0.40 : 0.35;
            const wheelW = 0.26;
            const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 18);
            wheelGeo.rotateZ(Math.PI / 2);
            const rimGeo = new THREE.CylinderGeometry(wheelR * 0.62, wheelR * 0.62, wheelW + 0.02, 12);
            rimGeo.rotateZ(Math.PI / 2);

            const wheels = [];
            const frontPivots = [];
            const wheelCoords = [
                [wid / 2 - 0.04, wheelR, len * 0.32, true],
                [-wid / 2 + 0.04, wheelR, len * 0.32, true],
                [wid / 2 - 0.04, wheelR, -len * 0.32, false],
                [-wid / 2 + 0.04, wheelR, -len * 0.32, false]
            ];
            wheelCoords.forEach(([wx, wy, wz, isFront]) => {
                const steerPivot = new THREE.Group();
                steerPivot.position.set(wx, wy, wz);
                const wGrp = new THREE.Group();
                const tire = new THREE.Mesh(wheelGeo, tireMat);
                tire.castShadow = true;
                const rim = new THREE.Mesh(rimGeo, chromeMat);
                wGrp.add(tire, rim);
                steerPivot.add(wGrp);
                root.add(steerPivot);
                wheels.push(wGrp);
                if (isFront) frontPivots.push(steerPivot);
            });

            const seatY = isSUV ? 0.40 : 0.24;
            root.userData = { wheels, frontPivots, doorPivot, seatOffset: new THREE.Vector3(0.42, seatY, -0.10), len, wid, style };
            return root;
        }

        function createPalmTree(height = 8.5, lean = 0.65) {
            const tree = new THREE.Group();
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7c5838, roughness: 0.9 });
            const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f855a, roughness: 0.65, side: THREE.DoubleSide });

            const segs = 6;
            let curX = 0, curY = 0;
            for (let i = 0; i < segs; i++) {
                const segH = height / segs;
                const rBot = 0.28 * (1 - i * 0.09);
                const rTop = 0.28 * (1 - (i + 1) * 0.09);
                const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, segH + 0.08, 9), trunkMat);
                const nextX = curX + Math.sin((i + 1) * 0.14) * lean * 0.32;
                const nextY = curY + segH;
                seg.position.set((curX + nextX) / 2, (curY + nextY) / 2, 0);
                seg.rotation.z = -lean * 0.14;
                seg.castShadow = true;
                tree.add(seg);
                curX = nextX;
                curY = nextY;
            }

            const crown = new THREE.Group();
            crown.position.set(curX, curY, 0);
            const fronds = 7;
            for (let f = 0; f < fronds; f++) {
                const ang = (f / fronds) * Math.PI * 2;
                const frondGrp = new THREE.Group();
                frondGrp.rotation.y = ang;
                const blade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.5, 5), leafMat);
                blade.scale.set(1, 1, 0.15);
                blade.rotation.x = Math.PI * 0.36;
                blade.position.set(0, 0.25, 1.1);
                blade.castShadow = true;
                frondGrp.add(blade);
                crown.add(frondGrp);
            }
            tree.add(crown);
            return tree;
        }

        /* =====================================================================
         * 6. THREE.JS SCENE, LIGHTING, SHADOWS & CAMERA STATE
         * ===================================================================== */
        let scene, camera, renderer, clock;
        let skyMesh, sunDisc, hemiLight, sunLight, oceanMat;
        let studioGroup, lobbyGroup, worldGroup;
        let boySelectChar, girlSelectChar, customChar, lobbyChar;

        const camState = {
            yaw: 0,
            pitch: 0.28,
            distance: 4.6,
            targetYaw: 0,
            targetPitch: 0.28,
            targetDistance: 4.6,
            dragging: false,
            lastX: 0,
            lastY: 0,
            shake: 0
        };

        const player = {
            pos: new THREE.Vector3(178, 0.04, 12),
            vel: new THREE.Vector3(),
            yaw: Math.PI,
            grounded: true,
            drivingCar: null,
            nearbyCar: null
        };

        function applySkyTexture(preset) {
            const c = document.createElement('canvas');
            c.width = 32;
            c.height = 256;
            const ctx = c.getContext('2d');
            const grad = ctx.createLinearGradient(0, 0, 0, 256);
            grad.addColorStop(0, preset.skyTop);
            grad.addColorStop(0.52, preset.skyMid);
            grad.addColorStop(1, preset.skyBot);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 32, 256);
            const tex = new THREE.CanvasTexture(c);
            tex.colorSpace = THREE.SRGBColorSpace;
            if (skyMesh.material.map) skyMesh.material.map.dispose();
            skyMesh.material.map = tex;
            skyMesh.material.needsUpdate = true;
        }

        function applyTimeOfDay(idx) {
            state.todIndex = ((idx % TIME_PRESETS.length) + TIME_PRESETS.length) % TIME_PRESETS.length;
            const p = TIME_PRESETS[state.todIndex];

            applySkyTexture(p);
            scene.fog = new THREE.FogExp2(p.fogColor, p.fogDensity * 0.36);
            hemiLight.color.setHex(p.hemiSky);
            hemiLight.groundColor.setHex(p.hemiGround);
            hemiLight.intensity = p.hemiIntensity;
            sunLight.color.setHex(p.sunColor);
            sunLight.intensity = p.sunIntensity;
            renderer.toneMappingExposure = p.exposure;

            sunDisc.position.copy(p.sunDir).multiplyScalar(3000);
            sunDisc.lookAt(0, 0, 0);
            sunDisc.material.color.setHex(p.sunColor);

            const iconEl = document.getElementById('tod-icon');
            const labelEl = document.getElementById('tod-label');
            if (iconEl) iconEl.textContent = p.icon;
            if (labelEl) labelEl.textContent = p.label;
        }

        function initThree() {
            // container passed in
            scene = new THREE.Scene();

            camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.15, 4500);
            camera.position.set(0, 1.85, 5.4);

            renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 0.88;
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            container.appendChild(renderer.domElement);

            clock = new THREE.Clock();

            const skyGeo = new THREE.SphereGeometry(3600, 32, 20);
            const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false });
            skyMesh = new THREE.Mesh(skyGeo, skyMat);
            scene.add(skyMesh);

            sunDisc = new THREE.Mesh(
                new THREE.CircleGeometry(140, 24),
                new THREE.MeshBasicMaterial({ color: 0xfff7d6, fog: false })
            );
            scene.add(sunDisc);

            hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x7c6f5b, 1.05);
            scene.add(hemiLight);

            sunLight = new THREE.DirectionalLight(0xfff5dc, 1.45);
            sunLight.castShadow = true;
            sunLight.shadow.mapSize.width = 1024;
            sunLight.shadow.mapSize.height = 1024;
            sunLight.shadow.camera.near = 10;
            sunLight.shadow.camera.far = 340;
            const d = 110;
            sunLight.shadow.camera.left = -d;
            sunLight.shadow.camera.right = d;
            sunLight.shadow.camera.top = d;
            sunLight.shadow.camera.bottom = -d;
            sunLight.shadow.bias = -0.0005;
            sunLight.shadow.normalBias = 0.02;
            scene.add(sunLight);
            scene.add(sunLight.target);

            studioGroup = new THREE.Group();
            lobbyGroup = new THREE.Group();
            worldGroup = new THREE.Group();
            scene.add(studioGroup, lobbyGroup, worldGroup);

            buildSelectionAndStudioScene();
            buildLobbyScene();
            buildViceCoastWorld();
            rebuildCustomCharacter();
            applyTimeOfDay(0);

            studioGroup.visible = true;
            lobbyGroup.visible = false;
            worldGroup.visible = false;

            window.addEventListener('resize', onResize);
            setupCameraAndInputListeners();
        }

        function onResize() {
            if (!camera || !renderer) return;
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight); composer?.setSize(window.innerWidth, window.innerHeight); bloomPass?.setSize(window.innerWidth, window.innerHeight);
        }

        /* =====================================================================
         * 7. GENDER SELECT, CUSTOMIZATION STUDIO & LOBBY 3D ENVIRONMENTS
         * ===================================================================== */
        function createPedestal(radius = 1.25, ringColor = 0x38bdf8) {
            const grp = new THREE.Group();
            const base = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius * 1.08, 0.18, 36),
                new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.7 })
            );
            base.position.y = 0.09;
            base.receiveShadow = true;
            base.castShadow = true;
            grp.add(base);

            const top = new THREE.Mesh(
                new THREE.CylinderGeometry(radius * 0.94, radius * 0.94, 0.04, 36),
                new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 })
            );
            top.position.y = 0.19;
            top.receiveShadow = true;
            grp.add(top);

            const ring = new THREE.Mesh(
                new THREE.RingGeometry(radius * 0.82, radius * 0.92, 36),
                new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.212;
            grp.add(ring);

            return grp;
        }

        function buildSelectionAndStudioScene() {
            const ground = new THREE.Mesh(
                new THREE.CircleGeometry(45, 48),
                new THREE.MeshStandardMaterial({ map: getSidewalkTex(), roughness: 0.82 })
            );
            ground.rotation.x = -Math.PI / 2;
            ground.receiveShadow = true;
            studioGroup.add(ground);

            const palmA = createPalmTree(7.5, 0.5);
            palmA.position.set(-7.5, 0, -8);
            const palmB = createPalmTree(8.2, -0.5);
            palmB.position.set(7.5, 0, -8);
            studioGroup.add(palmA, palmB);

            const boyPed = createPedestal(1.05, 0x38bdf8);
            boyPed.position.set(-1.45, 0, 0);
            studioGroup.add(boyPed);

            boySelectChar = createHumanCharacter({
                gender: 'boy',
                hairstyle: 'quiff',
                outfit: 'jacket_tee',
                accessory: 'cap',
                skin: PALETTES.skin[1],
                hair: PALETTES.hair[0],
                eyes: PALETTES.eyes[0],
                primary: 0x0284c7,
                secondary: 0x1e293b,
                shoes: 0xf8fafc
            });
            boySelectChar.position.set(-1.45, 0.21, 0);
            boySelectChar.rotation.y = 0.22;
            boySelectChar.userData.genderKey = 'boy';
            studioGroup.add(boySelectChar);

            const girlPed = createPedestal(1.05, 0xf472b6);
            girlPed.position.set(1.45, 0, 0);
            studioGroup.add(girlPed);

            girlSelectChar = createHumanCharacter({
                gender: 'girl',
                hairstyle: 'ponytail',
                outfit: 'cardigan_skirt',
                accessory: 'headband',
                skin: PALETTES.skin[1],
                hair: PALETTES.hair[2],
                eyes: PALETTES.eyes[1],
                primary: 0xe11d48,
                secondary: 0x1e293b,
                shoes: 0xf8fafc
            });
            girlSelectChar.position.set(1.45, 0.21, 0);
            girlSelectChar.rotation.y = -0.22;
            girlSelectChar.userData.genderKey = 'girl';
            studioGroup.add(girlSelectChar);

            const studioPed = createPedestal(1.2, 0x38bdf8);
            studioPed.position.set(0, 0, 0);
            studioPed.name = 'studioPed';
            studioGroup.add(studioPed);
        }

        function rebuildCustomCharacter() {
            if (!state.character.gender) return;
            if (customChar) {
                studioGroup.remove(customChar);
            }
            customChar = createHumanCharacter(state.character);
            customChar.position.set(0, 0.21, 0);
            studioGroup.add(customChar);

            if (lobbyChar) {
                lobbyGroup.remove(lobbyChar);
            }
            lobbyChar = createHumanCharacter(state.character);
            lobbyChar.position.set(0.65, 0.21, 0.4);
            lobbyChar.rotation.y = -0.25;
            lobbyGroup.add(lobbyChar);

            rebuildWorldPlayerCharacter();
        }

        function buildLobbyScene() {
            const terrace = new THREE.Mesh(
                new THREE.BoxGeometry(24, 0.3, 18),
                new THREE.MeshStandardMaterial({ map: getSidewalkTex(), roughness: 0.75 })
            );
            terrace.position.set(0, -0.15, 0);
            terrace.receiveShadow = true;
            lobbyGroup.add(terrace);

            const ped = createPedestal(1.25, 0x10b981);
            ped.position.set(0.65, 0, 0.4);
            lobbyGroup.add(ped);

            const showcaseCar = createVehicleMesh('convertible', 0x0ea5e9, false);
            showcaseCar.position.set(3.4, 0, -1.6);
            showcaseCar.rotation.y = -0.65;
            lobbyGroup.add(showcaseCar);

            const palm = createPalmTree(8.5, 0.6);
            palm.position.set(-4.5, 0, -4.5);
            lobbyGroup.add(palm);
        }

        /* =====================================================================
         * 8. HUGE 20,000m x 20,000m "VICE COAST" OPEN WORLD
         * ===================================================================== */
        const worldColliders = [];
        const buildingRects = [];
        const parkedCars = [];
        const trafficCars = [];
        const trafficSignals = [];
        const signalState = { timer: 0, phase: 0 };
        const pedestrians = [];
        const cyclists = [];
        const deadEnds = [];
        let worldPlayerChar = null;

        function buildDeadEndCulDeSac(x, z, dirX, dirZ, interMat) {
            const bulb = new THREE.Mesh(new THREE.CylinderGeometry(13.5, 13.5, 0.09, 28), interMat);
            bulb.position.set(x, 0.045, z);
            bulb.receiveShadow = true;
            worldGroup.add(bulb);

            const curb = new THREE.Mesh(
                new THREE.RingGeometry(13.5, 16.5, 28),
                new THREE.MeshStandardMaterial({ map: getSidewalkTex(), roughness: 0.85 })
            );
            curb.rotation.x = -Math.PI / 2;
            curb.position.set(x, 0.08, z);
            worldGroup.add(curb);

            const endX = x + dirX * 14.2;
            const endZ = z + dirZ * 14.2;
            const yaw = Math.atan2(dirX, dirZ);

            const barrierGrp = new THREE.Group();
            barrierGrp.position.set(endX, 0, endZ);
            barrierGrp.rotation.y = yaw;

            const stripeTex = makeCanvasTex('dead_end_barrier', 256, 64, (ctx, w, h) => {
                ctx.fillStyle = '#facc15';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#111827';
                for (let sx = -64; sx < w + 64; sx += 36) {
                    ctx.beginPath();
                    ctx.moveTo(sx, 0); ctx.lineTo(sx + 18, 0);
                    ctx.lineTo(sx - 6, h); ctx.lineTo(sx - 24, h);
                    ctx.closePath(); ctx.fill();
                }
            });

            const board = new THREE.Mesh(
                new THREE.BoxGeometry(10.5, 0.85, 0.22),
                new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.5 })
            );
            board.position.y = 1.1;
            board.castShadow = true;
            barrierGrp.add(board);

            [-4.4, 0, 4.4].forEach(px => {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x334155 }));
                post.position.set(px, 0.75, 0);
                barrierGrp.add(post);
            });

            const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x475569 }));
            signPost.position.set(0, 1.6, 0.1);
            const signBoard = new THREE.Mesh(
                new THREE.BoxGeometry(2.6, 0.8, 0.12),
                new THREE.MeshStandardMaterial({ map: getSignTex('DEAD END', '#facc15', '#111827'), roughness: 0.4 })
            );
            signBoard.position.set(0, 3.1, 0.1);
            barrierGrp.add(signPost, signBoard);

            worldGroup.add(barrierGrp);
            worldColliders.push({ minX: endX - 2.6, maxX: endX + 2.6, minZ: endZ - 2.6, maxZ: endZ + 2.6 });
            deadEnds.push({ x, z });

            [-1, 1].forEach(s => {
                const p = createPalmTree(7.8, s * 0.6);
                p.position.set(endX + dirZ * s * 8.5 + dirX * 3.5, 0.05, endZ - dirX * s * 8.5 + dirZ * 3.5);
                worldGroup.add(p);
            });
        }

        function buildCentralPark(cx, cz) {
            const parkGrass = new THREE.Mesh(
                new THREE.BoxGeometry(58, 0.22, 58),
                new THREE.MeshStandardMaterial({ map: getGrassTex(), roughness: 0.92 })
            );
            parkGrass.position.set(cx, 0.11, cz);
            parkGrass.receiveShadow = true;
            worldGroup.add(parkGrass);
            buildingRects.push({ x: cx, z: cz, w: 58, d: 58, isPark: true });

            const basin = new THREE.Mesh(
                new THREE.CylinderGeometry(6.8, 7.2, 0.9, 24),
                new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.45 })
            );
            basin.position.set(cx, 0.55, cz);
            basin.castShadow = true;
            basin.receiveShadow = true;
            worldGroup.add(basin);

            const fWater = new THREE.Mesh(
                new THREE.CylinderGeometry(6.1, 6.1, 0.2, 24),
                new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.12, metalness: 0.3 })
            );
            fWater.position.set(cx, 0.95, cz);
            worldGroup.add(fWater);

            const pillar = new THREE.Mesh(
                new THREE.CylinderGeometry(0.65, 0.95, 2.4, 14),
                new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 })
            );
            pillar.position.set(cx, 1.8, cz);
            pillar.castShadow = true;
            worldGroup.add(pillar);

            worldColliders.push({ minX: cx - 6.8, maxX: cx + 6.8, minZ: cz - 6.8, maxZ: cz + 6.8 });

            const benchMat = new THREE.MeshStandardMaterial({ color: 0x7c4a27, roughness: 0.85 });
            const treeOffsets = [[-18, -18], [18, -18], [-18, 18], [18, 18], [0, -21], [0, 21], [-21, 0], [21, 0]];
            treeOffsets.forEach(([ox, oz], idx) => {
                const p = createPalmTree(8.2 + (idx % 3) * 0.7, idx % 2 === 0 ? 0.5 : -0.5);
                p.position.set(cx + ox, 0.2, cz + oz);
                worldGroup.add(p);

                if (idx < 4) {
                    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.75), benchMat);
                    bench.position.set(cx + ox * 0.65, 0.48, cz + oz * 0.65);
                    bench.castShadow = true;
                    worldGroup.add(bench);
                }
            });
        }

        function buildExtraPark(cx, cz, style) {
            const parkGrass = new THREE.Mesh(
                new THREE.BoxGeometry(58, 0.22, 58),
                new THREE.MeshStandardMaterial({ map: getGrassTex(), roughness: 0.92 })
            );
            parkGrass.position.set(cx, 0.11, cz);
            parkGrass.receiveShadow = true;
            worldGroup.add(parkGrass);
            buildingRects.push({ x: cx, z: cz, w: 58, d: 58, isPark: true });

            const pathMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.85 });
            const ringPath = new THREE.Mesh(new THREE.RingGeometry(14, 18.5, 32), pathMat);
            ringPath.rotation.x = -Math.PI / 2;
            ringPath.position.set(cx, 0.23, cz);
            worldGroup.add(ringPath);

            if (style === 'pond') {
                const pond = new THREE.Mesh(
                    new THREE.CylinderGeometry(11.5, 11.5, 0.18, 28),
                    new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.12, metalness: 0.25 })
                );
                pond.position.set(cx, 0.18, cz);
                worldGroup.add(pond);
                const bridge = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.32, 24), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 }));
                bridge.position.set(cx, 0.34, cz);
                bridge.castShadow = true;
                worldGroup.add(bridge);
            } else {
                const base = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6.0, 0.45, 8), pathMat);
                base.position.set(cx, 0.38, cz);
                const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.65 }));
                roof.position.set(cx, 4.6, cz);
                roof.castShadow = true;
                worldGroup.add(base, roof);
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
                    col.position.set(cx + Math.cos(a) * 4.5, 2.0, cz + Math.sin(a) * 4.5);
                    worldGroup.add(col);
                }
                worldColliders.push({ minX: cx - 5.2, maxX: cx + 5.2, minZ: cz - 5.2, maxZ: cz + 5.2 });
            }

            const benchMat = new THREE.MeshStandardMaterial({ color: 0x7c4a27, roughness: 0.85 });
            [[-20, -20], [20, -20], [-20, 20], [20, 20], [-21, 0], [21, 0], [0, -21], [0, 21]].forEach(([ox, oz], idx) => {
                const p = createPalmTree(8.4 + (idx % 3), ox > 0 ? 0.55 : -0.55);
                p.position.set(cx + ox, 0.2, cz + oz);
                worldGroup.add(p);
                if (idx < 4) {
                    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.75), benchMat);
                    bench.position.set(cx + ox * 0.72, 0.48, cz + oz * 0.72);
                    bench.castShadow = true;
                    worldGroup.add(bench);
                }
            });
        }

        function buildViceCoastWorld() {
            const outerLand = new THREE.Mesh(
                new THREE.PlaneGeometry(20000, 20000),
                new THREE.MeshStandardMaterial({ map: getGrassTex(), color: 0x6ea65e, roughness: 0.94 })
            );
            outerLand.rotation.x = -Math.PI / 2;
            outerLand.position.set(-200, -0.02, 0);
            outerLand.receiveShadow = true;
            worldGroup.add(outerLand);

            const cityConcrete = new THREE.Mesh(
                new THREE.PlaneGeometry(660, 660),
                new THREE.MeshStandardMaterial({ color: 0xb9bfc6, roughness: 0.9 })
            );
            cityConcrete.rotation.x = -Math.PI / 2;
            cityConcrete.position.set(-20, 0, 0);
            cityConcrete.receiveShadow = true;
            worldGroup.add(cityConcrete);

            const sandMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(110, 20000),
                new THREE.MeshStandardMaterial({ map: getSandTex(), roughness: 0.94 })
            );
            sandMesh.rotation.x = -Math.PI / 2;
            sandMesh.position.set(250, 0.02, 0);
            sandMesh.receiveShadow = true;
            worldGroup.add(sandMesh);

            const boardwalk = new THREE.Mesh(
                new THREE.BoxGeometry(10, 0.24, 520),
                new THREE.MeshStandardMaterial({ color: 0x9c7a54, roughness: 0.85 })
            );
            boardwalk.position.set(200, 0.12, 0);
            boardwalk.receiveShadow = true;
            worldGroup.add(boardwalk);

            oceanMat = new THREE.MeshStandardMaterial({
                map: getWaterTex(),
                roughness: 0.14,
                metalness: 0.32
            });
            const ocean = new THREE.Mesh(new THREE.PlaneGeometry(9800, 20000), oceanMat);
            ocean.rotation.x = -Math.PI / 2;
            ocean.position.set(5190, -0.25, 0);
            worldGroup.add(ocean);

            const umbrellaColors = [0xef4444, 0x0ea5e9, 0xf59e0b, 0xec4899, 0x10b981];
            for (let z = -220; z <= 220; z += 28) {
                const palm = createPalmTree(8.5 + (Math.abs(z) % 3), (z % 2 === 0 ? 0.8 : -0.7));
                palm.position.set(208, 0, z);
                worldGroup.add(palm);

                const ux = 228 + (Math.abs(z * 7) % 20);
                const uGrp = new THREE.Group();
                uGrp.position.set(ux, 0.02, z + 6);
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
                pole.position.y = 1.25;
                const canopy = new THREE.Mesh(
                    new THREE.ConeGeometry(1.75, 0.65, 10),
                    new THREE.MeshStandardMaterial({ color: umbrellaColors[Math.abs(z) % umbrellaColors.length], roughness: 0.7 })
                );
                canopy.position.y = 2.4;
                canopy.castShadow = true;
                const chair = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 1.9), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 }));
                chair.position.set(0.95, 0.16, 0.2);
                uGrp.add(pole, canopy, chair);
                worldGroup.add(uGrp);
            }

            [-75, 65].forEach(lz => {
                const tower = new THREE.Group();
                tower.position.set(245, 0.02, lz);
                const wood = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
                const roofM = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.6 });
                [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]].forEach(([sx, sz]) => {
                    const stilt = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.18), wood);
                    stilt.position.set(sx, 1.2, sz);
                    stilt.castShadow = true;
                    tower.add(stilt);
                });
                const deck = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 2.8), wood);
                deck.position.y = 2.4;
                const hut = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.9, 2.1), wood);
                hut.position.y = 3.45;
                hut.castShadow = true;
                const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.85, 4), roofM);
                roof.rotation.y = Math.PI / 4;
                roof.position.y = 4.8;
                tower.add(deck, hut, roof);
                worldGroup.add(tower);
                worldColliders.push({ minX: 243.5, maxX: 246.5, minZ: lz - 1.5, maxZ: lz + 1.5 });
            });

            const asphaltV = new THREE.MeshStandardMaterial({ map: getAsphaltTex(1, 32), roughness: 0.82 });
            const asphaltH = new THREE.MeshStandardMaterial({ map: getAsphaltTex(1, 32), roughness: 0.82 });
            const interMat = new THREE.MeshStandardMaterial({ color: 0x2d333b, roughness: 0.84 });
            const swMat = new THREE.MeshStandardMaterial({ map: getSidewalkTex(), roughness: 0.85 });

            ROAD_COORDS.forEach(coord => {
                const rNS = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, 460), asphaltV);
                rNS.rotation.x = -Math.PI / 2;
                rNS.position.set(coord, 0.04, 0);
                rNS.receiveShadow = true;
                worldGroup.add(rNS);

                const ewLen = 408;
                const rEW = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ewLen), asphaltH);
                rEW.rotation.x = -Math.PI / 2;
                rEW.rotation.z = Math.PI / 2;
                rEW.position.set(-26, 0.045, coord);
                rEW.receiveShadow = true;
                worldGroup.add(rEW);

                if (coord !== 0) {
                    buildDeadEndCulDeSac(coord, -230, 0, -1, interMat);
                    buildDeadEndCulDeSac(coord, 230, 0, 1, interMat);
                    buildDeadEndCulDeSac(-230, coord, -1, 0, interMat);
                }
            });

            const hwTex = getAsphaltTex(1, 180);
            const hwMat = new THREE.MeshStandardMaterial({ map: hwTex, roughness: 0.84 });
            const hwNS = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, 19000), hwMat);
            hwNS.rotation.x = -Math.PI / 2;
            hwNS.position.set(0, 0.035, 0);
            hwNS.receiveShadow = true;
            worldGroup.add(hwNS);
            buildDeadEndCulDeSac(0, -9500, 0, -1, interMat);
            buildDeadEndCulDeSac(0, 9500, 0, 1, interMat);

            const hwW = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, 9500), hwMat);
            hwW.rotation.x = -Math.PI / 2;
            hwW.rotation.z = Math.PI / 2;
            hwW.position.set(-4750, 0.038, 0);
            hwW.receiveShadow = true;
            worldGroup.add(hwW);
            buildDeadEndCulDeSac(-9500, 0, -1, 0, interMat);

            // Grand Central Roundabout
            const rbRoad = new THREE.Mesh(new THREE.RingGeometry(12, 26, 48), interMat);
            rbRoad.rotation.x = -Math.PI / 2;
            rbRoad.position.set(0, 0.06, 0);
            rbRoad.receiveShadow = true;
            worldGroup.add(rbRoad);

            const rbLine = new THREE.Mesh(
                new THREE.RingGeometry(18.7, 19.2, 48),
                new THREE.MeshBasicMaterial({ color: 0xf8fafc })
            );
            rbLine.rotation.x = -Math.PI / 2;
            rbLine.position.set(0, 0.066, 0);
            worldGroup.add(rbLine);

            const rbIsland = new THREE.Mesh(
                new THREE.CylinderGeometry(11.8, 12.2, 0.35, 36),
                new THREE.MeshStandardMaterial({ map: getGrassTex(), roughness: 0.9 })
            );
            rbIsland.position.set(0, 0.175, 0);
            rbIsland.receiveShadow = true;
            worldGroup.add(rbIsland);
            const rbMonument = new THREE.Mesh(
                new THREE.CylinderGeometry(2.2, 3.2, 5.2, 16),
                new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.2 })
            );
            rbMonument.position.set(0, 2.7, 0);
            rbMonument.castShadow = true;
            const rbGlobe = new THREE.Mesh(
                new THREE.SphereGeometry(1.8, 20, 16),
                new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.18, metalness: 0.65 })
            );
            rbGlobe.position.set(0, 6.4, 0);
            worldGroup.add(rbMonument, rbGlobe);
            worldColliders.push({ minX: -11.5, maxX: 11.5, minZ: -11.5, maxZ: 11.5 });
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const p = createPalmTree(7.2, 0.45);
                p.position.set(Math.cos(a) * 8.2, 0.35, Math.sin(a) * 8.2);
                worldGroup.add(p);
            }

            // Outer Circle Road
            const ringAsphalt = new THREE.Mesh(
                new THREE.RingGeometry(RING_ROAD_RADIUS - 9, RING_ROAD_RADIUS + 9, 96),
                interMat
            );
            ringAsphalt.rotation.x = -Math.PI / 2;
            ringAsphalt.position.set(-10, 0.048, 0);
            ringAsphalt.receiveShadow = true;
            worldGroup.add(ringAsphalt);

            const ringCenterLine = new THREE.Mesh(
                new THREE.RingGeometry(RING_ROAD_RADIUS - 0.35, RING_ROAD_RADIUS + 0.35, 96),
                new THREE.MeshBasicMaterial({ color: 0xf59e0b })
            );
            ringCenterLine.rotation.x = -Math.PI / 2;
            ringCenterLine.position.set(-10, 0.055, 0);
            worldGroup.add(ringCenterLine);

            const cwMat = new THREE.MeshBasicMaterial({ color: 0xf1f5f9 });
            ROAD_COORDS.forEach(rx => {
                ROAD_COORDS.forEach(rz => {
                    if (rx === 0 && rz === 0) return;
                    const patch = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH + 0.4, ROAD_WIDTH + 0.4), interMat);
                    patch.rotation.x = -Math.PI / 2;
                    patch.position.set(rx, 0.055, rz);
                    patch.receiveShadow = true;
                    worldGroup.add(patch);

                    for (let s = -5.5; s <= 5.5; s += 2.2) {
                        const c1 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.8), cwMat);
                        c1.rotation.x = -Math.PI / 2; c1.position.set(rx + s, 0.062, rz + 9.2);
                        const c2 = c1.clone(); c2.position.set(rx + s, 0.062, rz - 9.2);
                        const c3 = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.1), cwMat);
                        c3.rotation.x = -Math.PI / 2; c3.position.set(rx + 9.2, 0.062, rz + s);
                        const c4 = c3.clone(); c4.position.set(rx - 9.2, 0.062, rz + s);
                        worldGroup.add(c1, c2, c3, c4);
                    }

                    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 6.2, 8), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 }));
                    pole.position.set(rx + 9.2, 3.1, rz - 9.2);
                    pole.castShadow = true;
                    const lampHead = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 1.4), new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfde047, emissiveIntensity: 0.5 }));
                    lampHead.position.set(rx + 8.6, 6.1, rz - 9.2);

                    const sigBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.55), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }));
                    sigBox.position.set(rx + 9.2, 4.9, rz - 9.2);
                    const nsBulbMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.4 });
                    const ewBulbMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.4 });
                    const nsBulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), nsBulbMat);
                    nsBulb.position.set(rx + 9.2, 4.9, rz - 8.9);
                    const ewBulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), ewBulbMat);
                    ewBulb.position.set(rx + 8.9, 4.9, rz - 9.2);

                    worldGroup.add(pole, lampHead, sigBox, nsBulb, ewBulb);
                    trafficSignals.push({ rx, rz, nsBulbMat, ewBulbMat });
                });
            });

            const artDecoColors = ['#f9c5d1', '#b5ead7', '#ffdac1', '#c7ceea', '#fff1c1', '#a0e7e5'];
            const hotelSigns = ['PALM HOTEL', 'SUNSET CAFE', 'OCEAN PLAZA', 'SUNRISE BISTRO', 'COASTAL MALL', 'BAYVIEW SUITES', 'METRO TOWER', 'MARINA CLUB'];
            let signIdx = 0;

            for (let bx = 0; bx < 4; bx++) {
                for (let bz = 0; bz < 4; bz++) {
                    const centerX = (ROAD_COORDS[bx] + ROAD_COORDS[bx + 1]) / 2;
                    const centerZ = (ROAD_COORDS[bz] + ROAD_COORDS[bz + 1]) / 2;

                    const swBlock = new THREE.Mesh(new THREE.BoxGeometry(68, 0.18, 68), swMat);
                    swBlock.position.set(centerX, 0.09, centerZ);
                    swBlock.receiveShadow = true;
                    worldGroup.add(swBlock);

                    if (bx === 2 && bz === 1) {
                        buildCentralPark(centerX, centerZ);
                        continue;
                    }
                    if (bx === 1 && bz === 2) {
                        buildExtraPark(centerX, centerZ, 'pond');
                        continue;
                    }
                    if (bx === 0 && bz === 0) {
                        buildExtraPark(centerX, centerZ, 'gazebo');
                        continue;
                    }

                    const isOceanDrive = (bx === 3);
                    const isDowntown = (bx === 0 || bx === 1);

                    const subOffsets = [[-14, -14], [14, -14], [-14, 14], [14, 14]];
                    subOffsets.forEach(([ox, oz], subI) => {
                        const x = centerX + ox;
                        const z = centerZ + oz;
                        if (Math.hypot(x, z) < 38) return;

                        const w = 20 + ((bx + subI) % 2) * 2;
                        const d = 20 + ((bz + subI) % 2) * 2;

                        let h, style, col;
                        if (isOceanDrive) {
                            h = 14 + ((bz * 3 + subI * 5) % 10);
                            style = 'artdeco';
                            col = artDecoColors[(bz * 4 + subI) % artDecoColors.length];
                        } else if (isDowntown) {
                            h = 26 + ((bz * 7 + subI * 9) % 26);
                            style = (subI % 2 === 0) ? 'glass' : 'artdeco';
                            col = style === 'glass' ? '#1e3a52' : '#d6d3d1';
                        } else {
                            h = 17 + ((bx * 4 + subI * 6) % 14);
                            style = (subI === 0) ? 'glass' : 'artdeco';
                            col = style === 'glass' ? '#244766' : artDecoColors[(bx + subI) % artDecoColors.length];
                        }

                        const floors = Math.max(3, Math.round(h / 3.4));
                        const facadeTex = getBuildingFacadeTex(style, col, floors);
                        const sideMat = new THREE.MeshStandardMaterial({ map: facadeTex, roughness: style === 'glass' ? 0.25 : 0.72, metalness: style === 'glass' ? 0.45 : 0.05 });
                        const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 });

                        const bMesh = new THREE.Mesh(
                            new THREE.BoxGeometry(w, h, d),
                            [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat]
                        );
                        bMesh.position.set(x, h / 2 + 0.18, z);
                        bMesh.castShadow = true;
                        bMesh.receiveShadow = true;
                        worldGroup.add(bMesh);

                        const hvac = new THREE.Mesh(new THREE.BoxGeometry(w * 0.35, 1.4, d * 0.35), roofMat);
                        hvac.position.set(x, h + 0.88, z);
                        hvac.castShadow = true;
                        worldGroup.add(hvac);

                        if ((isOceanDrive && ox > 0) || (isDowntown && subI === 1)) {
                            const label = hotelSigns[signIdx++ % hotelSigns.length];
                            const signMesh = new THREE.Mesh(
                                new THREE.BoxGeometry(0.25, 1.8, 7.6),
                                new THREE.MeshStandardMaterial({ map: getSignTex(label), roughness: 0.3, emissive: 0x0ea5e9, emissiveIntensity: 0.2 })
                            );
                            signMesh.position.set(x + w / 2 + 0.15, 5.2, z);
                            worldGroup.add(signMesh);
                        }

                        worldColliders.push({
                            minX: x - w / 2 - 0.3,
                            maxX: x + w / 2 + 0.3,
                            minZ: z - d / 2 - 0.3,
                            maxZ: z + d / 2 + 0.3
                        });
                        buildingRects.push({ x, z, w, d, isPark: false });
                    });

                    const cp = createPalmTree(7.8, 0.5);
                    cp.position.set(centerX + 31, 0.18, centerZ + 31);
                    worldGroup.add(cp);
                }
            }

            // Parked Drivable Vehicles
            const parkedSpecs = [
                { name: 'Ocean Convertible', style: 'convertible', color: 0xf43f5e, x: 175.5, z: 16, yaw: Math.PI },
                { name: 'Vice Street Bike', style: 'bike', color: 0x38bdf8, x: 175.5, z: 6, yaw: Math.PI },
                { name: 'Coastal Cargo Truck', style: 'truck', color: 0xf97316, x: 160.5, z: 26, yaw: 0 },
                { name: 'Sunset GT Coupe', style: 'coupe', color: 0x0ea5e9, x: 175.5, z: -26, yaw: Math.PI },
                { name: 'Palm SUV', style: 'suv', color: 0x10b981, x: 175.5, z: 68, yaw: Math.PI },
                { name: 'Turbo Sport Bike', style: 'bike', color: 0xef4444, x: 76.5, z: -18, yaw: 0 },
                { name: 'Metro Delivery Truck', style: 'truck', color: 0x2563eb, x: -76.5, z: -30, yaw: Math.PI },
                { name: 'Roundabout Sedan', style: 'sedan', color: 0xfacc15, x: 30, z: 0, yaw: Math.PI / 2 },
                { name: 'Central Park Coupe', style: 'coupe', color: 0xf97316, x: 76.5, z: -56, yaw: 0 },
                { name: 'Downtown SUV', style: 'suv', color: 0x1e293b, x: -91.5, z: -52, yaw: 0 },
                { name: 'Neon Street Bike', style: 'bike', color: 0xa855f7, x: -160.5, z: 14, yaw: Math.PI },
                { name: 'Harbor Heavy Truck', style: 'truck', color: 0x10b981, x: 84, z: 160.5, yaw: Math.PI / 2 },
                { name: 'Marina Convertible', style: 'convertible', color: 0xec4899, x: 48, z: 160.5, yaw: Math.PI / 2 },
                { name: 'Ring Road Cruiser', style: 'sedan', color: 0xf8fafc, x: -10, z: -274, yaw: Math.PI / 2 },
                { name: 'Ocean Drive Cycle', style: 'cycle', color: 0x22c55e, x: 173.5, z: 16, yaw: Math.PI },
                { name: 'Palm Beach Cycle', style: 'cycle', color: 0x06b6d4, x: 174.5, z: -12, yaw: 0 },
                { name: 'Downtown Cycle', style: 'cycle', color: 0xf59e0b, x: -7.5, z: -38, yaw: Math.PI },
                { name: 'Central Park Cycle', style: 'cycle', color: 0xec4899, x: 24, z: -12, yaw: Math.PI / 2 },
                { name: 'Ocean Drive Taxi', style: 'taxi', color: 0xfacc15, x: 175.5, z: 24, yaw: Math.PI },
                { name: 'Downtown Taxi', style: 'taxi', color: 0xfacc15, x: -7.5, z: -50, yaw: 0 },
                { name: 'Central Park Taxi', style: 'taxi', color: 0xfacc15, x: 76.5, z: 16, yaw: Math.PI },
                { name: 'Palm Beach Taxi', style: 'taxi', color: 0xfacc15, x: 175.5, z: -34, yaw: 0 }
            ];
            parkedSpecs.forEach(spec => {
                const mesh = spec.style === 'cycle'
                    ? createBicycleMesh(spec.color)
                    : createVehicleMesh(spec.style, spec.color, true);
                mesh.position.set(spec.x, 0.04, spec.z);
                mesh.rotation.y = spec.yaw;
                worldGroup.add(mesh);
                parkedCars.push({
                    name: spec.name,
                    style: spec.style,
                    mesh,
                    pos: new THREE.Vector3(spec.x, 0.04, spec.z),
                    yaw: spec.yaw,
                    speed: 0,
                    steer: 0,
                    doorAngle: 0,
                    doorTarget: 0
                });
            });

            // Moving AI Traffic (including moving Taxis)
            const trafficStyles = ['sedan', 'taxi', 'suv', 'truck', 'coupe', 'taxi', 'bike', 'convertible', 'truck', 'bike'];
            const trafficColors = [0xe2e8f0, 0xfacc15, 0x3b82f6, 0xef4444, 0x10b981, 0xfacc15, 0xf59e0b, 0x64748b, 0xec4899, 0x06b6d4];
            for (let i = 0; i < 24; i++) {
                const onVertical = (i % 2 === 0);
                const roadC = ROAD_COORDS[i % ROAD_COORDS.length];
                const dir = (i % 4 < 2) ? 1 : -1;
                let x, z, dirX, dirZ;
                if (onVertical) {
                    dirX = 0; dirZ = dir;
                    x = roadC - dir * LANE_OFFSET;
                    z = -180 + ((i * 39) % 340);
                } else {
                    dirX = dir; dirZ = 0;
                    z = roadC + dir * LANE_OFFSET;
                    x = -180 + ((i * 43) % 320);
                }
                if (Math.hypot(x, z) < 30) z += 45;
                const vStyle = trafficStyles[i % trafficStyles.length];
                const vColor = vStyle === 'taxi' ? 0xfacc15 : trafficColors[i % trafficColors.length];
                const mesh = createVehicleMesh(vStyle, vColor, false);
                const yaw = Math.atan2(dirX, dirZ);
                mesh.position.set(x, 0.04, z);
                mesh.rotation.y = yaw;
                worldGroup.add(mesh);
                const baseSpd = vStyle === 'truck' ? 7.8 : (vStyle === 'bike' ? 12.5 : 9.5 + (i % 4) * 1.4);
                trafficCars.push({
                    style: vStyle, mesh, x, z, dirX, dirZ, yaw,
                    speed: baseSpd,
                    baseSpeed: baseSpd,
                    turnCooldown: 0,
                    crashed: false
                });
            }

            // THE CAR SHOP Showroom Building at (104, -42) facing x = 84 avenue
            const shopGroup = new THREE.Group();
            const shopX = 104;
            const shopZ = -42;
            const shopBody = new THREE.Mesh(
                new THREE.BoxGeometry(14, 6.2, 16),
                new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.3 })
            );
            shopBody.position.set(shopX, 3.1, shopZ);
            shopBody.castShadow = true;
            shopBody.receiveShadow = true;
            shopGroup.add(shopBody);

            const showroomGlass = new THREE.Mesh(
                new THREE.BoxGeometry(0.25, 4.2, 12.5),
                new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.55 })
            );
            showroomGlass.position.set(shopX - 7.05, 2.2, shopZ);
            shopGroup.add(showroomGlass);

            const shopSign = new THREE.Mesh(
                new THREE.PlaneGeometry(11.5, 2.2),
                new THREE.MeshBasicMaterial({ map: getSignTex('THE CAR SHOP', '#0f172a', '#38bdf8') })
            );
            shopSign.rotation.y = -Math.PI / 2;
            shopSign.position.set(shopX - 7.15, 5.2, shopZ);
            shopGroup.add(shopSign);

            // Display supercar outside showroom
            const dispCar = createVehicleMesh('supercar', 0xfacc15, false);
            dispCar.position.set(shopX - 9.2, 0.04, shopZ - 4.5);
            dispCar.rotation.y = -Math.PI / 3;
            shopGroup.add(dispCar);

            // Glowing Car Shop entrance ring on sidewalk (CAR_SHOP_LOCATION = 92, -42)
            carShopRingMesh = new THREE.Mesh(
                new THREE.RingGeometry(1.8, 2.35, 32),
                new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
            );
            carShopRingMesh.rotation.x = -Math.PI / 2;
            carShopRingMesh.position.set(CAR_SHOP_LOCATION.x, 0.08, CAR_SHOP_LOCATION.z);
            shopGroup.add(carShopRingMesh);

            worldGroup.add(shopGroup);
            buildingRects.push({ x: shopX, z: shopZ, w: 14, d: 16, isPark: false });

            // Footpath Pedestrians
            for (let i = 0; i < 28; i++) {
                const isGirl = (i % 2 === 1);
                const cat = GENDER_CATALOG[isGirl ? 'girl' : 'boy'];
                const npcCfg = {
                    gender: isGirl ? 'girl' : 'boy',
                    skin: PALETTES.skin[i % PALETTES.skin.length],
                    hair: PALETTES.hair[(i * 3) % PALETTES.hair.length],
                    eyes: PALETTES.eyes[i % PALETTES.eyes.length],
                    primary: PALETTES.primary[(i * 5) % PALETTES.primary.length],
                    secondary: PALETTES.secondary[(i * 2) % PALETTES.secondary.length],
                    shoes: PALETTES.shoes[i % PALETTES.shoes.length],
                    hairstyle: cat.hairstyles[i % cat.hairstyles.length].id,
                    outfit: cat.outfits[i % cat.outfits.length].id,
                    accessory: i % 3 === 0 ? cat.accessories[1].id : 'none'
                };
                const mesh = createHumanCharacter(npcCfg);
                const onVertical = (i % 2 === 0);
                const roadC = ROAD_COORDS[i % ROAD_COORDS.length];
                const side = (i % 4 < 2) ? 1 : -1;
                const dir = (i % 3 === 0) ? 1 : -1;

                let x, z, dirX, dirZ;
                if (onVertical) {
                    x = roadC + side * 10.6;
                    z = -175 + ((i * 29) % 340);
                    dirX = 0; dirZ = dir;
                } else {
                    z = roadC + side * 10.6;
                    x = -175 + ((i * 31) % 330);
                    dirX = dir; dirZ = 0;
                }
                if (Math.hypot(x, z) < 32) x += 42;
                mesh.position.set(x, 0.18, z);
                const yaw = Math.atan2(dirX, dirZ);
                mesh.rotation.y = yaw;
                worldGroup.add(mesh);

                pedestrians.push({
                    mesh, x, z, dirX, dirZ, yaw,
                    speed: 1.75 + (i % 4) * 0.22,
                    phase: i * 1.1,
                    turnCooldown: 0
                });
            }

            // Footpath Cyclists
            const bikeColors = [0xef4444, 0x0ea5e9, 0x10b981, 0xf59e0b, 0xec4899, 0x8b5cf6];
            for (let i = 0; i < 16; i++) {
                const isGirl = (i % 2 === 0);
                const cat = GENDER_CATALOG[isGirl ? 'girl' : 'boy'];
                const cycCfg = {
                    gender: isGirl ? 'girl' : 'boy',
                    skin: PALETTES.skin[(i + 2) % PALETTES.skin.length],
                    hair: PALETTES.hair[(i * 2) % PALETTES.hair.length],
                    eyes: PALETTES.eyes[i % PALETTES.eyes.length],
                    primary: PALETTES.primary[(i * 3) % PALETTES.primary.length],
                    secondary: PALETTES.secondary[i % PALETTES.secondary.length],
                    shoes: PALETTES.shoes[i % PALETTES.shoes.length],
                    hairstyle: cat.hairstyles[i % cat.hairstyles.length].id,
                    outfit: cat.outfits[i % cat.outfits.length].id,
                    accessory: 'none'
                };
                const grp = new THREE.Group();
                const bike = createBicycleMesh(bikeColors[i % bikeColors.length]);
                const rider = createHumanCharacter(cycCfg);
                rider.position.set(0, 0.36, -0.16);
                grp.add(bike, rider);

                const onVertical = (i % 2 === 0);
                const roadC = ROAD_COORDS[i % ROAD_COORDS.length];
                const side = (i % 4 < 2) ? 1 : -1;
                const dir = (i % 3 === 0) ? 1 : -1;

                let x, z, dirX, dirZ;
                if (onVertical) {
                    x = roadC + side * 8.6;
                    z = -170 + ((i * 41) % 330);
                    dirX = 0; dirZ = dir;
                } else {
                    z = roadC + side * 8.6;
                    x = -170 + ((i * 37) % 310);
                    dirX = dir; dirZ = 0;
                }
                if (Math.hypot(x, z) < 34) z += 48;
                const yaw = Math.atan2(dirX, dirZ);
                grp.position.set(x, 0.05, z);
                grp.rotation.y = yaw;
                worldGroup.add(grp);

                cyclists.push({
                    group: grp, bike, rider, x, z, dirX, dirZ, yaw,
                    speed: 4.8 + (i % 3) * 0.65,
                    phase: i * 1.4
                });
            }
        }

        function rebuildWorldPlayerCharacter() {
            if (!state.character.gender) return;
            const prevPos = player.pos.clone();
            const prevYaw = player.yaw;
            if (worldPlayerChar) {
                worldGroup.remove(worldPlayerChar);
            }
            worldPlayerChar = createHumanCharacter(state.character);
            worldPlayerChar.position.copy(prevPos);
            worldPlayerChar.rotation.y = prevYaw;
            worldGroup.add(worldPlayerChar);
        }

        function getGroundHeight(x, z) {
            if (x > 296) return -0.15;
            if (x >= 195 && x <= 205 && z >= -260 && z <= 260) return 0.24;
            for (let bx = 0; bx < 4; bx++) {
                for (let bz = 0; bz < 4; bz++) {
                    const cx = (ROAD_COORDS[bx] + ROAD_COORDS[bx + 1]) / 2;
                    const cz = (ROAD_COORDS[bz] + ROAD_COORDS[bz + 1]) / 2;
                    if (Math.abs(x - cx) <= 34 && Math.abs(z - cz) <= 34) return 0.18;
                }
            }
            return 0.04;
        }

        function checkBuildingCollision(x, z, pad = 0.45) {
            for (let i = 0; i < worldColliders.length; i++) {
                const c = worldColliders[i];
                if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) {
                    return true;
                }
            }
            return false;
        }

        /* =====================================================================
         * 9. INPUT HANDLING & ULTRA-SMOOTH SINGLE-CLICK-AND-DRAG ORBIT CAMERA
         * ===================================================================== */
        const keys = {};
        const touchInput = { moveX: 0, moveY: 0, sprint: false };

        function setupCameraAndInputListeners() {
            const dom = renderer.domElement;
            const activePointers = new Map();
            let lastPinchDist = null;
            let lastTwoFingerCenter = null;

            const getTwoFingerMetrics = () => {
                const pts = [...activePointers.values()];
                const dx = pts[1].x - pts[0].x;
                const dy = pts[1].y - pts[0].y;
                return {
                    dist: Math.hypot(dx, dy),
                    cx: (pts[0].x + pts[1].x) * 0.5,
                    cy: (pts[0].y + pts[1].y) * 0.5,
                };
            };

            dom.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
                activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                camState.dragging = true;
                camState.lastX = e.clientX;
                camState.lastY = e.clientY;
                if (activePointers.size === 2) {
                    const m = getTwoFingerMetrics();
                    lastPinchDist = m.dist;
                    lastTwoFingerCenter = { x: m.cx, y: m.cy };
                }
                try { dom.setPointerCapture(e.pointerId); } catch (_) {}

                if (activePointers.size === 1 && state.stage === 'gender' && boySelectChar && girlSelectChar) {
                    const rect = dom.getBoundingClientRect();
                    const ndc = new THREE.Vector2(
                        ((e.clientX - rect.left) / rect.width) * 2 - 1,
                        -((e.clientY - rect.top) / rect.height) * 2 + 1
                    );
                    const raycaster = new THREE.Raycaster();
                    raycaster.setFromCamera(ndc, camera);
                    const hits = raycaster.intersectObjects([boySelectChar, girlSelectChar], true);
                    if (hits.length > 0) {
                        let obj = hits[0].object;
                        while (obj && !obj.userData?.genderKey) obj = obj.parent;
                        if (obj?.userData?.genderKey) {
                            selectGender(obj.userData.genderKey);
                        }
                    }
                }
            });

            dom.addEventListener('pointermove', (e) => {
                if (!activePointers.has(e.pointerId)) return;
                activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

                const sens = 0.0062;
                if (activePointers.size >= 2) {
                    const m = getTwoFingerMetrics();
                    if (lastTwoFingerCenter) {
                        const dx = m.cx - lastTwoFingerCenter.x;
                        const dy = m.cy - lastTwoFingerCenter.y;
                        camState.targetYaw -= dx * sens;
                        camState.targetPitch = THREE.MathUtils.clamp(camState.targetPitch + dy * sens, -0.18, 1.18);
                    }
                    if (lastPinchDist !== null) {
                        const minDist = state.stage === 'world' ? 2.4 : 2.6;
                        const maxDist = state.stage === 'world' ? 14.0 : 8.5;
                        camState.targetDistance = THREE.MathUtils.clamp(
                            camState.targetDistance - (m.dist - lastPinchDist) * 0.015,
                            minDist,
                            maxDist
                        );
                    }
                    lastPinchDist = m.dist;
                    lastTwoFingerCenter = { x: m.cx, y: m.cy };
                    return;
                }

                if (!camState.dragging) return;
                const dx = e.clientX - camState.lastX;
                const dy = e.clientY - camState.lastY;
                camState.lastX = e.clientX;
                camState.lastY = e.clientY;

                camState.targetYaw -= dx * sens;
                camState.targetPitch = THREE.MathUtils.clamp(camState.targetPitch + dy * sens, -0.18, 1.18);
            });

            const endDrag = (e) => {
                if (e && e.pointerId !== undefined) {
                    activePointers.delete(e.pointerId);
                    try { dom.releasePointerCapture(e.pointerId); } catch (_) {}
                }
                if (activePointers.size < 2) {
                    lastPinchDist = null;
                    lastTwoFingerCenter = null;
                }
                if (activePointers.size === 1) {
                    const remaining = [...activePointers.values()][0];
                    camState.lastX = remaining.x;
                    camState.lastY = remaining.y;
                    camState.dragging = true;
                } else if (activePointers.size === 0) {
                    camState.dragging = false;
                }
            };
            dom.addEventListener('pointerup', endDrag);
            dom.addEventListener('pointercancel', endDrag);
            dom.addEventListener('contextmenu', (e) => e.preventDefault());

            dom.addEventListener('wheel', (e) => {
                e.preventDefault();
                const minDist = state.stage === 'world' ? 2.4 : 2.6;
                const maxDist = state.stage === 'world' ? 14.0 : 8.5;
                camState.targetDistance = THREE.MathUtils.clamp(
                    camState.targetDistance + e.deltaY * 0.004,
                    minDist,
                    maxDist
                );
            }, { passive: false });

            window.addEventListener('keydown', (e) => {
                keys[e.code] = true;
                if (state.stage === 'world') {
                    if (e.code === 'KeyE') {
                        toggleVehicle();
                    } else if (e.code === 'CapsLock') {
                        e.preventDefault();
                        toggleTaxiJob();
                    } else if (e.code === 'KeyH') {
                        startContinuousHorn();
                    } else if (e.code === 'Space' && !player.drivingCar && player.grounded) {
                        player.vel.y = 8.4;
                        player.grounded = false;
                        playSFX('jump');
                    }
                }
            });

            window.addEventListener('keyup', (e) => {
                keys[e.code] = false;
                if (e.code === 'KeyH') {
                    stopContinuousHorn();
                }
            });

            window.addEventListener('blur', () => {
                Object.keys(keys).forEach(k => { keys[k] = false; });
                stopContinuousHorn();
                camState.dragging = false;
            });

            const zone = document.getElementById('joystick-zone');
            const knob = document.getElementById('joystick-knob');
            if (zone && knob) {
                let joyId = null;
                const maxR = 34;

                const updateKnob = (clientX, clientY) => {
                    const r = zone.getBoundingClientRect();
                    const cx = r.left + r.width / 2;
                    const cy = r.top + r.height / 2;
                    let dx = clientX - cx;
                    let dy = clientY - cy;
                    const dist = Math.hypot(dx, dy);
                    if (dist > maxR) {
                        dx = (dx / dist) * maxR;
                        dy = (dy / dist) * maxR;
                    }
                    knob.style.transform = `translate(${dx}px, ${dy}px)`;
                    touchInput.moveX = dx / maxR;
                    touchInput.moveY = dy / maxR;
                };

                zone.addEventListener('pointerdown', (e) => {
                    joyId = e.pointerId;
                    try { zone.setPointerCapture(joyId); } catch (_) {}
                    updateKnob(e.clientX, e.clientY);
                });
                zone.addEventListener('pointermove', (e) => {
                    if (e.pointerId === joyId) updateKnob(e.clientX, e.clientY);
                });
                const resetJoy = (e) => {
                    if (e.pointerId === joyId) {
                        joyId = null;
                        touchInput.moveX = 0;
                        touchInput.moveY = 0;
                        knob.style.transform = 'translate(0px, 0px)';
                    }
                };
                zone.addEventListener('pointerup', resetJoy);
                zone.addEventListener('pointercancel', resetJoy);
            }

            const jumpBtn = document.getElementById('touch-jump-btn');
            if (jumpBtn) {
                jumpBtn.addEventListener('click', () => {
                    if (state.stage === 'world' && !player.drivingCar && player.grounded) {
                        player.vel.y = 8.4;
                        player.grounded = false;
                        playSFX('jump');
                    }
                });
            }

            const sprintBtn = document.getElementById('touch-sprint-btn');
            if (sprintBtn) {
                sprintBtn.addEventListener('pointerdown', () => { touchInput.sprint = true; });
                sprintBtn.addEventListener('pointerup', () => { touchInput.sprint = false; });
                sprintBtn.addEventListener('pointercancel', () => { touchInput.sprint = false; });
            }
        }

        /* =====================================================================
         * 10. SIMULATION UPDATES (TRAFFIC SIGNALS, CARS, PEDESTRIANS & MINIMAP)
         * ===================================================================== */
        function updateTrafficSignals(dt) {
            signalState.timer += dt;
            const durations = [9.0, 2.5, 9.0, 2.5];
            if (signalState.timer >= durations[signalState.phase]) {
                signalState.timer = 0;
                signalState.phase = (signalState.phase + 1) % 4;
            }

            const nsGreen = signalState.phase === 0;
            const nsYellow = signalState.phase === 1;
            const ewGreen = signalState.phase === 2;

            for (const sig of trafficSignals) {
                if (nsGreen) {
                    sig.nsBulbMat.color.setHex(0x22c55e);
                    sig.nsBulbMat.emissive.setHex(0x22c55e);
                } else if (nsYellow) {
                    sig.nsBulbMat.color.setHex(0xfacc15);
                    sig.nsBulbMat.emissive.setHex(0xfacc15);
                } else {
                    sig.nsBulbMat.color.setHex(0xef4444);
                    sig.nsBulbMat.emissive.setHex(0xef4444);
                }

                if (ewGreen) {
                    sig.ewBulbMat.color.setHex(0x22c55e);
                    sig.ewBulbMat.emissive.setHex(0x22c55e);
                } else if (signalState.phase === 3) {
                    sig.ewBulbMat.color.setHex(0xfacc15);
                    sig.ewBulbMat.emissive.setHex(0xfacc15);
                } else {
                    sig.ewBulbMat.color.setHex(0xef4444);
                    sig.ewBulbMat.emissive.setHex(0xef4444);
                }
            }
        }

        function isSignalRedFor(x, z, dirX, dirZ) {
            const nsStop = signalState.phase === 1 || signalState.phase === 2 || signalState.phase === 3;
            const ewStop = signalState.phase === 0 || signalState.phase === 1 || signalState.phase === 3;

            for (const sig of trafficSignals) {
                if (Math.abs(dirZ) > 0.5) {
                    if (Math.abs(x - sig.rx) < 6.5 && nsStop) {
                        const distToLine = (sig.rz - 10.5 - z) * Math.sign(dirZ);
                        if (distToLine > 0 && distToLine < 11.5) return true;
                    }
                } else {
                    if (Math.abs(z - sig.rz) < 6.5 && ewStop) {
                        const distToLine = (sig.rx - 10.5 - x) * Math.sign(dirX);
                        if (distToLine > 0 && distToLine < 11.5) return true;
                    }
                }
            }
            return false;
        }

        function updatePlayerAndVehicles(dt, time) {
            for (const c of parkedCars) {
                c.doorAngle = THREE.MathUtils.lerp(c.doorAngle, c.doorTarget, Math.min(1, 10 * dt));
                if (c.mesh.userData.doorPivot) {
                    c.mesh.userData.doorPivot.rotation.y = c.doorAngle;
                }
            }

            let fwd = 0;
            let turn = 0;
            if (keys['KeyW'] || keys['ArrowUp']) fwd += 1;
            if (keys['KeyS'] || keys['ArrowDown']) fwd -= 1;
            if (keys['KeyA'] || keys['ArrowLeft']) turn += 1;
            if (keys['KeyD'] || keys['ArrowRight']) turn -= 1;

            if (Math.abs(touchInput.moveY) > 0.08 || Math.abs(touchInput.moveX) > 0.08) {
                fwd = -touchInput.moveY;
                turn = -touchInput.moveX;
            }

            if (player.drivingCar) {
                const car = player.drivingCar;
                const handbrake = keys['Space'];
                const isTruck = car.style === 'truck';
                const isBike = car.style === 'bike';
                const isCycle = car.style === 'cycle';
                const isSuper = car.style === 'supercar';

                const maxFwd = isCycle ? 14 : (isSuper ? 48 : (isBike ? 38 : (isTruck ? 22 : 30)));
                const accelRate = isCycle ? 12 : (isSuper ? 34 : (isBike ? 30 : (isTruck ? 14 : 22)));
                const accel = fwd > 0 ? accelRate : (fwd < 0 ? 18 : 0);
                if (fwd !== 0) {
                    car.speed += fwd * accel * dt;
                } else {
                    car.speed *= Math.pow(0.18, dt);
                }
                if (handbrake) {
                    car.speed *= Math.pow(0.02, dt);
                }
                car.speed = THREE.MathUtils.clamp(car.speed, isCycle ? -5 : -11, maxFwd);

                car.steer = THREE.MathUtils.lerp(car.steer, turn * (isBike || isCycle ? 0.54 : 0.46), Math.min(1, 10 * dt));
                const speedFactor = THREE.MathUtils.clamp(Math.abs(car.speed) / 4.5, 0, 1);
                const dirSign = car.speed >= -0.1 ? 1 : -1;
                car.yaw += car.steer * speedFactor * dirSign * (isTruck ? 1.95 : (isCycle ? 2.85 : 2.55)) * dt;

                const vx = Math.sin(car.yaw) * car.speed;
                const vz = Math.cos(car.yaw) * car.speed;
                const nx = THREE.MathUtils.clamp(car.pos.x + vx * dt, -WORLD_HALF + 50, 290);
                const nz = THREE.MathUtils.clamp(car.pos.z + vz * dt, -WORLD_HALF + 50, WORLD_HALF - 50);

                const colPad = isCycle ? 0.55 : (isBike ? 0.75 : (isTruck ? 1.85 : 1.35));
                const roadDist = (px, pz) => {
                    let best = 9999;
                    for (let r = 0; r < ROAD_COORDS.length; r++) {
                        const rc = ROAD_COORDS[r];
                        if (Math.abs(pz) <= 232) best = Math.min(best, Math.abs(px - rc));
                        if (px >= -232 && px <= 186) best = Math.min(best, Math.abs(pz - rc));
                    }
                    best = Math.min(best, Math.abs(Math.hypot(px + 10, pz) - RING_ROAD_RADIUS));
                    const centerDist = Math.hypot(px, pz);
                    if (centerDist >= 12 && centerDist <= 34) best = Math.min(best, 0);
                    return best;
                };
                const curRoadDist = roadDist(car.pos.x, car.pos.z);
                const canDriveAt = (tx, tz) => {
                    const d = roadDist(tx, tz);
                    return d <= 9.2 || d < curRoadDist;
                };
                if (!checkBuildingCollision(nx, car.pos.z, colPad) && canDriveAt(nx, car.pos.z)) car.pos.x = nx;
                else car.speed *= -0.25;
                if (!checkBuildingCollision(car.pos.x, nz, colPad) && canDriveAt(car.pos.x, nz)) car.pos.z = nz;
                else car.speed *= -0.25;

                for (let i = 0; i < trafficCars.length; i++) {
                    const t = trafficCars[i];
                    const dist = Math.hypot(car.pos.x - t.x, car.pos.z - t.z);
                    const hitR = (isTruck || t.style === 'truck') ? 3.8 : 3.0;
                    if (dist < hitR) {
                        if (Math.abs(car.speed) > 2.5 || !t.crashed) {
                            playSFX('crash');
                            camState.shake = 0.45;
                            t.crashed = true;
                            t.speed = 0;
                            showToast('Crash! Vehicle stopped.');
                        }
                        const pushAng = Math.atan2(car.pos.x - t.x, car.pos.z - t.z);
                        car.pos.x = t.x + Math.sin(pushAng) * (hitR + 0.08);
                        car.pos.z = t.z + Math.cos(pushAng) * (hitR + 0.08);
                        car.speed *= -0.25;
                    }
                }

                car.pos.y = Math.max(0.04, getGroundHeight(car.pos.x, car.pos.z) - 0.02);
                car.mesh.position.copy(car.pos);
                car.mesh.rotation.y = car.yaw;
                car.mesh.rotation.z = (isBike || isCycle) ? THREE.MathUtils.lerp(car.mesh.rotation.z, -car.steer * speedFactor * 0.55, Math.min(1, 10 * dt)) : 0;

                car.mesh.userData.wheels.forEach(w => { w.rotation.x += (car.speed * dt) / (isTruck ? 0.5 : 0.36); });
                car.mesh.userData.frontPivots.forEach(fp => { fp.rotation.y = car.steer; });

                const seatLocal = car.mesh.userData.seatOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), car.yaw);
                player.pos.copy(car.pos).add(seatLocal);
                player.yaw = car.yaw;
                worldPlayerChar.position.copy(player.pos);
                worldPlayerChar.rotation.y = car.yaw;
                worldPlayerChar.rotation.z = (isBike || isCycle) ? car.mesh.rotation.z : 0;
                animateHuman(worldPlayerChar, time, 0, true, true, 0, (isBike || isCycle) ? 'bike' : 'car');

                const kmh = Math.round(Math.abs(car.speed) * 3.6);
                
                
            } else {
                const sprinting = Boolean(keys['ShiftLeft'] || keys['ShiftRight'] || touchInput.sprint);
                const moveSpeed = sprinting ? 9.2 : 5.0;

                const forwardVec = new THREE.Vector3(-Math.sin(camState.yaw), 0, -Math.cos(camState.yaw));
                const rightVec = new THREE.Vector3(Math.cos(camState.yaw), 0, -Math.sin(camState.yaw));
                const wishDir = new THREE.Vector3()
                    .addScaledVector(forwardVec, fwd)
                    .addScaledVector(rightVec, -turn);

                if (wishDir.lengthSq() > 0.001) {
                    wishDir.normalize();
                    player.vel.x = THREE.MathUtils.lerp(player.vel.x, wishDir.x * moveSpeed, Math.min(1, 14 * dt));
                    player.vel.z = THREE.MathUtils.lerp(player.vel.z, wishDir.z * moveSpeed, Math.min(1, 14 * dt));

                    const targetYaw = Math.atan2(wishDir.x, wishDir.z);
                    let diff = targetYaw - player.yaw;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    player.yaw += diff * Math.min(1, 15 * dt);
                } else {
                    player.vel.x *= Math.pow(0.001, dt);
                    player.vel.z *= Math.pow(0.001, dt);
                }

                player.vel.y -= 23.0 * dt;
                const nx = THREE.MathUtils.clamp(player.pos.x + player.vel.x * dt, -WORLD_HALF + 20, 294);
                const nz = THREE.MathUtils.clamp(player.pos.z + player.vel.z * dt, -WORLD_HALF + 20, WORLD_HALF - 20);

                if (!checkBuildingCollision(nx, player.pos.z, 0.42)) player.pos.x = nx;
                else player.vel.x = 0;
                if (!checkBuildingCollision(player.pos.x, nz, 0.42)) player.pos.z = nz;
                else player.vel.z = 0;

                player.pos.y += player.vel.y * dt;
                const groundY = getGroundHeight(player.pos.x, player.pos.z);
                if (player.pos.y <= groundY) {
                    player.pos.y = groundY;
                    player.vel.y = 0;
                    player.grounded = true;
                }

                worldPlayerChar.position.copy(player.pos);
                worldPlayerChar.rotation.set(0, player.yaw, 0);
                const horizSpeed = Math.hypot(player.vel.x, player.vel.z);
                animateHuman(worldPlayerChar, time, horizSpeed / 9.2, player.grounded, false, 0, 'car');

                const kmh = Math.round(horizSpeed * 3.6);
                const spdEl = document.getElementById('hud-speed');
                
            }

            const pCarPos = player.drivingCar ? player.drivingCar.pos : player.pos;
            for (let i = 0; i < trafficCars.length; i++) {
                const c = trafficCars[i];
                if (c.crashed) {
                    c.speed = 0;
                    const blink = Math.sin(time * 12 + i) > 0;
                    c.mesh.position.set(c.x, 0.04, c.z);
                    c.mesh.rotation.y = c.yaw;
                    c.mesh.scale.set(1, blink ? 1.01 : 1.0, 1);
                    continue;
                }

                let targetSpd = c.baseSpeed;
                if (isSignalRedFor(c.x, c.z, c.dirX, c.dirZ)) {
                    targetSpd = 0;
                }
                if (Math.hypot(c.x - pCarPos.x, c.z - pCarPos.z) < 7.5) {
                    targetSpd = 0;
                }
                for (let j = 0; j < trafficCars.length; j++) {
                    if (i === j) continue;
                    const o = trafficCars[j];
                    const ahead = (o.x - c.x) * c.dirX + (o.z - c.z) * c.dirZ;
                    const lateral = Math.abs((o.x - c.x) * c.dirZ - (o.z - c.z) * c.dirX);
                    if (ahead > 0 && ahead < 8.5 && lateral < 2.6) {
                        targetSpd = 0;
                        break;
                    }
                }

                c.speed = THREE.MathUtils.lerp(c.speed, targetSpd, Math.min(1, 8 * dt));
                c.x += c.dirX * c.speed * dt;
                c.z += c.dirZ * c.speed * dt;

                if (c.x > 168) c.x = -210;
                if (c.x < -212) c.x = 166;
                if (c.z > 210) c.z = -210;
                if (c.z < -212) c.z = 210;

                c.mesh.position.set(c.x, 0.04, c.z);
                c.mesh.rotation.y = c.yaw;
                c.mesh.userData.wheels.forEach(w => { w.rotation.x += (c.speed * dt) / (c.style === 'truck' ? 0.5 : 0.36); });
            }

            let nearest = null;
            let bestDist = 4.2;
            for (const c of parkedCars) {
                const d = Math.hypot(player.pos.x - c.pos.x, player.pos.z - c.pos.z);
                if (d < bestDist) {
                    bestDist = d;
                    nearest = c;
                }
            }
            if (!nearest) {
                for (let i = 0; i < trafficCars.length; i++) {
                    const t = trafficCars[i];
                    if (t.style !== 'taxi') continue;
                    const d = Math.hypot(player.pos.x - t.x, player.pos.z - t.z);
                    if (d < 4.5) {
                        nearest = {
                            name: 'City Taxi',
                            style: 'taxi',
                            mesh: t.mesh,
                            pos: new THREE.Vector3(t.x, 0.04, t.z),
                            yaw: t.yaw,
                            speed: 0,
                            steer: 0,
                            doorAngle: 0,
                            doorTarget: 0,
                            _trafficRef: t,
                        };
                        break;
                    }
                }
            }
            player.nearbyCar = nearest;

            const promptEl = document.getElementById('vehicle-prompt');
            const promptText = document.getElementById('vehicle-prompt-text');
            const hornBtn = document.getElementById('btn-horn-action');
            if (promptEl && promptText) {
                if (player.drivingCar) {
                    promptEl.classList.remove('hidden');
                    promptText.textContent = `Press E to Exit ${player.drivingCar.name}`;
                    if (hornBtn) hornBtn.classList.remove('hidden');
                } else if (player.nearbyCar) {
                    promptEl.classList.remove('hidden');
                    promptText.textContent = `Press E to Drive ${player.nearbyCar.name}`;
                    if (hornBtn) hornBtn.classList.add('hidden');
                } else {
                    promptEl.classList.add('hidden');
                    if (hornBtn) hornBtn.classList.add('hidden');
                }
            }
        }

        function updatePedestrians(dt, time) {
            const pPos = player.drivingCar ? player.drivingCar.pos : player.pos;
            for (const p of pedestrians) {
                p.turnCooldown = Math.max(0, p.turnCooldown - dt);
                const distToPlayer = Math.hypot(p.x - pPos.x, p.z - pPos.z);
                const paused = distToPlayer < 2.4;

                if (!paused) {
                    p.x += p.dirX * p.speed * dt;
                    p.z += p.dirZ * p.speed * dt;

                    if (p.x > 180 || p.x < -210) p.dirX *= -1;
                    if (p.z > 210 || p.z < -210) p.dirZ *= -1;
                    if (Math.hypot(p.x, p.z) < 26) {
                        p.dirX *= -1;
                        p.dirZ *= -1;
                    }

                    if (p.turnCooldown <= 0) {
                        for (const rx of ROAD_COORDS) {
                            for (const rz of ROAD_COORDS) {
                                if (Math.hypot(p.x - rx, p.z - rz) < 11.5) {
                                    if (Math.random() < 0.35) {
                                        const oldX = p.dirX;
                                        p.dirX = p.dirZ * (Math.random() < 0.5 ? 1 : -1);
                                        p.dirZ = oldX * (Math.random() < 0.5 ? 1 : -1);
                                    }
                                    p.turnCooldown = 3.5;
                                }
                            }
                        }
                    }
                }

                const targetYaw = Math.atan2(p.dirX, p.dirZ);
                let diff = targetYaw - p.yaw;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                p.yaw += diff * Math.min(1, 10 * dt);

                p.mesh.position.set(p.x, getGroundHeight(p.x, p.z), p.z);
                p.mesh.rotation.y = p.yaw;
                animateHuman(p.mesh, time, paused ? 0 : 0.45, true, false, p.phase, 'car');
            }
        }

        function updateCyclists(dt, time) {
            const carPos = player.drivingCar ? player.drivingCar.pos : null;
            for (const c of cyclists) {
                let paused = false;
                if (carPos && Math.hypot(c.x - carPos.x, c.z - carPos.z) < 5.2) paused = true;

                if (!paused) {
                    c.x += c.dirX * c.speed * dt;
                    c.z += c.dirZ * c.speed * dt;
                    if (c.x > 172 || c.x < -208) c.dirX *= -1;
                    if (c.z > 208 || c.z < -208) c.dirZ *= -1;
                    if (Math.hypot(c.x, c.z) < 24) {
                        c.dirX *= -1;
                        c.dirZ *= -1;
                    }
                    c.bike.userData.wheels.forEach(w => { w.rotation.x += (c.speed * dt) / 0.34; });
                }

                const targetYaw = Math.atan2(c.dirX, c.dirZ);
                let diff = targetYaw - c.yaw;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                c.yaw += diff * Math.min(1, 8 * dt);

                c.group.position.set(c.x, 0.05, c.z);
                c.group.rotation.y = c.yaw;
                animateHuman(c.rider, time, paused ? 0 : 1, true, true, c.phase, 'bicycle');
            }
        }

        function updatePedestriansAndBeach(dt, time) {
            updatePedestrians(dt, time);
            updateCyclists(dt, time);

            if (oceanMat && oceanMat.map) {
                oceanMat.map.offset.x = (time * 0.035) % 1;
                oceanMat.map.offset.y = (time * 0.015) % 1;
            }
        }

        function renderMinimap() {
            const mmCanvas = minimapCanvasEl;
            if (!mmCanvas) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const rect = mmCanvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const targetW = Math.round(rect.width * dpr);
            const targetH = Math.round(rect.height * dpr);
            if (mmCanvas.width !== targetW || mmCanvas.height !== targetH) {
                mmCanvas.width = targetW;
                mmCanvas.height = targetH;
            }

            const mmCtx = mmCanvas.getContext('2d');
            const w = mmCanvas.width;
            const h = mmCanvas.height;

            const pPos = player.drivingCar ? player.drivingCar.pos : player.pos;
            const viewSpan = 440;
            const scale = w / viewSpan;
            const toX = (wx) => w / 2 + (wx - pPos.x) * scale;
            const toY = (wz) => h / 2 + (wz - pPos.z) * scale;

            const distEl = document.getElementById('hud-district');
            if (true) {
                if (pPos.x > 195) lastDistrict = 'Palm Beach';
                else if (Math.hypot(pPos.x, pPos.z) < 34) lastDistrict = 'Circle Roundabout';
                else if (Math.abs(Math.hypot(pPos.x + 10, pPos.z) - RING_ROAD_RADIUS) < 22) lastDistrict = 'Outer Circle Road';
                else if (pPos.x > 120 && Math.abs(pPos.z) < 230) lastDistrict = 'Ocean Drive';
                else if (Math.hypot(pPos.x, pPos.z) > 360) lastDistrict = 'Vice Coast Highway';
                else lastDistrict = 'Downtown Plaza';
            }

            mmCtx.fillStyle = '#264033';
            mmCtx.fillRect(0, 0, w, h);

            mmCtx.fillStyle = '#243447';
            mmCtx.fillRect(toX(-350), toY(-330), 660 * scale, 660 * scale);

            mmCtx.fillStyle = '#d4bc8b';
            mmCtx.fillRect(toX(195), toY(-10000), 110 * scale, 20000 * scale);
            mmCtx.fillStyle = '#0c7fa8';
            mmCtx.fillRect(toX(295), toY(-10000), 9800 * scale, 20000 * scale);

            for (let i = 0; i < buildingRects.length; i++) {
                const b = buildingRects[i];
                mmCtx.fillStyle = b.isPark ? '#2e6f40' : '#475b74';
                mmCtx.fillRect(toX(b.x - b.w / 2), toY(b.z - b.d / 2), b.w * scale, b.d * scale);
            }

            mmCtx.fillStyle = '#141c27';
            mmCtx.fillRect(toX(-ROAD_WIDTH / 2), toY(-9500), ROAD_WIDTH * scale, 19000 * scale);
            mmCtx.fillRect(toX(-9500), toY(-ROAD_WIDTH / 2), 9500 * scale, ROAD_WIDTH * scale);
            ROAD_COORDS.forEach(r => {
                mmCtx.fillRect(toX(r - ROAD_WIDTH / 2), toY(-230), ROAD_WIDTH * scale, 460 * scale);
                mmCtx.fillRect(toX(-230), toY(r - ROAD_WIDTH / 2), 408 * scale, ROAD_WIDTH * scale);
            });

            mmCtx.strokeStyle = '#141c27';
            mmCtx.lineWidth = 18 * scale;
            mmCtx.beginPath();
            mmCtx.arc(toX(-10), toY(0), RING_ROAD_RADIUS * scale, 0, Math.PI * 2);
            mmCtx.stroke();

            mmCtx.beginPath();
            mmCtx.arc(toX(0), toY(0), 19 * scale, 0, Math.PI * 2);
            mmCtx.lineWidth = 13 * scale;
            mmCtx.stroke();
            mmCtx.fillStyle = '#2e6f40';
            mmCtx.beginPath();
            mmCtx.arc(toX(0), toY(0), 11 * scale, 0, Math.PI * 2);
            mmCtx.fill();

            mmCtx.fillStyle = '#141c27';
            for (const de of deadEnds) {
                mmCtx.beginPath();
                mmCtx.arc(toX(de.x), toY(de.z), 13 * scale, 0, Math.PI * 2);
                mmCtx.fill();
            }

            mmCtx.fillStyle = '#38bdf8';
            for (const c of parkedCars) {
                mmCtx.beginPath();
                mmCtx.arc(toX(c.pos.x), toY(c.pos.z), Math.max(2.2, 3 * dpr * 0.65), 0, Math.PI * 2);
                mmCtx.fill();
            }

            for (const t of trafficCars) {
                mmCtx.fillStyle = t.crashed ? '#ef4444' : '#fbbf24';
                mmCtx.beginPath();
                mmCtx.arc(toX(t.x), toY(t.z), Math.max(2.2, 3 * dpr * 0.65), 0, Math.PI * 2);
                mmCtx.fill();
            }

            if (carShopRouteActive) {
                const nearestRoad = (val: number) => {
                    let best = ROAD_COORDS[0];
                    let bestD = Infinity;
                    for (const rc of ROAD_COORDS) {
                        const d = Math.abs(val - rc);
                        if (d < bestD) { bestD = d; best = rc; }
                    }
                    return best;
                };
                const startX = nearestRoad(pPos.x);
                const startZ = nearestRoad(pPos.z);
                const pts = [
                    { x: pPos.x, z: pPos.z },
                    { x: startX, z: pPos.z },
                    { x: startX, z: startZ },
                    { x: 84, z: startZ },
                    { x: 84, z: CAR_SHOP_LOCATION.z },
                    { x: CAR_SHOP_LOCATION.x, z: CAR_SHOP_LOCATION.z },
                ];
                mmCtx.strokeStyle = '#3b82f6';
                mmCtx.lineWidth = Math.max(4, 5.5 * dpr * 0.7);
                mmCtx.lineCap = 'round';
                mmCtx.lineJoin = 'round';
                mmCtx.beginPath();
                mmCtx.moveTo(toX(pts[0].x), toY(pts[0].z));
                for (let i = 1; i < pts.length; i++) {
                    mmCtx.lineTo(toX(pts[i].x), toY(pts[i].z));
                }
                mmCtx.stroke();
            }

            // Car Shop marker on minimap
            mmCtx.fillStyle = '#38bdf8';
            mmCtx.strokeStyle = '#ffffff';
            mmCtx.lineWidth = 1.8;
            mmCtx.beginPath();
            mmCtx.arc(toX(CAR_SHOP_LOCATION.x), toY(CAR_SHOP_LOCATION.z), Math.max(4, 5 * dpr * 0.7), 0, Math.PI * 2);
            mmCtx.fill();
            mmCtx.stroke();

            if (taxiJob.active) {
                const target = taxiJob.phase === 'pickup' ? taxiJob.pickupPos : taxiJob.dropoffPos;
                mmCtx.fillStyle = taxiJob.phase === 'pickup' ? '#38bdf8' : '#22c55e';
                mmCtx.strokeStyle = '#ffffff';
                mmCtx.lineWidth = 2;
                mmCtx.beginPath();
                mmCtx.arc(toX(target.x), toY(target.z), Math.max(4.5, 5.5 * dpr * 0.7), 0, Math.PI * 2);
                mmCtx.fill();
                mmCtx.stroke();
            }

            const px = w / 2;
            const py = h / 2;
            const facingAngle = Math.atan2(Math.sin(player.yaw), Math.cos(player.yaw));

            mmCtx.save();
            mmCtx.translate(px, py);
            mmCtx.rotate(-facingAngle);

            mmCtx.fillStyle = 'rgba(56, 189, 248, 0.24)';
            mmCtx.beginPath();
            mmCtx.moveTo(0, 0);
            mmCtx.arc(0, 0, 22 * dpr, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
            mmCtx.closePath();
            mmCtx.fill();

            mmCtx.fillStyle = '#ffffff';
            mmCtx.strokeStyle = '#0284c7';
            mmCtx.lineWidth = 2.5;
            mmCtx.beginPath();
            mmCtx.arc(0, 0, 4.5 * dpr * 0.7, 0, Math.PI * 2);
            mmCtx.fill();
            mmCtx.stroke();
            mmCtx.restore();
        }

        /* =====================================================================
         * 11. CAMERA & DYNAMIC SHADOWS
         * ===================================================================== */
        function updateCameraAndLights(dt, time) {
            const smooth = Math.min(1, 12 * dt);
            camState.yaw = THREE.MathUtils.lerp(camState.yaw, camState.targetYaw, smooth);
            camState.pitch = THREE.MathUtils.lerp(camState.pitch, camState.targetPitch, smooth);
            camState.distance = THREE.MathUtils.lerp(camState.distance, camState.targetDistance, smooth);

            const focus = new THREE.Vector3(0, 1.05, 0);
            if (state.stage === 'gender') {
                focus.set(0, 1.02, 0);
            } else if (state.stage === 'customize') {
                focus.set(-0.35, 1.05, 0);
            } else if (state.stage === 'lobby') {
                focus.set(0.25, 1.05, 0.25);
            } else if (state.stage === 'world') {
                if (player.drivingCar) {
                    focus.set(player.drivingCar.pos.x, player.drivingCar.pos.y + 1.25, player.drivingCar.pos.z);
                } else {
                    focus.set(player.pos.x, player.pos.y + 1.35, player.pos.z);
                }
            }

            const horizDist = Math.cos(camState.pitch) * camState.distance;
            const vertDist = Math.sin(camState.pitch) * camState.distance;

            const desiredCamPos = new THREE.Vector3(
                focus.x + Math.sin(camState.yaw) * horizDist,
                Math.max(0.45, focus.y + vertDist),
                focus.z + Math.cos(camState.yaw) * horizDist
            );

            if (state.stage === 'world') {
                const floorAtCam = getGroundHeight(desiredCamPos.x, desiredCamPos.z) + 0.45;
                if (desiredCamPos.y < floorAtCam) desiredCamPos.y = floorAtCam;
            }

            if (camState.shake > 0) {
                desiredCamPos.x += (Math.random() - 0.5) * camState.shake;
                desiredCamPos.y += (Math.random() - 0.5) * camState.shake;
                desiredCamPos.z += (Math.random() - 0.5) * camState.shake;
                camState.shake = Math.max(0, camState.shake - dt * 1.8);
            }

            camera.position.lerp(desiredCamPos, Math.min(1, 16 * dt));
            camera.lookAt(focus);

            const p = TIME_PRESETS[state.todIndex];
            sunLight.target.position.copy(focus);
            sunLight.position.copy(focus).addScaledVector(p.sunDir, 150);
            sunLight.target.updateMatrixWorld();

            skyMesh.position.set(focus.x, 0, focus.z);
            sunDisc.position.set(
                focus.x + p.sunDir.x * 3000,
                p.sunDir.y * 3000,
                focus.z + p.sunDir.z * 3000
            );
            sunDisc.lookAt(focus);
        }


  function boot() {
    initThree();

    // Balanced matte-coastal ocean water (no harsh glare)
    if (oceanMat) {
      oceanMat.roughness = 0.45;
      oceanMat.metalness = 0.1;
      oceanMat.needsUpdate = true;
    }

    let lastHudEmit = 0;

    const tick = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const time = clock.elapsedTime;

      fpsFrames++;
      const now = performance.now();
      if (now - fpsLastTime >= 400) {
        currentFps = Math.round((fpsFrames * 1000) / (now - fpsLastTime));
        fpsFrames = 0;
        fpsLastTime = now;
      }

      if (state.stage === 'gender') {
        animateHuman(boySelectChar, time, 0, true, false, 0, 'car');
        animateHuman(girlSelectChar, time, 0, true, false, 1.4, 'car');
        if (boySelectChar) boySelectChar.rotation.y = 0.22 + Math.sin(time * 0.8) * 0.14;
        if (girlSelectChar) girlSelectChar.rotation.y = -0.22 - Math.sin(time * 0.8) * 0.14;
      } else if (state.stage === 'customize') {
        animateHuman(customChar, time, 0, true, false, 0, 'car');
      } else if (state.stage === 'lobby') {
        animateHuman(lobbyChar, time, 0, true, false, 0.5, 'car');
      } else if (state.stage === 'world') {
        updateTrafficSignals(dt);
        updatePlayerAndVehicles(dt, time);
        updateTaxiJob(time);
        updatePedestriansAndBeach(dt, time);

        if (now - lastHudEmit >= 55) {
          lastHudEmit = now;
          const pPosNow = player.drivingCar ? player.drivingCar.pos : player.pos;
          const distToShop = Math.hypot(pPosNow.x - CAR_SHOP_LOCATION.x, pPosNow.z - CAR_SHOP_LOCATION.z);
          if (carShopRouteActive && distToShop < 22) {
            carShopRouteActive = false;
            showToast('Arrived at The Car Shop! Exit vehicle (E) and walk inside.');
          }
          renderMinimap();
          const speedKmh = player.drivingCar ? Math.round(Math.abs(player.drivingCar.speed) * 3.6) : 0;
          const taxiTarget = taxiJob.phase === 'pickup' ? taxiJob.pickupPos : taxiJob.dropoffPos;
          const taxiDist = (taxiJob.active && player.drivingCar)
            ? Math.round(Math.hypot(player.drivingCar.pos.x - taxiTarget.x, player.drivingCar.pos.z - taxiTarget.z))
            : 0;
          callbacks.onHudUpdate({
            district: lastDistrict,
            speedKmh,
            fps: currentFps,
            inVehicle: Boolean(player.drivingCar),
            vehicleName: player.drivingCar ? player.drivingCar.name : null,
            vehicleStyle: player.drivingCar ? player.drivingCar.style : null,
            nearbyVehicleName: player.nearbyCar ? player.nearbyCar.name : null,
            cash: playerCash,
            taxiJob: {
              active: taxiJob.active,
              phase: taxiJob.phase,
              tier: taxiJob.tier,
              distanceMeters: taxiDist,
              fareRupees: taxiJob.fareRupees,
            },
            carShopRouteActive,
            nearCarShop: !player.drivingCar && distToShop < 4.5,
            playerX: pPosNow.x,
            playerZ: pPosNow.z,
            playerYaw: player.yaw,
          });
        }
      }

      updateCameraAndLights(dt, time);
      renderer.render(scene, camera);
    };
    tick();
  }

  function ensureTaxiVisuals() {
    if (!taxiJob.beaconMesh) {
      const geo = new THREE.RingGeometry(2.1, 2.7, 32);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      worldGroup.add(ring);
      taxiJob.beaconMesh = ring;
    }
    if (!taxiJob.arrowGroup) {
      const grp = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.9,
        roughness: 0.25,
      });
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.65), mat);
      shaft.position.z = -0.2;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 8), mat);
      head.rotation.x = Math.PI / 2;
      head.position.z = 0.35;
      grp.add(shaft, head);
      grp.visible = false;
      worldGroup.add(grp);
      taxiJob.arrowGroup = grp;
    }
  }

  function pickRoadsidePoint(fromX: number, fromZ: number, minD: number, maxD: number) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const vert = Math.random() > 0.5;
      const rc = ROAD_COORDS[Math.floor(Math.random() * ROAD_COORDS.length)];
      const curbSide = Math.random() > 0.5 ? 6.8 : -6.8;
      const px = vert ? rc + curbSide : -185 + Math.random() * 350;
      const pz = vert ? -185 + Math.random() * 370 : rc + curbSide;
      const dist = Math.hypot(px - fromX, pz - fromZ);
      if (dist >= minD && dist <= maxD) {
        return new THREE.Vector3(px, 0.04, pz);
      }
    }
    return new THREE.Vector3(fromX > 0 ? -84 + 6.8 : 84 - 6.8, 0.04, 42);
  }

  function clearTaxiPassenger() {
    if (taxiJob.passengerMesh) {
      if (taxiJob.passengerMesh.parent) {
        taxiJob.passengerMesh.parent.remove(taxiJob.passengerMesh);
      }
      taxiJob.passengerMesh = null;
    }
    taxiJob.seatedInTaxi = null;
  }

  function startNextTaxiJourney(isAutoNext = false) {
    if (!player.drivingCar || player.drivingCar.style !== 'taxi') return;
    ensureTaxiVisuals();
    clearTaxiPassenger();

    const tiers = [
      { name: 'Short' as const, minD: 55, maxD: 115, minFare: 20, maxFare: 50 },
      { name: 'Medium' as const, minD: 120, maxD: 220, minFare: 60, maxFare: 150 },
      { name: 'Long' as const, minD: 230, maxD: 355, minFare: 160, maxFare: 250 },
    ];
    const picked = tiers[Math.floor(Math.random() * tiers.length)];
    const fare = Math.floor(picked.minFare + Math.random() * (picked.maxFare - picked.minFare + 1));

    const carPos = player.drivingCar.pos;
    const pickup = pickRoadsidePoint(carPos.x, carPos.z, 45, 135);
    const dropoff = pickRoadsidePoint(pickup.x, pickup.z, picked.minD, picked.maxD);

    const isGirl = Math.random() > 0.5;
    const cat = GENDER_CATALOG[isGirl ? 'girl' : 'boy'];
    const pMesh = createHumanCharacter({
      gender: isGirl ? 'girl' : 'boy',
      name: 'Passenger',
      hairstyle: cat.hairstyles[Math.floor(Math.random() * cat.hairstyles.length)].id,
      outfit: cat.outfits[Math.floor(Math.random() * cat.outfits.length)].id,
      accessory: 'none',
      skin: PALETTES.skin[Math.floor(Math.random() * PALETTES.skin.length)],
      hair: PALETTES.hair[Math.floor(Math.random() * PALETTES.hair.length)],
      eyes: PALETTES.eyes[0],
      primary: PALETTES.primary[Math.floor(Math.random() * PALETTES.primary.length)],
      secondary: PALETTES.secondary[Math.floor(Math.random() * PALETTES.secondary.length)],
      shoes: PALETTES.shoes[0],
    });
    pMesh.position.copy(pickup);
    pMesh.lookAt(carPos.x, pickup.y, carPos.z);
    worldGroup.add(pMesh);

    taxiJob.active = true;
    taxiJob.phase = 'pickup';
    taxiJob.tier = picked.name;
    taxiJob.fareRupees = fare;
    taxiJob.pickupPos.copy(pickup);
    taxiJob.dropoffPos.copy(dropoff);
    taxiJob.passengerMesh = pMesh;

    if (taxiJob.beaconMesh) {
      taxiJob.beaconMesh.position.set(pickup.x, 0.08, pickup.z);
      (taxiJob.beaconMesh.material as THREE.MeshBasicMaterial).color.setHex(0x38bdf8);
      taxiJob.beaconMesh.visible = true;
    }
    if (taxiJob.arrowGroup) {
      taxiJob.arrowGroup.visible = true;
      taxiJob.arrowGroup.children.forEach((m: any) => {
        m.material.color.setHex(0x38bdf8);
        m.material.emissive.setHex(0x0284c7);
      });
    }

    playTaxiStart();
    showToast(
      isAutoNext
        ? `New ${picked.name} Taxi Job started! Follow the blue arrow to pick up passenger.`
        : `Taxi Job Started (${picked.name} • Est. ₹${fare})! Follow the arrow.`
    );
  }

  function stopTaxiJob() {
    taxiJob.active = false;
    clearTaxiPassenger();
    if (taxiJob.beaconMesh) taxiJob.beaconMesh.visible = false;
    if (taxiJob.arrowGroup) taxiJob.arrowGroup.visible = false;
  }

  function toggleTaxiJob() {
    if (!player.drivingCar || player.drivingCar.style !== 'taxi') {
      showToast('Get inside a yellow Taxi first, then press CapsLock!');
      return;
    }
    if (taxiJob.active) {
      stopTaxiJob();
      showToast('Taxi Job cancelled.');
    } else {
      startNextTaxiJourney(false);
    }
  }

  function updateTaxiJob(time: number) {
    if (!taxiJob.active) return;
    if (!player.drivingCar || player.drivingCar.style !== 'taxi') {
      if (taxiJob.arrowGroup) taxiJob.arrowGroup.visible = false;
      return;
    }

    const car = player.drivingCar;
    const target = taxiJob.phase === 'pickup' ? taxiJob.pickupPos : taxiJob.dropoffPos;

    if (taxiJob.arrowGroup) {
      taxiJob.arrowGroup.visible = true;
      taxiJob.arrowGroup.position.set(car.pos.x, car.pos.y + 2.45 + Math.sin(time * 4) * 0.08, car.pos.z);
      taxiJob.arrowGroup.lookAt(target.x, car.pos.y + 2.45, target.z);
    }

    if (taxiJob.beaconMesh) {
      const s = 1 + Math.sin(time * 5) * 0.12;
      taxiJob.beaconMesh.scale.set(s, s, 1);
    }

    const dist = Math.hypot(car.pos.x - target.x, car.pos.z - target.z);

    if (taxiJob.phase === 'pickup') {
      if (taxiJob.passengerMesh) {
        animateHuman(taxiJob.passengerMesh, time, 0, true, false, 0.5, 'car');
      }
      if (dist < 6.4) {
        // Passenger gets into the taxi and sits!
        if (taxiJob.passengerMesh) {
          worldGroup.remove(taxiJob.passengerMesh);
          taxiJob.passengerMesh.position.set(-0.42, 0.24, -0.10);
          taxiJob.passengerMesh.rotation.set(0, 0, 0);
          car.mesh.add(taxiJob.passengerMesh);
          animateHuman(taxiJob.passengerMesh, time, 0, true, true, 0, 'car');
          taxiJob.seatedInTaxi = car;
        }
        taxiJob.phase = 'dropoff';
        if (taxiJob.beaconMesh) {
          taxiJob.beaconMesh.position.set(taxiJob.dropoffPos.x, 0.08, taxiJob.dropoffPos.z);
          (taxiJob.beaconMesh.material as THREE.MeshBasicMaterial).color.setHex(0x22c55e);
        }
        if (taxiJob.arrowGroup) {
          taxiJob.arrowGroup.children.forEach((m: any) => {
            m.material.color.setHex(0x22c55e);
            m.material.emissive.setHex(0x16a34a);
          });
        }
        playSFX('door');
        showToast('Passenger aboard! Follow the green arrow to drop-off.');
      }
    } else {
      if (taxiJob.passengerMesh) {
        animateHuman(taxiJob.passengerMesh, time, 0, true, true, 0, 'car');
      }
      if (dist < 6.8) {
        // Reached destination: passenger gets out, pay ₹, auto-start next journey!
        const earned = taxiJob.fareRupees;
        playerCash += earned;
        playTaxiComplete();
        showToast(`Drop-off Complete! +₹${earned} (Wallet: ₹${playerCash})`);
        startNextTaxiJourney(true);
      }
    }
  }

  function toggleVehicle() {
    stopContinuousHorn();
    if (player.drivingCar) {
      const car = player.drivingCar;
      car.speed = 0;
      car.doorTarget = 0.65;
      setTimeout(() => { car.doorTarget = 0; }, 900);
      const leftPos = new THREE.Vector3(2.2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.yaw).add(car.pos);
      const rightPos = new THREE.Vector3(-2.2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.yaw).add(car.pos);
      const exitPos = !checkBuildingCollision(leftPos.x, leftPos.z, 0.5) ? leftPos : rightPos;
      player.pos.set(
        THREE.MathUtils.clamp(exitPos.x, -WORLD_HALF + 20, 294),
        getGroundHeight(exitPos.x, exitPos.z),
        THREE.MathUtils.clamp(exitPos.z, -WORLD_HALF + 20, WORLD_HALF - 20)
      );
      player.vel.set(0, 0, 0);
      player.grounded = true;
      player.drivingCar = null;
      worldPlayerChar.rotation.set(0, player.yaw, 0);
      camState.targetDistance = 4.5;
      playSFX('door');
      showToast(`Exited ${car.name}`);
    } else if (player.nearbyCar) {
      const car = player.nearbyCar;
      if (car._trafficRef) {
        const idx = trafficCars.indexOf(car._trafficRef);
        if (idx >= 0) trafficCars.splice(idx, 1);
        delete car._trafficRef;
        parkedCars.push(car);
      }
      car.doorTarget = 0.72;
      setTimeout(() => { car.doorTarget = 0; }, 650);
      player.drivingCar = car;
      camState.targetYaw = car.yaw;
      camState.targetDistance = car.style === 'truck' ? 8.8 : 6.4;
      playSFX('door');
      showToast(
        car.style === 'taxi'
          ? `Driving ${car.name} — Press CapsLock for Taxi Job!`
          : `Driving ${car.name} — WASD to drive, Hold H for horn`
      );
    }
  }

  boot();

  return {
    setStage(stage: GameStage) {
      state.stage = stage;
      studioGroup.visible = stage === 'gender' || stage === 'customize';
      lobbyGroup.visible = stage === 'lobby';
      worldGroup.visible = stage === 'world';

      if (stage === 'gender') {
        camState.targetYaw = 0;
        camState.targetPitch = 0.14;
        camState.targetDistance = 4.6;
      } else if (stage === 'customize') {
        camState.targetYaw = 0.25;
        camState.targetPitch = 0.16;
        camState.targetDistance = 3.2;
      } else if (stage === 'lobby') {
        camState.targetYaw = -0.35;
        camState.targetPitch = 0.18;
        camState.targetDistance = 3.6;
      } else if (stage === 'world') {
        camState.targetYaw = player.yaw;
        camState.targetPitch = 0.28;
        camState.targetDistance = player.drivingCar ? 6.6 : 4.5;
      }
    },
    setCharacter(cfg: CharacterConfig) {
      state.character = { ...cfg };
      rebuildCustomCharacter();
    },
    enterOpenWorld(spawnKey: SpawnKey, garageCar?: ShopCarSpec | null) {
      state.spawnKey = spawnKey;
      stopContinuousHorn();
      rebuildWorldPlayerCharacter();
      const sp = START_SPAWNS[spawnKey] || START_SPAWNS.ocean_drive;
      player.drivingCar = null;
      player.pos.set(sp.x, getGroundHeight(sp.x, sp.z), sp.z);
      player.vel.set(0, 0, 0);
      player.yaw = sp.yaw;
      player.grounded = true;
      if (worldPlayerChar) {
        worldPlayerChar.position.copy(player.pos);
        worldPlayerChar.rotation.set(0, player.yaw, 0);
      }
      if (garageSpawnedCar) {
        worldGroup.remove(garageSpawnedCar.mesh);
        const idx = parkedCars.indexOf(garageSpawnedCar);
        if (idx >= 0) parkedCars.splice(idx, 1);
        garageSpawnedCar = null;
      }
      if (garageCar) {
        const mesh = createVehicleMesh(garageCar.style, garageCar.color, true);
        const gx = sp.x - 4.2;
        const gz = sp.z;
        mesh.position.set(gx, 0.04, gz);
        mesh.rotation.y = sp.yaw;
        worldGroup.add(mesh);
        garageSpawnedCar = {
          name: `${garageCar.brand} ${garageCar.name}`,
          style: garageCar.style,
          mesh,
          pos: new THREE.Vector3(gx, 0.04, gz),
          yaw: sp.yaw,
          speed: 0,
          steer: 0,
          doorAngle: 0,
          doorTarget: 0,
        };
        parkedCars.push(garageSpawnedCar);
      }
      camState.yaw = player.yaw;
      camState.targetYaw = player.yaw;
      camState.pitch = 0.28;
      camState.targetPitch = 0.28;
      camState.distance = 4.6;
      camState.targetDistance = 4.6;
    },
    setCarShopRoute(active: boolean) {
      carShopRouteActive = active;
      if (active) {
        showToast('Blue route set to The Car Shop on your map!');
      }
    },
    setCash(cash: number) {
      playerCash = cash;
    },
    spawnPurchasedCar(car: ShopCarSpec) {
      const mesh = createVehicleMesh(car.style, car.color, true);
      const sx = 89;
      const sz = -36;
      mesh.position.set(sx, 0.04, sz);
      mesh.rotation.y = 0;
      worldGroup.add(mesh);
      parkedCars.push({
        name: `${car.brand} ${car.name}`,
        style: car.style,
        mesh,
        pos: new THREE.Vector3(sx, 0.04, sz),
        yaw: 0,
        speed: 0,
        steer: 0,
        doorAngle: 0,
        doorTarget: 0,
      });
    },
    returnToLobby() {
      stopContinuousHorn();
      if (player.drivingCar) {
        player.drivingCar.doorTarget = 0;
        player.drivingCar.speed = 0;
        player.drivingCar = null;
      }
    },
    toggleVehicle() {
      toggleVehicle();
    },
    toggleTaxiJob() {
      toggleTaxiJob();
    },
    cycleTimeOfDay() {
      applyTimeOfDay(state.todIndex + 1);
      if (bloomPass) {
        bloomPass.strength = state.todIndex === 2 ? 0.42 : state.todIndex === 1 ? 0.26 : 0.16;
        bloomPass.threshold = state.todIndex === 2 ? 0.82 : 0.92;
      }
      if (scene) {
        scene.environmentIntensity = state.todIndex === 2 ? 0.3 : 0.55;
      }
      callbacks.onTimeOfDayChanged(state.todIndex);
      showToast(`Time: ${TIME_PRESETS[state.todIndex].label}`);
    },
    setTouchMove(x: number, y: number) {
      touchInput.moveX = x;
      touchInput.moveY = y;
    },
    setTouchSprint(s: boolean) {
      touchInput.sprint = s;
    },
    triggerJump() {
      if (state.stage === 'world' && !player.drivingCar && player.grounded) {
        player.vel.y = 8.4;
        player.grounded = false;
        playSFX('jump');
      }
    },
    startHorn() {
      startContinuousHorn();
    },
    stopHorn() {
      stopContinuousHorn();
    },
    setMinimapCanvas(el: HTMLCanvasElement | null) {
      minimapCanvasEl = el;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      composer?.dispose();
      renderer?.dispose();
      if (renderer?.domElement && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
