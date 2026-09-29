import {describe,it,expect} from 'vitest';
import {showReviewLocation} from '../showReviewLocation';

describe('show review recovery location',()=>{
  it('returns to the same fixture after removing credentials and refreshing',()=>{
    for(const port of [4176,4177]){
      const first=showReviewLocation(`?world=${encodeURIComponent(`ws://127.0.0.1:${port}/ws`)}&wtoken=private-token`,'/show-control-review.html');
      const reloaded=showReviewLocation(new URL(first.cleanUrl,'http://127.0.0.1:4175').search,'/show-control-review.html');
      expect(first.hub).toBe(`http://127.0.0.1:${port}/review`);
      expect(reloaded.hub).toBe(first.hub);
      expect(first.cleanUrl).not.toContain('private-token');
      expect(first.cleanUrl).not.toContain('world=');
    }
  });
  it('keeps malformed or external recovery destinations on the local fixture',()=>{
    for(const search of ['?reviewPort=0','?reviewPort=65536','?reviewPort=//example.com','?world=ws://example.com:4177/ws','?world=ws://user@localhost:4177/ws','?world=ws://127.0.0.1:0/ws']){
      expect(showReviewLocation(search,'/show-control-review.html').hub).toBe('http://127.0.0.1:4176/review');
    }
  });
});
