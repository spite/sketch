import { Vector2, DoubleSide } from "../third_party/three.module.js";
import { LineMaterial, generateParams } from "./lineMaterial.js";
import { GUI } from "../third_party/guspira.js";
import { initScene, update } from "../js/scene.js";
import { renderer, scene, camera, resize, dPR } from "../js/renderer.js";
import { addPaperParams, addEnvParams } from "../js/params.js";

const gui = new GUI("Scribble hatch I", document.querySelector("#gui"));
gui.show();
gui.addSection("Material");

const material = new LineMaterial({
  color: 0x808080,
  roughness: 0.2,
  metalness: 0.1,
  side: DoubleSide,
});
generateParams(gui, material);
addPaperParams(gui, material, "Craft light");
addEnvParams(gui, material, "bridge");

const tmp = new Vector2();
function render() {
  update();
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
