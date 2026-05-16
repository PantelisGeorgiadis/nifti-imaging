import { expect } from 'chai';

import { StandardColorPalette } from '../src/Constants.js';

describe('Constants', () => {
  describe('StandardColorPalette', () => {
    it('should define Grayscale palette', () => {
      expect(StandardColorPalette.Grayscale).to.equal('GRAYSCALE');
    });

    it('should define HotIron palette', () => {
      expect(StandardColorPalette.HotIron).to.equal('HOT_IRON');
    });

    it('should define PetColor palette', () => {
      expect(StandardColorPalette.PetColor).to.equal('PET_COLOR');
    });

    it('should define HotMetalBlue palette', () => {
      expect(StandardColorPalette.HotMetalBlue).to.equal('HOT_METAL_BLUE');
    });

    it('should define Pet20Step palette', () => {
      expect(StandardColorPalette.Pet20Step).to.equal('PET_20_STEP');
    });
  });
});
