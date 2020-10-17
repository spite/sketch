import { TextureLoader } from "../third_party/three.module.js";

const loader = new TextureLoader();

const papers = {
  "Craft light": { file: "Craft_Light.jpg", texture: null, promise: null },
  "Craft rough": { file: "Craft_Rough.jpg", texture: null, promise: null },
  "Watercolor cold press": {
    file: "Watercolor_ColdPress.jpg",
    texture: null,
    promise: null,
  },
  Parchment: { file: "Parchment.jpg", texture: null, promise: null },
};

async function getTexture(name) {
  if (papers[name].texture) {
    return papers[name].texture;
  }
  if (!papers[name].promise) {
    papers[name].promise = new Promise((resolve, reject) => {
      loader.load(`../assets/${papers[name].file}`, (res) => {
        papers[name].texture = res;
        resolve();
      });
    });
  }
  await papers[name].promise;
  return papers[name].texture;
}

const params = {
  paper: "Craft light",
};
function generateParams(gui, material) {
  return gui.add(params, "paper", Object.keys(papers)).onChange(async (v) => {
    material.uniforms.paperTexture.value = await getTexture(v);
  });
}
export { generateParams };
