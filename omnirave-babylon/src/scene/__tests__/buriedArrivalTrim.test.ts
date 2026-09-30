import { describe, expect, it } from 'vitest';
import { BURIED_ARRIVAL_TRIM_PATTERN } from '../createMainStageScene';

describe('BURIED_ARRIVAL_TRIM_PATTERN', () => {
  it('hides the five V65 trim meshes the approach deck buried, also after a merge', () => {
    for (const name of [
      'V65_ArrivalThresholdGoldBands',
      'V65_ArrivalThresholdShadowGrooves',
      'V65_ArrivalRunwayPearlBands',
      'V65_ArrivalRunwayGoldBands',
      'V65_ArrivalRunwayCyanThreads',
      'merged:V65_ArrivalThresholdGoldBands+1',
    ]) {
      expect(BURIED_ARRIVAL_TRIM_PATTERN.test(name), name).toBe(true);
    }
  });

  it('leaves the deck, the walkway and its gold inlay visible', () => {
    for (const name of [
      'merged:V151_ApproachDeckSlab+1',
      'V34_ApproachPaverField',
      'V34_ApproachGoldInlayNetwork',
      'V108_ForegroundBarricadeGoldRun',
      'V64_PromenadePearlRibbon',
    ]) {
      expect(BURIED_ARRIVAL_TRIM_PATTERN.test(name), name).toBe(false);
    }
  });
});
