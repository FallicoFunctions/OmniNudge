import {beforeEach,it,expect} from 'vitest';
import {createShowReviewRecovery} from '../createShowReviewRecovery';
beforeEach(()=>{
  document.body.innerHTML='<span id="review-connection"></span><section id="review-entry"><h1 id="review-entry-title"></h1><p id="review-entry-message"></p><a id="review-entry-link" href="http://127.0.0.1:4177/review">Choose a player</a></section>';
});
it('offers recovery for rejected and dropped connections, then clears it on reconnect',()=>{
  const view=createShowReviewRecovery(),entry=document.getElementById('review-entry')!;
  view.loading();view.connection('connecting');expect(entry.hidden).toBe(false);
  view.connection('open');expect(entry.hidden).toBe(true);
  for(const status of ['error','closed'] as const){
    view.connection(status);expect(entry.hidden).toBe(false);
    expect(entry.textContent).toContain('The booth is disconnected');
    expect(entry.querySelector('a')?.href).toBe('http://127.0.0.1:4177/review');
    view.connection('connecting');expect(entry.hidden).toBe(false);
    view.connection('open');expect(entry.hidden).toBe(true);
  }
});
it('keeps a recovery action visible if the scene fails to start',()=>{
  const view=createShowReviewRecovery();view.loading();view.failed();
  expect(document.getElementById('review-entry')!.hidden).toBe(false);
  expect(document.getElementById('review-entry-title')!.textContent).toBe('The booth could not open');
});
