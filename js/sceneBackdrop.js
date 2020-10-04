import {
  Group,
  Mesh,
  IcosahedronBufferGeometry,
} from "../third_party/three.module.js";

function init(scene, material) {
  const group = new Group();

  const backdrop = new Mesh(new IcosahedronBufferGeometry(20, 4), material);
  //backdrop.castShadow = backdrop.receiveShadow = true;
  scene.add(backdrop);

  return {
    update: () => {},
  };
}

export { init };
