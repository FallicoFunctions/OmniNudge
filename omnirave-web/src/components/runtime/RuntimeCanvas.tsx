import { Environment } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { RuntimeSession } from '../../lib/session';
import { FestivalBlockout } from './FestivalBlockout';
import { LocalPlayerRig } from './LocalPlayerRig';
import { RemotePlayerMarkers } from './RemotePlayerMarkers';

export function RuntimeCanvas(props: { session: RuntimeSession; unlocked: boolean }) {
  const { session, unlocked } = props;

  return (
    <div aria-label="OmniRave 3D runtime" className="world-scene-canvas">
      <Canvas
        camera={{ position: [0, 14, 28], fov: 44 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
        style={{ width: '100%', height: '100vh', display: 'block' }}
      >
        <color attach="background" args={['#04060c']} />
        <fog attach="fog" args={['#04060c', 80, 240]} />
        <ambientLight intensity={0.95} />
        <directionalLight position={[32, 42, 18]} intensity={1.35} />
        <Environment preset="night" />
        <FestivalBlockout activeZone={session.activeZone} unlocked={unlocked} />
        <RemotePlayerMarkers
          players={session.players ?? []}
          currentPlayerId={session.playerId}
          displayNames={session.settings.displayNames}
        />
        <LocalPlayerRig session={session} />
      </Canvas>
    </div>
  );
}
