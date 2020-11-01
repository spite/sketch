import {
  Color,
  DoubleSide,
  FrontSide,
  BackSide,
  MeshNormalMaterial,
  RawShaderMaterial,
  TextureLoader,
  RepeatWrapping,
  HalfFloatType,
} from "../third_party/three.module.js";
import { ShaderPass } from "../js/ShaderPass.js";
import { getFBO } from "../js/FBO.js";
import { shader as orthoVs } from "../shaders/ortho-vs.js";
import { shader as sobel } from "../shaders/sobel.js";
import { shader as aastep } from "../shaders/aastep.js";
import { shader as luma } from "../shaders/luma.js";
import { generateParams as generatePaperParams } from "../js/paper.js";
import { shader as darken } from "../shaders/blend-darken.js";
import { shader as screen } from "../shaders/blend-screen.js";
import { Material as CoordsMaterial } from "./CoordsMaterial.js";

const normalMat = new MeshNormalMaterial({ side: DoubleSide });
const coordsMat = new CoordsMaterial();

const loader = new TextureLoader();
const noiseTexture = loader.load("../assets/noise1.png");
noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping;

const fragmentShader = `#version 300 es
precision highp float;

uniform sampler2D colorTexture;
uniform sampler2D normalTexture;
uniform sampler2D paperTexture;
uniform sampler2D noiseTexture;
uniform sampler2D coordsBackTexture;
uniform sampler2D coordsFrontTexture;

uniform vec3 inkColor;
uniform float scale;
uniform float contour;
uniform float angleDark;
uniform float angleLight;

out vec4 fragColor;

in vec2 vUv;

${sobel}

${luma}

${aastep}

${darken}
${screen}

#define mul(a,b) (b*a)

float simplex(in vec3 v) {
  return 2. * texture(noiseTexture, v.xy/32.).r - 1.;
}

float fbm3(vec3 v) {
  float result = simplex(v);
  result += simplex(v * 2.) / 2.;
  result += simplex(v * 4.) / 4.;
  result /= (1. + 1./2. + 1./4.);
  return result;
}

float fbm5(vec3 v) {
  float result = simplex(v);
  result += simplex(v * 2.) / 2.;
  result += simplex(v * 4.) / 4.;
  result += simplex(v * 8.) / 8.;
  result += simplex(v * 16.) / 16.;
  result /= (1. + 1./2. + 1./4. + 1./8. + 1./16.);
  return result;
}

// adapted from https://github.com/libretro/glsl-shaders/blob/master/misc/cmyk-halftone-dot.glsl

float lines( in float l, in vec2 fragCoord, in vec2 resolution, in float thickness){
  vec2 center = vec2(resolution.x/2., resolution.y/2.);
  vec2 uv = fragCoord.xy * resolution;

  float c = (.5 + .5 * sin(uv.x*.5));
  float f = (c+thickness)*l;
  float e = 1. * length(vec2(dFdx(fragCoord.x), dFdy(fragCoord.y))); 
  f = smoothstep(.5-e, .5+e, f);
  return f;
}

#define TAU 6.28318530718

mat2 rot(in float a) {
  float s = sin(a);
  float c = cos(a);
  mat2 rot = mat2(c, -s, s, c);
  return rot;
}

void main() {
  vec2 size = vec2(textureSize(colorTexture, 0));
  float e = .01;

  vec4 color = texture(colorTexture, vUv);
  float normalEdge = 1.- length(sobel(normalTexture, vUv, size, contour));
  normalEdge = smoothstep(.5-e, .5+e, normalEdge);
  
  vec4 paper = texture(paperTexture, .00025 * vUv*size);
  float l = clamp(2. * luma(color.rgb), 0., 1.);
  mat2 r = rot(angleDark);
  float hatch = lines(1.-l, r*vUv, size, 1.);

  l = clamp(4. * luma(color.rgb), 0., 1.);
  r = rot(angleDark + TAU/4.);
  float hatch2 = lines(1.-l, r*vUv, size, 1.);

  l = clamp(luma(color.rgb) - .75, 0., 1.)*3.;
  r = rot(angleLight);
  float hatch3 = clamp(1.-lines(1.-l, r*vUv, size, 1.), 0., 1.);

  vec4 front = texture(coordsFrontTexture, vUv);
  vec4 back = texture(coordsBackTexture, vUv);
  vec4 rgb = .5 + .5 * color;

  if(mod(length(back.xz), .2) < .1) {
    back.a = 1.;
  }
  float stripe = min(front.a, .25 + back.a);
  rgb *= (.5 + .5 * stripe);

  fragColor.rgb = blendDarken(paper.rgb, rgb.rgb, 1.);
  fragColor.rgb = blendDarken(fragColor.rgb, inkColor/255., .25 * hatch);
  fragColor.rgb = blendDarken(fragColor.rgb, inkColor/255., .25 * hatch2);
  fragColor.rgb = blendScreen(fragColor.rgb, vec3(.5), hatch3);
  fragColor.rgb = blendDarken(fragColor.rgb, inkColor/255., 1.-normalEdge);
  fragColor.a = 1.;
}
`;

class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.colorFBO = getFBO(1, 1);
    this.coordsFrontFBO = getFBO(1, 1, { type: HalfFloatType });
    this.coordsBackFBO = getFBO(1, 1, { type: HalfFloatType });
    this.normalFBO = getFBO(1, 1);
    this.params = {
      scale: 40,
      contour: 1,
      inkColor: new Color(0, 0, 0),
      angleGrid: 0,
      angleDark: (45 * Math.PI) / 180,
      angleLight: (45 * Math.PI) / 180,
    };
    const shader = new RawShaderMaterial({
      uniforms: {
        paperTexture: { value: null },
        colorTexture: { value: this.colorFBO.texture },
        coordsFrontTexture: { value: this.coordsFrontFBO.texture },
        coordsBackTexture: { value: this.coordsBackFBO.texture },
        normalTexture: { value: this.normalFBO.texture },
        inkColor: { value: this.params.inkColor },
        scale: { value: this.params.scale },
        contour: { value: this.params.contour },
        angleDark: { value: this.params.angleDark },
        angleLight: { value: this.params.angleLight },
        noiseTexture: { value: noiseTexture },
      },
      vertexShader: orthoVs,
      fragmentShader,
    });
    this.renderPass = new ShaderPass(renderer, shader);
  }

  setSize(w, h) {
    this.normalFBO.setSize(w, h);
    this.colorFBO.setSize(w, h);
    this.coordsFrontFBO.setSize(w, h);
    this.coordsBackFBO.setSize(w, h);
    this.renderPass.setSize(w, h);
  }

  render(scene, camera) {
    this.renderer.setRenderTarget(this.colorFBO);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);

    scene.overrideMaterial = normalMat;
    this.renderer.setRenderTarget(this.normalFBO);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);

    scene.overrideMaterial = coordsMat;
    coordsMat.side = BackSide;
    this.renderer.setRenderTarget(this.coordsBackFBO);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);

    scene.overrideMaterial = coordsMat;
    coordsMat.side = FrontSide;
    this.renderer.setRenderTarget(this.coordsFrontFBO);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);

    scene.overrideMaterial = null;
    this.renderPass.render(true);
  }

  generateParams(gui) {
    const controllers = {};
    controllers["scale"] = gui
      .add(this.params, "scale", 10, 200)
      .onChange(async (v) => {
        coordsMat.uniforms.scale.value = v;
      });
    controllers["contour"] = gui
      .add(this.params, "contour", 0.0, 10)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.contour.value = v;
      });
    controllers["angleGrid"] = gui
      .add(this.params, "angleGrid", 0.0, Math.PI, 0.01)
      .onChange(async (v) => {
        coordsMat.uniforms.angleGrid.value = v;
      });
    controllers["angleDark"] = gui
      .add(this.params, "angleDark", 0.0, Math.PI, 0.01)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.angleDark.value = v;
      });
    controllers["angleLight"] = gui
      .add(this.params, "angleLight", 0.0, Math.PI, 0.01)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.angleLight.value = v;
      });
    controllers["inkColor"] = gui
      .addColor(this.params, "inkColor")
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.inkColor.value.copy(v);
      });
    controllers["paper"] = generatePaperParams(gui, this.renderPass.shader);
    return controllers;
  }
}

export { Post };
