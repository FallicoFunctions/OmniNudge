import { describe, expect, it } from 'vitest';
import { createServerClock } from '../serverClock';

describe('createServerClock', () => {
  it('is unknown before the first sample', () => {
    expect(createServerClock(() => 0).now()).toBeUndefined();
  });

  it('puts the server reading half a round trip before the reply', () => {
    let local = 1100;
    const clock = createServerClock(() => local);
    // Sent at 1000, replied at 1100: the server read 50_000 at local 1050.
    clock.addSample(1000, 50_000, 1100);
    expect(clock.now()).toBe(50_050);
    local = 2100;
    expect(clock.now()).toBe(51_050);
  });

  it('trusts the sample with the shortest round trip', () => {
    const clock = createServerClock(() => 0);
    clock.addSample(0, 10_000, 20); // offset 9_990
    clock.addSample(100, 10_500, 900); // slow reply: offset 10_000, less exact
    expect(clock.now()).toBe(9_990);
  });

  it('forgets old samples, so a changed network path is followed', () => {
    const clock = createServerClock(() => 0);
    clock.addSample(0, 10_000, 2); // offset 9_999
    for (let i = 0; i < 8; i += 1) clock.addSample(0, 20_000, 10); // offset 19_995
    expect(clock.now()).toBe(19_995);
  });

  it('ignores a reply that arrives before its ping was sent', () => {
    const clock = createServerClock(() => 0);
    clock.addSample(100, 10_000, 50);
    expect(clock.now()).toBeUndefined();
  });
});
