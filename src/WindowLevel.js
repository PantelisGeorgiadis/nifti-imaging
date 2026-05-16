class WindowLevel {
  /**
   * Creates an instance of WindowLevel.
   * @constructor
   * @param {number} window - Window width value.
   * @param {number} level - Window center (level) value.
   * @param {string} [description] - Optional description.
   */
  constructor(window, level, description) {
    this.window = window;
    this.level = level;
    this.description = description;
  }

  /**
   * Gets window width value.
   * @method
   * @returns {number} Window width value.
   */
  getWindow() {
    return this.window;
  }

  /**
   * Sets window width value.
   * @method
   * @param {number} value - Window width value.
   */
  setWindow(value) {
    this.window = value;
  }

  /**
   * Gets window center (level) value.
   * @method
   * @returns {number} Level value.
   */
  getLevel() {
    return this.level;
  }

  /**
   * Sets window center (level) value.
   * @method
   * @param {number} value - Level value.
   */
  setLevel(value) {
    this.level = value;
  }

  /**
   * Gets description.
   * @method
   * @returns {string|undefined} Description or undefined if not provided.
   */
  getDescription() {
    return this.description;
  }

  /**
   * Sets description.
   * @method
   * @param {string} description - Description.
   */
  setDescription(description) {
    this.description = description;
  }

  /**
   * Gets the window/level description string.
   * @method
   * @returns {string} Window/level description.
   */
  toString() {
    return `W:${this.getWindow()} L:${this.getLevel()} ${this.getDescription() || '[No description]'}`;
  }
}

export default WindowLevel;
