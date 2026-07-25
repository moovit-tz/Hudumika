import React, { useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';

// Real 3D warehouse view — shape (multi-floor deck stack), rack placement
// (from the same grid_row/grid_col/floor_level/max_stack_tiers data the 2D
// plan uses), and aisle routes/paths (the walkable/forklift lanes between
// rack rows). Reuses the same react-three-fiber + drei stack already used
// by Tracking's cargo-loading 3D view (TrackingCargoLoading.tsx) rather
// than adding a second 3D library.

interface Tier3D { tier: number; lotCount: number; occupancyPct: number; }
interface Location3D {
  id: string; code: string; gridRow: number | null; gridCol: number | null;
  maxStackTiers: number; occupancyPct: number; flagged: boolean; tiers: Tier3D[];
}
interface Floor3D { floorLevel: number; label: string; locations: Location3D[]; }

const FLOOR_HEIGHT = 3.2;
const TIER_HEIGHT = 0.6;
const CELL_SIZE = 1.4;

function bandColor3D(pct: number): string {
  if (pct >= 86) return '#ef4444';
  if (pct >= 61) return '#eab308';
  return '#22c55e';
}

function RackStack({ loc, offsetX, offsetZ, baseY, onSelect }: { loc: Location3D; offsetX: number; offsetZ: number; baseY: number; onSelect: (loc: Location3D) => void }) {
  const [hovered, setHovered] = useState(false);
  const x = (loc.gridCol! - offsetX) * CELL_SIZE;
  const z = (loc.gridRow! - offsetZ) * CELL_SIZE;

  return (
    <group position={[x, baseY, z]}>
      {loc.tiers.map((t, i) => (
        <mesh
          key={t.tier}
          position={[0, i * TIER_HEIGHT + TIER_HEIGHT / 2, 0]}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
          onPointerOut={() => setHovered(false)}
          onClick={(e) => { e.stopPropagation(); onSelect(loc); }}
        >
          <boxGeometry args={[CELL_SIZE * 0.8, TIER_HEIGHT * 0.85, CELL_SIZE * 0.8]} />
          <meshStandardMaterial
            color={bandColor3D(t.occupancyPct)}
            transparent
            opacity={t.lotCount > 0 ? (hovered ? 1 : 0.88) : 0.18}
            emissive={loc.flagged ? '#ef4444' : hovered ? '#0f766e' : '#000000'}
            emissiveIntensity={loc.flagged ? 0.4 : hovered ? 0.25 : 0}
          />
        </mesh>
      ))}
    </group>
  );
}

function AisleLines({ locations, offsetX, offsetZ, y }: { locations: Location3D[]; offsetX: number; offsetZ: number; y: number }) {
  const rows = [...new Set(locations.map(l => l.gridRow!))].sort((a, b) => a - b);
  const cols = [...new Set(locations.map(l => l.gridCol!))].sort((a, b) => a - b);
  if (cols.length === 0 || rows.length === 0) return null;
  const minCol = cols[0], maxCol = cols[cols.length - 1];
  const minRow = rows[0], maxRow = rows[rows.length - 1];

  const lines: [number, number, number][][] = [];
  // Aisle down the middle of each row gap (between racks, not through them).
  for (let r = minRow; r <= maxRow; r++) {
    lines.push([
      [(minCol - offsetX - 0.5) * CELL_SIZE, y, (r - offsetZ) * CELL_SIZE],
      [(maxCol - offsetX + 0.5) * CELL_SIZE, y, (r - offsetZ) * CELL_SIZE],
    ]);
  }
  // One cross-aisle at the entry column so every row aisle connects to a route out.
  lines.push([
    [(minCol - offsetX - 0.5) * CELL_SIZE, y, (minRow - offsetZ - 0.5) * CELL_SIZE],
    [(minCol - offsetX - 0.5) * CELL_SIZE, y, (maxRow - offsetZ + 0.5) * CELL_SIZE],
  ]);

  return (
    <>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color={i === lines.length - 1 ? '#f59e0b' : '#94a3b8'} lineWidth={i === lines.length - 1 ? 2.5 : 1} dashed={i !== lines.length - 1} dashSize={0.15} gapSize={0.1} />
      ))}
    </>
  );
}

function FloorDeck({ floor, offsetX, offsetZ, minRow, maxRow, minCol, maxCol, onSelect }: {
  floor: Floor3D; offsetX: number; offsetZ: number; minRow: number; maxRow: number; minCol: number; maxCol: number;
  onSelect: (loc: Location3D) => void;
}) {
  const placed = floor.locations.filter(l => l.gridRow != null && l.gridCol != null);
  const y = floor.floorLevel * FLOOR_HEIGHT;
  const width = (maxCol - minCol + 2) * CELL_SIZE;
  const depth = (maxRow - minRow + 2) * CELL_SIZE;
  const centerX = ((minCol + maxCol) / 2 - offsetX) * CELL_SIZE;
  const centerZ = ((minRow + maxRow) / 2 - offsetZ) * CELL_SIZE;

  return (
    <group>
      <mesh position={[centerX, y - 0.05, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={floor.floorLevel === 0 ? '#e2e8f0' : '#cbd5e1'} transparent opacity={0.35} />
      </mesh>
      {placed.length > 0 && <AisleLines locations={placed} offsetX={offsetX} offsetZ={offsetZ} y={y + 0.01} />}
      {placed.map(loc => (
        <RackStack key={loc.id} loc={loc} offsetX={offsetX} offsetZ={offsetZ} baseY={y} onSelect={onSelect} />
      ))}
    </group>
  );
}

export function SealWarehouse3D({ floors }: { floors: Floor3D[] }) {
  const controlsRef = useRef<any>(null);
  const [selected, setSelected] = useState<Location3D | null>(null);

  const allPlaced = useMemo(() => floors.flatMap(f => f.locations.filter(l => l.gridRow != null && l.gridCol != null)), [floors]);
  const rows = allPlaced.map(l => l.gridRow!);
  const cols = allPlaced.map(l => l.gridCol!);
  const minRow = rows.length ? Math.min(...rows) : 0, maxRow = rows.length ? Math.max(...rows) : 0;
  const minCol = cols.length ? Math.min(...cols) : 0, maxCol = cols.length ? Math.max(...cols) : 0;
  const offsetX = (minCol + maxCol) / 2, offsetZ = (minRow + maxRow) / 2;
  const span = Math.max(maxCol - minCol, maxRow - minRow, 4) * CELL_SIZE;
  const topY = (Math.max(...floors.map(f => f.floorLevel), 0) + 1) * FLOOR_HEIGHT;

  if (allPlaced.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No locations are placed on the grid yet — place some in 2D Plan / Edit Layout first, then switch back to 3D.</div>;
  }

  return (
    <div style={{ position: 'relative' }}>
      <Canvas camera={{ position: [span * 1.3, topY * 1.6, span * 1.3], fov: 45 }} style={{ background: 'var(--bg)', borderRadius: 12, height: 520 }}>
        <ambientLight intensity={0.75} />
        <directionalLight position={[10, 16, 8]} intensity={0.9} />
        {floors.map(f => (
          <FloorDeck key={f.floorLevel} floor={f} offsetX={offsetX} offsetZ={offsetZ} minRow={minRow} maxRow={maxRow} minCol={minCol} maxCol={maxCol} onSelect={setSelected} />
        ))}
        <OrbitControls ref={controlsRef} enablePan enableZoom enableRotate target={[0, topY / 2, 0]} />
      </Canvas>

      <div style={{ position: 'absolute', top: 12, left: 12, background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', fontSize: 11.5, display: 'flex', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: '#22c55e' }} /> 0-60%</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: '#eab308' }} /> 61-85%</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: '#ef4444' }} /> 86-100%</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 2, background: '#f59e0b' }} /> Main route</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 2, background: '#94a3b8', borderTop: '1px dashed #94a3b8' }} /> Aisle</span>
      </div>

      {selected && (
        <div style={{ position: 'absolute', top: 12, right: 12, background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, maxWidth: 220 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>{selected.code}</div>
          {selected.tiers.map(t => (
            <div key={t.tier}>Tier {t.tier}: {t.lotCount > 0 ? `${t.occupancyPct}%` : 'empty'}</div>
          ))}
        </div>
      )}
    </div>
  );
}
