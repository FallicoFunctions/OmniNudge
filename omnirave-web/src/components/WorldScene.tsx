import type { RuntimeSession } from '../lib/session';
import { RuntimeCanvas } from './runtime/RuntimeCanvas';

export function WorldScene(props: { session: RuntimeSession; unlocked: boolean }) {
  return <RuntimeCanvas session={props.session} unlocked={props.unlocked} />;
}
