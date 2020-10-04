import {
  WebGLRenderer,
  PerspectiveCamera,
  Scene,
  Mesh,
  DirectionalLight,
  HemisphereLight,
  Vector3,
  Raycaster,
  PCFSoftShadowMap,
  sRGBEncoding,
  Vector2,
  IcosahedronBufferGeometry,
  TorusKnotBufferGeometry,
  PointLight,
  DoubleSide,
  CubeTextureLoader,
  AmbientLight,
  MeshStandardMaterial,
} from "../third_party/three.module.js";
import { OrbitControls } from "../third_party/OrbitControls.js";
import { LineMaterial } from "./lineMaterial.js";
import * as dat from "../third_party/dat.gui.module.js";
import { init as initBlob } from "../js/sceneBlob.js";
import { init as initBackdrop } from "../js/sceneBackdrop.js";
import { init as initSpheres } from "../js/sceneSpheres.js";

const params = {
  roughness: 0.2,
  metalness: 0.1,
  min: 0.25,
  max: 0.75,
  min2: 0.5,
  max2: 0.5,
  scale: 1,
  radius: 3,
};
const gui = new dat.GUI();
gui.add(params, "roughness", 0, 1);
gui.add(params, "metalness", 0, 1);

gui.add(params, "min", 0, 2);
gui.add(params, "max", 0, 2);
gui.add(params, "min2", 0, 2);
gui.add(params, "max2", 0, 2);
gui.add(params, "scale", 0, 10);
gui.add(params, "radius", 1, 10);
const canvas = document.querySelector("canvas");

const renderer = new WebGLRenderer({
  antialias: true,
  alpha: true,
  canvas,
  preserveDrawingBuffer: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0xffffff, 1);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
//renderer.outputEncoding = sRGBEncoding;
//renderer.gammaFactor = 2.2;

const scene = new Scene();
const camera = new PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 10, -5);

const loader = new CubeTextureLoader();
loader.setPath("../assets/");

const textureCube = loader.load([
  "posx.jpg",
  "negx.jpg",
  "posy.jpg",
  "negy.jpg",
  "posz.jpg",
  "negz.jpg",
]);
textureCube.encoding = sRGBEncoding;

const material = new LineMaterial({
  color: 0x808080,
  roughness: 0.2,
  metalness: 0.1,
  envMap: textureCube,
  side: DoubleSide,
});

initBackdrop(scene, material);
initBlob(scene, material);
initSpheres(scene, material);

const controls = new OrbitControls(camera, renderer.domElement);
controls.screenSpacePanning = true;

const raycaster = new Raycaster();
const mouse = new Vector2();

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}
window.addEventListener("mousemove", onMouseMove, false);

const up = new Vector3(0, 1, 0);

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dPR = window.devicePixelRatio;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

const tmp = new Vector2();
function render() {
  if (material.uniforms && material.uniforms.resolution) {
    renderer.getSize(tmp);
    tmp.multiplyScalar(window.devicePixelRatio);
    material.uniforms.resolution.value.copy(tmp);

    material.roughness = params.roughness;
    material.metalness = params.metalness;

    material.uniforms.range.value.set(params.min, params.max);
    material.uniforms.range2.value.set(params.min2, params.max2);
    material.uniforms.scale.value = params.scale;
    material.uniforms.radius.value = params.radius;
  }
  renderer.render(scene, camera);
  renderer.setAnimationLoop(render);
}

const light = new DirectionalLight(0xffffff, 0.5);
light.position.set(3, 6, 3);
light.castShadow = true;
light.shadow.bias = -0.0001;
light.shadow.mapSize.set(4096, 4096);
scene.add(light);

const light2 = new DirectionalLight(0xffffff, 0.5);
light2.position.set(-3, -3, -3);
light2.castShadow = true;
light2.shadow.bias = -0.0001;
light2.shadow.mapSize.set(4096, 4096);
scene.add(light2);

const hemiLight = new HemisphereLight(0xbbbbbb, 0x080808, 1);
scene.add(hemiLight);

const ambientLight = new AmbientLight(0x202020);
//scene.add(ambientLight);

const spotLight = new PointLight(0xa183ff, 1);
spotLight.castShadow = true;
spotLight.distance = 8;
spotLight.decay = 2;
spotLight.power = 40;
//scene.add(spotLight);

async function init() {
  resize();
  render();
}

window.addEventListener("resize", resize);

init();
