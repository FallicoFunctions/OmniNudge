import type { RuntimeZoneEvent, RuntimeZoneID } from '../../lib/session';

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

function eventAtmosphere(event: RuntimeZoneEvent | undefined) {
  if (!event) {
    return {
      glowBoost: 1,
      floorTint: '#ffffff',
      wallTint: '#ffffff',
      beamScale: 1,
      hazeColor: '#ffffff',
      hazeOpacity: 0,
    };
  }

  if (event.zoneId === 'main_stage') {
    if (event.phase === 'lead_in') {
      return {
        glowBoost: 1.25,
        floorTint: '#ffd9f1',
        wallTint: '#d6f7ff',
        beamScale: 1.12,
        hazeColor: '#b6eeff',
        hazeOpacity: 0.12,
      };
    }

    if (event.phase === 'active') {
      return {
        glowBoost: 1.55,
        floorTint: '#ffe7f6',
        wallTint: '#ffffff',
        beamScale: 1.24,
        hazeColor: '#ffffff',
        hazeOpacity: 0.2,
      };
    }

    return {
      glowBoost: 1.18,
      floorTint: '#f5edff',
      wallTint: '#def8ff',
      beamScale: 1.08,
      hazeColor: '#e2fbff',
      hazeOpacity: 0.1,
    };
  }

  if (event.zoneId === 'underground') {
    if (event.phase === 'active') {
      return {
        glowBoost: 0.9,
        floorTint: '#63242d',
        wallTint: '#ff9b73',
        beamScale: 1.18,
        hazeColor: '#ff6c48',
        hazeOpacity: 0.18,
      };
    }

    return {
      glowBoost: 0.82,
      floorTint: '#3f1b22',
      wallTint: '#dd7f63',
      beamScale: 1.08,
      hazeColor: '#cc6954',
      hazeOpacity: 0.12,
    };
  }

  if (event.phase === 'lead_in') {
    return {
      glowBoost: 1.22,
      floorTint: '#ffe7ff',
      wallTint: '#fff1a8',
      beamScale: 1.1,
      hazeColor: '#ffd9ff',
      hazeOpacity: 0.13,
    };
  }

  if (event.phase === 'active') {
    return {
      glowBoost: 1.48,
      floorTint: '#fff3af',
      wallTint: '#ffc8f4',
      beamScale: 1.22,
      hazeColor: '#ffe99f',
      hazeOpacity: 0.2,
    };
  }

  return {
    glowBoost: 1.14,
    floorTint: '#fff6d1',
    wallTint: '#f6dcff',
    beamScale: 1.08,
    hazeColor: '#fff3c8',
    hazeOpacity: 0.12,
  };
}

export function FestivalBlockout(props: {
  activeZone: RuntimeZoneID;
  unlocked: boolean;
  zoneEvent?: RuntimeZoneEvent;
}) {
  const palette = PALETTES[props.activeZone];
  const glow = props.unlocked ? 1 : 0.55;
  const atmosphere = eventAtmosphere(props.zoneEvent);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={palette.floor} emissive={atmosphere.floorTint} emissiveIntensity={0.12 * glow} roughness={0.92} metalness={0.14} />
      </mesh>

      <mesh position={[0, 7, -36]}>
        <boxGeometry args={[46, 14, 8]} />
        <meshStandardMaterial color={palette.wall} emissive={atmosphere.wallTint} emissiveIntensity={0.09 * glow} roughness={0.68} metalness={0.2} />
      </mesh>

      <mesh position={[0, 5.5, -26]} castShadow>
        <boxGeometry args={[34, 10, 10]} />
        <meshStandardMaterial emissive={palette.stage} emissiveIntensity={0.25 * glow * atmosphere.glowBoost} color="#0a0e16" />
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
        <meshStandardMaterial emissive={palette.beamA} emissiveIntensity={0.9 * glow * atmosphere.beamScale} color={palette.beamA} />
      </mesh>

      <mesh position={[16, 18, -10]} rotation={[0.28, 0, 0.45]}>
        <cylinderGeometry args={[0.45, 0.45, 34, 16]} />
        <meshStandardMaterial emissive={palette.beamB} emissiveIntensity={0.9 * glow * atmosphere.beamScale} color={palette.beamB} />
      </mesh>

      {props.zoneEvent ? (
        <mesh position={[0, 12, -24]}>
          <sphereGeometry args={[18, 32, 32]} />
          <meshBasicMaterial color={atmosphere.hazeColor} transparent opacity={atmosphere.hazeOpacity} />
        </mesh>
      ) : null}
    </group>
  );
}
