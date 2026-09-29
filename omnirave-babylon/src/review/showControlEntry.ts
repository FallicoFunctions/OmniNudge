import { showReviewLocation } from './showReviewLocation';
import { createShowReviewRecovery } from './createShowReviewRecovery';

const link = document.getElementById('review-entry-link') as HTMLAnchorElement;
const view=createShowReviewRecovery();
const parameters = new URLSearchParams(location.search);
const world = parameters.get('world');
const token = parameters.get('wtoken');

const recovery=showReviewLocation(location.search,location.pathname);
link.href=recovery.hub;

if (world && token) {
  view.loading();
  // Keep the entry UI independent of the 3D module so a load/startup failure
  // always leaves a readable recovery path instead of an empty canvas.
  void import('./showControl').then(({startShowControlReview}) => {
    startShowControlReview(view.connection);
  }).catch(() => {
    history.replaceState(null, '', recovery.cleanUrl);
    view.failed();
  });
} else {
  history.replaceState(null, '', recovery.cleanUrl);
}

// pagehide disposes the scene and socket. A restored history entry must not
// display that disposed scene; reload into the player picker instead.
window.addEventListener('pageshow', event => {
  if (event.persisted) location.reload();
});
