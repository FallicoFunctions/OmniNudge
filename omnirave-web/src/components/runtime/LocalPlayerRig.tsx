import { useEffect } from 'react';
import type { RuntimeSession } from '../../lib/session';

export function LocalPlayerRig(props: {
  session: RuntimeSession;
  onGuestSprintAttempt?: () => void;
}) {
  const self =
    props.session.players?.find((player) => player.id === props.session.playerId) ?? {
      position: { x: 0, y: 0, z: 0 },
    };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Shift' || props.session.mode !== 'guest') {
        return;
      }

      props.onGuestSprintAttempt?.();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [props.onGuestSprintAttempt, props.session.mode]);

  return (
    <group position={[self.position.x, 0, self.position.z]}>
      <mesh position={[0, 1.75, 0]} castShadow>
        <capsuleGeometry args={[0.65, 1.9, 8, 16]} />
        <meshStandardMaterial color="#f1f4ff" emissive="#90d9ff" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0, 4.1, 0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial emissive="#9ce8ff" emissiveIntensity={0.95} color="#b2f0ff" />
      </mesh>
    </group>
  );
}
