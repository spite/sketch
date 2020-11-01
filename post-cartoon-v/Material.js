import {
  MeshStandardMaterial,
  Vector2,
  Color,
} from "../third_party/three.module.js";

const Material = MeshStandardMaterial;

function generateParams(gui, material) {
  const params = material;
  gui.add(params, "roughness", 0, 1).onChange((v) => (material.roughness = v));
  gui.add(params, "metalness", 0, 1).onChange((v) => (material.metalness = v));
}

export { Material, generateParams };
