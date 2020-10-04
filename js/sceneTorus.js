import {
  Group,
  Mesh,
  IcosahedronBufferGeometry,
  TorusKnotBufferGeometry,
} from "../third_party/three.module.js";

function init(scene, material) {
  const group = new Group();

  const torus = new Mesh(
    new TorusKnotBufferGeometry(2, 0.5, 200, 50, 4, 3),
    material
  );
  torus.castShadow = torus.receiveShadow = true;
  scene.add(torus);

  torus.rotation.x = Math.random(2 * Math.PI);
  torus.rotation.y = Math.random(2 * Math.PI);
  torus.rotation.z = Math.random(2 * Math.PI);

  return {
    update: () => {
      torus.rotation.y = performance.now() * 0.001;
      torus.rotation.z = performance.now() * 0.0005;
    },
  };
}

export { init };
