/*! guspira v0.1.0 — A reactive GUI toolkit for creative coding sketches
 * https://github.com/spite/guspira
 * MIT License, Copyright (c) 2026 Jaume Sanchez
 */

// src/reactive.js
var hasRAF = typeof requestAnimationFrame === "function";
var now = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
var rafSchedule = hasRAF ? (fn) => requestAnimationFrame(fn) : (fn) => setTimeout(() => fn(now()), 16);
var rafCancel = hasRAF ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);
var activeEffect = null;
var batchDepth = 0;
var pending = /* @__PURE__ */ new Set();
var ReactiveEffect = class {
  constructor(fn, scheduler) {
    this.fn = fn;
    this.scheduler = scheduler;
    this.deps = /* @__PURE__ */ new Set();
    this.active = true;
    this.paused = false;
    this.dirty = false;
    this.cleanupFn = null;
  }
  // What a dependency change does to this effect: run it, or hand it to its scheduler to be
  // run later. A paused effect only remembers that it went stale.
  notify() {
    if (!this.active) return;
    if (this.paused) {
      this.dirty = true;
      return;
    }
    if (this.scheduler) this.scheduler(this);
    else this.run();
  }
  pause() {
    this.paused = true;
  }
  // Catches up immediately rather than through the scheduler: resuming is itself the moment
  // the caller chose, so waiting for another frame after it would just add latency.
  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.dirty) {
      this.dirty = false;
      this.run();
    }
  }
  run() {
    if (!this.active) return;
    this.runCleanup();
    this.cleanup();
    const prev = activeEffect;
    activeEffect = this;
    try {
      const result = this.fn();
      if (typeof result === "function") this.cleanupFn = result;
      return result;
    } finally {
      activeEffect = prev;
    }
  }
  runCleanup() {
    if (!this.cleanupFn) return;
    const fn = this.cleanupFn;
    this.cleanupFn = null;
    untrack(fn);
  }
  cleanup() {
    this.deps.forEach((depSet) => depSet.delete(this));
    this.deps.clear();
  }
  stop() {
    if (!this.active) return;
    this.runCleanup();
    this.cleanup();
    this.active = false;
  }
};
function track(subscribers) {
  if (activeEffect) {
    subscribers.add(activeEffect);
    activeEffect.deps.add(subscribers);
  }
}
function reportError(error) {
  if (typeof console !== "undefined") console.error("[guspira] effect threw:", error);
}
function drain() {
  batchDepth++;
  try {
    let guard = 0;
    while (pending.size) {
      if (++guard > 1e5) {
        pending.clear();
        throw new Error(
          "[guspira] reactive update never settled — an effect is very likely writing a signal it also reads. Use peek() to read without subscribing, or untrack()."
        );
      }
      const effect2 = pending.values().next().value;
      pending.delete(effect2);
      try {
        effect2.notify();
      } catch (error) {
        reportError(error);
      }
    }
  } finally {
    batchDepth--;
  }
}
function trigger(subscribers) {
  if (subscribers.size === 0) return;
  batchDepth++;
  try {
    subscribers.forEach((effect2) => pending.add(effect2));
  } finally {
    batchDepth--;
    if (batchDepth === 0) drain();
  }
}
function same(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.every((v, i) => Object.is(v, b[i]));
  }
  return false;
}
function signal(initialValue) {
  let value = initialValue;
  const subscribers = /* @__PURE__ */ new Set();
  const sig = () => {
    track(subscribers);
    return value;
  };
  sig.set = (newValue) => {
    if (same(value, newValue)) return;
    value = newValue;
    trigger(subscribers);
  };
  sig.update = (updater) => sig.set(updater(value));
  sig.peek = () => value;
  sig.isSignal = true;
  sig.target = sig;
  return sig;
}
function computed(fn) {
  const value = signal(void 0);
  const computation = new ReactiveEffect(() => value.set(fn()));
  computation.run();
  const computedSignal = () => value();
  computedSignal.peek = value.peek;
  computedSignal.isSignal = true;
  computedSignal.stop = () => computation.stop();
  return computedSignal;
}
function createScheduler(driver = null) {
  const queue = /* @__PURE__ */ new Set();
  let cancel = null;
  let paused = false;
  const flush = () => {
    cancel = null;
    if (paused) return 0;
    const jobs = [...queue];
    queue.clear();
    for (const job of jobs) {
      try {
        job.run();
      } catch (error) {
        reportError(error);
      }
    }
    return jobs.length;
  };
  const schedule = (job) => {
    queue.add(job);
    if (driver && !cancel && !paused) cancel = driver(flush);
  };
  return {
    schedule,
    flush,
    get size() {
      return queue.size;
    },
    // Drops pending work without running it.
    clear() {
      queue.clear();
      if (cancel) cancel();
      cancel = null;
    },
    // Stops the whole queue at once — a hidden panel or a stopped sketch costs nothing,
    // and the work that piled up runs on resume.
    pause() {
      paused = true;
      if (cancel) cancel();
      cancel = null;
    },
    resume() {
      if (!paused) return;
      paused = false;
      if (queue.size) flush();
    },
    get paused() {
      return paused;
    }
  };
}
var frame = createScheduler((flush) => {
  const id = rafSchedule(flush);
  return () => rafCancel(id);
});
var microtask = createScheduler((flush) => {
  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) flush();
  });
  return () => {
    cancelled = true;
  };
});
function effect(fn, options = {}) {
  const { scheduler, lazy = false } = options;
  const enqueue = !scheduler ? void 0 : typeof scheduler === "function" ? scheduler : (job) => scheduler.schedule(job);
  const e = new ReactiveEffect(fn, enqueue);
  if (!lazy) e.run();
  const handle = () => e.stop();
  handle.stop = () => e.stop();
  handle.run = () => e.run();
  handle.pause = () => e.pause();
  handle.resume = () => e.resume();
  return handle;
}
function effectRAF(fn) {
  return effect(fn, { scheduler: frame });
}
function batch(fn) {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) drain();
  }
}
function untrack(fn) {
  const prev = activeEffect;
  activeEffect = null;
  try {
    return fn();
  } finally {
    activeEffect = prev;
  }
}
var lerpNumber = (from, to, t) => from + (to - from) * t;
function tweened(initialValue, duration = 400, easing = (t) => t, interpolate = lerpNumber) {
  const value = signal(initialValue);
  const target = signal(initialValue);
  let from = initialValue;
  let to = initialValue;
  let startTime = null;
  let frameId = null;
  const stopAnimation = () => {
    if (frameId !== null) rafCancel(frameId);
    frameId = null;
    startTime = null;
  };
  const tick = (time) => {
    if (startTime === null) startTime = time;
    const progress = Math.min((time - startTime) / duration, 1);
    value.set(progress < 1 ? interpolate(from, to, easing(progress)) : to);
    if (progress < 1) frameId = rafSchedule(tick);
    else stopAnimation();
  };
  const sig = () => value();
  sig.peek = value.peek;
  sig.isSignal = true;
  sig.target = target;
  sig.set = (newValue) => {
    if (interpolate === lerpNumber && (typeof newValue !== "number" || !isFinite(newValue))) {
      reportError(new Error(`tweened() interpolates numbers; got ${JSON.stringify(newValue)}`));
      return;
    }
    if (newValue === to) return;
    stopAnimation();
    from = value.peek();
    to = newValue;
    target.set(newValue);
    if (duration === 0) value.set(to);
    else frameId = rafSchedule(tick);
  };
  sig.update = (updater) => sig.set(updater(value.peek()));
  sig.reset = (newValue) => {
    stopAnimation();
    from = newValue;
    to = newValue;
    target.set(newValue);
    value.set(newValue);
  };
  Object.defineProperties(sig, {
    duration: {
      get: () => duration,
      set: (ms) => {
        duration = Math.max(0, ms);
      }
    },
    easing: {
      get: () => easing,
      set: (fn) => {
        easing = typeof fn === "function" ? fn : (t) => t;
      }
    }
  });
  return sig;
}
var easings = {
  linear: (t) => t,
  quadIn: (t) => t * t,
  quadOut: (t) => t * (2 - t),
  quadInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  expoOut: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  backOut: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
  elasticOut: (t) => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * 2.094) + 1
};
var isSignal = (v) => typeof v === "function" && v.isSignal === true;
var toSignal = (v) => isSignal(v) ? v : signal(v);

// src/format.js
function precision(step) {
  if (!isFinite(step)) return 0;
  let e = 1;
  let p = 0;
  while (Math.round(step * e) / e !== step) {
    e *= 10;
    p++;
    if (p > 10) break;
  }
  return p;
}
function formatFloat(value, step) {
  return parseFloat(value).toFixed(precision(step));
}
function snap(value, step, min, max) {
  const snapped = Math.round(value / step) * step;
  return parseFloat(Math.max(min, Math.min(max, snapped)).toFixed(precision(step)));
}

// src/range-slider.js
var RangeSlider = class extends HTMLElement {
  static formAssociated = true;
  constructor() {
    super();
    this.internals_ = this.attachInternals();
    this.attachShadow({ mode: "open" });
    this.isDragging = false;
    this.currentHandle = "max";
    this._min = 0;
    this._max = 100;
    this._step = 1;
    this._valMin = 0;
    this._valMax = 50;
    this._syncingAttribute = false;
    this._listening = false;
    this._dragRect = null;
    this._onPointerMove = (e) => this.handleDragMove(e);
    this._onPointerUp = () => this.handleDragEnd();
  }
  static get observedAttributes() {
    return ["min", "max", "step", "value", "dual", "disabled"];
  }
  get template() {
    return `
      <style>
        :host {
          display: inline-block;
          width: 100%;
          height: var(--gui-row-height, 24px);
          user-select: none;
          touch-action: none;
          vertical-align: middle;
          --track-height: var(--gui-track-height, 4px);
          --track-color: var(--gui-track, #333);
          --fill-color: var(--gui-fill, #e0e0e0);
          --thumb-size: 8px;
          --thumb-color: var(--gui-thumb, #fff);
          --thumb-border: 2px solid var(--gui-track, #333);
          --thumb-hover: var(--gui-thumb-hover, #f0f0f0);
          cursor: pointer;
          border-radius: var(--gui-radius, 4px);
        }

        :host([disabled]) {
          opacity: 0.5;
          pointer-events: none;
        }

        :host(:focus-visible) {
          outline: 2px solid var(--gui-focus, #888);
          outline-offset: 2px;
        }

        .container:hover {
          --thumb-size: 16px;
        }

        .container {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
        }

        .track {
          position: absolute;
          width: 100%;
          height: var(--track-height);
          background-color: var(--track-color);
          border-radius: 4px;
        }

        /* Dragging must not lag behind the pointer, so the eased transitions that make
           programmatic changes look smooth are switched off for the duration. */
        .container.immediate .thumb,
        .container.immediate .fill {
          transition: none;
        }

        .fill {
          position: absolute;
          height: var(--track-height);
          background-color: var(--fill-color);
          border-radius: 4px;
          pointer-events: none;
          transition: width .1s ease-in, left .1s ease-in;
        }

        .thumb {
          position: absolute;
          width: var(--thumb-size);
          height: var(--thumb-size);
          background-color: var(--thumb-color);
          border: var(--thumb-border);
          border-radius: 50%;
          transform: translateX(-50%);
          box-shadow: 0 0.5px 1.5px rgba(0, 0, 0, 0.2);
          transition: left .1s ease-in, transform .1s ease-in, width .1s ease-in, height .1s ease-in;
          z-index: 2;
          box-sizing: border-box;
        }

        .thumb:hover {
          background-color: var(--thumb-hover);
          transform: translateX(-50%) scale(1.1);
        }

        .thumb:active {
          transform: translateX(-50%) scale(0.95);
        }

        :host(:not([dual])) .thumb-min {
          display: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .thumb, .fill { transition: none; }
        }
      </style>

      <div class="container" id="container">
        <div class="track"></div>
        <div class="fill" id="fill"></div>
        <div class="thumb thumb-min" id="thumbMin"></div>
        <div class="thumb thumb-max" id="thumbMax"></div>
      </div>
    `;
  }
  connectedCallback() {
    if (!this.elements) {
      this.shadowRoot.innerHTML = this.template;
      this.elements = {
        container: this.shadowRoot.getElementById("container"),
        fill: this.shadowRoot.getElementById("fill"),
        thumbMin: this.shadowRoot.getElementById("thumbMin"),
        thumbMax: this.shadowRoot.getElementById("thumbMax")
      };
    }
    if (!this.hasAttribute("tabindex")) this.setAttribute("tabindex", "0");
    if (!this.hasAttribute("role")) this.setAttribute("role", "slider");
    this.updateUI();
    this.addEventListeners();
  }
  // Drag tracking is on window (the pointer leaves the element constantly), so it has to
  // be torn down explicitly or every slider ever created stays reachable.
  disconnectedCallback() {
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerUp);
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || this._syncingAttribute) return;
    switch (name) {
      case "min":
        this._min = parseFloat(newValue);
        break;
      case "max":
        this._max = parseFloat(newValue);
        break;
      case "step":
        this._step = parseFloat(newValue);
        break;
      case "value":
        if (newValue === null) break;
        if (newValue.includes(",")) {
          const parts = newValue.split(",");
          this._valMin = parseFloat(parts[0]);
          this._valMax = parseFloat(parts[1]);
        } else {
          this._valMax = parseFloat(newValue);
          if (!this.hasAttribute("dual")) this._valMin = this._min;
        }
        break;
    }
    this.updateUI();
  }
  addEventListeners() {
    if (!this._listening) {
      this._listening = true;
      this.elements.container.addEventListener("pointerdown", (e) => this.handleDragStart(e));
      this.addEventListener("keydown", (e) => this.handleKeyDown(e));
    }
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    window.addEventListener("pointercancel", this._onPointerUp);
  }
  handleDragStart(e) {
    if (this.hasAttribute("disabled")) return;
    this.elements.container.classList.add("immediate");
    this.isDragging = true;
    this.focus();
    this._dragRect = this.getBoundingClientRect();
    this.elements.thumbMin.style.zIndex = 2;
    this.elements.thumbMax.style.zIndex = 2;
    const rect = this._dragRect;
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const value = this.percentageToValue(percentage);
    if (this.hasAttribute("dual")) {
      const distMin = Math.abs(value - this._valMin);
      const distMax = Math.abs(value - this._valMax);
      if (this._valMin === this._valMax) {
        if (this._valMin === this._max) this.currentHandle = "min";
        else if (this._valMin === this._min) this.currentHandle = "max";
        else this.currentHandle = value < this._valMin ? "min" : "max";
      } else {
        this.currentHandle = distMin < distMax ? "min" : "max";
      }
      const active = this.currentHandle === "min" ? this.elements.thumbMin : this.elements.thumbMax;
      active.style.zIndex = 3;
    } else {
      this.currentHandle = "max";
    }
    this.updateValueFromPointer(e);
  }
  handleDragMove(e) {
    if (!this.isDragging) return;
    this.updateValueFromPointer(e);
  }
  handleDragEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this._dragRect = null;
    this.dispatchEvent(new Event("change", { bubbles: true }));
    this.updateFormValue();
    this.elements.container.classList.remove("immediate");
  }
  // Arrows nudge by one step, Page keys by ten, Home/End jump to the ends. In dual mode
  // Shift moves the lower handle, so both are reachable without a pointer.
  handleKeyDown(e) {
    if (this.hasAttribute("disabled")) return;
    const dual = this.hasAttribute("dual");
    const big = this._step * 10;
    let delta = 0;
    let absolute = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        delta = this._step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        delta = -this._step;
        break;
      case "PageUp":
        delta = big;
        break;
      case "PageDown":
        delta = -big;
        break;
      case "Home":
        absolute = this._min;
        break;
      case "End":
        absolute = this._max;
        break;
      default:
        return;
    }
    e.preventDefault();
    const handle = dual && e.shiftKey ? "min" : "max";
    const current = handle === "min" ? this._valMin : this._valMax;
    this.currentHandle = handle;
    this.applyValue(absolute !== null ? absolute : current + delta);
    this.dispatchEvent(new Event("input", { bubbles: true }));
    this.dispatchEvent(new Event("change", { bubbles: true }));
  }
  updateValueFromPointer(e) {
    const rect = this._dragRect || this.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.applyValue(this.percentageToValue(percentage));
    this.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // Snaps to the step grid and clamps to the range (shared with the panel, so the value
  // shown and the value stored can't disagree), then keeps the handles from crossing.
  applyValue(rawValue) {
    let value = snap(rawValue, this._step, this._min, this._max);
    if (this.currentHandle === "min") {
      if (value > this._valMax) value = this._valMax;
      this._valMin = value;
    } else {
      if (this.hasAttribute("dual") && value < this._valMin) value = this._valMin;
      this._valMax = value;
    }
    this.updateUI();
  }
  percentageToValue(percentage) {
    return this._min + percentage * (this._max - this._min);
  }
  valueToPercentage(value) {
    const span = this._max - this._min;
    if (!span) return 0;
    return (value - this._min) / span * 100;
  }
  updateUI() {
    if (!this.elements) return;
    const dual = this.hasAttribute("dual");
    const clamp = (p) => Math.max(0, Math.min(100, p));
    const pMin = clamp(this.valueToPercentage(dual ? this._valMin : this._min));
    const pMax = clamp(this.valueToPercentage(this._valMax));
    if (dual) this.elements.thumbMin.style.left = `${pMin}%`;
    this.elements.thumbMax.style.left = `${pMax}%`;
    this.elements.fill.style.left = `${pMin}%`;
    this.elements.fill.style.width = `${pMax - pMin}%`;
    if (this._ariaBounds !== `${this._min}/${this._max}`) {
      this._ariaBounds = `${this._min}/${this._max}`;
      this.setAttribute("aria-valuemin", this._min);
      this.setAttribute("aria-valuemax", this._max);
    }
    this.setAttribute("aria-valuenow", dual ? `${this._valMin},${this._valMax}` : this._valMax);
    this.updateFormValue();
  }
  updateFormValue() {
    const value = this.hasAttribute("dual") ? `${this._valMin},${this._valMax}` : `${this._valMax}`;
    this.internals_.setFormValue(value);
    this._syncingAttribute = true;
    this.setAttribute("value", value);
    this._syncingAttribute = false;
  }
  get value() {
    if (this.hasAttribute("dual")) return [this._valMin, this._valMax];
    return this._valMax;
  }
  // Dragging goes element -> input event -> signal -> effect -> back here with the value the
  // element already has. Without this guard every pointer move repaints the thumbs, rewrites
  // three aria attributes and re-reports the form value a second time, for nothing.
  set value(val) {
    if (Array.isArray(val)) {
      if (val[0] === this._valMin && val[1] === this._valMax) return;
      this._valMin = val[0];
      this._valMax = val[1];
    } else {
      if (val === this._valMax) return;
      this._valMax = val;
    }
    this.updateUI();
  }
  get min() {
    return this._min;
  }
  set min(value) {
    this._min = parseFloat(value);
    this.updateUI();
  }
  get max() {
    return this._max;
  }
  set max(value) {
    this._max = parseFloat(value);
    this.updateUI();
  }
  get step() {
    return this._step;
  }
  set step(value) {
    this._step = parseFloat(value);
    this.updateUI();
  }
};
if (!customElements.get("range-slider")) customElements.define("range-slider", RangeSlider);
var range_slider_default = RangeSlider;

// src/random.js
var source = Math.random;
function setRandomSource(fn) {
  source = fn;
}
var random = () => source();
var randomInRange = (min, max) => min + source() * (max - min);
var randomElement = (array) => array[Math.floor(source() * array.length)];
var randomBool = (chance = 0.5) => source() < chance;
function randomHexColor() {
  const channel = () => Math.floor(source() * 256).toString(16).padStart(2, "0");
  return `#${channel()}${channel()}${channel()}`;
}

// src/keyboard.js
var TYPING_TAGS = /* @__PURE__ */ new Set(["INPUT", "SELECT", "TEXTAREA"]);
function isTyping(target) {
  if (!target) return false;
  if (TYPING_TAGS.has(target.tagName)) return true;
  return target.isContentEditable === true;
}
function bindKey(code, fn, opts = {}) {
  const {
    ctrl = false,
    shift = false,
    alt = false,
    meta = false,
    allowWhileTyping = false,
    target = window,
    preventDefault = false
  } = opts;
  const handler = (e) => {
    if (e.code !== code) return;
    if (e.ctrlKey !== ctrl || e.shiftKey !== shift || e.altKey !== alt) return;
    if (e.metaKey !== meta) return;
    if (!allowWhileTyping && isTyping(e.target)) return;
    if (preventDefault) e.preventDefault();
    fn(e);
  };
  target.addEventListener("keydown", handler);
  return () => target.removeEventListener("keydown", handler);
}

// src/gui.js
var CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
function composeRangeValue(min, max, step) {
  return `${formatFloat(min, step)}–${formatFloat(max, step)}`;
}
function readOptions(a, b) {
  if (typeof a === "function") return { onChange: a, disabled: b };
  if (a && typeof a === "object") return a;
  return {};
}
function readButtonOptions(a) {
  if (typeof a === "function") return { disabled: a };
  if (a && typeof a === "object") return a;
  return {};
}
function condition(...candidates) {
  for (const value of candidates) {
    if (value === void 0 || value === null) continue;
    return typeof value === "function" ? value : () => value;
  }
  return null;
}
var targetOf = (sig) => sig.target || sig;
var optionValue = (opt) => Array.isArray(opt) ? opt[0] : opt;
var optionLabel = (opt) => Array.isArray(opt) ? opt[1] : opt;
var Controller = class {
  constructor(gui, row) {
    this.gui = gui;
    this.row = row;
    this.el = null;
    this.labelEl = null;
    this.randomize = null;
    this._stops = [];
    this._destroyed = false;
  }
  // Registers an effect owned by this row.
  bind(fn) {
    this._stops.push(effect(fn));
    return this;
  }
  onDestroy(fn) {
    this._stops.push(fn);
    return this;
  }
  setVisible(visible) {
    this.row.classList.toggle("gui-hidden", !visible);
    return this;
  }
  setDisabled(disabled) {
    this.row.classList.toggle("disabled", !!disabled);
    return this;
  }
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._stops.forEach((stop) => stop());
    this._stops.length = 0;
    this.row.remove();
    this.gui._forget(this);
  }
};
function destroyChildren(controller, container) {
  [...controller.gui._controllers].forEach((c) => {
    if (c !== controller && container.contains(c.row)) c.destroy();
  });
}
var Section = class extends Controller {
  constructor(gui, row, body, open) {
    super(gui, row);
    this.body = body;
    this.open = open;
  }
  destroy() {
    if (this._destroyed) return;
    destroyChildren(this, this.body);
    super.destroy();
  }
  setOpen(v) {
    this.open.set(!!v);
    return this;
  }
  toggle() {
    return this.setOpen(!this.open());
  }
};
var Tab = class extends Controller {
  constructor(gui, row, panel, button, index) {
    super(gui, row);
    this.panel = panel;
    this.button = button;
    this.index = index;
  }
  select() {
    this.gui.selectTab(this.index);
    return this;
  }
  destroy() {
    if (this._destroyed) return;
    destroyChildren(this, this.panel);
    this.button.remove();
    super.destroy();
  }
};
var GUI = class {
  // `opts`: { visible, expanded, storageKey, onBeforeRandomize, className }.
  // `storageKey` makes the panel remember its own layout state — collapsed or expanded,
  // which tab was open, which sections were folded — separately from app parameters.
  constructor(title = "Settings", el = document.body, opts = {}) {
    this.options = opts;
    this._storageKey = opts.storageKey || null;
    this._controllers = [];
    this._unbinds = [];
    this.container = document.createElement("div");
    this.container.className = "gui";
    if (opts.className) this.container.classList.add(opts.className);
    const titleEl = document.createElement("div");
    titleEl.className = "gui-title";
    titleEl.textContent = title;
    this.titleEl = titleEl;
    const expandEl = document.createElement("span");
    expandEl.className = "gui-chevron";
    expandEl.innerHTML = CHEVRON;
    titleEl.append(expandEl);
    this.container.append(titleEl);
    this.scroller = document.createElement("div");
    this.scroller.className = "gui-scroller";
    this.container.append(this.scroller);
    this.rows = document.createElement("div");
    this.rows.className = "gui-rows";
    this.scroller.append(this.rows);
    this._current = this.rows;
    this._currentTab = this.rows;
    this._tabBar = null;
    this._tabs = [];
    this._activeTab = signal(0);
    const wide = window.innerWidth > 950;
    this.rowsExpanded = signal(this._readUIState("expanded", opts.expanded ?? wide));
    titleEl.addEventListener("click", () => {
      this.rowsExpanded.set(!this.rowsExpanded.peek());
      this._writeUIState("expanded", this.rowsExpanded.peek());
    });
    this._stops = [
      effect(() => {
        const expanded = this.rowsExpanded();
        this.rows.classList.toggle("visible", expanded);
        this.container.classList.toggle("collapsed", !expanded);
      }),
      effect(() => this._syncTabs(this._activeTab()))
    ];
    el.append(this.container);
    if (opts.visible !== false) this.show();
  }
  // --- panel-level -------------------------------------------------------------------
  show() {
    this.container.classList.add("visible");
    return this;
  }
  hide() {
    this.container.classList.remove("visible");
    return this;
  }
  // Tears the whole panel down: every row's effects, every key binding, the DOM.
  destroy() {
    [...this._controllers].forEach((c) => c.destroy());
    this._unbinds.forEach((u) => u());
    this._unbinds.length = 0;
    this._stops.forEach((stop) => stop());
    this._stops.length = 0;
    this.container.remove();
  }
  // Called both by the active-tab effect and by addTab — a newly added panel has to be
  // classed straight away, and adding a tab doesn't change which index is active.
  // Only reflects state — it must not write the remembered tab. A panel being rebuilt adds
  // its tabs one at a time, and each addTab would otherwise save the tab that happens to be
  // active mid-build, wiping the name it is about to restore.
  _syncTabs(active = this._activeTab.peek()) {
    this._tabs.forEach((tab, i) => {
      tab.panel.classList.toggle("active", i === active);
      tab.button.classList.toggle("active", i === active);
    });
  }
  _forget(controller) {
    const i = this._controllers.indexOf(controller);
    if (i !== -1) this._controllers.splice(i, 1);
    const t = this._tabs.indexOf(controller);
    if (t !== -1) {
      this._tabs.splice(t, 1);
      this._tabs.forEach((tab, i2) => tab.index = i2);
      const active = Math.min(this._activeTab.peek(), this._tabs.length - 1);
      this._activeTab.set(Math.max(0, active));
      this._syncTabs();
    }
  }
  // Panel layout state (folded/expanded/active tab) — kept apart from app parameters, and
  // silently skipped when no storageKey was given or storage is unavailable.
  _readUIState(key, fallback) {
    if (!this._storageKey) return fallback;
    try {
      const raw = localStorage.getItem(`${this._storageKey}:ui:${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  _writeUIState(key, value) {
    if (!this._storageKey) return;
    try {
      localStorage.setItem(`${this._storageKey}:ui:${key}`, JSON.stringify(value));
    } catch {
    }
  }
  // --- structure ---------------------------------------------------------------------
  // A top-level tab. Subsequent add*() calls go into it until the next addTab(). The tab
  // bar appears on the first call; the first tab is active unless a remembered one wins.
  addTab(name) {
    if (!this._tabBar) {
      this._tabBar = document.createElement("div");
      this._tabBar.className = "gui-tabbar";
      this.rows.append(this._tabBar);
    }
    const index = this._tabs.length;
    const panel = document.createElement("div");
    panel.className = "gui-tab-panel";
    this.rows.append(panel);
    const button = document.createElement("button");
    button.className = "gui-tab-btn";
    button.type = "button";
    button.textContent = name;
    this._tabBar.append(button);
    const tab = new Tab(this, panel, panel, button, index);
    button.onclick = () => this.selectTab(tab.index);
    this._tabs.push(tab);
    this._controllers.push(tab);
    this._currentTab = panel;
    this._current = panel;
    if (this._readUIState("tab", null) === name) this._activeTab.set(index);
    else this._syncTabs();
    return tab;
  }
  // Choosing a tab is the only thing that records one, so the remembered tab is always a
  // deliberate choice rather than a side effect of building the panel.
  selectTab(index) {
    this._activeTab.set(index);
    const tab = this._tabs[index];
    if (tab) this._writeUIState("tab", tab.button.textContent);
    return this;
  }
  // A titled group inside the current tab. `visibleWhen` hides the whole group (an
  // attractor's settings while a different field is selected, say) and `disabledWhen` greys
  // it out; `open`/`collapsible` control folding, which is remembered per section when the
  // GUI has a storageKey.
  addSection(name, opts = {}) {
    const { collapsible = true } = opts;
    const visible = condition(opts.visibleWhen, opts.visible);
    const disabled = condition(opts.disabledWhen, opts.disabled);
    const section = document.createElement("div");
    section.className = "gui-section";
    const title = document.createElement("div");
    title.className = "gui-section-title";
    title.textContent = name;
    const body = document.createElement("div");
    body.className = "gui-section-body";
    section.append(title, body);
    this._currentTab.append(section);
    this._current = body;
    const tabName = this._tabs.length ? this._tabs[this._tabs.length - 1].button.textContent : "";
    const stateKey = `section:${tabName}/${name}`;
    const open = signal(collapsible ? this._readUIState(stateKey, opts.open ?? true) : true);
    const controller = new Section(this, section, body, open);
    if (collapsible) {
      const chevron = document.createElement("span");
      chevron.className = "gui-chevron";
      chevron.innerHTML = CHEVRON;
      title.append(chevron);
      title.classList.add("gui-collapsible");
      title.addEventListener("click", () => {
        controller.toggle();
        this._writeUIState(stateKey, open.peek());
      });
      controller.bind(() => section.classList.toggle("open", open()));
    } else {
      section.classList.add("open");
    }
    if (visible) controller.bind(() => section.classList.toggle("gui-hidden", !visible()));
    if (disabled) controller.bind(() => section.classList.toggle("disabled", !!disabled()));
    this._controllers.push(controller);
    return controller;
  }
  // Sends following controls back to the tab (or the panel root) rather than the section
  // opened last.
  endSection() {
    this._current = this._currentTab;
    return this;
  }
  // Adds into a specific tab or section rather than wherever the last one left the cursor.
  // Building a panel is sequential, but adding a row later is not — a button that appends a
  // layer needs to say where the layer goes, long after that section stopped being current.
  // With a callback the target applies only inside it; without one it sticks.
  into(target, fn) {
    const container = target instanceof Section ? target.body : target instanceof Tab ? target.panel : target;
    const prevCurrent = this._current;
    const prevTab = this._currentTab;
    this._current = container;
    if (target instanceof Tab) this._currentTab = target.panel;
    if (!fn) return this;
    try {
      return fn();
    } finally {
      this._current = prevCurrent;
      this._currentTab = prevTab;
    }
  }
  // --- rows --------------------------------------------------------------------------
  createRow(label, opts = {}) {
    const row = document.createElement("div");
    row.className = "gui-row";
    const controller = new Controller(this, row);
    if (label) {
      const labelEl = document.createElement("span");
      labelEl.className = "gui-label";
      labelEl.textContent = label;
      if (opts.title) labelEl.title = opts.title;
      row.append(labelEl);
      controller.labelEl = labelEl;
    }
    const disabled = condition(opts.disabledWhen, opts.disabled);
    if (disabled) controller.bind(() => row.classList.toggle("disabled", !!disabled()));
    const visible = condition(opts.visibleWhen, opts.visible);
    if (visible) controller.bind(() => row.classList.toggle("gui-hidden", !visible()));
    this._current.append(row);
    this._controllers.push(controller);
    return controller;
  }
  // Clicking a control's label rolls a new value for it. `fn` does the rolling; wiring it
  // here also enrolls the control in panel-wide randomization.
  _randomizable(controller, fn, opts) {
    if (opts.randomizable === false) return;
    controller.randomize = fn;
    if (!controller.labelEl) return;
    controller.labelEl.classList.add("gui-randomizable");
    controller.labelEl.title = opts.title || "Click to randomize";
    const handler = () => {
      if (controller.row.classList.contains("disabled")) return;
      this._beforeRandomize();
      fn();
    };
    controller.labelEl.addEventListener("click", handler);
    controller.onDestroy(() => controller.labelEl.removeEventListener("click", handler));
  }
  _beforeRandomize() {
    if (this.options.onBeforeRandomize) this.options.onBeforeRandomize();
  }
  // Rerolls every randomizable control, or only those added after `from` (a controller or
  // an index) — that's how a "Randomize" button randomizes what follows it and not itself.
  randomizeAll(from = 0) {
    let start = from;
    if (from instanceof Controller) {
      const at = this._controllers.indexOf(from);
      if (at === -1) return this;
      start = at + 1;
    }
    this._beforeRandomize();
    this._controllers.slice(Math.max(0, start)).forEach((c) => {
      if (!c.randomize || c.row.classList.contains("disabled")) return;
      c.randomize();
    });
    return this;
  }
  // --- controls ----------------------------------------------------------------------
  addButton(label, onClick, a) {
    const opts = readButtonOptions(a);
    const controller = this.createRow(null, opts);
    const btn = document.createElement("button");
    btn.className = "gui-btn";
    btn.type = "button";
    btn.textContent = label;
    btn.onclick = onClick;
    controller.row.append(btn);
    controller.el = btn;
    controller.setLabel = (text) => {
      btn.textContent = text;
      return controller;
    };
    return controller;
  }
  // A button that rerolls the panel, then calls `onDone` (rebuild the scene, reseed,
  // whatever the new values need). Bound to a key as well — R by default.
  //
  // `scope: "following"` narrows it to the controls added after the button, which is useful
  // when a preset picker or an output setting sits above it. It is not the default: a button
  // added at the bottom of a panel would then reroll nothing at all, silently.
  addRandomizeButton(label = "Randomize", onDone = () => {
  }, a) {
    const opts = readButtonOptions(a);
    let controller = null;
    const run = () => {
      this.randomizeAll(opts.scope === "following" ? controller : 0);
      onDone();
    };
    controller = this.addButton(label, run, opts);
    if (opts.key !== null) {
      const unbind = bindKey(opts.key || "KeyR", run);
      this._unbinds.push(unbind);
      controller.onDestroy(unbind);
    }
    return controller;
  }
  // Several buttons sharing one row, so a pair like Export / Import costs one row instead
  // of two. `buttons` is a list of { label, onClick, title }.
  addButtons(label, buttons, a) {
    const opts = readButtonOptions(a);
    const controller = this.createRow(label, opts);
    const group = document.createElement("div");
    group.className = label ? "gui-control gui-btn-group" : "gui-btn-group";
    controller.buttons = buttons.map(({ label: text, onClick, title }) => {
      const btn = document.createElement("button");
      btn.className = "gui-btn";
      btn.type = "button";
      btn.textContent = text;
      if (title) btn.title = title;
      btn.onclick = onClick;
      group.append(btn);
      return btn;
    });
    controller.row.append(group);
    controller.el = group;
    return controller;
  }
  addCheckbox(label, value, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);
    this._randomizable(controller, () => {
      sig.set(randomBool());
      opts.onChange && opts.onChange(sig());
    }, opts);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "gui-checkbox";
    input.onchange = () => {
      sig.set(input.checked);
      opts.onChange && opts.onChange(input.checked);
    };
    controller.bind(() => input.checked = targetOf(sig)());
    controller.row.append(input);
    controller.el = input;
    controller.signal = sig;
    return controller;
  }
  // `options` is a list of values, or of [value, label] pairs when the two differ.
  addSelect(label, value, options, a, b) {
    if (Array.isArray(value) && typeof options === "function") {
      const swap = value;
      value = options;
      options = swap;
    }
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);
    this._randomizable(controller, () => {
      sig.set(optionValue(randomElement(controller.options)));
      opts.onChange && opts.onChange(sig());
    }, opts);
    const select = document.createElement("select");
    select.className = "gui-select";
    select.onchange = () => {
      const match = controller.options.find((o) => String(optionValue(o)) === select.value);
      const v = match === void 0 ? select.value : optionValue(match);
      sig.set(v);
      opts.onChange && opts.onChange(v);
    };
    let optionValues = /* @__PURE__ */ new Set();
    controller.setOptions = (list) => {
      controller.options = list;
      optionValues = new Set(list.map((o) => String(optionValue(o))));
      select.innerHTML = "";
      list.forEach((opt) => {
        const el = document.createElement("option");
        el.value = optionValue(opt);
        el.textContent = optionLabel(opt);
        select.append(el);
      });
      select.value = String(sig.peek());
      return controller;
    };
    controller.setOptions(options);
    controller.bind(() => {
      const v = String(targetOf(sig)());
      if (optionValues.has(v)) select.value = v;
    });
    controller.row.append(select);
    controller.el = select;
    controller.signal = sig;
    return controller;
  }
  addSlider(label, value, min, max, step, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);
    this._randomizable(controller, () => {
      sig.set(snap(randomInRange(min, max), step, min, max));
      opts.onChange && opts.onChange(sig());
    }, opts);
    const wrapper = document.createElement("div");
    wrapper.className = "gui-slider-container";
    const input = document.createElement("range-slider");
    input.className = "gui-slider";
    input.min = min;
    input.max = max;
    input.step = step;
    input.oninput = () => {
      const v = parseFloat(input.value);
      sig.set(v);
      opts.onChange && opts.onChange(v);
    };
    const valDisplay = document.createElement("span");
    valDisplay.className = "gui-slider-val";
    valDisplay.title = "Click to type a value";
    const startEditing = () => {
      if (controller.row.classList.contains("disabled")) return;
      if (valDisplay.dataset.editing) return;
      valDisplay.dataset.editing = "1";
      const editor = document.createElement("input");
      editor.type = "text";
      editor.className = "gui-slider-edit";
      editor.value = formatFloat(targetOf(sig).peek(), step);
      valDisplay.replaceWith(editor);
      editor.focus();
      editor.select();
      let committed = false;
      const commit = (accept) => {
        if (committed) return;
        committed = true;
        editor.onblur = null;
        if (accept) {
          const parsed = parseFloat(editor.value);
          if (isFinite(parsed)) {
            const v = snap(parsed, step, min, max);
            sig.set(v);
            opts.onChange && opts.onChange(v);
          }
        }
        editor.replaceWith(valDisplay);
        delete valDisplay.dataset.editing;
      };
      editor.onblur = () => commit(true);
      editor.onkeydown = (e) => {
        if (e.key === "Enter") commit(true);
        else if (e.key === "Escape") commit(false);
      };
    };
    valDisplay.addEventListener("click", startEditing);
    controller.bind(() => {
      const v = targetOf(sig)();
      input.value = v;
      valDisplay.textContent = formatFloat(v, step);
    });
    wrapper.append(input, valDisplay);
    controller.row.append(wrapper);
    controller.el = input;
    controller.signal = sig;
    return controller;
  }
  // Two handles over one range; the signal holds [min, max].
  addRangeSlider(label, value, min, max, step, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);
    this._randomizable(controller, () => {
      const lo = snap(randomInRange(min, max), step, min, max);
      const hi = snap(randomInRange(lo, max), step, min, max);
      sig.set([lo, hi]);
      opts.onChange && opts.onChange(sig());
    }, opts);
    const wrapper = document.createElement("div");
    wrapper.className = "gui-slider-container";
    const input = document.createElement("range-slider");
    input.setAttribute("dual", "");
    input.className = "gui-slider";
    input.min = min;
    input.max = max;
    input.step = step;
    input.oninput = () => {
      const [lo, hi] = input.value;
      sig.set([parseFloat(lo), parseFloat(hi)]);
      opts.onChange && opts.onChange(sig());
    };
    const valDisplay = document.createElement("span");
    valDisplay.className = "gui-slider-val gui-range-val";
    controller.bind(() => {
      const [lo, hi] = targetOf(sig)();
      input.value = [lo, hi];
      valDisplay.textContent = composeRangeValue(lo, hi, step);
    });
    wrapper.append(input, valDisplay);
    controller.row.append(wrapper);
    controller.el = input;
    controller.signal = sig;
    return controller;
  }
  addColor(label, value, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);
    this._randomizable(controller, () => {
      sig.set(randomHexColor());
      opts.onChange && opts.onChange(sig());
    }, opts);
    const input = document.createElement("input");
    input.type = "color";
    input.className = "gui-color";
    input.oninput = () => {
      sig.set(input.value);
      opts.onChange && opts.onChange(input.value);
    };
    controller.bind(() => input.value = targetOf(sig)());
    controller.row.append(input);
    controller.el = input;
    controller.signal = sig;
    return controller;
  }
  addTextInput(label, value, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);
    const input = document.createElement("input");
    input.type = "text";
    input.className = "gui-input-text";
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.oninput = () => {
      sig.set(input.value);
      opts.onChange && opts.onChange(input.value);
    };
    controller.bind(() => {
      const v = targetOf(sig)();
      if (document.activeElement !== input) input.value = v;
    });
    controller.row.append(input);
    controller.el = input;
    controller.signal = sig;
    return controller;
  }
  addNumber(label, value, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);
    const input = document.createElement("input");
    input.type = "number";
    input.className = "gui-input-number";
    if (opts.min !== void 0) input.min = opts.min;
    if (opts.max !== void 0) input.max = opts.max;
    if (opts.step !== void 0) input.step = opts.step;
    input.oninput = () => {
      const v = parseFloat(input.value);
      if (!isFinite(v)) return;
      sig.set(v);
      opts.onChange && opts.onChange(v);
    };
    controller.bind(() => {
      const v = targetOf(sig)();
      if (document.activeElement !== input) input.value = v;
    });
    controller.row.append(input);
    controller.el = input;
    controller.signal = sig;
    return controller;
  }
  // Read-only display of a signal (frame time, particle count, whatever the app computes).
  // Unlike the editable controls this reads the value rather than the target: a readout has
  // no hand to fight, and showing a value travelling is usually the reason for pointing one
  // at a tween.
  addMonitor(label, value, a, b) {
    const opts = readOptions(a, b);
    const sig = toSignal(value);
    const controller = this.createRow(label, opts);
    const out = document.createElement("span");
    out.className = "gui-monitor";
    const format = opts.format || ((v) => String(v));
    controller.bind(() => out.textContent = format(sig()));
    controller.row.append(out);
    controller.el = out;
    controller.signal = sig;
    return controller;
  }
  // A file picker that hands the File to `onFile`. The input is reset after each pick so
  // choosing the same file twice still fires.
  addFileButton(label, onFile, a) {
    const opts = readButtonOptions(a);
    const controller = this.addButton(label, () => input.click(), opts);
    const input = document.createElement("input");
    input.type = "file";
    input.hidden = true;
    if (opts.accept) input.accept = opts.accept;
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (file) onFile(file);
      input.value = "";
    });
    controller.row.append(input);
    controller.fileInput = input;
    return controller;
  }
  addLabel(text, opts = {}) {
    return this.createRow(text, opts);
  }
  // Free-form HTML inside a row — a description, a legend, a link.
  addText(html) {
    const controller = this.createRow();
    const content = document.createElement("div");
    content.className = "gui-text";
    content.innerHTML = html;
    controller.row.append(content);
    controller.el = content;
    return controller;
  }
  addSeparator() {
    const controller = this.createRow();
    const line = document.createElement("div");
    line.className = "gui-separator";
    controller.row.append(line);
    controller.el = line;
    return controller;
  }
  // Any element, wrapped in a row so it lines up with everything else.
  addElement(el, opts = {}) {
    const controller = this.createRow(opts.label, opts);
    controller.row.append(el);
    controller.el = el;
    return controller;
  }
  // --- presets -----------------------------------------------------------------------
  // Builds the UI for a preset store (see presets.js): a picker of built-ins, a picker of
  // saved ones, and save/load/delete/export/import. Returns the controllers it created.
  addPresets(store, opts = {}) {
    const created = {};
    if (opts.builtin !== false && store.builtinNames().length) {
      const names = store.builtinNames();
      const pick = signal(names.includes(store.current.peek()) ? store.current.peek() : names[0]);
      created.builtin = this.addSelect(opts.label || "Preset", pick, names, {
        onChange: (name2) => store.apply(name2)
      });
      created.builtin.bind(
        () => pick.set(names.includes(store.current()) ? store.current() : names[0])
      );
    }
    const attach = (controller, text, title, onClick) => {
      controller.row.classList.add("gui-compact");
      const btn = document.createElement("button");
      btn.className = "gui-btn gui-btn-mini";
      btn.type = "button";
      btn.textContent = text;
      btn.title = title;
      btn.onclick = onClick;
      controller.row.append(btn);
      return btn;
    };
    const selected = signal("");
    created.saved = this.addSelect("Saved", selected, [], { randomizable: false });
    const refresh = (select) => {
      const names = store.userNames();
      created.saved.setOptions(names.length ? names : [["", "(none saved)"]]);
      const next = select && names.includes(select) ? select : names[0] || "";
      selected.set(next);
      created.saved.el.value = next;
    };
    refresh();
    created.load = attach(created.saved, "Load", "Load the selected preset", () => {
      if (selected()) store.apply(selected());
    });
    created.remove = attach(created.saved, "✕", "Delete the selected preset", () => {
      if (!selected()) return;
      store.remove(selected());
      refresh();
    });
    const name = signal("");
    created.name = this.addTextInput("Name", name, { placeholder: "name this look" });
    created.save = attach(created.name, opts.saveLabel || "Save", "Save the current values", () => {
      const key = name().trim();
      if (!key) return;
      store.save(key);
      refresh(key);
    });
    const importFile = (file) => store.importFile(file).then(() => refresh()).catch((e) => {
      console.warn("[guspira] could not import preset:", e);
      if (opts.onImportError) opts.onImportError(e);
    });
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.hidden = true;
    fileInput.accept = "application/json,.json";
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) importFile(file);
      fileInput.value = "";
    });
    created.files = this.addButtons(null, [
      {
        label: "Export",
        title: "Download the current values as JSON",
        onClick: () => store.exportFile(name().trim() || selected() || "preset")
      },
      { label: "Import", title: "Load values from a JSON file", onClick: () => fileInput.click() }
    ]);
    created.files.row.append(fileInput);
    created.refresh = refresh;
    return created;
  }
};
var gui_default = GUI;

// src/color.js
var clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
var toLinear = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
var toSrgb = (c) => c <= 31308e-7 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
var isHexColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  ];
}
function rgbToHex(rgb) {
  return `#${rgb.map(
    (c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, "0")
  ).join("")}`;
}
function rgbToOklab([r, g, b]) {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}
function oklabToRgb([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    toSrgb(clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    toSrgb(clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    toSrgb(clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s))
  ];
}
function mixColors(from, to, t) {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const a = rgbToOklab(hexToRgb(from));
  const b = rgbToOklab(hexToRgb(to));
  return rgbToHex(oklabToRgb([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ]));
}

// src/params.js
var sameType = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length;
  }
  return typeof a === typeof b;
};
function coerce(raw, fallback) {
  if (typeof fallback === "number") {
    const v = parseFloat(raw);
    return isFinite(v) ? v : void 0;
  }
  if (typeof fallback === "boolean") {
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
    return void 0;
  }
  if (Array.isArray(fallback)) {
    const parts = raw.split(",").map((p) => parseFloat(p));
    if (parts.length !== fallback.length || parts.some((p) => !isFinite(p))) return void 0;
    return parts;
  }
  return raw;
}
function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function createParams(defaults, options = {}) {
  const {
    storageKey = null,
    exclude = [],
    url = false,
    migrate = null,
    delay = 250,
    ease = null
  } = options;
  const easing = typeof ease === "number" ? { duration: ease } : ease;
  const keys = Object.keys(defaults);
  const persisted = keys.filter((k) => !exclude.includes(k));
  let stored = storageKey ? readStorage(storageKey) : {};
  if (migrate) stored = migrate(stored) || stored;
  if (url && typeof location !== "undefined") {
    const allowed = Array.isArray(url) ? url : keys;
    const query = new URLSearchParams(location.search);
    for (const key of allowed) {
      if (!query.has(key)) continue;
      const value = coerce(query.get(key), defaults[key]);
      if (value !== void 0) stored[key] = value;
    }
  }
  const easedSignal = (key, value) => {
    if (!easing) return signal(value);
    const { duration = 400, easing: curve, only = null, skip = [] } = easing;
    const wanted = (only ? only.includes(key) : true) && !skip.includes(key);
    if (!wanted) return signal(value);
    if (typeof value === "number") return tweened(value, duration, curve);
    if (isHexColor(value)) return tweened(value, duration, curve, mixColors);
    return signal(value);
  };
  const params = {};
  for (const key of keys) {
    const value = key in stored && sameType(stored[key], defaults[key]) ? stored[key] : defaults[key];
    params[key] = easedSignal(key, value);
  }
  const snapshot = (subset = persisted) => {
    const out = {};
    for (const key of subset) out[key] = params[key].target();
    return out;
  };
  const apply = (values) => {
    if (!values || typeof values !== "object") return [];
    const applied = [];
    batch(() => {
      for (const [key, value] of Object.entries(values)) {
        if (!(key in params) || !sameType(value, defaults[key])) continue;
        params[key].set(value);
        applied.push(key);
      }
    });
    return applied;
  };
  const reset = (subset = keys) => {
    batch(() => subset.forEach((key) => params[key].set(defaults[key])));
  };
  let timer = null;
  let flush = () => {
  };
  let stop = () => {
  };
  if (storageKey) {
    flush = () => {
      clearTimeout(timer);
      writeStorage(storageKey, snapshot());
    };
    const schedulePersist = () => {
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    };
    const stops = persisted.map(
      (key) => effect(() => {
        params[key].target();
        schedulePersist();
      })
    );
    const onHide = () => flush();
    const canListen = typeof addEventListener === "function";
    if (canListen) addEventListener("pagehide", onHide);
    stop = () => {
      clearTimeout(timer);
      stops.forEach((s) => s());
      if (canListen) removeEventListener("pagehide", onHide);
    };
  }
  const helpers = {
    $defaults: defaults,
    $keys: keys,
    $persisted: persisted,
    $snapshot: snapshot,
    $apply: apply,
    $reset: reset,
    $flush: flush,
    $stop: stop,
    // Retimes every parameter that travels; 0 makes them arrive at once.
    $ease: (ms) => {
      for (const key of keys) {
        if (params[key].target !== params[key]) params[key].duration = ms;
      }
    },
    $clear: () => {
      if (storageKey) {
        try {
          localStorage.removeItem(storageKey);
        } catch {
        }
      }
    },
    // A query string for the current state, skipping anything still at its default — for
    // "copy a link to this look".
    $toQuery: () => {
      const query = new URLSearchParams();
      for (const key of persisted) {
        const value = params[key].target();
        if (sameType(value, defaults[key]) && String(value) === String(defaults[key])) continue;
        query.set(key, Array.isArray(value) ? value.join(",") : String(value));
      }
      return query.toString();
    }
  };
  for (const [name, fn] of Object.entries(helpers)) {
    Object.defineProperty(params, name, { value: fn, enumerable: false });
  }
  return params;
}

// src/presets.js
var CUSTOM = "custom";
function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function createPresetStore(params, options = {}) {
  const {
    builtin = {},
    storageKey = null,
    exclude = [],
    customName = CUSTOM,
    onApply = null
  } = options;
  const subset = params.$persisted.filter((k) => !exclude.includes(k));
  let user = storageKey ? readStorage(storageKey) : {};
  const current = signal(customName);
  const store = {
    current,
    builtinNames: () => [customName, ...Object.keys(builtin)],
    userNames: () => Object.keys(user),
    snapshot: () => params.$snapshot(subset),
    // Takes a preset name (built-in or saved) or a plain object of values.
    apply(nameOrValues) {
      if (nameOrValues === customName) return [];
      const values = typeof nameOrValues === "string" ? builtin[nameOrValues] || user[nameOrValues] : nameOrValues;
      if (!values) return [];
      const applied = params.$apply(values);
      if (typeof nameOrValues === "string") current.set(nameOrValues);
      else current.set(customName);
      if (onApply) onApply(nameOrValues, applied);
      return applied;
    },
    markCustom() {
      current.set(customName);
    },
    save(name) {
      user[name] = store.snapshot();
      if (storageKey) writeStorage(storageKey, user);
      current.set(name);
      return user[name];
    },
    remove(name) {
      delete user[name];
      if (storageKey) writeStorage(storageKey, user);
    },
    exportFile(name = "preset") {
      const values = user[name] || store.snapshot();
      download(`${name}.json`, JSON.stringify(values, null, 2));
    },
    // Accepts both a bare snapshot and a wrapper like { name, params }, since that's what
    // hand-written preset files tend to look like.
    importFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
          try {
            const parsed = JSON.parse(reader.result);
            const values = parsed && parsed.params ? parsed.params : parsed;
            const applied = store.apply(values);
            if (parsed && parsed.name) {
              user[parsed.name] = values;
              if (storageKey) writeStorage(storageKey, user);
              current.set(parsed.name);
            }
            resolve(applied);
          } catch (e) {
            reject(e);
          }
        };
        reader.readAsText(file);
      });
    },
    // The full state as JSON — paste into a bug report, or back in through import.
    toJSON: () => JSON.stringify(store.snapshot(), null, 2)
  };
  return store;
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
    }
    ta.remove();
    return ok;
  }
}
export {
  Controller,
  gui_default as GUI,
  range_slider_default as RangeSlider,
  Section,
  Tab,
  batch,
  bindKey,
  computed,
  copyText,
  createParams,
  createPresetStore,
  createScheduler,
  easings,
  effect,
  effectRAF,
  formatFloat,
  frame,
  hexToRgb,
  isSignal,
  microtask,
  mixColors,
  precision,
  random,
  randomBool,
  randomElement,
  randomHexColor,
  randomInRange,
  readStorage,
  setRandomSource,
  signal,
  snap,
  toSignal,
  tweened,
  untrack,
  writeStorage
};
