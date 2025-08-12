import React, { forwardRef, useMemo, useRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

/**
 * LowPolyRunner — avatar stilizzato (ora meno low-poly) con corsa procedurale
 * Props:
 *  - getSpeed(): number             -> velocità istantanea del player
 *  - getMoveDir(): THREE.Vector3    -> direzione di movimento (per yaw busto)
 *  - scale: number                  -> scala del modello (default 0.7)
 *  - animMult: number               -> moltiplicatore animazione (default 1) — es: speed stat / 10
 */
const LowPolyRunner = forwardRef(function LowPolyRunner(
  { getSpeed = () => 0, getMoveDir = () => new THREE.Vector3(), scale = 0.7, animMult = 1 },
  ref
) {
  const group = useRef();
  const head = useRef();
  const torso = useRef();
  const armL = useRef();
  const armR = useRef();
  const forearmL = useRef();
  const forearmR = useRef();
  const handL = useRef();
  const handR = useRef();
  const legL = useRef();
  const legR = useRef();
  const shinL = useRef();
  const shinR = useRef();
  const footL = useRef();
  const footR = useRef();

  useImperativeHandle(ref, () => group.current, []);

  // Materiali
  const mats = useMemo(() => {
    const skin  = new THREE.MeshStandardMaterial({ color: "#f3c6a8", roughness: 0.8, metalness: 0.0 });
    const hair  = new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.7 });
    const shirt = new THREE.MeshStandardMaterial({ color: "#0b0b0b", roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: "#0f1115", roughness: 0.9 });
    const shoes = new THREE.MeshStandardMaterial({ color: "#111315", roughness: 0.55, metalness: 0.06 });
    const sole  = new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.9 });
    return { skin, hair, shirt, pants, shoes, sole };
  }, []);

  // Helper pivot per arto
  const Limb = ({ children, pivot = [0, 0, 0] }) => {
    const p = useRef();
    return (
      <group ref={p} position={pivot}>
        {children(p)}
      </group>
    );
  };

  // ANIMAZIONE — corsa parametrica (più rapida alla base e scalata con le stats)
  useFrame((_, dt) => {
    const speed = getSpeed();                        // istantanea
    const s = THREE.MathUtils.clamp(speed, 0, 10);   // limiti un po' più alti
    const norm = s / 7;                              // 0..~1

    // base più veloce + moltiplicatore da stats (animMult)
    const baseFreq = 5.75;                           // prima 3.0 -> ora più rapido
    const maxFreq  = 12.75;                          // picco a corsa piena
    const freq = THREE.MathUtils.lerp(baseFreq, maxFreq, norm) * Math.max(0.8, animMult);

    const ampArm = THREE.MathUtils.lerp(0.45, 1.05, norm);   // swing braccia
    const ampLeg = THREE.MathUtils.lerp(0.55, 1.30, norm);   // swing gambe più marcato
    const t = (performance.now() / 1000) * freq;

    // swing alternati
    const swingR = Math.sin(t) * ampLeg;
    const swingL = Math.sin(t + Math.PI) * ampLeg;
    const armSwingR = Math.sin(t + Math.PI) * ampArm;
    const armSwingL = Math.sin(t) * ampArm;

    // Cosce
    if (legR.current && legL.current) {
      legR.current.rotation.x = THREE.MathUtils.damp(legR.current.rotation.x, swingR, 12, dt);
      legL.current.rotation.x = THREE.MathUtils.damp(legL.current.rotation.x, swingL, 12, dt);
    }
    // Tibiæ
    if (shinR.current && shinL.current) {
      shinR.current.rotation.x = THREE.MathUtils.damp(shinR.current.rotation.x, -swingR * 0.65, 12, dt);
      shinL.current.rotation.x = THREE.MathUtils.damp(shinL.current.rotation.x, -swingL * 0.65, 12, dt);
    }
    // Piedi (roll punta)
    if (footR.current && footL.current) {
      footR.current.rotation.x = THREE.MathUtils.damp(footR.current.rotation.x, Math.max(0, Math.sin(t + 0.4)) * 0.35, 10, dt);
      footL.current.rotation.x = THREE.MathUtils.damp(footL.current.rotation.x, Math.max(0, Math.sin(t + Math.PI + 0.4)) * 0.35, 10, dt);
    }
    // Braccia
    if (armR.current && armL.current) {
      armR.current.rotation.x = THREE.MathUtils.damp(armR.current.rotation.x, armSwingR, 12, dt);
      armL.current.rotation.x = THREE.MathUtils.damp(armL.current.rotation.x, armSwingL, 12, dt);
    }
    if (forearmR.current && forearmL.current) {
      forearmR.current.rotation.x = THREE.MathUtils.damp(forearmR.current.rotation.x, -armSwingR * 0.45, 12, dt);
      forearmL.current.rotation.x = THREE.MathUtils.damp(forearmL.current.rotation.x, -armSwingL * 0.45, 12, dt);
    }
    if (handR.current && handL.current) {
      handR.current.rotation.x = THREE.MathUtils.damp(handR.current.rotation.x, -armSwingR * 0.2, 10, dt);
      handL.current.rotation.x = THREE.MathUtils.damp(handL.current.rotation.x, -armSwingL * 0.2, 10, dt);
    }
    // Torso/head
    if (torso.current && head.current) {
      const nod = Math.sin(t * 2) * 0.05 * (0.7 + 0.3 * norm);
      torso.current.rotation.x = THREE.MathUtils.damp(torso.current.rotation.x, nod, 10, dt);
      head.current.position.y = THREE.MathUtils.damp(head.current.position.y, 1.02 + Math.abs(Math.sin(t)) * 0.035 * (0.7 + 0.3 * norm), 10, dt);
      // leggera torsione Y del torso per dare dinamica
      const twist = Math.sin(t) * 0.12 * (0.6 + 0.4 * norm);
      torso.current.rotation.y = THREE.MathUtils.damp(torso.current.rotation.y, twist, 10, dt);
    }

    // orientamento verso la direzione di movimento
    const dir = getMoveDir();
    if (dir && (dir.x !== 0 || dir.z !== 0) && group.current) {
      const targetYaw = Math.atan2(dir.x, dir.z);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, targetYaw, 0));
      group.current.quaternion.slerp(q, 1 - Math.pow(0.0001, dt));
    }
  });

  // MODELLO (più dettagliato: segmenti in più, mani/piedi definiti, spalle/anche accennate)
  // Nota: abbiamo aumentato i segmenti dei cilindri (da 6 → 10) per arrotondare leggermente.
  return (
    <group ref={group} position={[0, 0, 0]} scale={scale}>
      {/* Ombra */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[0.52, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.24} />
      </mesh>

      {/* Pelvi (piedi a y≈0) */}
      <group position={[0, 0.95, 0]}>
        {/* Torso con leggera trapezoidale */}
        <group ref={torso} position={[0, 0.6, 0]}>
          {/* busto base */}
          <mesh castShadow position={[0, 0.22, 0]}>
            <boxGeometry args={[0.9, 1.05, 0.52]} />
            <meshStandardMaterial {...mats.shirt} />
          </mesh>
          {/* pettorali/shoulder cap */}
          <mesh castShadow position={[0, 0.6, 0]}>
            <boxGeometry args={[0.98, 0.22, 0.56]} />
            <meshStandardMaterial {...mats.shirt} />
          </mesh>
          {/* taper addominali */}
          <mesh castShadow position={[0, -0.05, 0]}>
            <boxGeometry args={[0.85, 0.42, 0.48]} />
            <meshStandardMaterial {...mats.shirt} />
          </mesh>

          {/* logo maglia */}
          <mesh position={[0.22, 0.28, 0.28]}>
            <boxGeometry args={[0.2, 0.2, 0.012]} />
            <meshStandardMaterial color="#3cc5ff" />
          </mesh>

          {/* collo */}
          <mesh castShadow position={[0, 0.86, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.14, 10]} />
            <meshStandardMaterial {...mats.skin} />
          </mesh>

          {/* testa (box) + capelli a strati */}
          <group ref={head} position={[0, 1.08, 0]}>
            <mesh castShadow position={[0, 0.24, 0]}>
              <boxGeometry args={[0.6, 0.58, 0.56]} />
              <meshStandardMaterial {...mats.skin} />
            </mesh>
            {/* cappello/corona */}
            <mesh castShadow position={[0, 0.55, -0.02]}>
              <boxGeometry args={[0.64, 0.26, 0.6]} />
              <meshStandardMaterial {...mats.hair} />
            </mesh>
            {/* frangia */}
            <mesh castShadow position={[0.06, 0.43, 0.28]} rotation={[0.1, 0.08, -0.06]}>
              <boxGeometry args={[0.52, 0.22, 0.16]} />
              <meshStandardMaterial {...mats.hair} />
            </mesh>
            {/* tempie */}
            <mesh castShadow position={[0.32, 0.36, 0]}>
              <boxGeometry args={[0.08, 0.32, 0.52]} />
              <meshStandardMaterial {...mats.hair} />
            </mesh>
            <mesh castShadow position={[-0.32, 0.36, 0]}>
              <boxGeometry args={[0.08, 0.32, 0.52]} />
              <meshStandardMaterial {...mats.hair} />
            </mesh>
          </group>

          {/* Braccia più “piene” */}
          <Limb pivot={[0.56, 0.66, 0]}>
            {() => (
              <group ref={armR}>
                {/* bicipite */}
                <mesh castShadow position={[0.26, -0.16, 0]}>
                  <boxGeometry args={[0.22, 0.54, 0.26]} />
                  <meshStandardMaterial {...mats.shirt} />
                </mesh>
                {/* avambraccio leggermente cilindrico */}
                <group ref={forearmR} position={[0.26, -0.46, 0]}>
                  <mesh castShadow position={[0, -0.26, 0]}>
                    <cylinderGeometry args={[0.11, 0.12, 0.52, 10]} />
                    <meshStandardMaterial {...mats.skin} />
                  </mesh>
                  {/* mano */}
                  <group ref={handR} position={[0, -0.54, 0.02]}>
                    <mesh castShadow>
                      <boxGeometry args={[0.18, 0.12, 0.2]} />
                      <meshStandardMaterial {...mats.skin} />
                    </mesh>
                  </group>
                </group>
              </group>
            )}
          </Limb>

          <Limb pivot={[-0.56, 0.66, 0]}>
            {() => (
              <group ref={armL}>
                <mesh castShadow position={[-0.26, -0.16, 0]}>
                  <boxGeometry args={[0.22, 0.54, 0.26]} />
                  <meshStandardMaterial {...mats.shirt} />
                </mesh>
                <group ref={forearmL} position={[-0.26, -0.46, 0]}>
                  <mesh castShadow position={[0, -0.26, 0]}>
                    <cylinderGeometry args={[0.11, 0.12, 0.52, 10]} />
                    <meshStandardMaterial {...mats.skin} />
                  </mesh>
                  <group ref={handL} position={[0, -0.54, 0.02]}>
                    <mesh castShadow>
                      <boxGeometry args={[0.18, 0.12, 0.2]} />
                      <meshStandardMaterial {...mats.skin} />
                    </mesh>
                  </group>
                </group>
              </group>
            )}
          </Limb>
        </group>

        {/* Gambe più definite (coscia box, tibia box, piede con puntale + suola) */}
        <Limb pivot={[0.24, 0.0, 0]}>
          {() => (
            <group ref={legR} position={[0.24, 0.95, 0]}>
              <mesh castShadow position={[0, -0.38, 0]}>
                <boxGeometry args={[0.28, 0.74, 0.32]} />
                <meshStandardMaterial {...mats.pants} />
              </mesh>
              <group ref={shinR} position={[0, -0.74, 0]}>
                <mesh castShadow position={[0, -0.34, 0]}>
                  <boxGeometry args={[0.24, 0.66, 0.28]} />
                  <meshStandardMaterial {...mats.pants} />
                </mesh>
                {/* scarpa */}
                <group ref={footR} position={[0, -0.7, 0.05]}>
                  {/* tomaia */}
                  <mesh castShadow position={[0, -0.04, 0.02]}>
                    <boxGeometry args={[0.36, 0.16, 0.74]} />
                    <meshStandardMaterial {...mats.shoes} />
                  </mesh>
                  {/* puntale leggermente più alto */}
                  <mesh castShadow position={[0, 0.02, 0.32]}>
                    <boxGeometry args={[0.34, 0.12, 0.18]} />
                    <meshStandardMaterial {...mats.shoes} />
                  </mesh>
                  {/* suola */}
                  <mesh position={[0, -0.12, 0]}>
                    <boxGeometry args={[0.38, 0.06, 0.76]} />
                    <meshStandardMaterial {...mats.sole} />
                  </mesh>
                </group>
              </group>
            </group>
          )}
        </Limb>

        <Limb pivot={[-0.24, 0.0, 0]}>
          {() => (
            <group ref={legL} position={[-0.24, 0.95, 0]}>
              <mesh castShadow position={[0, -0.38, 0]}>
                <boxGeometry args={[0.28, 0.74, 0.32]} />
                <meshStandardMaterial {...mats.pants} />
              </mesh>
              <group ref={shinL} position={[0, -0.74, 0]}>
                <mesh castShadow position={[0, -0.34, 0]}>
                  <boxGeometry args={[0.24, 0.66, 0.28]} />
                  <meshStandardMaterial {...mats.pants} />
                </mesh>
                <group ref={footL} position={[0, -0.7, 0.05]}>
                  <mesh castShadow position={[0, -0.04, 0.02]}>
                    <boxGeometry args={[0.36, 0.16, 0.74]} />
                    <meshStandardMaterial {...mats.shoes} />
                  </mesh>
                  <mesh castShadow position={[0, 0.02, 0.32]}>
                    <boxGeometry args={[0.34, 0.12, 0.18]} />
                    <meshStandardMaterial {...mats.shoes} />
                  </mesh>
                  <mesh position={[0, -0.12, 0]}>
                    <boxGeometry args={[0.38, 0.06, 0.76]} />
                    <meshStandardMaterial {...mats.sole} />
                  </mesh>
                </group>
              </group>
            </group>
          )}
        </Limb>
      </group>
    </group>
  );
});

export default LowPolyRunner;
