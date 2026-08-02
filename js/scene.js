import { obj as blob } from "../js/sceneBlob.js";
import { obj as torus } from "../js/sceneTorus.js";
import { obj as backdrop } from "../js/sceneBackdrop.js";
import { obj as spheres } from "../js/sceneSpheres.js";
import { obj as suzanne } from "../js/sceneSuzanne.js";
//import { obj as zardoz } from "../js/sceneZardoz.js";
import { obj as leePerry } from "../js/sceneLeePerry.js";
import { obj as metaballs } from "../js/sceneMetaballs.js";

import {
  DirectionalLight,
  HemisphereLight,
  AmbientLight,
  PointLight,
} from "../third_party/three.module.js";
import { signal } from "../third_party/guspira.js";
import { addRenderParams } from "./params.js";

function initLights(scene) {
  const light = new DirectionalLight(0xffffff, 0.5);
  light.position.set(0, 1, 3);
  light.castShadow = true;
  light.shadow.bias = -0.0001;
  light.shadow.mapSize.set(1024, 1024);
  scene.add(light);

  const light2 = new DirectionalLight(0xffffff, 0.5);
  light2.position.set(-3, -3, -3);
  light2.castShadow = true;
  light2.shadow.bias = -0.0001;
  light2.shadow.mapSize.set(1024, 1024);
  scene.add(light2);

  const hemiLight = new HemisphereLight(0xbbbbbb, 0x080808, 1);
  scene.add(hemiLight);

  const ambientLight = new AmbientLight(0x202020);
  //scene.add(ambientLight);

  const spotLight = new PointLight(0xa183ff, 1);
  spotLight.castShadow = true;
  spotLight.distance = 8;
  spotLight.decay = 2;
  spotLight.power = 40;
  //scene.add(spotLight);
}

const scenes = {
  backdrop: { obj: backdrop, init: false },
  suzanne: { obj: suzanne, init: false },
  //  zardoz: { obj: zardoz, init: false },
  leePerry: { obj: leePerry, init: false },
  torus: { obj: torus, init: false },
  blob: { obj: blob, init: false },
  spheres: { obj: spheres, init: false },
  metaballs: { obj: metaballs, init: false },
};

async function initScene(scene, material, gui) {
  initLights(scene);

  const controllers = {};
  gui.addSection("Render");
  addRenderParams(gui);
  gui.addSection("Scene");

  async function show(key, visible) {
    if (!scenes[key].init) {
      await scenes[key].obj.init(material);
      scene.add(scenes[key].obj.group);
      scenes[key].init = true;
    }
    scenes[key].obj.group.visible = visible;
  }

  for (const key of Object.keys(scenes)) {
    const visible = signal(false);
    gui.addCheckbox(key, visible, (v) => show(key, v));
    // setValue keeps the call shape the sketches already use; a signal alone
    // would update the checkbox without running show().
    controllers[key] = {
      signal: visible,
      setValue: async (v) => {
        visible.set(v);
        await show(key, v);
      },
    };
    scenes[key].obj.params(gui);
  }

  await controllers.backdrop.setValue(true);

  return controllers;
}

function update() {
  for (const key of Object.keys(scenes)) {
    if (scenes[key].obj) {
      scenes[key].obj.update();
    }
  }
}

export { initScene, update };
