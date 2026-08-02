import { addMaterialParams } from "../js/params.js";
import {
  MeshStandardMaterial,
  Vector2,
  Color,
} from "../third_party/three.module.js";

const Material = MeshStandardMaterial;

function generateParams(gui, material) {
  const params = material;
  addMaterialParams(gui, material);
}

export { Material, generateParams };
