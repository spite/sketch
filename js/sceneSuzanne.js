import { OBJLoader } from "../third_party/OBJLoader.js";
import { SubdivisionModifier } from "../third_party/SubdivisionModifier.js";
import {
  BufferGeometry,
  Matrix4,
  Group,
  Mesh,
  BufferAttribute,
} from "../third_party/three.module.js";

let suzanne;
const group = new Group();
let material;

const params = {};

function mergeMesh(mesh) {
  let count = 0;
  mesh.traverse((m) => {
    if (m instanceof Mesh) {
      count += m.geometry.attributes.position.count;
    }
  });
  let geo = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  count = 0;
  mesh.traverse((m) => {
    if (m instanceof Mesh) {
      const mat = new Matrix4().makeTranslation(
        m.position.x,
        m.position.y,
        m.position.z
      );
      m.geometry.applyMatrix4(mat);
      const pos = m.geometry.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        positions[(count + j) * 3] = pos.array[j * 3];
        positions[(count + j) * 3 + 1] = pos.array[j * 3 + 1];
        positions[(count + j) * 3 + 2] = pos.array[j * 3 + 2];
      }
      count += pos.count;
    }
  });
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  return geo;
}

async function loadModel(file) {
  return new Promise((resolve, reject) => {
    const loader = new OBJLoader();
    loader.load(file, resolve, null, reject);
  });
}

async function loadSuzanne() {
  const model = await loadModel("../assets/suzanne.obj");
  const geo = mergeMesh(model);
  const modified = new SubdivisionModifier(3);
  const geo2 = new BufferGeometry().fromGeometry(modified.modify(geo));
  geo2.center();
  const scale = 3;
  geo2.applyMatrix4(new Matrix4().makeScale(scale, scale, scale));
  return geo2;
}

async function generate() {
  if (suzanne) {
    group.remove(suzanne);
  }
  const geo = await loadSuzanne();
  suzanne = new Mesh(geo, material);
  suzanne.castShadow = suzanne.receiveShadow = true;
  group.add(suzanne);
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
