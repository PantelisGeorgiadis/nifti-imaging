import { expect } from 'chai';

import WindowLevel from '../src/WindowLevel.js';

describe('WindowLevel', () => {
  it('should store window and level values', () => {
    const wl = new WindowLevel(400, 200);
    expect(wl.getWindow()).to.equal(400);
    expect(wl.getLevel()).to.equal(200);
  });

  it('should store optional description', () => {
    const wl = new WindowLevel(256, 128, 'Test');
    expect(wl.getDescription()).to.equal('Test');
  });

  it('should have undefined description when not provided', () => {
    const wl = new WindowLevel(256, 128);
    expect(wl.getDescription()).to.be.undefined;
  });

  it('should update window value via setWindow', () => {
    const wl = new WindowLevel(100, 50);
    wl.setWindow(500);
    expect(wl.getWindow()).to.equal(500);
  });

  it('should update level value via setLevel', () => {
    const wl = new WindowLevel(100, 50);
    wl.setLevel(300);
    expect(wl.getLevel()).to.equal(300);
  });

  it('should update description via setDescription', () => {
    const wl = new WindowLevel(100, 50);
    wl.setDescription('Updated');
    expect(wl.getDescription()).to.equal('Updated');
  });

  it('should return a string containing window and level', () => {
    const wl = new WindowLevel(400, 200, 'CT Chest');
    const str = wl.toString();
    expect(str).to.be.a('string');
    expect(str).to.include('400');
    expect(str).to.include('200');
  });

  it('should include no description placeholder when description is absent', () => {
    const wl = new WindowLevel(256, 128);
    const str = wl.toString();
    expect(str).to.include('No description');
  });
});
