import type { RuntimePlayer } from '../../lib/session';
import { PlayerNameplates } from './PlayerNameplates';

export function RemotePlayerMarkers(props: {
  players: RuntimePlayer[];
  currentPlayerId: string;
  displayNames: boolean;
}) {
  const remotes = props.players.filter((player) => player.id !== props.currentPlayerId);

  return (
    <group>
      {remotes.map((player) => (
        <group key={player.id} position={[player.position.x, 0, player.position.z]}>
          <mesh position={[0, 1.4, 0]} castShadow>
            <capsuleGeometry args={[0.55, 1.6, 8, 12]} />
            <meshStandardMaterial
              color={player.mode === 'guest' ? '#ff77cd' : '#7cf2c8'}
              emissive={player.mode === 'guest' ? '#751e60' : '#0d5c46'}
              emissiveIntensity={0.24}
            />
          </mesh>
          <mesh position={[0, 2.6, 0]}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshStandardMaterial
              color={player.mode === 'guest' ? '#ffc4ea' : '#d7fff2'}
              emissive={player.mode === 'guest' ? '#8f3c70' : '#1c6b55'}
              emissiveIntensity={0.5}
            />
          </mesh>
          <PlayerNameplates name={player.playerName} visible={props.displayNames} position={[0, 3.15, 0]} />
        </group>
      ))}
    </group>
  );
}
