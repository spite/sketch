import {
  Group,
  Mesh,
  BufferGeometry,
  Vector3,
  IcosahedronGeometry,
} from "../third_party/three.module.js";
import perlin from "../third_party/perlin.js";

let blob;
const group = new Group();
let material;
const geo = new IcosahedronGeometry(1, 5);

const params = {
  scale: 1,
  noise: 1,
};

async function generate() {
  if (blob) {
    group.remove(blob);
  }

  const v = new Vector3();
  const vertices = geo.vertices;
  for (let j = 0; j < vertices.length; j++) {
    v.copy(vertices[j]);
    v.normalize();
    const n =
      1 +
      params.scale +
      params.scale *
        perlin.simplex3(
          params.noise * v.x,
          params.noise * v.y,
          params.noise * v.z
        );
    v.multiplyScalar(n);
    vertices[j].copy(v);
  }
  geo.computeVertexNormals();
  geo.computeFaceNormals();

  blob = new Mesh(new BufferGeometry().fromGeometry(geo), material);

  blob.castShadow = blob.receiveShadow = true;
  group.add(blob);
}

const obj = {
  init: async (m, q, r) => {
    material = m;
    params.q = q || params.q;
    params.r = r || params.r;
    await generate();
  },
  update: () => {},
  group,
  generate: () => generate(material),
  params: (gui) => {
    gui.add(params, "scale", 0.1, 2, 0.1).onChange(generate);
    gui.add(params, "noise", 0.1, 2, 0.1).onChange(generate);
  },
};

export { obj };
