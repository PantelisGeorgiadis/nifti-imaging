import { expect } from 'chai';

import Histogram from '../src/Histogram.js';

describe('Histogram', () => {
  it('should store all properties', () => {
    const data = new Array(256).fill(0);
    data[128] = 42;
    const hist = new Histogram(0, 255, 1000, data);
    expect(hist.getMin()).to.equal(0);
    expect(hist.getMax()).to.equal(255);
    expect(hist.getCount()).to.equal(1000);
    expect(hist.getData()).to.equal(data);
  });

  it('should return exactly the data array passed in', () => {
    const data = new Array(256).fill(1);
    const hist = new Histogram(-100, 100, 256, data);
    expect(hist.getData()).to.have.length(256);
    expect(hist.getData()[0]).to.equal(1);
  });

  it('should return a string with min, max, and count', () => {
    const hist = new Histogram(10, 200, 500, new Array(256).fill(0));
    const str = hist.toString();
    expect(str).to.be.a('string');
    expect(str).to.include('10');
    expect(str).to.include('200');
    expect(str).to.include('500');
  });
});
