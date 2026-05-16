import ColorPalette from './ColorPalette.js';
import { StandardColorPalette } from './Constants.js';
import Histogram from './Histogram.js';
import NiftiImage from './NiftiImage.js';
import WindowLevel from './WindowLevel.js';
import log from './log.js';
import version from './version.js';

const constants = { StandardColorPalette };

const NiftiImaging = {
  ColorPalette,
  constants,
  Histogram,
  log,
  NiftiImage,
  version,
  WindowLevel,
};

export default NiftiImaging;
export { ColorPalette, constants, Histogram, log, NiftiImage, version, WindowLevel };
