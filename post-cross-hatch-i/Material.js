import { MeshStandardMaterial } from "../third_party/three.module.js";

const Material = MeshStandardMaterial;

function generateParams(gui, material) {
  gui
    .add(material, "roughness", 0, 1)
    .onChange((v) => (material.roughness = v));
  gui
    .add(material, "metalness", 0, 1)
    .onChange((v) => (material.metalness = v));
}

export { Material, generateParams };
