import * as nifti from 'nifti-reader-js';

import ColorPalette from './ColorPalette.js';
import { StandardColorPalette } from './Constants.js';
import Histogram from './Histogram.js';
import WindowLevel from './WindowLevel.js';

class NiftiImage {
  /**
   * Creates an instance of NiftiImage.
   * @constructor
   * @param {ArrayBuffer} arrayBuffer - The NIFTI file contents as an ArrayBuffer.
   */
  constructor(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      throw new Error('arrayBuffer must be an instance of ArrayBuffer');
    }

    let data = arrayBuffer;

    // Decompress if gzip-compressed NIFTI
    if (nifti.isCompressed(data)) {
      data = nifti.decompress(data);
    }

    if (!nifti.isNIFTI(data)) {
      throw new Error('Data does not appear to be a valid NIFTI file');
    }

    this.header = nifti.readHeader(data);
    if (!this.header) {
      throw new Error('Failed to read NIFTI header');
    }

    this.imageData = nifti.readImage(this.header, data);
    if (!this.imageData) {
      throw new Error('Failed to read NIFTI image data');
    }

    if (this.header.littleEndian === false) {
      this._byteSwapImageData();
    }
  }

  /**
   * Gets the image width in voxels.
   * @method
   * @returns {number} Image width.
   */
  getWidth() {
    return this.header.dims[1];
  }

  /**
   * Gets the image height in voxels.
   * @method
   * @returns {number} Image height.
   */
  getHeight() {
    return this.header.dims[2];
  }

  /**
   * Gets the number of slices (z-dimension).
   * @method
   * @returns {number} Number of slices.
   */
  getNumberOfSlices() {
    return this.header.dims[0] >= 3 ? this.header.dims[3] || 1 : 1;
  }

  /**
   * Gets the number of time points (4th dimension).
   * For fMRI data this equals the number of acquired volumes over time.
   * @method
   * @returns {number} Number of time points.
   */
  getNumberOfTimePoints() {
    return this.header.dims[0] >= 4 ? this.header.dims[4] || 1 : 1;
  }

  /**
   * @typedef {Object} RenderingResult
   * @property {number} slice - Rendered slice index.
   * @property {number} timePoint - Rendered time-point index.
   * @property {number} width - Rendered width.
   * @property {number} height - Rendered height.
   * @property {ArrayBuffer} pixels - Rendered pixels RGBA array buffer.
   * This format was chosen because it is suitable for rendering in a canvas object.
   * @property {WindowLevel} windowLevel - Window/level used to render the pixels.
   * @property {Array<Histogram>} [histograms] - Array of calculated per-channel histograms.
   * Histograms are calculated using the original pixel values.
   */

  /**
   * Renders a single slice to RGBA pixels.
   * @method
   * @param {Object} [opts] - Rendering options.
   * @param {number} [opts.slice] - Slice index to render.
   * @param {number} [opts.timePoint] - Time-point index to render (4th dimension, 0-based).
   * @param {WindowLevel} [opts.windowLevel] - User provided window/level.
   * @param {boolean} [opts.calculateHistograms] - Flag to indicate whether to calculate histograms.
   * @param {string} [opts.colorPalette] - Color palette to use.
   * @returns {RenderingResult} Rendering result object.
   * @throws {Error} If slice or time-point index is out of range or
   * optionally provided window level is not of type WindowLevel.
   */
  render(opts) {
    const options = opts ?? {};
    const slice = options.slice !== undefined ? options.slice : 0;
    const timePoint = options.timePoint !== undefined ? options.timePoint : 0;
    const calculateHistograms = options.calculateHistograms === true;
    const colorPaletteName = options.colorPalette || StandardColorPalette.Grayscale;

    const numSlices = this.getNumberOfSlices();
    const numTimePoints = this.getNumberOfTimePoints();
    const width = this.getWidth();
    const height = this.getHeight();

    if (slice < 0 || slice >= numSlices) {
      throw new Error(`Slice index ${slice} is out of range [0, ${numSlices - 1}]`);
    }
    if (timePoint < 0 || timePoint >= numTimePoints) {
      throw new Error(`Time-point index ${timePoint} is out of range [0, ${numTimePoints - 1}]`);
    }
    if (options.windowLevel !== undefined && !(options.windowLevel instanceof WindowLevel)) {
      throw new Error('opts.windowLevel must be an instance of WindowLevel');
    }

    // Check if the image is RGB24 (interleaved RGB)
    const isRgb = this.header.datatypeCode === nifti.NIFTI1.TYPE_RGB24;

    // Extract raw typed slice data
    const rawSliceData = this._extractSlice(slice, timePoint, isRgb);

    // Apply voxel scaling (scl_slope / scl_inter) - skip for RGB data
    const scaledData = isRgb ? rawSliceData : this._applyScaling(rawSliceData);

    // Determine window/level
    const windowLevel = options.windowLevel
      ? options.windowLevel
      : this._calculateWindowLevel(scaledData);

    // Calculate histograms if requested
    let histograms;
    if (calculateHistograms) {
      histograms = [this._calculateHistogram(scaledData)];
    }

    // Determine axis flips for correct anatomical display
    const { flipX, flipY } = this._getOrientationFlips();

    // Build RGBA output
    const colorPalette = new ColorPalette(colorPaletteName);
    const pixels = this._toRgba(scaledData, windowLevel, colorPalette, isRgb, flipX, flipY);

    return {
      slice,
      timePoint,
      width,
      height,
      pixels,
      windowLevel,
      histograms,
    };
  }

  /**
   * Gets the NIFTI image description.
   * @method
   * @returns {string} NIFTI image description.
   */
  toString() {
    return (
      `NiftiImage [${this.getWidth()}x${this.getHeight()}x${this.getNumberOfSlices()} ` +
      `timePoints:${this.getNumberOfTimePoints()} dtype:${this.header.datatypeCode}]`
    );
  }

  /**
   * Decomposes the affine matrix into origin, spacing, and direction cosines.
   * Mirrors cornerstone3D's parseAffineMatrix, adapted to plain JavaScript.
   *
   * Caches the result on first call.
   *
   * Fallback (no valid affine): origin = [0,0,0], spacing from pixDims,
   * orientation = identity.
   * @method
   * @private
   * @returns {Object} Parsed affine components (origin, spacing, orientation).
   */
  _parseAffine() {
    if (this._parsedAffine) {
      return this._parsedAffine;
    }

    const affine = this.header.affine;

    if (!affine || affine[0][0] == null) {
      // No valid qform/sform - use pixDims as spacing, identity orientation
      const px = this.header.pixDims;
      const spacing = [Math.abs(px[1]) || 1, Math.abs(px[2]) || 1, Math.abs(px[3]) || 1];
      this._parsedAffine = {
        origin: [0, 0, 0],
        spacing,
        orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      };

      return this._parsedAffine;
    }

    // Origin = 4th column of the affine (translation vector)
    const origin = [affine[0][3], affine[1][3], affine[2][3]];

    // Spacing = L2-norm of each column of the 3x3 rotation-scale block
    const spacing = [
      Math.sqrt(affine[0][0] ** 2 + affine[1][0] ** 2 + affine[2][0] ** 2),
      Math.sqrt(affine[0][1] ** 2 + affine[1][1] ** 2 + affine[2][1] ** 2),
      Math.sqrt(affine[0][2] ** 2 + affine[1][2] ** 2 + affine[2][2] ** 2),
    ];
    // Guard against degenerate affines
    if (spacing[0] === 0) {
      spacing[0] = 1;
    }
    if (spacing[1] === 0) {
      spacing[1] = 1;
    }
    if (spacing[2] === 0) {
      spacing[2] = 1;
    }

    // Orientation = column-normalised direction cosines, row-major
    // orientation[3i + j] = affine[i][j] / spacing[j]
    const orientation = [
      affine[0][0] / spacing[0],
      affine[0][1] / spacing[1],
      affine[0][2] / spacing[2],
      affine[1][0] / spacing[0],
      affine[1][1] / spacing[1],
      affine[1][2] / spacing[2],
      affine[2][0] / spacing[0],
      affine[2][1] / spacing[1],
      affine[2][2] / spacing[2],
    ];

    this._parsedAffine = { origin, spacing, orientation };

    return this._parsedAffine;
  }

  /**
   * Byte-swaps the raw image data buffer in-place for big-endian files.
   * nifti-reader-js correctly identifies endianness but does not swap image bytes.
   * @method
   * @private
   */
  _byteSwapImageData() {
    const dtCode = this.header.datatypeCode;
    // 1-byte types need no swapping
    if (
      dtCode === nifti.NIFTI1.TYPE_UINT8 ||
      dtCode === nifti.NIFTI1.TYPE_INT8 ||
      dtCode === nifti.NIFTI1.TYPE_RGB24
    ) {
      return;
    }
    const bytes = new Uint8Array(this.imageData);
    let stride;
    if (dtCode === nifti.NIFTI1.TYPE_UINT16 || dtCode === nifti.NIFTI1.TYPE_INT16) {
      stride = 2;
    } else if (
      dtCode === nifti.NIFTI1.TYPE_UINT32 ||
      dtCode === nifti.NIFTI1.TYPE_INT32 ||
      dtCode === nifti.NIFTI1.TYPE_FLOAT32 ||
      dtCode === nifti.NIFTI1.TYPE_COMPLEX64
    ) {
      stride = 4;
    } else if (dtCode === nifti.NIFTI1.TYPE_FLOAT64) {
      stride = 8;
    } else {
      return; // unknown - leave as-is
    }
    for (let i = 0; i < bytes.length; i += stride) {
      let lo = 0,
        hi = stride - 1;
      while (lo < hi) {
        const tmp = bytes[i + lo];
        bytes[i + lo] = bytes[i + hi];
        bytes[i + hi] = tmp;
        lo++;
        hi--;
      }
    }
  }

  /**
   * Returns the full typed array for the image data, wrapping the raw ArrayBuffer.
   * @method
   * @private
   * @returns {TypedArray} The typed array matching the NIFTI datatype.
   */
  _getTypedData() {
    const dtCode = this.header.datatypeCode;

    // RGB24 is stored as Uint8
    if (dtCode === nifti.NIFTI1.TYPE_RGB24) {
      return new Uint8Array(this.imageData);
    }

    switch (dtCode) {
      case nifti.NIFTI1.TYPE_UINT8:
        return new Uint8Array(this.imageData);
      case nifti.NIFTI1.TYPE_INT8:
        return new Int8Array(this.imageData);
      case nifti.NIFTI1.TYPE_UINT16:
        return new Uint16Array(this.imageData);
      case nifti.NIFTI1.TYPE_INT16:
        return new Int16Array(this.imageData);
      case nifti.NIFTI1.TYPE_UINT32:
        return new Uint32Array(this.imageData);
      case nifti.NIFTI1.TYPE_INT32:
        return new Int32Array(this.imageData);
      case nifti.NIFTI1.TYPE_FLOAT32:
        return new Float32Array(this.imageData);
      case nifti.NIFTI1.TYPE_FLOAT64:
        return new Float64Array(this.imageData);
      case nifti.NIFTI1.TYPE_COMPLEX64: {
        // Stored as interleaved (real, imag) float32 pairs; return magnitudes.
        const pairs = new Float32Array(this.imageData);
        const mags = new Float32Array(pairs.length / 2);
        for (let i = 0; i < mags.length; i++) {
          const re = pairs[i * 2];
          const im = pairs[i * 2 + 1];
          mags[i] = Math.sqrt(re * re + im * im);
        }
        return mags;
      }
      default:
        throw new Error(`Unsupported NIFTI datatype code: ${dtCode}`);
    }
  }

  /**
   * Extracts the voxel data for the requested slice.
   * For RGB24, each voxel has 3 bytes (R,G,B). Others are 1 value per voxel.
   * @method
   * @private
   * @param {number} slice - Slice index.
   * @param {number} timePoint - Time-point index.
   * @param {boolean} isRgb - Whether this is RGB24.
   * @returns {TypedArray} Voxel data for the slice.
   */
  _extractSlice(slice, timePoint, isRgb) {
    const typed = this._getTypedData();
    const width = this.getWidth();
    const height = this.getHeight();
    const sliceVoxels = width * height;

    if (isRgb) {
      // Each voxel = 3 bytes
      const sliceOffset = (timePoint * this.getNumberOfSlices() + slice) * sliceVoxels * 3;
      return typed.subarray(sliceOffset, sliceOffset + sliceVoxels * 3);
    }

    const sliceOffset = (timePoint * this.getNumberOfSlices() + slice) * sliceVoxels;
    return typed.subarray(sliceOffset, sliceOffset + sliceVoxels);
  }

  /**
   * Applies NIFTI voxel scaling: value = raw * scl_slope + scl_inter.
   * Skipped when scl_slope == 0 (per NIFTI spec) or effectively an identity (slope=1, inter=0).
   * @method
   * @private
   * @param {TypedArray} data - Input slice data.
   * @returns {Float64Array|TypedArray} Scaled data (Float64Array if scaling applied, otherwise original).
   */
  _applyScaling(data) {
    const slope = this.header.scl_slope;
    const inter = this.header.scl_inter || 0;

    // Per NIFTI spec: if slope == 0 (or unset/NaN), ignore scaling
    if (!slope) {
      return data;
    }
    // Identity transform (no-op)
    if (slope === 1 && inter === 0) {
      return data;
    }

    const scaled = new Float64Array(data.length);
    for (let i = 0; i < data.length; i++) {
      scaled[i] = data[i] * slope + inter;
    }

    return scaled;
  }

  /**
   * Calculates window/level for the given voxel data.
   * Mirrors ImageJ "Enhance Contrast saturated=0.35%": clips the lowest and
   * highest 0.35% of pixel values to derive the display range.
   * @method
   * @private
   * @param {TypedArray|Float64Array} data - Slice data.
   * @returns {WindowLevel} Computed WindowLevel.
   */
  _calculateWindowLevel(data) {
    const n = data.length;
    if (n === 0) {
      return new WindowLevel(255, 127.5, 'Auto');
    }

    const SATURATE = 0.0035;
    const NUM_BINS = 4096;

    // Pass 1: find the finite data range
    let dataMin = Infinity;
    let dataMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = data[i];
      if (!isFinite(v)) {
        continue;
      }
      if (v < dataMin) {
        dataMin = v;
      }
      if (v > dataMax) {
        dataMax = v;
      }
    }
    if (!isFinite(dataMin)) {
      dataMin = 0;
    }
    if (!isFinite(dataMax)) {
      dataMax = 255;
    }

    // Uniform or degenerate data: return a window of width 2 centred on the value
    if (dataMin >= dataMax) {
      return new WindowLevel(2, dataMin, 'Auto');
    }

    // Pass 2: build histogram over finite values only
    const bins = new Int32Array(NUM_BINS);
    const range = dataMax - dataMin;
    let validCount = 0;
    for (let i = 0; i < n; i++) {
      const v = data[i];
      if (!isFinite(v)) {
        continue;
      }
      bins[Math.min(NUM_BINS - 1, Math.floor(((v - dataMin) / range) * NUM_BINS))]++;
      validCount++;
    }

    if (validCount === 0) {
      return new WindowLevel(255, 127.5, 'Auto');
    }

    // Clip indices matching the sorted-array approach
    const loSkip = Math.floor(validCount * SATURATE);
    const hiSkip =
      validCount - 1 - Math.min(validCount - 1, Math.ceil(validCount * (1 - SATURATE)) - 1);

    // Walk from left to find the percentile min bin
    let cumSum = 0;
    let loIdx = 0;
    for (let b = 0; b < NUM_BINS; b++) {
      cumSum += bins[b];
      if (cumSum > loSkip) {
        loIdx = b;
        break;
      }
    }

    // Walk from right to find the percentile max bin
    cumSum = 0;
    let hiIdx = NUM_BINS - 1;
    for (let b = NUM_BINS - 1; b >= 0; b--) {
      cumSum += bins[b];
      if (cumSum > hiSkip) {
        hiIdx = b;
        break;
      }
    }

    let min = dataMin + (loIdx / NUM_BINS) * range;
    let max = dataMin + ((hiIdx + 1) / NUM_BINS) * range;

    if (min >= max) {
      min = min - 1;
      max = max + 1;
    }

    return new WindowLevel(max - min, (max + min) / 2, 'Auto');
  }

  /**
   * Calculates a 256-bin histogram over the given voxel data.
   * @method
   * @private
   * @param {TypedArray|Float64Array} data - Slice data.
   * @returns {Histogram} Computed histogram.
   */
  _calculateHistogram(data) {
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (v < min) {
        min = v;
      }
      if (v > max) {
        max = v;
      }
    }

    if (!isFinite(min)) {
      min = 0;
    }
    if (!isFinite(max)) {
      max = 255;
    }
    if (min === max) {
      min = min - 1;
      max = max + 1;
    }

    const numBins = 256;
    const bins = new Array(numBins).fill(0);
    const range = max - min;
    let count = 0;

    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (!isFinite(v)) {
        continue;
      }
      bins[Math.min(numBins - 1, Math.floor(((v - min) / range) * numBins))]++;
      count++;
    }

    return new Histogram(min, max, count, bins);
  }

  /**
   * Converts grayscale (or RGB) slice data to RGBA pixels applying window/level.
   * @method
   * @private
   * @param {TypedArray|Float64Array} data - Slice data.
   * @param {WindowLevel} windowLevel - Window/level for display.
   * @param {ColorPalette} colorPalette - Color palette for grayscale mapping.
   * @param {boolean} isRgb - Whether source data is interleaved RGB.
   * @param {boolean} flipX - Reverse column order (horizontal mirror).
   * @param {boolean} flipY - Reverse row order (vertical mirror).
   * @returns {ArrayBuffer} RGBA pixel buffer (width x height x 4 bytes).
   */
  _toRgba(data, windowLevel, colorPalette, isRgb, flipX = false, flipY = false) {
    const width = this.getWidth();
    const height = this.getHeight();
    const numPixels = width * height;
    const rgba = new Uint8ClampedArray(numPixels * 4);

    if (isRgb) {
      if (!flipX && !flipY) {
        // Fast path: sequential scan with no per-pixel branch
        for (let i = 0; i < numPixels; i++) {
          const base = i * 4;
          const src = i * 3;
          rgba[base] = data[src];
          rgba[base + 1] = data[src + 1];
          rgba[base + 2] = data[src + 2];
          rgba[base + 3] = 255;
        }
      } else {
        let outIdx = 0;
        for (let row = 0; row < height; row++) {
          const srcRow = flipY ? height - 1 - row : row;
          for (let col = 0; col < width; col++) {
            const srcCol = flipX ? width - 1 - col : col;
            const i = srcRow * width + srcCol;
            const base = outIdx * 4;
            const src = i * 3;
            rgba[base] = data[src];
            rgba[base + 1] = data[src + 1];
            rgba[base + 2] = data[src + 2];
            rgba[base + 3] = 255;
            outIdx++;
          }
        }
      }
    } else {
      const lut = colorPalette.getLut();
      const w = windowLevel.getWindow();
      const l = windowLevel.getLevel();
      const lo = l - w / 2;
      const hi = l + w / 2;
      const range = hi - lo;

      if (!flipX && !flipY) {
        // Fast path: sequential scan with no per-pixel branch
        for (let i = 0; i < numPixels; i++) {
          const t = range === 0 ? 0 : Math.min(1, Math.max(0, (data[i] - lo) / range));
          const lutIdx = Math.min(255, Math.round(t * 255)) * 4;
          const base = i * 4;
          rgba[base] = lut[lutIdx];
          rgba[base + 1] = lut[lutIdx + 1];
          rgba[base + 2] = lut[lutIdx + 2];
          rgba[base + 3] = 255;
        }
      } else {
        let outIdx = 0;
        for (let row = 0; row < height; row++) {
          const srcRow = flipY ? height - 1 - row : row;
          for (let col = 0; col < width; col++) {
            const srcCol = flipX ? width - 1 - col : col;
            const i = srcRow * width + srcCol;
            const v = data[i];
            const t = range === 0 ? 0 : Math.min(1, Math.max(0, (v - lo) / range));
            const lutIdx = Math.min(255, Math.round(t * 255)) * 4;
            const base = outIdx * 4;
            rgba[base] = lut[lutIdx];
            rgba[base + 1] = lut[lutIdx + 1];
            rgba[base + 2] = lut[lutIdx + 2];
            rgba[base + 3] = 255;
            outIdx++;
          }
        }
      }
    }

    return rgba.buffer;
  }

  /**
   * Computes X/Y flip flags for standard neurological axial display.
   *
   * Uses the normalised direction cosines from _parseAffine() so the sign is
   * correct even for oblique acquisitions where raw affine[0][0] may be small.
   *
   * RAS convention:
   *   - orientation[0]: X-component of the i-axis unit vector
   *       < 0 -> i-axis points Left  -> voxel 0 is patient-Right -> flip so L is at screen-left
   *   - orientation[4]: Y-component of the j-axis unit vector
   *       > 0 -> j-axis points Anterior -> voxel 0 is Posterior  -> flip so Anterior is at screen-top
   * @method
   * @private
   * @returns {Object} Flip flags (flipX, flipY).
   */
  _getOrientationFlips() {
    const affine = this.header.affine;
    if (!affine || affine[0][0] == null) {
      return { flipX: false, flipY: false };
    }
    const { orientation } = this._parseAffine();

    return {
      flipX: orientation[0] < 0,
      flipY: orientation[4] > 0,
    };
  }
}

export default NiftiImage;
