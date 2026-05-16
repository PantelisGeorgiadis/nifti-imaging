import { expect } from 'chai';

import ColorPalette from '../src/ColorPalette.js';
import { StandardColorPalette } from '../src/Constants.js';
import log from '../src/log.js';

describe('ColorPalette', () => {
  it('should default to Grayscale palette', () => {
    const cp = new ColorPalette();
    expect(cp.getColorPalette()).to.equal(StandardColorPalette.Grayscale);
  });

  it('should store the provided palette name', () => {
    const cp = new ColorPalette(StandardColorPalette.HotIron);
    expect(cp.getColorPalette()).to.equal(StandardColorPalette.HotIron);
  });

  it('should return a Uint8Array with 256 * 4 entries', () => {
    const cp = new ColorPalette(StandardColorPalette.Grayscale);
    const lut = cp.getLut();
    expect(lut).to.be.instanceOf(Uint8Array);
    expect(lut.length).to.equal(256 * 4);
  });

  it('should have full alpha (255) for all entries', () => {
    const cp = new ColorPalette(StandardColorPalette.Grayscale);
    const lut = cp.getLut();
    for (let i = 3; i < lut.length; i += 4) {
      expect(lut[i]).to.equal(255);
    }
  });

  it('grayscale LUT should be a ramp R==G==B==index', () => {
    const cp = new ColorPalette(StandardColorPalette.Grayscale);
    const lut = cp.getLut();
    for (let i = 0; i < 256; i++) {
      expect(lut[i * 4]).to.equal(i);
      expect(lut[i * 4 + 1]).to.equal(i);
      expect(lut[i * 4 + 2]).to.equal(i);
    }
  });

  it('should map t=0 to first LUT entry', () => {
    const cp = new ColorPalette(StandardColorPalette.Grayscale);
    const c = cp.getColor(0);
    expect(c.r).to.equal(0);
    expect(c.g).to.equal(0);
    expect(c.b).to.equal(0);
    expect(c.a).to.equal(255);
  });

  it('should map t=1 to last LUT entry', () => {
    const cp = new ColorPalette(StandardColorPalette.Grayscale);
    const c = cp.getColor(1);
    expect(c.r).to.equal(255);
    expect(c.g).to.equal(255);
    expect(c.b).to.equal(255);
    expect(c.a).to.equal(255);
  });

  it('should clamp values below 0', () => {
    const cp = new ColorPalette(StandardColorPalette.Grayscale);
    const c = cp.getColor(-1);
    expect(c.r).to.equal(0);
  });

  it('should clamp values above 1', () => {
    const cp = new ColorPalette(StandardColorPalette.Grayscale);
    const c = cp.getColor(2);
    expect(c.r).to.equal(255);
  });

  Object.values(StandardColorPalette).forEach((paletteName) => {
    it(`should build a valid LUT for ${paletteName}`, () => {
      const cp = new ColorPalette(paletteName);
      const lut = cp.getLut();
      expect(lut.length).to.equal(256 * 4);
    });
  });

  it('should return a description string', () => {
    const cp = new ColorPalette(StandardColorPalette.HotMetalBlue);
    expect(cp.toString()).to.include(StandardColorPalette.HotMetalBlue);
  });

  it('should fall back to Grayscale and warn for an unknown palette name', () => {
    const warnings = [];
    const original = log.warn;
    log.warn = (...args) => warnings.push(args.join(' '));
    try {
      const cp = new ColorPalette('UNKNOWN_PALETTE');
      // LUT must equal the Grayscale LUT
      const grayscale = new ColorPalette(StandardColorPalette.Grayscale);
      expect(cp.getLut()).to.deep.equal(grayscale.getLut());
      // A warning must have been emitted
      expect(warnings.length).to.be.greaterThan(0);
      expect(warnings[0]).to.include('UNKNOWN_PALETTE');
    } finally {
      log.warn = original;
    }
  });
});
