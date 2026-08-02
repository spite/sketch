import { MeshStandardMaterial } from "../third_party/three.module.js";
import { addMaterialParams } from "../js/params.js";

const Material = MeshStandardMaterial;

function generateParams(gui, material) {
  addMaterialParams(gui, material);
}

export { Material, generateParams };
