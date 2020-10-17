import { Vector2, DoubleSide } from "../third_party/three.module.js";
import {
  ScreenSpaceSketchMaterial,
  generateParams,
} from "./screenSpaceSketchMaterial.js";
import * as dat from "../third_party/dat.gui.module.js";
import { initScene } from "../js/scene.js";
import { renderer, scene, camera, resize } from "../js/renderer.js";
import { generateParams as generatePaperParams } from "../js/paper.js";
import { generateParams as generateEnvParams } from "../js/envMap.js";

const gui = new dat.GUI();
const materialFolder = gui.addFolder("Material");
materialFolder.open();

const material = new ScreenSpaceSketchMaterial({
  color: 0x808080,
  roughness: 0.4,
  metalness: 0.1,
  side: DoubleSide,
});
generateParams(materialFolder, material);
const paperController = generatePaperParams(materialFolder, material);
paperController.setValue("Watercolor cold press");
const envMapController = generateEnvParams(materialFolder, material);
envMapController.setValue("bridge");

const tmp = new Vector2();
function render() {
  renderer.getSize(tmp);
  tmp.multiplyScalar(window.devicePixelRatio);
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
