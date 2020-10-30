import {
  Color,
  DoubleSide,
  MeshNormalMaterial,
  RawShaderMaterial,
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

const fragmentShader = `#version 300 es
precision highp float;

uniform sampler2D colorTexture;
uniform sampler2D normalTexture;
uniform sampler2D paperTexture;
uniform vec3 inkColor;
uniform float scale;
uniform float thickness;

out vec4 fragColor;

in vec2 vUv;

${sobel}

${luma}

float texh(in vec2 p, in float lum) {
  float e = thickness * length(vec2(dFdx(p.x), dFdy(p.y))); 
  if (lum < 1.00) {
    float v = abs(mod(p.x + p.y, 10.0));
    if (v < e) {
      return 0.;
    }
  }
  
  if (lum < 0.8) {
    float v = abs(mod(p.x - p.y, 10.0));
    if (v < e) {
      return 0.;
    }
  }
  
  if (lum < 0.6) {
    float v = abs(mod(p.x + p.y - 5.0, 10.0));
    if (v < e) {
      return 0.;
    }
  }
  
  if (lum < 0.4) {
    float v = abs(mod(p.x - p.y - 5.0, 10.0));
    if (v < e) {
      return 0.;
    }
  }

  if (lum < 0.2) {
    float v = abs(mod(p.x + p.y - 7.5, 10.0));
    if (v < e) {
      return 0.;
    }
  }

 return 1.;
}

${aastep}

${darken}

void main() {
  vec2 size = vec2(textureSize(colorTexture, 0));
  float e = .01;
  vec4 color = texture(colorTexture, vUv);
  float l = 2. * luma(color.rgb);
  float normalEdge = 1.- length(sobel(normalTexture, vUv, size, thickness));
  normalEdge = aastep(.5, normalEdge);
  // float colorEdge = 1.- length(sobel(colorTexture, vUv, size, 1.));
  // colorEdge = aastep(.5, colorEdge);
  // colorEdge += .5;
  vec4 paper = texture(paperTexture, .00025 * vUv*size);
  float r = texh(scale*vUv*size, l) * normalEdge;
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
      scale: 0.3,
      thickness: 2.5,
      inkColor: new Color(255, 0, 0),
    };
    const shader = new RawShaderMaterial({
      uniforms: {
        paperTexture: { value: null },
        colorTexture: { value: this.colorFBO.texture },
        normalTexture: { value: this.normalFBO.texture },
        inkColor: { value: this.params.inkColor },
        scale: { value: this.params.scale },
        thickness: { value: this.params.thickness },
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
    controllers["scale"] = gui
      .add(this.params, "scale", 0.1, 2)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.scale.value = v;
      });
    controllers["thickness"] = gui
      .add(this.params, "thickness", 0.1, 10)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.thickness.value = v;
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
