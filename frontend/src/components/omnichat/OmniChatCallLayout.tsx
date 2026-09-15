import { Outlet } from 'react-router';
import { OmniChatCallProvider } from './OmniChatCallProvider';

/** Every OmniChat page, under the one call that lasts while the caller moves between them. */
export default function OmniChatCallLayout() {
  return (
    <OmniChatCallProvider>
      <Outlet />
    </OmniChatCallProvider>
  );
}
