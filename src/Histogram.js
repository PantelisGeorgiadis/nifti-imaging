class Histogram {
  /**
   * Creates an instance of Histogram.
   * @constructor
   * @param {number} min - Minimum pixel value.
   * @param {number} max - Maximum pixel value.
   * @param {number} count - Total number of samples.
   * @param {Array<number>} data - Bin counts (256 bins, linearly spaced between min and max).
   */
  constructor(min, max, count, data) {
    this.min = min;
    this.max = max;
    this.count = count;
    this.data = data;
  }

  /**
   * Gets the minimum value.
   * @method
   * @returns {number} Minimum value.
   */
  getMin() {
    return this.min;
  }

  /**
   * Gets the maximum value.
   * @method
   * @returns {number} Maximum value.
   */
  getMax() {
    return this.max;
  }

  /**
   * Gets the total sample count.
   * @method
   * @returns {number} Total count.
   */
  getCount() {
    return this.count;
  }

  /**
   * Gets the histogram bin counts array.
   * @method
   * @returns {Array<number>} Array of 256 bin counts.
   */
  getData() {
    return this.data;
  }

  /**
   * Gets the histogram description string.
   * @method
   * @returns {string} Histogram description.
   */
  toString() {
    return `Histogram [min: ${this.min}, max: ${this.max}, count: ${this.count}]`;
  }
}

export default Histogram;
