import {
  Color,
  DoubleSide,
  MeshNormalMaterial,
  RawShaderMaterial,
  TextureLoader,
  RepeatWrapping,
} from "../third_party/three.module.js";
import { ShaderPass } from "../js/ShaderPass.js";
import { getFBO } from "../js/FBO.js";
import { shader as orthoVs } from "../shaders/ortho-vs.js";
import { shader as sobel } from "../shaders/sobel.js";
import { shader as aastep } from "../shaders/aastep.js";
import { shader as luma } from "../shaders/luma.js";
import { generateParams as generatePaperParams } from "../js/paper.js";
import { shader as darken } from "../shaders/blend-darken.js";

const normalMat = new MeshNormalMaterial({ side: DoubleSide });

const loader = new TextureLoader();
const noiseTexture = loader.load("../assets/noise1.png");
noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping;

const fragmentShader = `#version 300 es
precision highp float;

uniform sampler2D colorTexture;
uniform sampler2D normalTexture;
uniform sampler2D paperTexture;
uniform sampler2D noiseTexture;
uniform vec3 inkColor;
uniform float scale;
uniform float thickness;
uniform float intensity;
uniform float noisiness;
uniform float angle;
uniform float blob;

out vec4 fragColor;

in vec2 vUv;

${sobel}

${luma}

${aastep}

${darken}

float stripe(in vec2 uv, in float freq) {
  float v = .5 + .5 * sin(.05*uv.y * freq);
  return smoothstep(0., thickness, v);
}

// from https://www.shadertoy.com/view/4llSDH

vec2 distortUV(in vec2 uv, in vec2 nUV, in float scale, in float offset) {
  vec2 noise= texture(noiseTexture, nUV*scale+vec2(offset, 0.)).xy;
  uv += (-1.0+noise*2.0) * intensity;
  return uv;
}

vec2 warpUv(in vec2 uv, in float scale, in float offset) {
  vec2 nUV = uv;
  vec2 ruv = uv;

	ruv = distortUV(ruv, nUV, scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.1,nUV.y+0.1), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.2,nUV.y+0.2), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.3,nUV.y+0.3), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.4,nUV.y+0.4), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.5,nUV.y+0.5), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.6,nUV.y+0.6), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.7,nUV.y+0.7), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.8,nUV.y+0.8), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.9,nUV.y+0.9), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.15,nUV.y+0.15), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.25,nUV.y+0.25), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.35,nUV.y+0.35), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.45,nUV.y+0.45), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.55,nUV.y+0.55), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.65,nUV.y+0.65), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.75,nUV.y+0.75), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.85,nUV.y+0.85), scale, offset);
  ruv = distortUV(ruv, vec2(nUV.x+0.95,nUV.y+0.95), scale, offset);

  return ruv;
}

#define TAU 6.28318530718

void main() {
  vec2 size = vec2(textureSize(colorTexture, 0));

  int levels = 10;
  float r = 1.;

  for(int i=0; i<levels; i++) {
    float f = float(i) / float(levels);
    vec2 uv = warpUv(vUv, mix(.001, .5, f), mix(-10., 10., f));
    vec4 color = texture(colorTexture, uv);
    float l = 1.- round(2.*luma(color.rgb)*float(levels))/float(levels);
    if(l>float(i)/float(levels)) {

      float a = angle + (TAU/2.) * f;
      float s = sin(a);
      float c = cos(a);
      mat2 rot = mat2(c, -s, s, c);

      vec2 noise = noisiness*texture(noiseTexture, .5*uv).xy;

      r *= .5 + .5 * stripe(rot * (scale * uv + noise) * size, mix(5., 20., f));
    }
  }
  float e =.1;
  r = smoothstep(.5-e, .5 + e, r);

  vec2 uv = warpUv(vUv, .1, 0.);
  r *= aastep(.5, 1.-sobel(normalTexture, uv, size, 20.*thickness).r);
  uv = warpUv(vUv, .2, 0.);
  r *= aastep(.5, 1.-sobel(normalTexture, uv, size, 20.*thickness).r);

  vec4 paper = texture(paperTexture, .00025 * vUv*size);
  fragColor.rgb = blendDarken(paper.rgb, inkColor/255., 1.-r);
  fragColor.a = 1.;
}
`;

class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.colorFBO = getFBO(1, 1);
    this.normalFBO = getFBO(1, 1);
    this.params = {
      scale: 1,
      angle: 0.4,
      thickness: 0.15,
      intensity: 0.0005,
      noisiness: 0.005,
      inkColor: new Color(133, 106, 255),
      blob: 0.01,
    };
    const shader = new RawShaderMaterial({
      uniforms: {
        paperTexture: { value: null },
        colorTexture: { value: this.colorFBO.texture },
        normalTexture: { value: this.normalFBO.texture },
        noiseTexture: { value: noiseTexture },
        inkColor: { value: this.params.inkColor },
        scale: { value: this.params.scale },
        thickness: { value: this.params.thickness },
        intensity: { value: this.params.intensity },
        noisiness: { value: this.params.noisiness },
        angle: { value: this.params.angle },
        blob: { value: this.params.blob },
      },
      vertexShader: orthoVs,
      fragmentShader,
    });
    this.renderPass = new ShaderPass(renderer, shader);
  }

  setSize(w, h) {
    this.normalFBO.setSize(w, h);
    this.colorFBO.setSize(w, h);
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
    scene.overrideMaterial = null;
    this.renderPass.render(true);
  }

  generateParams(gui) {
    const controllers = {};
    // controllers["intensity"] = gui
    //   .add(this.params, "intensity", 0.0001, 0.01)
    //   .onChange(async (v) => {
    //     this.renderPass.shader.uniforms.intensity.value = v;
    //   });
    controllers["scale"] = gui
      .add(this.params, "scale", 0.5, 4)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.scale.value = v;
      });
    // controllers["blob"] = gui
    //   .add(this.params, "blob", 0.000001, 1)
    //   .onChange(async (v) => {
    //     this.renderPass.shader.uniforms.blob.value = v;
    //   });
    controllers["thickness"] = gui
      .add(this.params, "thickness", 0.1, 0.25)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.thickness.value = v;
      });
    controllers["noisiness"] = gui
      .add(this.params, "noisiness", 0, 0.1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.noisiness.value = v;
      });
    controllers["angle"] = gui
      .add(this.params, "angle", 0, Math.PI)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.angle.value = v;
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
