import {
  Group,
  Mesh,
  IcosahedronBufferGeometry,
} from "../third_party/three.module.js";

const group = new Group();
let material;
const sphereGeometry = new IcosahedronBufferGeometry(1, 4);

const params = {};

async function generate() {
  const r = 10;
  for (let j = 0; j < 20; j++) {
    const sphere = new Mesh(sphereGeometry, material);
    sphere.castShadow = sphere.receiveShadow = true;
    sphere.scale.setScalar(0.75 + Math.random() * 0.5);
    const x = Math.random() * 2 * r - r;
    const y = Math.random() * 2 * r - r;
    const z = Math.random() * 2 * r - r;
    sphere.position.set(x, y, z);
    group.add(sphere);
  }
}

const obj = {
  init: async (m) => {
    material = m;
    await generate();
  },
  update: () => {},
  group,
  generate: () => generate(material),
  params: (gui) => {},
};

export { obj };
