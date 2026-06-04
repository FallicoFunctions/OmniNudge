import type { RuntimeZoneID } from '../../lib/session';

const PALETTES: Record<
  RuntimeZoneID,
  {
    floor: string;
    stage: string;
    wall: string;
    beamA: string;
    beamB: string;
  }
> = {
  main_stage: {
    floor: '#140c29',
    stage: '#ff6dd0',
    wall: '#1d1234',
    beamA: '#ff4bae',
    beamB: '#4ce3ff',
  },
  underground: {
    floor: '#090d14',
    stage: '#63f7d2',
    wall: '#141922',
    beamA: '#5dffe0',
    beamB: '#3e86ff',
  },
  plurr_partay: {
    floor: '#1a0f24',
    stage: '#ffd86c',
    wall: '#2a1836',
    beamA: '#ff78d0',
    beamB: '#ffc95f',
  },
};

export function FestivalBlockout(props: { activeZone: RuntimeZoneID; unlocked: boolean }) {
  const palette = PALETTES[props.activeZone];
  const glow = props.unlocked ? 1 : 0.55;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={palette.floor} roughness={0.92} metalness={0.14} />
      </mesh>

      <mesh position={[0, 7, -36]}>
        <boxGeometry args={[46, 14, 8]} />
        <meshStandardMaterial color={palette.wall} roughness={0.68} metalness={0.2} />
      </mesh>

      <mesh position={[0, 5.5, -26]} castShadow>
        <boxGeometry args={[34, 10, 10]} />
        <meshStandardMaterial emissive={palette.stage} emissiveIntensity={0.25 * glow} color="#0a0e16" />
      </mesh>

      <mesh position={[-28, 10, -20]}>
        <boxGeometry args={[8, 20, 8]} />
        <meshStandardMaterial color={palette.wall} roughness={0.78} metalness={0.12} />
      </mesh>

      <mesh position={[28, 10, -20]}>
        <boxGeometry args={[8, 20, 8]} />
        <meshStandardMaterial color={palette.wall} roughness={0.78} metalness={0.12} />
      </mesh>

      <mesh position={[-16, 18, -10]} rotation={[0.28, 0, -0.45]}>
        <cylinderGeometry args={[0.45, 0.45, 34, 16]} />
        <meshStandardMaterial emissive={palette.beamA} emissiveIntensity={0.9 * glow} color={palette.beamA} />
      </mesh>

      <mesh position={[16, 18, -10]} rotation={[0.28, 0, 0.45]}>
        <cylinderGeometry args={[0.45, 0.45, 34, 16]} />
        <meshStandardMaterial emissive={palette.beamB} emissiveIntensity={0.9 * glow} color={palette.beamB} />
      </mesh>
    </group>
  );
}
