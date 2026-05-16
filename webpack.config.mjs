import CopyWebpackPlugin from 'copy-webpack-plugin';
import { createRequire } from 'module';
import path from 'path';
import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';

const { BannerPlugin } = webpack;
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const rootPath = process.cwd();
const context = path.join(rootPath, 'src');
const examplesPath = path.join(rootPath, 'examples');
const outputPath = path.join(rootPath, 'build');
const filename = path.parse(pkg.main).base;

function getCurrentDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = ('0' + (today.getMonth() + 1)).slice(-2);
  const date = ('0' + today.getDate()).slice(-2);
  return `${year}-${month}-${date}`;
}

function getBanner() {
  return (
    `/*! ${pkg.name} - ${pkg.version} - ` +
    `${getCurrentDate()} ` +
    `| (c) 2026 ${pkg.author} | ${pkg.homepage} */`
  );
}

export default {
  mode: 'production',
  context,
  entry: {
    niftiImaging: './index.js',
  },
  target: 'web',
  output: {
    filename,
    library: {
      commonjs: 'nifti-imaging',
      amd: 'nifti-imaging',
      root: 'niftiImaging',
    },
    libraryTarget: 'umd',
    path: outputPath,
    umdNamedDefine: true,
    globalObject: 'this',
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
        parallel: true,
        terserOptions: {
          sourceMap: true,
        },
      }),
    ],
  },
  experiments: {
    outputModule: false,
  },
  plugins: [
    new BannerPlugin({
      banner: getBanner(),
      entryOnly: true,
      raw: true,
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: path.join(examplesPath, 'index.html'), to: path.join(outputPath, 'index.html') },
      ],
    }),
  ],
  node: {
    __dirname: false,
  },
};
