import { DoubleSide } from "../third_party/three.module.js";
import { Material, generateParams } from "./Material.js";
import * as dat from "../third_party/dat.gui.module.js";
import { initScene, update } from "../js/scene.js";
import { renderer, scene, camera, resize, onResize } from "../js/renderer.js";
import { generateParams as generateEnvParams } from "../js/envMap.js";
import { Post } from "./post.js";

renderer.setClearColor(0xffffff, 0);

const post = new Post(renderer);

const gui = new dat.GUI();
const materialFolder = gui.addFolder("Material");
materialFolder.open();

const material = new Material({
  color: 0x808080,
  roughness: 0.2,
  metalness: 0.1,
  side: DoubleSide,
});
generateParams(materialFolder, material);
const postController = post.generateParams(materialFolder);
postController["paper"].setValue("Parchment");
const envMapController = generateEnvParams(materialFolder, material);
envMapController.setValue("bridge");

function render() {
  update();
  post.render(scene, camera);
  renderer.setAnimationLoop(render);
}

async function init() {
  const controllers = await initScene(scene, material, gui);
  controllers.backdrop.setValue(false);
  controllers.torus.setValue(true);
  controllers.spheres.setValue(true);
  resize();
  render();
}

onResize(() => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dPR = window.devicePixelRatio;
  post.setSize(width * dPR, height * dPR);
});

init();
