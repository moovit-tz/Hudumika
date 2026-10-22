import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Icon } from '../Icon.js';
import type { FleetVehicle, FleetCargoItem } from '../../lib/freightFleetData.js';

export type CameraPreset = 'iso' | 'side' | 'top' | 'rear' | 'cab';

interface Truck3DViewerProps {
  vehicle: FleetVehicle;
  items?: FleetCargoItem[];
  showHotspots?: boolean;
  onItemSelect?: (item: FleetCargoItem) => void;
  selectedItemId?: string | null;
  onAddCargoClick?: () => void;
}

// -------------------------------------------------------------
// Realistic 3D Wheel Component
// -------------------------------------------------------------
function Wheel({ position, radius = 0.52, width = 0.32 }: { position: [number, number, number]; radius?: number; width?: number }) {
  return (
    <group position={position}>
      {/* Tire Rubber */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius, radius, width, 24]} />
        <meshStandardMaterial color="#1a1c1e" roughness={0.85} metalness={0.1} />
      </mesh>
      {/* Outer Rim */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 0.65, radius * 0.65, width + 0.02, 18]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.25} />
      </mesh>
      {/* Center Hub */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 0.28, radius * 0.28, width + 0.05, 12]} />
        <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
}

// -------------------------------------------------------------
// Interactive 3D Hotspot with Telemetry Tooltip
// -------------------------------------------------------------
function HotspotMarker({
  position,
  title,
  subtitle,
  status,
  metrics,
  active,
  onClick,
}: {
  position: [number, number, number];
  title: string;
  subtitle: string;
  status: 'Healthy' | 'Warning' | 'Critical';
  metrics: { label: string; value: string }[];
  active: boolean;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const statusColor = status === 'Healthy' ? '#10b981' : status === 'Warning' ? '#f59e0b' : '#ef4444';

  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.getElapsedTime();
      meshRef.current.scale.setScalar(1 + Math.sin(t * 3) * 0.12);
    }
  });

  return (
    <group position={position}>
      {/* Outer Pulse Ring */}
      <mesh ref={meshRef} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <ringGeometry args={[0.22, 0.32, 24]} />
        <meshBasicMaterial color={statusColor} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* Center Beacon */}
      <mesh onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <circleGeometry args={[0.18, 24]} />
        <meshBasicMaterial color={statusColor} side={THREE.DoubleSide} />
      </mesh>

      {/* Floating 3D HTML Card when clicked / active */}
      {active && (
        <Html position={[0, 0.6, 0]} center distanceFactor={14} zIndexRange={[100, 0]}>
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.95)',
              color: '#ffffff',
              padding: '12px 14px',
              borderRadius: '10px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15)',
              minWidth: 200,
              fontSize: 11,
              fontFamily: 'Inter, sans-serif',
              backdropFilter: 'blur(8px)',
              pointerEvents: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <strong style={{ fontSize: 13, color: '#f8fafc' }}>{title}</strong>
              <span
                style={{
                  background: statusColor,
                  color: '#0f172a',
                  padding: '1px 6px',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 10,
                }}
              >
                {status}
              </span>
            </div>
            <div style={{ color: '#94a3b8', marginBottom: 8, fontSize: 11 }}>{subtitle}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6 }}>
              {metrics.map((m) => (
                <div key={m.label}>
                  <div style={{ color: '#64748b', fontSize: 10 }}>{m.label}</div>
                  <strong style={{ color: '#38bdf8', fontSize: 11 }}>{m.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// -------------------------------------------------------------
// 3D Cargo Crate Component with Dimensions & Hover Info
// -------------------------------------------------------------
function CargoBox3D({
  item,
  position,
  dims,
  selected,
  onSelect,
}: {
  item: FleetCargoItem;
  position: [number, number, number];
  dims: [number, number, number];
  selected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const edgesGeometry = useMemo(() => {
    const box = new THREE.BoxGeometry(...dims);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [dims[0], dims[1], dims[2]]);

  useEffect(() => {
    return () => {
      edgesGeometry.dispose();
    };
  }, [edgesGeometry]);

  return (
    <group position={position}>
      {/* Crate Mesh */}
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={dims} />
        <meshStandardMaterial
          color={selected ? '#38bdf8' : hovered ? '#0284c7' : item.color || '#0891b2'}
          roughness={0.4}
          metalness={0.15}
          transparent
          opacity={0.92}
        />
      </mesh>

      {/* Wireframe Outline */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={selected ? '#ffffff' : hovered ? '#93c5fd' : '#1e293b'} linewidth={1.5} />
      </lineSegments>

      {/* Wooden Pallet Underneath */}
      <mesh position={[0, -dims[1] / 2 - 0.04, 0]}>
        <boxGeometry args={[dims[0] * 1.02, 0.08, dims[2] * 1.02]} />
        <meshStandardMaterial color="#854d0e" roughness={0.9} />
      </mesh>

      {/* Crate Label Pin / Tooltip */}
      {(hovered || selected) && (
        <Html position={[0, dims[1] / 2 + 0.25, 0]} center distanceFactor={12} zIndexRange={[120, 0]}>
          <div
            style={{
              background: selected ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.92)',
              color: '#ffffff',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 10.5,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
              border: `1px solid ${selected ? '#38bdf8' : 'rgba(255,255,255,0.2)'}`,
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontWeight: 700, color: '#38bdf8' }}>{item.code} · {item.weight_kg} kg</div>
            <div style={{ fontSize: 9.5, color: '#cbd5e1' }}>{item.label}</div>
            <div style={{ fontSize: 9, color: '#94a3b8' }}>
              {item.length_cm} × {item.width_cm} × {item.height_cm} cm · {item.destination}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// -------------------------------------------------------------
// Complete 3D Truck Model (Cabin + Wheels + Translucent Trailer)
// -------------------------------------------------------------
function TruckModel({
  vehicle,
  items,
  selectedItemId,
  onItemSelect,
  transparentTrailer = true,
  activeHotspot,
  setActiveHotspot,
  showHotspots = true,
  isDark = false,
}: {
  vehicle: FleetVehicle;
  items: FleetCargoItem[];
  selectedItemId?: string | null;
  onItemSelect?: (item: FleetCargoItem) => void;
  transparentTrailer?: boolean;
  activeHotspot: string | null;
  setActiveHotspot: (key: string | null) => void;
  showHotspots?: boolean;
  isDark?: boolean;
}) {
  const isHeavyTruck = vehicle.category === 'Heavy Truck';
  const isVan = vehicle.category === 'Cargo Van' || vehicle.type === 'VAN';
  const trailerLength = isHeavyTruck ? 9.2 : isVan ? 4.2 : 5.8;
  const trailerWidth = 2.4;
  const trailerHeight = 2.5;
  const cabLength = isHeavyTruck ? 2.8 : 1.8;

  // Compute placed crates inside trailer bounds
  const placedBoxes = useMemo(() => {
    const list: { item: FleetCargoItem; pos: [number, number, number]; dims: [number, number, number] }[] = [];
    const validItems = items.filter((it) => it.status !== 'Delivered');

    const trailerStartX = isHeavyTruck ? -trailerLength / 2 + 0.3 : -trailerLength / 2 + 0.2;
    const spacingX = 1.35;
    const spacingZ = 1.1;

    let col = 0;
    let row = 0;
    const colsMax = Math.floor(trailerLength / spacingX);

    validItems.forEach((it) => {
      const boxW = 1.05;
      const boxH = Math.min(1.4, (it.height_cm || 100) / 90);
      const boxD = 0.95;

      const x = trailerStartX + col * spacingX + boxW / 2;
      const z = (row === 0 ? -spacingZ / 2 : spacingZ / 2);
      const y = -trailerHeight / 2 + boxH / 2 + 0.08;

      list.push({
        item: it,
        pos: [x, y, z],
        dims: [boxW, boxH, boxD],
      });

      row++;
      if (row >= 2) {
        row = 0;
        col = (col + 1) % colsMax;
      }
    });

    return list;
  }, [items, isHeavyTruck, trailerLength, trailerHeight]);

  const loadPct = vehicle.specs.loadCapacityPct || 68;
  const fillWidth = (trailerLength * 0.96) * (loadPct / 100);

  return (
    <group position={[0, 0.4, 0]}>
      {/* TRUCK CABIN */}
      <group position={[trailerLength / 2 + cabLength / 2 + 0.2, 0, 0]}>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[cabLength, 2.7, 2.4]} />
          <meshStandardMaterial color="#f8fafc" metalness={0.65} roughness={0.2} />
        </mesh>

        <mesh position={[-0.2, 1.65, 0]} rotation={[0, 0, -0.15]}>
          <boxGeometry args={[cabLength * 0.85, 0.5, 2.3]} />
          <meshStandardMaterial color="#f1f5f9" metalness={0.6} roughness={0.25} />
        </mesh>

        {/* Windshield */}
        <mesh position={[cabLength / 2 + 0.02, 0.55, 0]} rotation={[0, 0, -0.18]}>
          <boxGeometry args={[0.08, 1.15, 2.22]} />
          <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
        </mesh>

        {/* Side Windows */}
        <mesh position={[0.1, 0.65, 1.21]}>
          <boxGeometry args={[1.2, 0.85, 0.04]} />
          <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0.1, 0.65, -1.21]}>
          <boxGeometry args={[1.2, 0.85, 0.04]} />
          <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
        </mesh>

        {/* Front Grille */}
        <mesh position={[cabLength / 2 + 0.03, -0.4, 0]}>
          <boxGeometry args={[0.06, 1.05, 2.05]} />
          <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
        </mesh>
        {[-0.65, -0.45, -0.25, -0.05].map((yOffset) => (
          <mesh key={yOffset} position={[cabLength / 2 + 0.06, yOffset, 0]}>
            <boxGeometry args={[0.04, 0.06, 1.95]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.15} />
          </mesh>
        ))}

        {/* Headlights */}
        <mesh position={[cabLength / 2 + 0.06, -0.75, 0.85]}>
          <boxGeometry args={[0.04, 0.25, 0.45]} />
          <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[cabLength / 2 + 0.06, -0.75, -0.85]}>
          <boxGeometry args={[0.04, 0.25, 0.45]} />
          <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={0.8} />
        </mesh>

        <mesh position={[0.8, 0.7, 1.45]}>
          <boxGeometry args={[0.2, 0.55, 0.12]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} />
        </mesh>
        <mesh position={[0.8, 0.7, -1.45]}>
          <boxGeometry args={[0.2, 0.55, 0.12]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} />
        </mesh>

        <Wheel position={[0.4, -1.2, 1.15]} />
        <Wheel position={[0.4, -1.2, -1.15]} />

        <mesh position={[cabLength / 2 + 0.02, -1.05, 0]}>
          <boxGeometry args={[0.25, 0.45, 2.38]} />
          <meshStandardMaterial color="#334155" roughness={0.7} />
        </mesh>
      </group>

      {/* CHASSIS & ACCESSORIES */}
      <mesh position={[0.5, -0.95, 0.5]}>
        <boxGeometry args={[trailerLength + 3.2, 0.25, 0.18]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} />
      </mesh>
      <mesh position={[0.5, -0.95, -0.5]}>
        <boxGeometry args={[trailerLength + 3.2, 0.25, 0.18]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} />
      </mesh>

      {/* Fuel Tank */}
      <mesh position={[1.5, -0.95, 1.05]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.38, 0.38, 1.6, 20]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.2} />
      </mesh>
      <mesh position={[1.5, -0.95, -1.05]}>
        <boxGeometry args={[1.4, 0.5, 0.45]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
      </mesh>

      {isHeavyTruck && (
        <>
          <Wheel position={[trailerLength / 2 - 0.4, -1.2, 1.15]} />
          <Wheel position={[trailerLength / 2 - 0.4, -1.2, -1.15]} />
          <Wheel position={[trailerLength / 2 - 1.5, -1.2, 1.15]} />
          <Wheel position={[trailerLength / 2 - 1.5, -1.2, -1.15]} />
        </>
      )}

      {/* TRAILER CONTAINER */}
      <group position={[0, 0.15, 0]}>
        <mesh position={[0, -trailerHeight / 2 + 0.05, 0]}>
          <boxGeometry args={[trailerLength, 0.1, trailerWidth]} />
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </mesh>

        <mesh position={[0, trailerHeight / 2 - 0.05, 0]}>
          <boxGeometry args={[trailerLength, 0.1, trailerWidth]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.4} roughness={0.3} />
        </mesh>

        <mesh position={[trailerLength / 2, 0, 0]}>
          <boxGeometry args={[0.1, trailerHeight, trailerWidth]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.3} />
        </mesh>
        <mesh position={[-trailerLength / 2, 0, 0]}>
          <boxGeometry args={[0.1, trailerHeight, trailerWidth]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.3} />
        </mesh>

        {transparentTrailer ? (
          <>
            <mesh position={[0, 0, trailerWidth / 2]}>
              <boxGeometry args={[trailerLength, trailerHeight, 0.04]} />
              <meshStandardMaterial
                color={isDark ? '#38bdf8' : '#e0f2fe'}
                transparent
                opacity={isDark ? 0.18 : 0.22}
                roughness={0.1}
                metalness={0.2}
              />
            </mesh>
            <mesh position={[0, 0, -trailerWidth / 2]}>
              <boxGeometry args={[trailerLength, trailerHeight, 0.04]} />
              <meshStandardMaterial
                color={isDark ? '#38bdf8' : '#e0f2fe'}
                transparent
                opacity={isDark ? 0.26 : 0.35}
                roughness={0.1}
                metalness={0.2}
              />
            </mesh>
          </>
        ) : (
          <>
            <mesh position={[0, 0, trailerWidth / 2]}>
              <boxGeometry args={[trailerLength, trailerHeight, 0.04]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.3} metalness={0.3} />
            </mesh>
            <mesh position={[0, 0, -trailerWidth / 2]}>
              <boxGeometry args={[trailerLength, trailerHeight, 0.04]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.3} metalness={0.3} />
            </mesh>
          </>
        )}

        {/* Edge Rails */}
        <mesh position={[0, trailerHeight / 2, trailerWidth / 2]}>
          <boxGeometry args={[trailerLength + 0.1, 0.08, 0.08]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.9} />
        </mesh>
        <mesh position={[0, trailerHeight / 2, -trailerWidth / 2]}>
          <boxGeometry args={[trailerLength + 0.1, 0.08, 0.08]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.9} />
        </mesh>
        <mesh position={[0, -trailerHeight / 2, trailerWidth / 2]}>
          <boxGeometry args={[trailerLength + 0.1, 0.08, 0.08]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.9} />
        </mesh>
        <mesh position={[0, -trailerHeight / 2, -trailerWidth / 2]}>
          <boxGeometry args={[trailerLength + 0.1, 0.08, 0.08]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.9} />
        </mesh>

        {/* Volumetric Fill Volume */}
        <mesh
          position={[
            -trailerLength / 2 + fillWidth / 2 + 0.1,
            -trailerHeight / 2 + (trailerHeight * 0.75) / 2 + 0.1,
            0,
          ]}
        >
          <boxGeometry args={[fillWidth, trailerHeight * 0.75, trailerWidth * 0.92]} />
          <meshStandardMaterial
            color="#0284c7"
            transparent
            opacity={isDark ? 0.22 : 0.16}
            roughness={0.2}
          />
        </mesh>

        {/* 3D Cargo Crates */}
        {placedBoxes.map(({ item, pos, dims }) => (
          <CargoBox3D
            key={item.id}
            item={item}
            position={pos}
            dims={dims}
            selected={selectedItemId === item.id}
            onSelect={() => onItemSelect?.(item)}
          />
        ))}

        {isHeavyTruck && (
          <>
            <Wheel position={[-trailerLength / 2 + 1.2, -1.35, 1.15]} />
            <Wheel position={[-trailerLength / 2 + 1.2, -1.35, -1.15]} />
            <Wheel position={[-trailerLength / 2 + 2.3, -1.35, 1.15]} />
            <Wheel position={[-trailerLength / 2 + 2.3, -1.35, -1.15]} />
            <Wheel position={[-trailerLength / 2 + 3.4, -1.35, 1.15]} />
            <Wheel position={[-trailerLength / 2 + 3.4, -1.35, -1.15]} />
          </>
        )}

        <mesh position={[-trailerLength / 2 - 0.05, -1.1, 0]}>
          <boxGeometry args={[0.15, 0.25, 2.3]} />
          <meshStandardMaterial color="#e11d48" metalness={0.4} />
        </mesh>
      </group>

      {/* DIAGNOSTIC HOTSPOTS */}
      {showHotspots && (
        <>
          <HotspotMarker
            position={[trailerLength / 2 + 1.6, 0.4, 1.35]}
            title="Engine Bay"
            subtitle="Volvo D16K750 Inline-6"
            status={vehicle.systemHealth.engine}
            metrics={[
              { label: 'Health', value: '98% Optimal' },
              { label: 'Temp', value: '88°C' },
              { label: 'Oil Press.', value: '4.2 Bar' },
              { label: 'Coolant', value: '91°C' },
            ]}
            active={activeHotspot === 'engine'}
            onClick={() => setActiveHotspot(activeHotspot === 'engine' ? null : 'engine')}
          />

          <HotspotMarker
            position={[0, 0.9, 1.35]}
            title="Cargo Container"
            subtitle={`${loadPct}% Space Loaded`}
            status="Healthy"
            metrics={[
              { label: 'Payload', value: `${vehicle.specs.currentWeightKg.toLocaleString()} kg` },
              { label: 'Max Cap.', value: `${vehicle.specs.maxWeightKg.toLocaleString()} kg` },
              { label: 'Temp', value: `${vehicle.specs.tempC ?? 4}°C` },
              { label: 'Door Lock', value: 'Secured' },
            ]}
            active={activeHotspot === 'cargo'}
            onClick={() => setActiveHotspot(activeHotspot === 'cargo' ? null : 'cargo')}
          />

          <HotspotMarker
            position={[trailerLength / 2 + 1.2, -0.9, 1.35]}
            title="Front Steer Brakes"
            subtitle="Brembo Dual Disc System"
            status={vehicle.systemHealth.brakes}
            metrics={[
              { label: 'Pad Wear', value: '78% Remaining' },
              { label: 'ABS Status', value: 'Active' },
              { label: 'Rotor Temp', value: '64°C' },
              { label: 'Fluid Level', value: 'Optimal' },
            ]}
            active={activeHotspot === 'brakes'}
            onClick={() => setActiveHotspot(activeHotspot === 'brakes' ? null : 'brakes')}
          />

          <HotspotMarker
            position={[-trailerLength / 2 + 2.3, -1.0, 1.35]}
            title="Rear Dual Tires"
            subtitle="Michelin X MultiWay 3D"
            status={vehicle.systemHealth.tires}
            metrics={[
              { label: 'Pressure', value: '86 PSI (Low)' },
              { label: 'Target', value: '105 PSI' },
              { label: 'Tread', value: '8.4 mm' },
              { label: 'Alert', value: 'Check PSI' },
            ]}
            active={activeHotspot === 'tires'}
            onClick={() => setActiveHotspot(activeHotspot === 'tires' ? null : 'tires')}
          />

          <HotspotMarker
            position={[1.5, -0.7, 1.35]}
            title="Fuel System"
            subtitle={`Diesel ${vehicle.specs.fuelLevelPct}%`}
            status="Healthy"
            metrics={[
              { label: 'Current Level', value: `${vehicle.specs.fuelUsedL}L / 68%` },
              { label: 'Range', value: '740 km' },
              { label: 'Efficiency', value: '3.2 km/L' },
              { label: 'DEF / AdBlue', value: '84%' },
            ]}
            active={activeHotspot === 'fuel'}
            onClick={() => setActiveHotspot(activeHotspot === 'fuel' ? null : 'fuel')}
          />
        </>
      )}

      {/* Ground Floor Shadow Plane */}
      <mesh position={[0, -1.72, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[trailerLength + 8, 8]} />
        <meshBasicMaterial color={isDark ? '#000000' : '#0f172a'} transparent opacity={isDark ? 0.45 : 0.08} />
      </mesh>
    </group>
  );
}

// -------------------------------------------------------------
// Camera Rig controller for Camera Presets
// -------------------------------------------------------------
function CameraController({ preset, controlsRef }: { preset: CameraPreset; controlsRef: React.RefObject<any> }) {
  const { camera } = useThree();

  useEffect(() => {
    let targetPos: [number, number, number] = [9, 4.5, 9];
    let lookTarget: [number, number, number] = [0, 0, 0];

    switch (preset) {
      case 'side':
        targetPos = [0, 0.4, 11];
        lookTarget = [0, 0.4, 0];
        break;
      case 'top':
        targetPos = [0.001, 14, 0.001];
        lookTarget = [0, 0, 0];
        break;
      case 'rear':
        targetPos = [-10, 0.6, 0.001];
        lookTarget = [0, 0.6, 0];
        break;
      case 'cab':
        targetPos = [6.5, 1.2, 4.5];
        lookTarget = [4.5, 0.5, 0];
        break;
      case 'iso':
      default:
        targetPos = [8.5, 4.2, 7.5];
        lookTarget = [0, 0.2, 0];
        break;
    }

    camera.position.set(...targetPos);
    camera.lookAt(...lookTarget);

    if (controlsRef.current) {
      controlsRef.current.target.set(...lookTarget);
      controlsRef.current.update();
    }
  }, [preset, camera, controlsRef]);

  return null;
}

// -------------------------------------------------------------
// Main Exported Truck3DViewer Component
// -------------------------------------------------------------
export const Truck3DViewer: React.FC<Truck3DViewerProps> = ({
  vehicle,
  items = vehicle.cargoItems,
  showHotspots = true,
  onItemSelect,
  selectedItemId,
  onAddCargoClick,
}) => {
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('iso');
  const [transparentTrailer, setTransparentTrailer] = useState(true);
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const controlsRef = useRef<any>(null);

  // Reactive theme detector for dark mode
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'dark';
    }
    return false;
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const loadPct = vehicle.specs.loadCapacityPct || 68;
  const availPct = 100 - loadPct;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 460,
        borderRadius: 'var(--r, 12px)',
        overflow: 'hidden',
        background: isDark
          ? 'linear-gradient(180deg, #090d16 0%, #151d2d 100%)'
          : 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--elev-sm)',
      }}
    >
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [8.5, 4.2, 7.5], fov: 42 }}
        style={{ width: '100%', height: '100%', outline: 'none' }}
      >
        <ambientLight intensity={isDark ? 0.65 : 0.8} color={isDark ? '#cbd5e1' : '#ffffff'} />
        <directionalLight position={[10, 15, 10]} intensity={isDark ? 1.4 : 1.2} castShadow />
        <directionalLight position={[-10, 8, -10]} intensity={0.4} />
        <hemisphereLight intensity={0.5} groundColor={isDark ? '#090d16' : '#64748b'} />

        <TruckModel
          vehicle={vehicle}
          items={items}
          selectedItemId={selectedItemId}
          onItemSelect={onItemSelect}
          transparentTrailer={transparentTrailer}
          activeHotspot={activeHotspot}
          setActiveHotspot={setActiveHotspot}
          showHotspots={showHotspots}
          isDark={isDark}
        />

        <CameraController preset={cameraPreset} controlsRef={controlsRef} />
        <OrbitControls
          ref={controlsRef}
          enablePan
          enableZoom
          enableRotate
          autoRotate={autoRotate}
          autoRotateSpeed={1.2}
          maxPolarAngle={Math.PI / 2 - 0.02}
          minDistance={3}
          maxDistance={22}
        />
      </Canvas>

      {/* Top Overlay: Capacity Schematics & Vehicle Title */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          pointerEvents: 'none',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        {/* Left: Capacity Fill Pill */}
        <div
          style={{
            pointerEvents: 'auto',
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '8px 14px',
            boxShadow: 'var(--elev-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Volumetric Space
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal)' }}>{loadPct}%</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)' }}>Loaded</span>
              <span style={{ fontSize: 11, color: 'var(--ink3)', margin: '0 2px' }}>·</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)' }}>{availPct}% Available</span>
            </div>
          </div>

          <div style={{ width: 90, height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${loadPct}%`, height: '100%', background: 'linear-gradient(90deg, #0284c7, var(--teal))' }} />
          </div>
        </div>

        {/* Right: Camera Presets & View Controls (Horizontally scrollable on mobile) */}
        <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: 4,
            boxShadow: 'var(--elev-sm)',
            overflowX: 'auto',
            maxWidth: '100%',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {(
            [
              ['iso', '360° Orbit'],
              ['side', 'Side Cutaway'],
              ['top', 'Top Plan'],
              ['rear', 'Rear Doors'],
              ['cab', 'Cab Hotspots'],
            ] as [CameraPreset, string][]
          ).map(([p, label]) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setCameraPreset(p);
                setAutoRotate(false);
              }}
              style={{
                border: 'none',
                background: cameraPreset === p ? 'var(--teal)' : 'transparent',
                color: cameraPreset === p ? '#ffffff' : 'var(--ink2)',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {label}
            </button>
          ))}

          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

          {/* Toggle Trailer Transparency */}
          <button
            type="button"
            title={transparentTrailer ? 'Make trailer solid' : 'Make trailer translucent'}
            onClick={() => setTransparentTrailer(!transparentTrailer)}
            style={{
              border: 'none',
              background: transparentTrailer ? 'var(--teal-l)' : 'transparent',
              color: transparentTrailer ? 'var(--teal)' : 'var(--ink3)',
              padding: '5px 8px',
              borderRadius: '6px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap',
            }}
          >
            <Icon name="maximize" size={12} /> {transparentTrailer ? 'Translucent' : 'Solid'}
          </button>

          {/* Auto Rotate Toggle */}
          <button
            type="button"
            title={autoRotate ? 'Stop 360° rotation' : 'Start 360° rotation'}
            onClick={() => setAutoRotate(!autoRotate)}
            style={{
              border: 'none',
              background: autoRotate ? 'var(--teal-l)' : 'transparent',
              color: autoRotate ? 'var(--teal)' : 'var(--ink3)',
              padding: '5px 8px',
              borderRadius: '6px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap',
            }}
          >
            <Icon name="refresh" size={12} /> 360°
          </button>
        </div>
      </div>

      {/* Bottom Floating Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          right: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            pointerEvents: 'auto',
            background: 'rgba(15, 23, 42, 0.88)',
            color: '#f8fafc',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: 10.5,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            maxWidth: '100%',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8', flexShrink: 0 }} />
            Drag to rotate 360°
          </span>
          <span style={{ color: '#64748b' }}>|</span>
          <span style={{ whiteSpace: 'nowrap' }}>Pinch / Scroll to zoom</span>
        </div>

        {onAddCargoClick && (
          <button
            type="button"
            onClick={onAddCargoClick}
            style={{
              pointerEvents: 'auto',
              background: 'var(--teal)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '7px 14px',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 12px rgba(8, 145, 178, 0.35)',
            }}
          >
            <Icon name="plus" size={13} /> Add Cargo to Plan
          </button>
        )}
      </div>
    </div>
  );
};
