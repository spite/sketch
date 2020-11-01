import { OBJLoader } from "../third_party/OBJLoader.js";
import { Matrix4, Group, Mesh } from "../third_party/three.module.js";

let leePerry;
const group = new Group();
let material;

const params = {};

async function loadModel(file) {
  return new Promise((resolve, reject) => {
    const loader = new OBJLoader();
    loader.load(file, resolve, null, reject);
  });
}

async function loadLeePerry() {
  const model = await loadModel("../assets/LeePerry.obj");
  const geo = model.children[0].geometry;
  geo.center();
  const scale = 0.1;
  geo.applyMatrix4(new Matrix4().makeScale(scale, scale, scale));
  return geo;
}

async function generate() {
  if (leePerry) {
    group.remove(leePerry);
  }
  const geo = await loadLeePerry();
  geo.center();
  const scale = 0.5;
  geo.applyMatrix4(new Matrix4().makeScale(scale, scale, scale));
  // geo.computeVertexNormals();
  // geo.computeFaceNormals();
  leePerry = new Mesh(geo, material);
  leePerry.castShadow = leePerry.receiveShadow = true;
  group.add(leePerry);
}

const obj = {
  init: async (m, q, r) => {
    material = m;
    await generate();
  },
  update: () => {},
  group,
  generate: () => generate(material),
  params: (gui) => {},
};

export { obj };
