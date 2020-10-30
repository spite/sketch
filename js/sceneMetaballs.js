import {
  Group,
  Mesh,
  IcosahedronBufferGeometry,
} from "../third_party/three.module.js";
import { MarchingCubes } from "../third_party/MarchingCubes.js";

const group = new Group();
let material;

const params = {};
const resolution = 64;

function update(object, time, numblobs) {
  if (!object) {
    return;
  }

  object.reset();

  const subtract = 12;
  const strength = 1.2 / ((Math.sqrt(numblobs) - 1) / 4 + 1);

  for (let i = 0; i < numblobs; i++) {
    const ballx =
      Math.sin(i + 1.26 * time * (1.03 + 0.5 * Math.cos(0.21 * i))) * 0.27 +
      0.5;
    const bally =
      Math.abs(Math.cos(i + 1.12 * time * Math.cos(1.22 + 0.1424 * i))) * 0.77; // dip into the floor
    const ballz =
      Math.cos(i + 1.32 * time * 0.1 * Math.sin(0.92 + 0.53 * i)) * 0.27 + 0.5;

    object.addBall(ballx, bally, ballz, strength, subtract);
  }
}

let effect;

async function generate() {
  effect = new MarchingCubes(resolution, material, true, true);
  effect.position.set(0, 0, 0);
  effect.scale.set(4, 4, 4);

  effect.castShadow = effect.receiveShadow = true;

  effect.enableUvs = false;
  effect.enableColors = false;

  group.add(effect);
}

const obj = {
  init: async (m) => {
    material = m;
    await generate();
  },
  update: () => {
    update(effect, 0.0005 * performance.now(), 10);
  },
  group,
  generate: () => generate(material),
  params: (gui) => {},
};

export { obj };
