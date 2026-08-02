import { DoubleSide } from "../third_party/three.module.js";
import { Material, generateParams } from "./Material.js";
import { GUI } from "../third_party/guspira.js";
import { initScene, update } from "../js/scene.js";
import { renderer, scene, camera, resize, onResize, dPR } from "../js/renderer.js";
import { Post } from "./post.js";
import { addEnvParams } from "../js/params.js";

const post = new Post(renderer);

const gui = new GUI("Post Scribble hatch I", document.querySelector("#gui"));
gui.show();
gui.addSection("Material");

const material = new Material({
  color: 0x808080,
  roughness: 0.2,
  metalness: 0.1,
  side: DoubleSide,
});
generateParams(gui, material);
post.generateParams(gui, { paper: "Parchment" });
addEnvParams(gui, material, "bridge");

function render() {
  update();
  post.render(scene, camera);
  renderer.setAnimationLoop(render);
}

async function init() {
  const controllers = await initScene(scene, material, gui);
  controllers.torus.setValue(true);
  controllers.spheres.setValue(true);
  resize();
  render();
}

onResize(() => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  post.setSize(width * dPR, height * dPR);
});

init();
