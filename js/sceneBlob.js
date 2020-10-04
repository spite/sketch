import {
  Group,
  Mesh,
  BufferGeometry,
  Vector3,
  IcosahedronGeometry,
} from "../third_party/three.module.js";
import perlin from "../third_party/perlin.js";

function init(scene, material) {
  const group = new Group();

  const geo = new IcosahedronGeometry(3, 5);
  const v = new Vector3();
  const vertices = geo.vertices;
  for (let j = 0; j < vertices.length; j++) {
    v.copy(vertices[j]);
    v.multiplyScalar(0.5);
    const n = 1.25 + 0.25 * perlin.simplex3(v.x, v.y, v.z);
    v.multiplyScalar(n);
    vertices[j].copy(v);
  }
  geo.computeVertexNormals();
  geo.computeFaceNormals();

  const blob = new Mesh(new BufferGeometry().fromGeometry(geo), material);
  blob.castShadow = blob.receiveShadow = true;
  scene.add(blob);

  return {
    update: () => {},
  };
}

export { init };
