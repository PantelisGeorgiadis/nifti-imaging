# nifti-imaging

[![NPM version][npm-version-image]][npm-url] [![NPM downloads][npm-downloads-image]][npm-url] [![build][build-image]][build-url] [![MIT License][license-image]][license-url]

Neuroimaging Informatics Technology Initiative (NIfTI) image rendering pipeline for Node.js and browser using the [nifti-reader-js][nifti-reader-js-url] library.

### Note
**This effort is a work-in-progress and should not be used for production or clinical purposes.**

### Install
#### Node.js
```
npm install nifti-imaging
```

#### Browser
```html
<script type="text/javascript" src="https://unpkg.com/nifti-imaging"></script>
```

### Build
```
npm install
npm run build
```

### Features
- Renders single and multi-slice datasets with optional adjustment of window/level and color palette.
- Handles all standard NIfTI datatypes, including integer, float and complex voxel types.
- Decodes gzip-compressed NIfTI files (`.nii.gz`) transparently.
- Supports 4D time-series datasets.
- Outputs RGBA pixel arrays, suitable for use with HTML5 Canvas, WebGL and WebGPU, or other imaging libraries.
- Provides a common bundle for both Node.js and browser.

### Supported Datatypes
- UINT8 (Type code 2)
- INT8 (Type code 256)
- UINT16 (Type code 512)
- INT16 (Type code 4)
- UINT32 (Type code 768)
- INT32 (Type code 8)
- FLOAT32 (Type code 16)
- FLOAT64 (Type code 64)
- COMPLEX64 (Type code 32) — rendered as voxel magnitude
- RGB24 (Type code 128) — true-color

### Usage

#### Basic image rendering
```js
// Import objects in Node.js
const niftiImaging = require('nifti-imaging');
const { NiftiImage } = niftiImaging;

// Import objects in Browser
const { NiftiImage } = window.niftiImaging;

// Create an ArrayBuffer with the contents of the NIfTI byte stream.
const image = new NiftiImage(arrayBuffer);

// Render image.
const renderingResult = image.render();

// Rendered pixels in an RGBA ArrayBuffer.
const renderedPixels = renderingResult.pixels;
// Rendered width.
const width = renderingResult.width;
// Rendered height.
const height = renderingResult.height;
```

#### Advanced image rendering
```js
// Import objects in Node.js
const niftiImaging = require('nifti-imaging');
const { NiftiImage, WindowLevel } = niftiImaging;
const { StandardColorPalette } = niftiImaging.constants;

// Import objects in Browser
const { NiftiImage, WindowLevel } = window.niftiImaging;
const { StandardColorPalette } = window.niftiImaging.constants;

// Create an ArrayBuffer with the contents of the NIfTI byte stream.
const image = new NiftiImage(arrayBuffer);

// Create image rendering options.
const renderingOpts = {
  // Optional slice index.
  // If not provided, the first slice is rendered.
  slice: 0,
  // Optional time-point index for 4D datasets.
  // If not provided, the first time-point is used.
  timePoint: 0,
  // Optional user-provided window/level.
  // If not provided, the rendering pipeline calculates it from pixel values.
  windowLevel: new WindowLevel(windowWidth, windowLevel),
  // Optional flag to indicate whether histograms should be calculated.
  // If not provided, the histograms are not calculated.
  calculateHistograms: false,
  // Optional standard color palette.
  // If not provided, the grayscale palette is used.
  colorPalette: StandardColorPalette.Grayscale
};

// Render image.
const renderingResult = image.render(renderingOpts);

// Rendered pixels in an RGBA ArrayBuffer.
const renderedPixels = renderingResult.pixels;
// Rendered slice index.
const slice = renderingResult.slice;
// Rendered time-point index.
const timePoint = renderingResult.timePoint;
// Rendered width.
const width = renderingResult.width;
// Rendered height.
const height = renderingResult.height;
// Window/level used to render the pixels.
const windowLevel = renderingResult.windowLevel;
// Array of calculated per-channel histograms.
// In case calculateHistograms rendering option is false
// histograms should not be present.
const histograms = renderingResult.histograms;
```
Please check a live example [here][nifti-imaging-live-example-url].

### License
nifti-imaging is released under the MIT License.

[npm-url]: https://npmjs.org/package/nifti-imaging
[npm-version-image]: https://img.shields.io/npm/v/nifti-imaging.svg?style=flat
[npm-downloads-image]: http://img.shields.io/npm/dm/nifti-imaging.svg?style=flat

[build-url]: https://github.com/PantelisGeorgiadis/nifti-imaging/actions/workflows/build.yml
[build-image]: https://github.com/PantelisGeorgiadis/nifti-imaging/actions/workflows/build.yml/badge.svg?branch=master

[license-image]: https://img.shields.io/badge/license-MIT-blue.svg?style=flat
[license-url]: LICENSE.txt

[nifti-reader-js-url]: https://github.com/rii-mango/NIFTI-Reader-JS

[nifti-imaging-live-example-url]: https://unpkg.com/nifti-imaging@latest/build/index.html
