import {
  sRGBEncoding,
  CubeTextureLoader,
} from "../third_party/three.module.js";

const cubeTexLoader = new CubeTextureLoader();
cubeTexLoader.setPath("../assets/");

const environments = {
  bridge: { file: "", extension: "jpg", texture: null },
  park: { file: "park_", extension: "jpg", texture: null },
  pisa: { file: "pisa_", extension: "png", texture: null },
};

function getTexture(name) {
  if (!environments[name].texture) {
    const f = environments[name].file;
    const ext = environments[name].extension;
    environments[name].texture = cubeTexLoader.load([
      `${f}posx.${ext}`,
      `${f}negx.${ext}`,
      `${f}posy.${ext}`,
      `${f}negy.${ext}`,
      `${f}posz.${ext}`,
      `${f}negz.${ext}`,
    ]);
    environments[name].texture.encoding = sRGBEncoding;
  }
  return environments[name].texture;
}

const params = {
  environment: "bridge",
};
function generateParams(gui, material) {
  return gui
    .add(params, "environment", Object.keys(environments))
    .onChange((v) => {
      material.envMap = getTexture(v);
    });
}

export { generateParams };
