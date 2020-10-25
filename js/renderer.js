import {
  WebGLRenderer,
  PerspectiveCamera,
  Scene,
  PCFSoftShadowMap,
  sRGBEncoding,
} from "../third_party/three.module.js";
import { OrbitControls } from "../third_party/OrbitControls.js";

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
camera.position.set(5, 5, 5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.screenSpacePanning = true;

const resizeFns = [];

function onResize(fn) {
  resizeFns.push(fn);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dPR = window.devicePixelRatio;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  for (const fn of resizeFns) {
    fn();
  }
}

window.addEventListener("resize", resize);

export { renderer, scene, camera, resize, onResize };
