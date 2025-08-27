import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import LowPolyRunner from "./LowPolyRunner";

function Btn({ children, onClick, variant = "secondary", className = "" }) {
  const v = typeof variant === "string" ? variant : "secondary";
  const base = "px-3 py-1.5 rounded-xl border text-sm select-none transition active:scale-[.98]";
  const primary = "bg-cyan-600 text-white border-cyan-500/50 hover:bg-cyan-500";
  const secondary = "bg-white/10 text-white border-white/15 hover:bg-white/15";
  const styles = v === "primary" ? primary : secondary;
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}
function Pill({ children, active = false, onClick }) {
  const role = onClick ? "button" : undefined;
  return (
    <span
      role={role}
      onClick={onClick}
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border select-none ${
        active ? "bg-emerald-600 border-emerald-500/60 text-white" : "bg-white/10 border-white/15 text-white"
      } ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      {children}
    </span>
  );
}
function Panel({ children, className = "" }) {
  return <div className={`bg-slate-900/80 border border-white/10 rounded-2xl ${className}`}>{children}</div>;
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const vec3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => Math.random() * (b - a) + a;

function useKeyboard() {
  const keys = useRef({});
  useEffect(() => {
    const down = (e) => { if (!e || !e.code) return; keys.current[e.code] = true; };
    const up   = (e) => { if (!e || !e.code) return; keys.current[e.code] = false; };
    const mdown = (e) => { if (typeof e?.button === "number" && e.button === 0) keys.current["MouseLeft"] = true; };
    const mup   = (e) => { if (typeof e?.button === "number" && e.button === 0) keys.current["MouseLeft"] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousedown", mdown);
    window.addEventListener("mouseup", mup);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousedown", mdown);
      window.removeEventListener("mouseup", mup);
    };
  }, []);
  return keys;
}

function useGameState() {
  const [state, set] = useState(() => ({
    playing: false,
    paused: false,
    gameOver: false,
    wave: 1,
    time: 0,
    score: 0,
    level: 1,
    xp: 0,
    player: { pos: vec3(0, 1, 0), velY: 0, speed: 10, dashCooldown: 0, maxHp: 100, hp: 100, magnet: 1, damage: 10, firerate: 7, bulletSpeed: 35, pierce: 0 },
    enemies: [],
    bullets: [],
    eBullets: [],
    pickups: [],
    nextId: 1,
    lastShot: 0,
    difficulty: 2,
    bossActive: false,
    bossDefeatedAtWave: 0,
    hitFlash: 0,
  }));
  return [state, set];
}

/* ----------- Look input ----------- */
const LOOK = { yaw: 0, pitch: 0 };
function LookInput() {
  const { gl } = useThree();
  const sensitivity = 0.0025;
  useEffect(() => {
    const el = gl?.domElement;
    const doc = el?.ownerDocument || document;
    if (!el || !doc) return;
    const onMouseMove = (e) => {
      if (doc.pointerLockElement !== el) return;
      LOOK.yaw   -= (e?.movementX || 0) * sensitivity;
      LOOK.pitch -= (e?.movementY || 0) * sensitivity;
      const maxP = Math.PI / 2 - 0.01;
      LOOK.pitch = Math.max(-maxP, Math.min(maxP, LOOK.pitch));
    };
    doc.addEventListener("mousemove", onMouseMove);
    return () => doc.removeEventListener("mousemove", onMouseMove);
  }, [gl]);
  return null;
}

/* ----------- Scene ----------- */
function StarField({ count = 1400, radius = 85 }) {
  const geom = useMemo(() => new THREE.BufferGeometry(), []);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random(), v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = radius * (0.7 + 0.3 * Math.random());
      arr[i*3+0] = r * Math.sin(phi) * Math.cos(theta);
      arr[i*3+1] = r * Math.cos(phi);
      arr[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return arr;
  }, [count, radius]);
  useEffect(() => {
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.computeBoundingSphere();
  }, [geom, positions]);
  return (
    <points geometry={geom}>
      <pointsMaterial size={0.7} sizeAttenuation depthWrite={false} transparent opacity={0.8} />
    </points>
  );
}

function Arena() {
  const grid = 56;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[35, 64]} />
        <meshStandardMaterial color="#0a0f1e" roughness={0.8} metalness={0} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[34.5, 35, 128]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.35} />
      </mesh>
      <gridHelper args={[70, grid]} position-y={0.01} />
    </group>
  );
}

/* ----------- Player con modello ----------- */
const MODEL_SCALE = 0.7; // regola la dimensione del personaggio

function Player({ state, krefs }) {
  const ref = useRef();
  const t = useRef(0);

  useFrame((_, dt) => {
    t.current += dt;
    if (!ref.current) return;
    ref.current.position.copy(state.player.pos);
    ref.current.position.y = state.player.pos.y - MODEL_SCALE;
    if (Math.abs(state.player.velY) < 0.01) {
      ref.current.position.y += Math.sin(t.current * 2) * 0.05;
    }
  });

  // animMult scala la frequenza degli step con le stats (speed 10 => 1.0)
  const animMult = Math.max(0.8, state.player.speed / 10);

  return (
    <group ref={ref} castShadow>
      <LowPolyRunner
        scale={MODEL_SCALE}
        animMult={animMult}
        getSpeed={() => krefs?.speedRef?.current ?? 0}
        getMoveDir={() => (krefs?.moveDirRef?.current ?? new THREE.Vector3(0,0,1))}
      />
    </group>
  );
}

/* ----------- Enemies / Bullets / Pickups (invariati) ----------- */
function Enemies({ state }) {
  return (
    <group>
      {state.enemies.map((e) => (
        <group key={e.id} position={[e.pos.x, e.pos.y, e.pos.z]}>
          <mesh castShadow>
            {e.isBoss ? <icosahedronGeometry args={[e.radius, 1]} /> : <dodecahedronGeometry args={[e.radius, 0]} />}
            <meshStandardMaterial
              color={e.isBoss ? "#ffd166" : "#ff4060"}
              emissive={e.isBoss ? "#ffb703" : "#ff3b3b"}
              emissiveIntensity={e.isBoss ? 1.2 : 0.8}
              metalness={0.25}
              roughness={0.3}
            />
          </mesh>
          {/* HP bar */}
          <mesh position={[0, e.radius + (e.isBoss ? 0.6 : 0.3), 0]}>
            <boxGeometry args={[1.8, 0.06, 0.06]} />
            <meshBasicMaterial color="#111" />
          </mesh>
          <mesh
            position={[
              -1.8/2 + ((Math.max(0, (e.hp / (e.maxHp || 1))) * 1.8) / 2),
              e.radius + (e.isBoss ? 0.6 : 0.3),
              0
            ]}
          >
            <boxGeometry args={[Math.max(0.05, (e.hp / (e.maxHp || 1))) * 1.8, 0.06, 0.06]} />
            <meshBasicMaterial color={e.isBoss ? "#ffd166" : "#6eff86"} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
function Bullets({ state }) {
  return (
    <group>
      {state.bullets.map((b) => (
        <mesh key={b.id} position={[b.pos.x, b.pos.y, b.pos.z]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshBasicMaterial color="#00ffe6" />
        </mesh>
      ))}
    </group>
  );
}
function EnemyBullets({ state }) {
  return (
    <group>
      {state.eBullets.map((b) => (
        <mesh key={b.id} position={[b.pos.x, b.pos.y, b.pos.z]}>
          <sphereGeometry args={[0.14, 14, 14]} />
          <meshStandardMaterial color="#ffd166" emissive="#ffb703" emissiveIntensity={0.9} />
        </mesh>
      ))}
    </group>
  );
}
function Pickups({ state }) {
  return (
    <group>
      {state.pickups.map((p) => (
        <group key={p.id} position={[p.pos.x, p.pos.y, p.pos.z]}>
          <mesh>
            <icosahedronGeometry args={[0.25, 0]} />
            <meshStandardMaterial color={p.type === "xp" ? "#66ff99" : p.type === "heart" ? "#ff6fa0" : "#6f9bff"} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const ALL_UPGRADES = [
  { key: "damage", name: "+Damage", desc: "+25% bullet damage", apply: (s) => ({ ...s, player: { ...s.player, damage: s.player.damage * 1.25 } }) },
  { key: "firerate", name: "+Firerate", desc: "-15% fire interval", apply: (s) => ({ ...s, player: { ...s.player, firerate: s.player.firerate * 1.15 } }) },
  { key: "speed", name: "+Move Speed", desc: "+15% move speed", apply: (s) => ({ ...s, player: { ...s.player, speed: s.player.speed * 1.15 } }) },
  { key: "maxhp", name: "+Max HP", desc: "+20% max HP and heal 20%", apply: (s) => ({ ...s, player: { ...s.player, maxHp: Math.round(s.player.maxHp * 1.2), hp: Math.min(Math.round(s.player.maxHp * 1.2), Math.round(s.player.hp + s.player.maxHp * 0.2)) } }) },
  { key: "bullet", name: "+Bullet Speed", desc: "+20% bullet speed", apply: (s) => ({ ...s, player: { ...s.player, bulletSpeed: s.player.bulletSpeed * 1.2 } }) },
  { key: "magnet", name: "Magnet", desc: "+30% pickup radius", apply: (s) => ({ ...s, player: { ...s.player, magnet: s.player.magnet * 1.3 } }) },
  { key: "pierce", name: "Pierce", desc: "+1 bullet pierce", apply: (s) => ({ ...s, player: { ...s.player, pierce: s.player.pierce + 1 } }) },
];

function pickThree() {
  const pool = [...ALL_UPGRADES];
  const res = [];
  for (let i = 0; i < 3; i++) res.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return res;
}

/* ------------------------------ Game Loop ------------------------------ */
function GameLoop({ gs, krefs }) {
  const [state, set] = gs;
  const { camera, gl } = useThree();
  const keys = useKeyboard();
  const tmp = useMemo(() => ({ v: vec3(), dir: vec3() }), []);

  useEffect(() => {
    camera.position.set(0, 1.4, 6);
    camera.lookAt(0, 1, 0);
  }, [state.playing, camera]);

  useFrame((_, dtx) => {
    const dt = Math.min(0.05, dtx);
    set((prev) => {
      if (!prev.playing || prev.paused || prev.gameOver) return prev;
      const s = {
        ...prev,
        player: { ...prev.player, pos: prev.player.pos.clone(), velY: prev.player.velY, dashCooldown: Math.max(0, prev.player.dashCooldown - dt) },
        enemies: prev.enemies.map((e) => ({ ...e, pos: e.pos.clone() })),
        bullets: prev.bullets.map((b) => ({ ...b, pos: b.pos.clone() })),
        eBullets: prev.eBullets.map((b) => ({ ...b, pos: b.pos.clone() })),
        pickups: prev.pickups.map((p) => ({ ...p, pos: p.pos.clone() })),
        time: prev.time + dt,
        hitFlash: Math.max(0, prev.hitFlash - 2 * dt),
      };

      // Movimento
      const move = vec3();
      if (keys.current["KeyW"]) move.z -= 1;
      if (keys.current["KeyS"]) move.z += 1;
      if (keys.current["KeyA"]) move.x -= 1;
      if (keys.current["KeyD"]) move.x += 1;
      if (move.lengthSq() > 0) move.normalize();
      const yawOnly = new THREE.Euler(0, LOOK.yaw, 0, "YXZ");
      const worldDir = tmp.dir.copy(move).applyEuler(yawOnly);
      worldDir.y = 0; worldDir.normalize();

      const willDash = keys.current["ShiftLeft"] && s.player.dashCooldown === 0;
      const speed = s.player.speed * (willDash ? 1.8 : 1);

      // ref per animazione avatar (velocità e direzione)
      if (krefs?.moveDirRef) krefs.moveDirRef.current.copy(worldDir);
      if (krefs?.speedRef)   krefs.speedRef.current = move.lengthSq() > 0 ? speed : 0;

      if (willDash) s.player.dashCooldown = 1.0;

      const nextPos = tmp.v.copy(s.player.pos).addScaledVector(worldDir, speed * dt);
      const arenaR = 35; if (nextPos.length() > arenaR - 1) nextPos.setLength(arenaR - 1);
      s.player.pos.x = nextPos.x;
      s.player.pos.z = nextPos.z;

      // Salto + gravità
      const groundY = 1;
      const g = 18;
      const jumpSpeed = 7;
      const onGround = s.player.pos.y <= groundY + 1e-3 && s.player.velY === 0;
      if (keys.current["Space"] && onGround) s.player.velY = jumpSpeed;
      s.player.velY -= g * dt;
      s.player.pos.y += s.player.velY * dt;
      if (s.player.pos.y < groundY) { s.player.pos.y = groundY; s.player.velY = 0; }

      // Camera follow
      {
        const camRot  = new THREE.Euler(LOOK.pitch, LOOK.yaw, 0, "YXZ");
        const camQuat = new THREE.Quaternion().setFromEuler(camRot);
        const target  = s.player.pos.clone().add(new THREE.Vector3(0, 0.4, 0));
        const offset  = new THREE.Vector3(0, 0.4, 6).applyQuaternion(camQuat);
        const desired = target.clone().add(offset);
        camera.position.lerp(desired, 0.12);
        camera.quaternion.slerp(camQuat, 0.18);
      }

      // Boss spawn
      const bossWave  = s.wave % 5 === 0;
      const bossAlive = s.enemies.some((e) => e.isBoss);
      if (bossWave && !s.bossActive && s.bossDefeatedAtWave !== s.wave && !bossAlive) {
        s.enemies = [];
        const tier = Math.max(1, Math.floor(s.wave / 5));
        const baseHp = 260 + 150 * tier;
        const hp = Math.round(baseHp * (1 + 0.25 * s.difficulty));
        const speedB = 2.6 + 0.12 * s.wave + 0.25 * s.difficulty;
        const radius = 2.2 + 0.05 * s.wave;
        const pos = vec3(rnd(-18, 18), 1, rnd(-18, 18));
        s.enemies.push({ id: s.nextId++, pos, hp, maxHp: hp, radius, speed: speedB, isBoss: true, velY: 0, jumpCooldown: rnd(1.2, 2.0), leapTime: 0, leapDir: vec3(), shootCooldown: rnd(0.5, 1.0) });
        s.bossActive = true;
      }

      // Shooting (player)
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
      const interval = 1 / s.player.firerate;
      const isLocked = gl?.domElement?.ownerDocument?.pointerLockElement === gl?.domElement;
      const wantShoot = isLocked && keys.current["MouseLeft"];
      if (wantShoot && now - s.lastShot >= interval) {
        const camRot  = new THREE.Euler(LOOK.pitch, LOOK.yaw, 0, "YXZ");
        const camQuat = new THREE.Quaternion().setFromEuler(camRot);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat).normalize();
        const pos = s.player.pos.clone().addScaledVector(fwd, 1.0).add(vec3(0, 0.1, 0));
        const vel = fwd.multiplyScalar(s.player.bulletSpeed);
        s.bullets.push({ id: s.nextId++, pos, vel, life: 1.8, pierceLeft: s.player.pierce, damage: s.player.damage });
        s.lastShot = now;
      }

      // Bullets step
      s.bullets = s.bullets.map((b) => ({ ...b, pos: b.pos.clone().addScaledVector(b.vel, dt), life: b.life - dt })).filter((b) => b.life > 0 && b.pos.length() < 60);

      // Spawn normali
      if (!bossWave || !s.bossActive) {
        const spawnRate = 1.2;
        const spawnChance = dt / (spawnRate / (1 + (s.wave - 1) * 0.15));
        if (Math.random() < spawnChance && s.enemies.filter((e)=>!e.isBoss).length < 45) {
          const ang = rnd(0, Math.PI * 2);
          const r = 33;
          const pos = vec3(Math.cos(ang) * r, 1, Math.sin(ang) * r);
          const hp = Math.round(18 + (s.wave - 1) * 6 * (0.7 + 0.3 * s.difficulty));
          const speedE = 3 + (s.wave - 1) * 0.2 + s.difficulty * 0.3;
          s.enemies.push({ id: s.nextId++, pos, hp, maxHp: hp, radius: 0.9, speed: speedE, isBoss: false });
        }
      }

      // Enemies + boss abilità
      for (const e of s.enemies) {
        const toP = s.player.pos.clone().sub(e.pos); toP.y = 0;
        if (toP.lengthSq() > 0) toP.normalize();
        e.pos.addScaledVector(toP, e.speed * dt);

        if (e.isBoss) {
          e.jumpCooldown -= dt;
          const ground = 1, gBoss = 22;
          if (e.jumpCooldown <= 0 && e.pos.distanceTo(s.player.pos) < 24) {
            e.velY = 7.8 + 0.2 * s.wave;
            e.leapDir = toP.clone();
            e.leapTime = 0.55 + Math.min(0.4, 0.02 * s.wave);
            e.jumpCooldown = rnd(1.3, 2.5);
          }
          if (e.leapTime > 0) {
            const leapSpeed = 6.5 + 0.22 * s.wave + 0.7 * s.difficulty;
            e.pos.addScaledVector(e.leapDir, leapSpeed * dt);
            e.leapTime -= dt;
          }
          e.velY -= gBoss * dt;
          e.pos.y += e.velY * dt;
          if (e.pos.y < ground) { e.pos.y = ground; e.velY = 0; }
          e.shootCooldown -= dt;
          if (e.shootCooldown <= 0) {
            const dir = s.player.pos.clone().sub(e.pos).normalize();
            const speed = 7 + 0.65 * s.wave + 0.75 * s.difficulty;
            const posB = e.pos.clone().add(dir.clone().multiplyScalar(e.radius + 0.4));
            const velB = dir.multiplyScalar(speed);
            s.eBullets.push({ id: s.nextId++, pos: posB, vel: velB, life: 3.5, damage: 18 + 4 * s.difficulty });
            const base = 1.7;
            e.shootCooldown = Math.max(0.4, base / (1 + 0.08 * s.wave + 0.25 * s.difficulty));
          }
        }
      }

      // Collisioni player bullets
      let scoreAdd = 0, xpAdd = 0;
      for (const b of s.bullets) {
        for (const e of s.enemies) {
          if (e.hp <= 0) continue;
          if (b.pos.distanceTo(e.pos) < e.radius + 0.2) {
            e.hp -= b.damage;
            if (b.pierceLeft <= 0) b.life = -1; else b.pierceLeft -= 1;
            if (e.hp <= 0) { scoreAdd += e.isBoss ? 200 : 15; xpAdd += e.isBoss ? 5 : 1; }
          }
        }
      }
      s.bullets = s.bullets.filter((b) => b.life > 0);

      // Enemy bullets + hit
      s.eBullets = s.eBullets.map((b) => ({ ...b, pos: b.pos.clone().addScaledVector(b.vel, dt), life: b.life - dt })).filter((b) => b.life > 0 && b.pos.length() < 70);
      let hpLoss = 0;
      for (const b of s.eBullets) if (b.pos.distanceTo(s.player.pos) < 0.7) { hpLoss += b.damage; b.life = -1; }
      s.eBullets = s.eBullets.filter((b) => b.life > 0);

      // Morti -> drop
      for (let i = s.enemies.length - 1; i >= 0; i--) {
        const e = s.enemies[i];
        if (e.hp <= 0) {
          const roll = Math.random();
          if (roll < (e.isBoss ? 1.0 : 0.6)) {
            const type = e.isBoss ? (roll < 0.4 ? "heart" : roll < 0.7 ? "shield" : "xp")
                                  : (roll < 0.1 ? "heart" : roll < 0.18 ? "shield" : "xp");
            s.pickups.push({ id: s.nextId++, pos: e.pos.clone(), ttl: e.isBoss ? 18 : 10, type });
          }
          if (e.isBoss) { s.bossActive = false; s.bossDefeatedAtWave = s.wave; }
          s.enemies.splice(i, 1);
        }
      }

      // Danni da contatto
      for (const e of s.enemies) {
        const dmg = (e.isBoss ? 25 : 10) * s.difficulty * dt;
        if (e.pos.distanceTo(s.player.pos) < e.radius + 0.8) hpLoss += dmg;
      }
      if (hpLoss > 0) s.hitFlash = 1;
      const newHp = clamp(s.player.hp - hpLoss, 0, s.player.maxHp);
      const over = newHp <= 0;

      // Pickups
      for (let i = s.pickups.length - 1; i >= 0; i--) {
        const p = s.pickups[i];
        p.ttl -= dt;
        if (p.ttl <= 0) { s.pickups.splice(i, 1); continue; }
        const d0 = p.pos.distanceTo(s.player.pos);
        if (d0 < 2.5 * s.player.magnet) {
          const dirP = s.player.pos.clone().sub(p.pos); dirP.y = 0; dirP.normalize();
          p.pos.addScaledVector(dirP, (10 + 6 * s.player.magnet) * dt);
        }
        const d1 = p.pos.distanceTo(s.player.pos);
        if (d1 < 1.0) {
          if (p.type === "xp") xpAdd += 1;
          if (p.type === "heart") s.player.hp = clamp(s.player.hp + 15, 0, s.player.maxHp);
          if (p.type === "shield") s.player.hp = clamp(s.player.hp + 8, 0, s.player.maxHp);
          s.pickups.splice(i, 1);
        }
      }

      // Level & wave
      let lvlUp = false;
      let newXp = s.xp + xpAdd;
      const need = 10 + (s.level - 1) * 6;
      if (newXp >= need) { newXp -= need; lvlUp = true; }
      let newWave = s.wave;
      if (s.time > 25 + s.wave * 18) newWave += 1;

      return {
        ...s,
        wave: newWave,
        bullets: s.bullets,
        eBullets: s.eBullets,
        enemies: s.enemies,
        pickups: s.pickups,
        score: s.score + scoreAdd,
        xp: newXp,
        level: s.level + (lvlUp ? 1 : 0),
        player: { ...s.player, hp: newHp, pos: s.player.pos, velY: s.player.velY },
        gameOver: over,
      };
    });
  });

  return null;
}

/* ---------------------------------- App ---------------------------------- */
export default function App() {
  const gs = useGameState();
  const [state, set] = gs;
  const [levelChoices, setLevelChoices] = useState([]);
  const [showHelp, setShowHelp] = useState(true);
  const [canvasEl, setCanvasEl] = useState(null);

  // ref per animazione avatar
  const moveDirRef = useRef(new THREE.Vector3());
  const speedRef   = useRef(0);

  // level up overlay
  const prevLevel = useRef(state.level);
  useEffect(() => {
    if (state.level > prevLevel.current) {
      prevLevel.current = state.level;
      setLevelChoices(pickThree());
      set((s) => ({ ...s, paused: true }));
    }
  }, [state.level, set]);

  // P per pausa
  useEffect(() => {
    const onKey = (e) => { if (e?.code === "KeyP") set((s) => ({ ...s, paused: !s.paused })); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [set]);

  // pointer lock management
  useEffect(() => {
    const el = canvasEl;
    const doc = el?.ownerDocument || document;
    const overlayOpen = showHelp || state.gameOver || (state.paused && levelChoices.length > 0);
    try {
      if (overlayOpen && doc.pointerLockElement === el && doc.exitPointerLock) doc.exitPointerLock();
    } catch {}
  }, [showHelp, state.gameOver, state.paused, levelChoices.length, canvasEl]);

  const requestLock = () => {
    try {
      const el = canvasEl;
      const req = el?.requestPointerLock || el?.webkitRequestPointerLock || el?.mozRequestPointerLock;
      if (typeof req === "function") req.call(el);
    } catch {}
  };

  const start = () => {
    set({
      playing: true, paused: false, gameOver: false, wave: 1, time: 0, score: 0, level: 1, xp: 0,
      lastShot: 0, difficulty: state.difficulty,
      player: { pos: vec3(0, 1, 0), velY: 0, speed: 10, dashCooldown: 0, maxHp: 100, hp: 100, magnet: 1, damage: 10, firerate: 7, bulletSpeed: 35, pierce: 0 },
      enemies: [], bullets: [], eBullets: [], pickups: [], nextId: 1, bossActive: false, bossDefeatedAtWave: 0, hitFlash: 0,
    });
    setShowHelp(false);
    requestLock();
  };

  const overlayOpen = showHelp || state.gameOver || (state.paused && levelChoices.length > 0);
  const on3DClick = () => { if (!overlayOpen) requestLock(); };
  const hpPct = Math.round((state.player.hp / state.player.maxHp) * 100);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", position: "relative", background: "radial-gradient(ellipse at center, #0f172a 0%, #020617 60%, #000 100%)", color: "#e2e8f0" }}>
      {/* top bar */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Pill active>Neon Runner 3D</Pill>
          <span style={{ opacity: 0.7, fontSize: 13 }}>Wave {state.wave} • Lvl {state.level}</span>
          <span style={{ opacity: 0.7, fontSize: 13 }}>Score {state.score}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={() => set((s) => ({ ...s, paused: !s.paused }))}>{state.paused ? "▶ Resume" : "⏸ Pause"}</Btn>
          <Btn onClick={start}>↻ Reset</Btn>
          <Btn onClick={() => setShowHelp(true)}>🛠️ Help</Btn>
        </div>
      </div>

      {/* canvas */}
      <div style={{ position: "relative", flex: 1, zIndex: 1, pointerEvents: overlayOpen ? "none" : "auto" }} onMouseDown={on3DClick}>
        <Canvas
          style={{ width: "100%", height: "100%" }}
          shadows
          camera={{ position: [0, 1.6, 6], fov: 60 }}
          onCreated={({ gl }) => { try { setCanvasEl(gl?.domElement ?? null); } catch {} }}
        >
          <ambientLight intensity={0.35} />
          <pointLight position={[0, 5, 0]} intensity={1.2} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
          <LookInput />
          <GameLoop gs={gs} krefs={{ moveDirRef, speedRef }} />
          <StarField />
          <Arena />
          <Player state={state} krefs={{ moveDirRef, speedRef }} />
          <Enemies state={state} />
          <Bullets state={state} />
          <EnemyBullets state={state} />
          <Pickups state={state} />
        </Canvas>

        {/* crosshair */}
        {!overlayOpen && (
          <div style={{ pointerEvents: "none", position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}>
            <div style={{ width: 12, height: 12, borderRadius: 999, border: "1px solid rgba(125,255,255,.7)", boxShadow: "0 0 8px rgba(0,255,255,.6)" }} />
          </div>
        )}

        {/* HP bar */}
        <div style={{ position: "absolute", right: 16, top: 40, width: 180 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4, textAlign: "right" }}>HP {hpPct}%</div>
          <div style={{ height: 12, borderRadius: 6, background: "rgba(255,255,255,.12)", overflow: "hidden", border: "1px solid rgba(255,255,255,.15)" }}>
            <div style={{ height: "100%", width: `${hpPct}%`, background: "linear-gradient(90deg,#22c55e,#4ade80)" }} />
          </div>
        </div>

        {/* hint */}
        {!overlayOpen && (
          <div style={{ position: "absolute", right: 16, top: 8, fontSize: 12, opacity: 0.7, display: "flex", gap: 8 }}>
            🖱️ Click to lock • WASD • LMB • Shift dash • Space jump
          </div>
        )}

        {/* hit flash */}
        {!overlayOpen && (
          <div style={{ pointerEvents: "none", position: "absolute", inset: 0, background: `rgba(255,215,64,${Math.min(0.28, state.hitFlash * 0.28)})`, mixBlendMode: "screen", transition: "background 50ms linear" }} />
        )}
      </div>

      {/* footer */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderTop: "1px solid rgba(255,255,255,.1)", fontSize: 12, opacity: 0.75 }}>
        <div style={{ display: "flex", gap: 16 }}>
          <span>WASD: Move</span><span>Mouse: Look</span><span>LMB: Shoot</span><span>Shift: Dash</span><span>Space: Jump</span><span>P: Pause</span>
        </div>
        <div>🛡️ Survive the waves.</div>
      </div>

      {/* overlays */}
      {showHelp && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Panel className="max-w-xl w-full">
            <div className="p-4 border-b border-white/10">
              <div className="text-lg font-semibold">Neon Runner 3D</div>
              <div className="text-xs text-white/70 mt-1">Click to lock the mouse • WASD • Left click • Shift dash • Space jump</div>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Pill active={state.difficulty === 1} onClick={() => set((s) => ({ ...s, difficulty: 1 }))}>Easy</Pill>
                <Pill active={state.difficulty === 2} onClick={() => set((s) => ({ ...s, difficulty: 2 }))}>Normal</Pill>
                <Pill active={state.difficulty === 3} onClick={() => set((s) => ({ ...s, difficulty: 3 }))}>Hard</Pill>
              </div>
              <div className="flex items-center gap-2">
                <Btn className="flex-1" variant="primary" onClick={start}>▶ Start</Btn>
                <Btn onClick={() => start()}>↻ Quick Reset</Btn>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {state.paused && !showHelp && !state.gameOver && levelChoices.length > 0 && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Panel className="max-w-2xl w-full">
            <div className="p-4 border-b border-white/10">
              <div className="text-lg font-semibold">⚔️ Level Up!</div>
              <div className="text-xs text-white/70 mt-1">Select one upgrade</div>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {levelChoices.map((u) => (
                <Btn
                  key={u.key}
                  className="text-left h-auto py-3 flex flex col items-start gap-1"
                  onClick={() => {
                    set((s) => u.apply({ ...s, paused: false }));
                    setLevelChoices([]);
                    try {
                      const el = canvasEl;
                      const req = el?.requestPointerLock || el?.webkitRequestPointerLock || el?.mozRequestPointerLock;
                      if (typeof req === "function") req.call(el);
                    } catch {}
                  }}
                >
                  <div className="text-sm font-semibold">{u.name}</div>
                  <div className="text-xs opacity-80">{u.desc}</div>
                </Btn>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {state.gameOver && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Panel className="max-w-md w-full">
            <div className="p-4 border-b border-white/10">
              <div className="text-lg font-semibold">Game Over</div>
              <div className="text-xs text-white/70 mt-1">Your score: {state.score}</div>
            </div>
            <div className="p-4 flex items-center gap-2">
              <Btn className="flex-1" variant="primary" onClick={start}>↻ Try Again</Btn>
              <Btn onClick={() => { set((s) => ({ ...s, gameOver: false, paused: true })); setShowHelp(true); }}>⚙️ Options</Btn>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
