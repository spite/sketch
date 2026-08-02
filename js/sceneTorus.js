import { signal } from "../third_party/guspira.js";
import {
  Group,
  Mesh,
  TorusKnotBufferGeometry,
} from "../third_party/three.module.js";

let torus;
const group = new Group();
let material;

const params = {
  q: 3,
  r: 2,
  radius: 2,
  radius2: 0.5,
};

async function generate() {
  if (torus) {
    group.remove(torus);
    torus.geometry.dispose();
  }
  torus = new Mesh(
    new TorusKnotBufferGeometry(
      params.radius,
      params.radius2,
      400,
      50,
      params.q,
      params.r
    ),
    material
  );
  torus.castShadow = torus.receiveShadow = true;
  group.add(torus);
}

const obj = {
  init: async (m) => {
    material = m;
    await generate();
  },
  update: () => {},
  group,
  generate,
  params: (gui) => {
    for (const [key, min, max, step] of [
      ["q", 1, 10, 1],
      ["r", 1, 10, 1],
      ["radius", 1, 3, 0.01],
      ["radius2", 0.1, 1, 0.01],
    ]) {
      const sig = signal(params[key]);
      gui.addSlider(`torus ${key}`, sig, min, max, step, (v) => {
        params[key] = v;
        generate();
      });
    }
  },
};

export { obj };
