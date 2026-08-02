import { Color } from "../third_party/three.module.js";
import { signal } from "../third_party/guspira.js";
import { maxPixelRatio, setMaxPixelRatio } from "./renderer.js";
import { getTexture as getPaperTexture, paperNames } from "./paper.js";
import { getTexture as getEnvTexture, environmentNames } from "./envMap.js";

function clamp255(v) {
  return Math.round(Math.min(255, Math.max(0, v)));
}

// Some shaders keep ink as 0-255 components and divide in GLSL; others keep a
// normalised Color. hexFrom/applyHex bridge both to the "#rrggbb" the picker uses.
function hexFrom(color, scale255) {
  if (!scale255) return `#${color.getHexString()}`;
  const to = (v) => clamp255(v).toString(16).padStart(2, "0");
  return `#${to(color.r)}${to(color.g)}${to(color.b)}`;
}

function applyHex(color, hex, scale255) {
  const c = new Color(hex);
  if (scale255) color.setRGB(c.r * 255, c.g * 255, c.b * 255);
  else color.copy(c);
}

function addRenderParams(gui) {
  const cap = signal(maxPixelRatio);
  const effective = signal(Math.min(window.devicePixelRatio, maxPixelRatio));
  gui.addSlider("pixel ratio cap", cap, 0.5, 3, 0.25, (v) => {
    setMaxPixelRatio(v);
    effective.set(Math.min(window.devicePixelRatio, v));
  });
  gui.addMonitor("effective", effective, { format: (v) => `${v}x` });
  return { cap, effective };
}

function addMaterialParams(gui, material) {
  // Sketch materials keep defaults on a .params object; post sketches pass a
  // plain MeshStandardMaterial and read straight off it.
  const params = material.params ?? material;
  const roughness = signal(params.roughness);
  const metalness = signal(params.metalness);
  gui.addSlider("roughness", roughness, 0, 1, 0.01, (v) => {
    material.roughness = v;
  });
  gui.addSlider("metalness", metalness, 0, 1, 0.01, (v) => {
    material.metalness = v;
  });
  return { roughness, metalness };
}

function addInkParams(gui, colorUniform, options = {}) {
  const { label = "ink color", scale255 = false } = options;
  const ink = signal(hexFrom(colorUniform.value, scale255));
  gui.addColor(label, ink, (hex) => {
    applyHex(colorUniform.value, hex, scale255);
  });
  return ink;
}

function addPaperParams(gui, target, initial = "Craft light") {
  const paper = signal(initial);
  const apply = async (v) => {
    target.uniforms.paperTexture.value = await getPaperTexture(v);
  };
  gui.addSelect("paper", paper, paperNames, apply);
  apply(initial);
  return paper;
}

function addEnvParams(gui, material, initial = "bridge") {
  const environment = signal(initial);
  const apply = (v) => {
    material.envMap = getEnvTexture(v);
    material.needsUpdate = true;
  };
  gui.addSelect("environment", environment, environmentNames, apply);
  apply(initial);
  return environment;
}

export {
  addRenderParams,
  addMaterialParams,
  addInkParams,
  addPaperParams,
  addEnvParams,
};
