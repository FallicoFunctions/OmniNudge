import { Html } from '@react-three/drei';

export function PlayerNameplates(props: {
  name: string;
  visible: boolean;
  position: [number, number, number];
}) {
  if (!props.visible) {
    return null;
  }

  return (
    <Html position={props.position} center distanceFactor={10}>
      <div className="player-nameplate">{props.name}</div>
    </Html>
  );
}
