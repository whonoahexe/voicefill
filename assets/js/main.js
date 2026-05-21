// assets/js/main.js — ES module entry point
// Imports ui.js and initialises event bindings when DOM is ready.

import { init } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  init();
});
