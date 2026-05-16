import { expect } from 'chai';
import { NIFTI1 } from 'nifti-reader-js';
import { gzip } from 'pako';

import NiftiImage from '../src/NiftiImage.js';
import WindowLevel from '../src/WindowLevel.js';

function createNiftiBuffer(opts) {
  const header = new NIFTI1();
  header.littleEndian = true;

  // Dimensionality
  const numDims = opts.numTimePoints > 1 ? 4 : opts.numSlices > 1 ? 3 : 2;
  header.dims[0] = numDims;
  header.dims[1] = opts.width;
  header.dims[2] = opts.height;
  header.dims[3] = opts.numSlices || 1;
  header.dims[4] = opts.numTimePoints || 1;
  header.dims[5] = 1;
  header.dims[6] = 1;
  header.dims[7] = 1;

  header.datatypeCode = opts.datatypeCode;
  header.magic = 'n+1';

  // vox_offset: NIFTI1 header = 348 bytes + 4 extension bytes = 352
  header.vox_offset = 352;

  // Scaling
  if (opts.sclSlope !== undefined) {
    header.scl_slope = opts.sclSlope;
  } else {
    header.scl_slope = 1;
  }
  header.scl_inter = opts.sclInter !== undefined ? opts.sclInter : 0;

  // Cal min/max
  header.cal_min = opts.calMin !== undefined ? opts.calMin : 0;
  header.cal_max = opts.calMax !== undefined ? opts.calMax : 0;

  // Voxel spacing (pixDims[1..3])
  if (opts.pixDims) {
    header.pixDims[1] = opts.pixDims[0];
    header.pixDims[2] = opts.pixDims[1];
    header.pixDims[3] = opts.pixDims[2];
  }

  // Sform - enables proper affine for origin/spacing/orientation tests
  if (opts.sform) {
    header.sform_code = opts.sform.code !== undefined ? opts.sform.code : 1;
    // NOTE: NIFTI1.toArrayBuffer() does not serialise srow_x/y/z,
    // so we write them directly into the serialised buffer at the
    // NIfTI-1 byte offsets (280 / 296 / 312, each 4xFloat32 LE).
  }

  // bits per voxel
  switch (opts.datatypeCode) {
    case NIFTI1.TYPE_UINT8:
    case NIFTI1.TYPE_INT8:
      header.numBitsPerVoxel = 8;
      break;
    case NIFTI1.TYPE_UINT16:
    case NIFTI1.TYPE_INT16:
      header.numBitsPerVoxel = 16;
      break;
    case NIFTI1.TYPE_UINT32:
    case NIFTI1.TYPE_INT32:
    case NIFTI1.TYPE_FLOAT32:
      header.numBitsPerVoxel = 32;
      break;
    case NIFTI1.TYPE_FLOAT64:
      header.numBitsPerVoxel = 64;
      break;
    case NIFTI1.TYPE_COMPLEX64:
      header.numBitsPerVoxel = 64;
      break;
    case NIFTI1.TYPE_RGB24:
      header.numBitsPerVoxel = 24;
      break;
    default:
      header.numBitsPerVoxel = 8;
  }

  // Serialize header (348 bytes) + extension (4 zeros) = 352 bytes
  const headerBuffer = header.toArrayBuffer();

  // Patch srow values into the serialised binary header
  if (opts.sform) {
    const dv = new DataView(headerBuffer);
    const LE = header.littleEndian !== false;
    const rows = [opts.sform.rowX, opts.sform.rowY, opts.sform.rowZ];
    const baseOffsets = [280, 296, 312];
    rows.forEach((row, ri) => {
      row.forEach((v, ci) => dv.setFloat32(baseOffsets[ri] + ci * 4, v, LE));
    });
  }

  const pixelData = opts.pixelData;
  const total = headerBuffer.byteLength + pixelData.byteLength;
  const combined = new ArrayBuffer(total);
  const view = new Uint8Array(combined);
  view.set(new Uint8Array(headerBuffer), 0);
  view.set(new Uint8Array(pixelData), headerBuffer.byteLength);

  return combined;
}

function createBigEndianNiftiBuffer(opts) {
  const le = new Uint8Array(createNiftiBuffer(opts));
  const out = le.slice(0);

  const swap16 = (off) => {
    const t = out[off];
    out[off] = out[off + 1];
    out[off + 1] = t;
  };
  const swap32 = (off) => {
    let t;
    t = out[off];
    out[off] = out[off + 3];
    out[off + 3] = t;
    t = out[off + 1];
    out[off + 1] = out[off + 2];
    out[off + 2] = t;
  };

  // Header
  swap32(0); // sizeof_hdr
  swap32(32); // extents
  swap32(140); // glmax
  swap32(144); // glmin

  swap16(36); // session_error
  for (let i = 0; i < 8; i++) {
    swap16(40 + i * 2);
  } // dim[0..7]
  swap16(68); // intent_code
  swap16(70); // datatype
  swap16(72); // bitpix
  swap16(74); // slice_start
  swap16(120); // slice_end
  swap16(252); // qform_code
  swap16(254); // sform_code

  swap32(56);
  swap32(60);
  swap32(64); // intent_p1/2/3
  for (let i = 0; i < 8; i++) {
    swap32(76 + i * 4);
  } // pixdim[0..7]
  swap32(108); // vox_offset
  swap32(112); // scl_slope
  swap32(116); // scl_inter
  swap32(124); // cal_max
  swap32(128); // cal_min
  swap32(132); // slice_duration
  swap32(136); // toffset
  for (let i = 0; i < 5; i++) {
    swap32(256 + i * 4);
  } // quatern + qoffset
  for (let i = 0; i < 12; i++) {
    swap32(280 + i * 4);
  } // srow_x/y/z

  // Pixel data
  const pixStrides = {
    [NIFTI1.TYPE_UINT16]: 2,
    [NIFTI1.TYPE_INT16]: 2,
    [NIFTI1.TYPE_UINT32]: 4,
    [NIFTI1.TYPE_INT32]: 4,
    [NIFTI1.TYPE_FLOAT32]: 4,
    [NIFTI1.TYPE_COMPLEX64]: 4,
    [NIFTI1.TYPE_FLOAT64]: 8,
  };
  const stride = pixStrides[opts.datatypeCode] ?? 1;
  if (stride > 1) {
    const pixStart = 352; // header 348 + extension 4
    for (let i = pixStart; i < out.length; i += stride) {
      for (let a = 0, b = stride - 1; a < b; a++, b--) {
        const t = out[i + a];
        out[i + a] = out[i + b];
        out[i + b] = t;
      }
    }
  }

  return out.buffer;
}

function gzipBuffer(buffer) {
  const compressed = gzip(new Uint8Array(buffer));
  return compressed.buffer.slice(
    compressed.byteOffset,
    compressed.byteOffset + compressed.byteLength
  );
}

describe('NiftiImage', () => {
  it('should throw if argument is not an ArrayBuffer', () => {
    expect(() => new NiftiImage(null)).to.throw();
    expect(() => new NiftiImage('string')).to.throw();
    expect(() => new NiftiImage(42)).to.throw();
  });

  it('should throw for non-NIFTI data', () => {
    const garbage = new ArrayBuffer(400);
    new Uint8Array(garbage).fill(0xaa);
    expect(() => new NiftiImage(garbage)).to.throw();
  });

  it('should parse a valid NIFTI-1 header', () => {
    const width = 4,
      height = 4,
      numSlices = 2;
    const pixels = new Uint8Array(width * height * numSlices);
    pixels.fill(128);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: pixels.buffer,
    });
    const img = new NiftiImage(buf);
    expect(img.getWidth()).to.equal(4);
    expect(img.getHeight()).to.equal(4);
    expect(img.getNumberOfSlices()).to.equal(2);
    expect(img.getNumberOfTimePoints()).to.equal(1);
  });

  it('should render a single slice and return correct dimensions [TYPE_UINT8]', () => {
    const width = 8,
      height = 8;
    const pixels = new Uint8Array(width * height);
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = i;
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: pixels.buffer,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    expect(result.slice).to.equal(0);
    expect(result.timePoint).to.equal(0);
    expect(result.width).to.equal(8);
    expect(result.height).to.equal(8);
    expect(result.pixels).to.be.instanceOf(ArrayBuffer);
    expect(result.pixels.byteLength).to.equal(8 * 8 * 4);
    expect(result.windowLevel).to.be.instanceOf(WindowLevel);
  });

  it('should produce fully-black output for all-zero data with explicit W/L [TYPE_UINT8]', () => {
    const width = 4,
      height = 4;
    const pixels = new Uint8Array(width * height).fill(0);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: pixels.buffer,
    });
    const img = new NiftiImage(buf);
    // W=255, L=127.5 -> lo=0, hi=255. Value 0 maps to t=0 -> black.
    const result = img.render({ slice: 0, windowLevel: new WindowLevel(255, 127.5) });
    const rgba = new Uint8Array(result.pixels);
    for (let i = 0; i < rgba.length; i += 4) {
      expect(rgba[i]).to.equal(0);
      expect(rgba[i + 1]).to.equal(0);
      expect(rgba[i + 2]).to.equal(0);
      expect(rgba[i + 3]).to.equal(255);
    }
  });

  it('should render an int16 slice [TYPE_INT16]', () => {
    const width = 4,
      height = 4;
    const raw = new Int16Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = (i - 8) * 100;
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_INT16,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    expect(result.pixels.byteLength).to.equal(width * height * 4);
    expect(result.windowLevel.getWindow()).to.be.a('number');
  });

  it('should render a float32 slice [TYPE_FLOAT32]', () => {
    const width = 4,
      height = 4;
    const raw = new Float32Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = i * 0.5;
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_FLOAT32,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    expect(result.pixels.byteLength).to.equal(width * height * 4);
  });

  it('should apply scaling when scl_slope != 0 and != 1', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height).fill(10);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      sclSlope: 2,
      sclInter: 100,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    // All values are 10*2+100=120. Auto W/L will try min=max which becomes [119,121]
    // Every pixel normalized to ~0.5 -> grayscale ~128
    const rgba = new Uint8Array(result.pixels);
    // Check all pixels have same value (uniform image)
    const r0 = rgba[0];
    for (let i = 0; i < rgba.length; i += 4) {
      expect(rgba[i]).to.equal(r0);
    }
  });

  it('should skip scaling when scl_slope == 0', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = i * 4;
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      sclSlope: 0,
      sclInter: 100,
    });
    const img = new NiftiImage(buf);
    // Rendering should not throw; scaling is skipped
    const result = img.render({ slice: 0 });
    expect(result.pixels).to.be.instanceOf(ArrayBuffer);
  });

  it('should extract the correct slice from multi-slice data', () => {
    const width = 4,
      height = 4,
      numSlices = 3;
    const voxels = width * height;
    const raw = new Uint8Array(voxels * numSlices);
    // Slice 0: all 0, slice 1: all 128, slice 2: all 255
    for (let i = 0; i < voxels; i++) {
      raw[i] = 0;
    }
    for (let i = 0; i < voxels; i++) {
      raw[voxels + i] = 128;
    }
    for (let i = 0; i < voxels; i++) {
      raw[voxels * 2 + i] = 255;
    }

    const buf = createNiftiBuffer({
      width,
      height,
      numSlices,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      sclSlope: 0,
    });
    const img = new NiftiImage(buf);

    // Render slice 2 with W=255, L=127.5 -> lo=0, hi=255. Value 255 -> t=1 -> white.
    const result = img.render({
      slice: 2,
      windowLevel: new WindowLevel(255, 127.5),
    });
    const rgba = new Uint8Array(result.pixels);
    // All pixels should be white (255) because value=255 maps to t=1
    for (let i = 0; i < rgba.length; i += 4) {
      expect(rgba[i]).to.equal(255);
    }
  });

  it('should throw when windowLevel is not an instance of WindowLevel', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height).fill(128);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    expect(() =>
      img.render({ slice: 0, windowLevel: { getWindow: () => 255, getLevel: () => 128 } })
    ).to.throw(/opts.windowLevel must be an instance of WindowLevel/);
    expect(() => img.render({ slice: 0, windowLevel: 42 })).to.throw();
  });

  it('should throw for out-of-range slice index', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height * 2).fill(0);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 2,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    expect(() => img.render({ slice: 5 })).to.throw();
  });

  it('should use user-provided window/level', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = i * 4;
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      sclSlope: 0,
    });
    const img = new NiftiImage(buf);
    const wl = new WindowLevel(256, 128);
    const result = img.render({ slice: 0, windowLevel: wl });
    expect(result.windowLevel).to.equal(wl);
  });

  it('should calculate histograms when requested', () => {
    const width = 8,
      height = 8;
    const raw = new Uint8Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = i;
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      sclSlope: 0,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0, calculateHistograms: true });
    expect(result.histograms).to.be.an('array').with.length(1);
    const hist = result.histograms[0];
    expect(hist.getMin()).to.be.a('number');
    expect(hist.getMax()).to.be.a('number');
    expect(hist.getData()).to.have.length(256);
  });

  it('should not calculate histograms by default', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height).fill(100);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    expect(result.histograms).to.be.undefined;
  });

  it('should render RGB24 slice with correct RGBA output [TYPE_RGB24]', () => {
    const width = 4,
      height = 4;
    const numPixels = width * height;
    const raw = new Uint8Array(numPixels * 3);
    for (let i = 0; i < numPixels; i++) {
      raw[i * 3] = 255; // R
      raw[i * 3 + 1] = 128; // G
      raw[i * 3 + 2] = 0; // B
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_RGB24,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    expect(result.pixels.byteLength).to.equal(numPixels * 4);
    const rgba = new Uint8Array(result.pixels);
    for (let i = 0; i < numPixels; i++) {
      expect(rgba[i * 4]).to.equal(255);
      expect(rgba[i * 4 + 1]).to.equal(128);
      expect(rgba[i * 4 + 2]).to.equal(0);
      expect(rgba[i * 4 + 3]).to.equal(255);
    }
  });

  it('should use percentile-based windowing (ignoring cal_min/cal_max)', () => {
    // 16 voxels with values 10..25; cal_min/cal_max are set but must be ignored
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = 10 + i;
    } // 10..25
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      sclSlope: 0,
      calMin: 50,
      calMax: 200,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    // percentile 0.35% of n=16 clips 0 at each end -> min=10, max=25
    expect(result.windowLevel.getWindow()).to.be.closeTo(15, 0.1);
    expect(result.windowLevel.getLevel()).to.be.closeTo(17.5, 0.1);
  });

  it('should compute percentile window when cal_min and cal_max are both zero', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = 10 + i;
    } // 10..25
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      sclSlope: 0,
      calMin: 0,
      calMax: 0,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    // percentile 0.35% of n=16 clips 0 at each end -> min=10, max=25 -> window=15, level=17.5
    expect(result.windowLevel.getWindow()).to.be.closeTo(15, 0.1);
    expect(result.windowLevel.getLevel()).to.be.closeTo(17.5, 0.1);
  });

  it('should render a specific time point via timePoint option', () => {
    const width = 4,
      height = 4,
      numSlices = 2,
      numTimePoints = 2;
    const voxels = width * height;
    const raw = new Uint8Array(voxels * numSlices * numTimePoints);
    // vol0: all 0; vol1: all 200
    for (let i = 0; i < voxels * numSlices; i++) {
      raw[i] = 0;
    }
    for (let i = 0; i < voxels * numSlices; i++) {
      raw[voxels * numSlices + i] = 200;
    }

    const buf = createNiftiBuffer({
      width,
      height,
      numSlices,
      numTimePoints,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      sclSlope: 0,
    });
    const img = new NiftiImage(buf);
    expect(img.getNumberOfTimePoints()).to.equal(2);
    const result = img.render({ slice: 0, timePoint: 1, windowLevel: new WindowLevel(400, 100) });
    expect(result.timePoint).to.equal(1);
    expect(result.pixels).to.be.instanceOf(ArrayBuffer);
  });

  it('should throw for out-of-range timePoint index', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height * 2).fill(0);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 2,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    expect(() => img.render({ slice: 0, timePoint: 5 })).to.throw();
  });

  it('should expose correct getNumberOfTimePoints', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height * 3).fill(0);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 3,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    expect(img.getNumberOfTimePoints()).to.equal(3);
  });

  it('should render a specific timePoint', () => {
    const width = 4,
      height = 4,
      numSlices = 1,
      numTimePoints = 3;
    const voxels = width * height;
    const raw = new Uint8Array(voxels * numSlices * numTimePoints);
    // tp0: all 0, tp1: all 100, tp2: all 200
    raw.fill(0, 0, voxels);
    raw.fill(100, voxels, voxels * 2);
    raw.fill(200, voxels * 2, voxels * 3);

    const buf = createNiftiBuffer({
      width,
      height,
      numSlices,
      numTimePoints,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      sclSlope: 0,
    });
    const img = new NiftiImage(buf);
    const result = img.render({
      slice: 0,
      timePoint: 2,
      windowLevel: new WindowLevel(400, 200),
    });
    expect(result.timePoint).to.equal(2);
    expect(result.pixels).to.be.instanceOf(ArrayBuffer);
  });

  it('timePoint option is used when specified', () => {
    const width = 4,
      height = 4,
      numSlices = 1,
      numTimePoints = 3;
    const voxels = width * height;
    const raw = new Uint8Array(voxels * numSlices * numTimePoints).fill(50);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices,
      numTimePoints,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      sclSlope: 0,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0, timePoint: 2 });
    expect(result.timePoint).to.equal(2);
  });

  it('should throw for out-of-range timePoint', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height * 2).fill(0);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 2,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    expect(() => img.render({ slice: 0, timePoint: 5 })).to.throw();
  });

  it('should return a description string', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height).fill(0);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const str = img.toString();
    expect(str).to.be.a('string');
    expect(str.length).to.be.greaterThan(0);
  });

  it('should decompress a gzip-compressed NIFTI file', () => {
    const width = 4,
      height = 4;
    const pixels = new Uint8Array(width * height).fill(100);
    const plain = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: pixels.buffer,
      sclSlope: 0,
    });
    const compressed = gzipBuffer(plain);
    const img = new NiftiImage(compressed);
    expect(img.getWidth()).to.equal(width);
    expect(img.getHeight()).to.equal(height);
  });

  it('should render an int8 slice [TYPE_INT8]', () => {
    const width = 4,
      height = 4;
    const raw = new Int8Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = i - 8;
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_INT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    expect(result.pixels.byteLength).to.equal(width * height * 4);
  });

  it('should render a uint16 slice [TYPE_UINT16]', () => {
    const width = 4,
      height = 4;
    const raw = new Uint16Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = i * 100;
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT16,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    expect(result.pixels.byteLength).to.equal(width * height * 4);
  });

  it('should render a uint32 slice [TYPE_UINT32]', () => {
    const width = 4,
      height = 4;
    const raw = new Uint32Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = i * 1000;
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT32,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    expect(result.pixels.byteLength).to.equal(width * height * 4);
  });

  it('should render an int32 slice [TYPE_INT32]', () => {
    const width = 4,
      height = 4;
    const raw = new Int32Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = (i - 8) * 1000;
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_INT32,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    expect(result.pixels.byteLength).to.equal(width * height * 4);
  });

  it('should render a float64 slice [TYPE_FLOAT64]', () => {
    const width = 4,
      height = 4;
    const raw = new Float64Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = i * 0.25;
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_FLOAT64,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    expect(result.pixels.byteLength).to.equal(width * height * 4);
  });

  it('should render COMPLEX64 as voxel magnitudes [TYPE_COMPLEX64]', () => {
    const width = 4,
      height = 4;
    const numPixels = width * height;
    // Interleaved (real, imag) float32 pairs
    const raw = new Float32Array(numPixels * 2);
    for (let i = 0; i < numPixels; i++) {
      raw[i * 2] = i * 3; // real
      raw[i * 2 + 1] = i * 4; // imag — magnitude = i * 5
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_COMPLEX64,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0 });
    expect(result.pixels.byteLength).to.equal(numPixels * 4);
  });

  it('should be a no-op for 1-byte types [TYPE_UINT8]', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = i;
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const before = new Uint8Array(img.imageData.slice(0));
    img._byteSwapImageData();
    const after = new Uint8Array(img.imageData);
    // All bytes should be unchanged for 1-byte type
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).to.equal(before[i]);
    }
  });

  it('should swap 2-byte pairs for UINT16 (stride=2) [TYPE_UINT16]', () => {
    const width = 2,
      height = 2;
    // Create UINT16 image: values [0x0102, 0x0304, 0x0506, 0x0708]
    const raw = new Uint16Array([0x0102, 0x0304, 0x0506, 0x0708]);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT16,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    img._byteSwapImageData();
    const swapped = new Uint8Array(img.imageData);
    // First element was 0x0102 LE [0x02, 0x01]; after swap -> [0x01, 0x02]
    expect(swapped[0]).to.equal(0x01);
    expect(swapped[1]).to.equal(0x02);
  });

  it('should swap 4-byte groups for FLOAT32 (stride=4) [TYPE_FLOAT32]', () => {
    const width = 2,
      height = 2;
    const raw = new Float32Array([1.0, 2.0, 3.0, 4.0]);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_FLOAT32,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const before = new Uint8Array(img.imageData.slice(0));
    img._byteSwapImageData();
    const after = new Uint8Array(img.imageData);
    // Each 4-byte group should be reversed
    for (let g = 0; g < before.length / 4; g++) {
      expect(after[g * 4]).to.equal(before[g * 4 + 3]);
      expect(after[g * 4 + 1]).to.equal(before[g * 4 + 2]);
      expect(after[g * 4 + 2]).to.equal(before[g * 4 + 1]);
      expect(after[g * 4 + 3]).to.equal(before[g * 4]);
    }
  });

  it('should swap 8-byte groups for FLOAT64 (stride=8) [TYPE_FLOAT64]', () => {
    const width = 2,
      height = 2;
    const raw = new Float64Array([1.0, 2.0, 3.0, 4.0]);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_FLOAT64,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const before = new Uint8Array(img.imageData.slice(0));
    img._byteSwapImageData();
    const after = new Uint8Array(img.imageData);
    for (let g = 0; g < before.length / 8; g++) {
      for (let b = 0; b < 8; b++) {
        expect(after[g * 8 + b]).to.equal(before[g * 8 + (7 - b)]);
      }
    }
  });

  it('should be a no-op for unknown dtypes [TYPE_UNKNOWN]', () => {
    const width = 2,
      height = 2;
    const raw = new Uint8Array(width * height).fill(42);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    img.header.datatypeCode = 9999; // unknown
    const before = new Uint8Array(img.imageData.slice(0));
    img._byteSwapImageData();
    const after = new Uint8Array(img.imageData);
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).to.equal(before[i]);
    }
  });

  it('should return the cached result on a second call', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height).fill(50);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const first = img._parseAffine();
    const second = img._parseAffine();
    expect(second).to.equal(first); // same object reference (cached)
  });

  it('should fall back to pixDims spacing when affine is null', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height).fill(50);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      pixDims: [2, 3, 4],
    });
    const img = new NiftiImage(buf);
    img.header.affine = null;
    const parsed = img._parseAffine();
    expect(parsed.origin).to.deep.equal([0, 0, 0]);
    expect(parsed.orientation).to.deep.equal([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(parsed.spacing[0]).to.be.closeTo(2, 0.001);
    expect(parsed.spacing[1]).to.be.closeTo(3, 0.001);
    expect(parsed.spacing[2]).to.be.closeTo(4, 0.001);
  });

  it('should guard degenerate (zero-norm) affine columns', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height).fill(50);
    // srow_x[0]=0, srow_y[0]=0, srow_z[0]=0 -> column-0 norm = 0 -> guard fires
    // srow_x[1]=0, srow_y[1]=0, srow_z[1]=0 -> column-1 norm = 0 -> guard fires
    // srow_z[2]=2 -> column-2 norm = 2 (fine)
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      sclSlope: 0,
      sform: {
        rowX: [0, 0, 2, 10],
        rowY: [0, 0, 0, 20],
        rowZ: [0, 0, 0, 30],
      },
    });
    const img = new NiftiImage(buf);
    const parsed = img._parseAffine();
    // spacing[0] and spacing[1] were 0 -> clamped to 1
    expect(parsed.spacing[0]).to.equal(1);
    expect(parsed.spacing[1]).to.equal(1);
  });

  it('should return no flips when affine is null', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height).fill(50);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    img.header.affine = null;
    const { flipX, flipY } = img._getOrientationFlips();
    expect(flipX).to.be.false;
    expect(flipY).to.be.false;
  });

  it('should apply flipX and flipY from a LAS sform', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = i * 4;
    }
    // srow_x[0]=-2 -> orientation[0] = -1 < 0 -> flipX
    // srow_y[1]=+2 -> orientation[4] = +1 > 0 -> flipY
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      sclSlope: 0,
      sform: {
        rowX: [-2, 0, 0, 0],
        rowY: [0, 2, 0, 0],
        rowZ: [0, 0, 2, 0],
      },
    });
    const img = new NiftiImage(buf);
    const { flipX, flipY } = img._getOrientationFlips();
    expect(flipX).to.be.true;
    expect(flipY).to.be.true;
    // Rendering should still work
    const result = img.render({ slice: 0, windowLevel: new WindowLevel(255, 127.5) });
    expect(result.pixels.byteLength).to.equal(width * height * 4);
  });

  it('should return default W/L for empty data', () => {
    const width = 2,
      height = 2;
    const raw = new Uint8Array(width * height).fill(100);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const wl = img._calculateWindowLevel(new Float64Array(0));
    expect(wl.getWindow()).to.equal(255);
    expect(wl.getLevel()).to.be.closeTo(127.5, 0.001);
  });

  it('should substitute finite bounds when pixel data contains only NaN', () => {
    const width = 4,
      height = 4;
    const raw = new Float32Array(width * height).fill(NaN);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_FLOAT32,
      pixelData: raw.buffer,
      sclSlope: 0,
    });
    const img = new NiftiImage(buf);
    // Should not throw; !isFinite guards replace NaN bounds
    const result = img.render({ slice: 0 });
    expect(result.pixels.byteLength).to.equal(width * height * 4);
    expect(result.windowLevel.getWindow()).to.be.a('number');
  });

  it('should handle non-finite pixel values without throwing', () => {
    const width = 4,
      height = 4;
    const raw = new Float32Array(width * height).fill(NaN);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_FLOAT32,
      pixelData: raw.buffer,
      sclSlope: 0,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0, calculateHistograms: true });
    expect(result.histograms).to.be.an('array').with.length(1);
    expect(result.histograms[0].getData()).to.have.length(256);
  });

  it('should detect big-endian NIFTI and produce correct pixels after byte-swap', () => {
    const width = 4,
      height = 4;
    // Use UINT16 so the byte-swap changes the byte order meaningfully
    const raw = new Uint16Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = (i + 1) * 50;
    }
    const buf = createBigEndianNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT16,
      pixelData: raw.buffer,
      sclSlope: 0,
    });
    const img = new NiftiImage(buf);
    expect(img.header.littleEndian).to.be.false;
    expect(img.getWidth()).to.equal(width);
    expect(img.getHeight()).to.equal(height);
    const result = img.render({ slice: 0 });
    expect(result.pixels.byteLength).to.equal(width * height * 4);
  });

  it('should handle uniform data without divide-by-zero', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height).fill(77);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
      sclSlope: 0,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0, calculateHistograms: true });
    const hist = result.histograms[0];
    expect(hist.getMin()).to.be.below(hist.getMax());
    expect(hist.getData()).to.have.length(256);
  });

  it('should swap 4-byte groups for COMPLEX64 (stride=4) [TYPE_COMPLEX64]', () => {
    const width = 2,
      height = 2;
    // Two complex values: (1+2i) and (3+4i) stored as [1.0, 2.0, 3.0, 4.0] float32
    const raw = new Float32Array([1.0, 2.0, 3.0, 4.0]);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_COMPLEX64,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const before = new Uint8Array(img.imageData.slice(0));
    img._byteSwapImageData();
    const after = new Uint8Array(img.imageData);
    // Each 4-byte float32 component should be individually reversed
    for (let g = 0; g < before.length / 4; g++) {
      expect(after[g * 4]).to.equal(before[g * 4 + 3]);
      expect(after[g * 4 + 1]).to.equal(before[g * 4 + 2]);
      expect(after[g * 4 + 2]).to.equal(before[g * 4 + 1]);
      expect(after[g * 4 + 3]).to.equal(before[g * 4]);
    }
  });

  it('should calculate histograms for an RGB24 image when requested', () => {
    const width = 4,
      height = 4;
    const numPixels = width * height;
    const raw = new Uint8Array(numPixels * 3);
    for (let i = 0; i < numPixels; i++) {
      raw[i * 3] = i * 4; // R
      raw[i * 3 + 1] = 255 - i * 4; // G
      raw[i * 3 + 2] = 128; // B
    }
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_RGB24,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const result = img.render({ slice: 0, calculateHistograms: true });
    expect(result.pixels.byteLength).to.equal(numPixels * 4);
    expect(result.histograms).to.be.an('array').with.length(1);
    expect(result.histograms[0].getData()).to.have.length(256);
    expect(result.histograms[0].getCount()).to.equal(numPixels * 3);
  });

  it('should apply default options when render is called with no arguments', () => {
    const width = 4,
      height = 4;
    const raw = new Uint8Array(width * height).fill(128);
    const buf = createNiftiBuffer({
      width,
      height,
      numSlices: 1,
      numTimePoints: 1,
      datatypeCode: NIFTI1.TYPE_UINT8,
      pixelData: raw.buffer,
    });
    const img = new NiftiImage(buf);
    const result = img.render();
    expect(result.slice).to.equal(0);
    expect(result.timePoint).to.equal(0);
    expect(result.width).to.equal(width);
    expect(result.height).to.equal(height);
    expect(result.pixels).to.be.instanceOf(ArrayBuffer);
    expect(result.pixels.byteLength).to.equal(width * height * 4);
    expect(result.windowLevel).to.be.instanceOf(WindowLevel);
    expect(result.histograms).to.be.undefined;
  });
});
