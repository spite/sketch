import { Vector2, DoubleSide } from "../third_party/three.module.js";
import { LineMaterial, generateParams } from "./lineMaterial.js";
import { GUI } from "../third_party/guspira.js";
import { initScene } from "../js/scene.js";
import { renderer, scene, camera, resize, dPR } from "../js/renderer.js";
import { addPaperParams, addEnvParams } from "../js/params.js";

// from https://twitter.com/oceanquigley/status/1322991432160866304

const gui = new GUI("Lines VI", document.querySelector("#gui"));
gui.show();
gui.addSection("Material");

const material = new LineMaterial({
  color: 0x808080,
  roughness: 0.4,
  metalness: 0.1,
  side: DoubleSide,
});
generateParams(gui, material);
addPaperParams(gui, material, "Parchment");
addEnvParams(gui, material, "bridge");

const tmp = new Vector2();
function render() {
  renderer.getSize(tmp);
  tmp.multiplyScalar(dPR);
  material.uniforms.resolution.value.copy(tmp);
  renderer.render(scene, camera);
  renderer.setAnimationLoop(render);
}

async function init() {
  const controllers = await initScene(scene, material, gui);
  controllers.torus.setValue(true);
  controllers.spheres.setValue(true);
  resize();
  render();
}

init();
