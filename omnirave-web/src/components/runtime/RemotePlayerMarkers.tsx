import type { RuntimePlayer } from '../../lib/session';

export function RemotePlayerMarkers(props: { players: RuntimePlayer[]; currentPlayerId: string }) {
  const remotes = props.players.filter((player) => player.id !== props.currentPlayerId);

  return (
    <group>
      {remotes.map((player) => (
        <mesh key={player.id} position={[player.position.x, 1.4, player.position.z]} castShadow>
          <capsuleGeometry args={[0.55, 1.6, 8, 12]} />
          <meshStandardMaterial color="#ff77cd" emissive="#751e60" emissiveIntensity={0.32} />
        </mesh>
      ))}
    </group>
  );
}
