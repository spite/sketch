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
    gui.add(params, "q", 1, 10, 1).onChange(generate);
    gui.add(params, "r", 1, 10, 1).onChange(generate);
    gui.add(params, "radius", 1, 3).onChange(generate);
    gui.add(params, "radius2", 0.1, 1).onChange(generate);
  },
};

export { obj };
