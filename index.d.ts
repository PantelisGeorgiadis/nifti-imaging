import log from 'loglevel';

declare namespace StandardColorPalette {
  const Grayscale: string;
  const HotIron: string;
  const PetColor: string;
  const HotMetalBlue: string;
  const Pet20Step: string;
}

declare class WindowLevel {
  /**
   * Creates an instance of WindowLevel.
   */
  constructor(window: number, level: number, description?: string);

  /**
   * Gets window value.
   */
  getWindow(): number;

  /**
   * Sets window value.
   */
  setWindow(value: number): void;

  /**
   * Gets level value.
   */
  getLevel(): number;

  /**
   * Sets level value.
   */
  setLevel(value: number): void;

  /**
   * Gets description.
   */
  getDescription(): string | undefined;

  /**
   * Sets description.
   */
  setDescription(description: string): void;

  /**
   * Gets the window/level description.
   */
  toString(): string;
}

declare class Histogram {
  /**
   * Creates an instance of Histogram.
   */
  constructor(min: number, max: number, count: number, data: number[]);

  /**
   * Gets minimum value.
   */
  getMin(): number;

  /**
   * Gets maximum value.
   */
  getMax(): number;

  /**
   * Gets the total voxel count.
   */
  getCount(): number;

  /**
   * Gets the bin data array.
   */
  getData(): number[];

  /**
   * Gets the histogram description.
   */
  toString(): string;
}

declare class ColorPalette {
  /**
   * Creates an instance of ColorPalette.
   */
  constructor(colorPalette?: string);

  /**
   * Gets color palette name.
   */
  getColorPalette(): string;

  /**
   * Gets the 256-entry RGBA lookup table.
   */
  getLut(): Uint8Array;

  /**
   * Gets the RGBA color at a normalized position [0, 1].
   */
  getColor(t: number): { r: number; g: number; b: number; a: number };

  /**
   * Gets the color palette description.
   */
  toString(): string;
}

declare class NiftiImage {
  /**
   * Creates an instance of NiftiImage.
   */
  constructor(arrayBuffer: ArrayBuffer);

  /**
   * Gets the image width in voxels.
   */
  getWidth(): number;

  /**
   * Gets the image height in voxels.
   */
  getHeight(): number;

  /**
   * Gets the number of slices (z-dimension).
   */
  getNumberOfSlices(): number;

  /**
   * Gets the number of time points (t-dimension).
   */
  getNumberOfTimePoints(): number;

  /**
   * Renders the image.
   */
  render(opts?: {
    slice?: number;
    timePoint?: number;
    windowLevel?: WindowLevel;
    calculateHistograms?: boolean;
    colorPalette?: string;
  }): {
    slice: number;
    timePoint: number;
    width: number;
    height: number;
    pixels: ArrayBuffer;
    windowLevel: WindowLevel;
    histograms?: Array<Histogram>;
  };

  /**
   * Gets the image description.
   */
  toString(): string;
}

/**
 * Version.
 */
declare const version: string;

export namespace constants {
  export { StandardColorPalette };
}

declare const NiftiImaging: {
  ColorPalette: typeof ColorPalette;
  constants: { StandardColorPalette: typeof StandardColorPalette };
  Histogram: typeof Histogram;
  NiftiImage: typeof NiftiImage;
  version: string;
  WindowLevel: typeof WindowLevel;
};

export default NiftiImaging;
export { ColorPalette, Histogram, log, NiftiImage, version, WindowLevel };
