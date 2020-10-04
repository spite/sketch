import {
  Group,
  Mesh,
  IcosahedronBufferGeometry,
} from "../third_party/three.module.js";

function init(scene, material) {
  const group = new Group();

  const r = 10;
  const sphereGeometry = new IcosahedronBufferGeometry(1, 4);
  for (let j = 0; j < 20; j++) {
    const sphere = new Mesh(sphereGeometry, material);
    sphere.castShadow = sphere.receiveShadow = true;
    sphere.scale.setScalar(0.75 + Math.random() * 0.5);
    const x = Math.random() * 2 * r - r;
    const y = Math.random() * 2 * r - r;
    const z = Math.random() * 2 * r - r;
    sphere.position.set(x, y, z);
    scene.add(sphere);
  }

  return {
    update: () => {},
  };
}

export { init };
