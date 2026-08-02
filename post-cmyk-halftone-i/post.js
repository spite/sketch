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
import { signal } from "../third_party/guspira.js";
import { addInkParams, addPaperParams } from "../js/params.js";
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
uniform float contour;
uniform float cyan;
uniform float magenta;
uniform float yellow;
uniform float black;

out vec4 fragColor;

in vec2 vUv;

${sobel}

${luma}

${aastep}

${darken}

#define mul(a,b) (b*a)

// adapted from https://github.com/libretro/glsl-shaders/blob/master/misc/cmyk-halftone-dot.glsl

float lines( in float l, in vec2 fragCoord, in vec2 resolution, in float thickness){
  vec2 center = vec2(resolution.x/2., resolution.y/2.);
  vec2 uv = fragCoord.xy * resolution;

  float c = (.5 + .5 * sin(uv.x*.5));
  float f = (c+thickness)*l;
  float e = .1;
  f = smoothstep(.5-e, .5+e, f);
  return f;
}

#define TAU 6.28318530718

vec2 rot(in vec2 uv, in float a) {
  a = a * TAU / 360.;
  float s = sin(a);
  float c = cos(a);
  mat2 rot = mat2(c, -s, s, c);
  return rot * uv;
}

void main() {
  vec2 size = vec2(textureSize(colorTexture, 0));
  float e = .01;
  vec4 color = texture(colorTexture, vUv);
  float l = 2. * luma(color.rgb);
  float normalEdge = 1.- length(sobel(normalTexture, vUv, size, contour));
  normalEdge = smoothstep(.5-e, .5+e, normalEdge);
  vec4 paper = texture(paperTexture, .00025 * vUv*size);
  
  color *= normalEdge;

  vec4 cmyk;
	cmyk.xyz = .5 - .5 * color.rgb;
	cmyk.w = min(cmyk.x, min(cmyk.y, cmyk.z)); // Create K

  float frequency = .05;
  vec3 blackColor = vec3(0.);

  float s = scale;
  vec2 uv = vUv * size;

  float w = mix(0., 1., 1.-thickness);
	mat2 k_matrix = mat2(0.707, 0.707, -0.707, 0.707);
	vec2 Kst = frequency * s * mul(k_matrix , uv);
	vec2 Kuv = w * (2. * fract(Kst) - 1.);
	float k = step(0.0, sqrt(cmyk.w) - length(Kuv) - 1. * (1.-black));
	mat2 c_matrix = mat2(0.966, 0.259, -0.259, 0.966);
	vec2 Cst = frequency * s * mul(c_matrix , uv);
	vec2 Cuv = w * (2. * fract(Cst) - 1.);
	float c = step(0.0, sqrt(cmyk.x) - length(Cuv) - 1. * (1.-cyan));
	mat2 m_matrix = mat2(0.966, -0.259, 0.259, 0.966);
	vec2 Mst = frequency * s * mul(m_matrix , uv);
	vec2 Muv = w * (2. * fract(Mst) - 1.);
	float m = step(0.0, sqrt(cmyk.y) - length(Muv) - 1. * (1.-magenta));
	vec2 Yst = frequency * s * uv; // 0 deg
	vec2 Yuv = w * (2. * fract(Yst) - 1.);
	float y = step(0.0, sqrt(cmyk.z) - length(Yuv) - 1. * (1.-yellow));

	vec3 rgbscreen = 1.0 - vec3(c,m,y);
  rgbscreen = mix(rgbscreen, blackColor, k);

  fragColor.rgb = rgbscreen;
  fragColor.a = 1.;
}
`;

class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.colorFBO = getFBO(1, 1);
    this.normalFBO = getFBO(1, 1);
    this.params = {
      scale: 2,
      thickness: 0.32,
      contour: 2.1,
      inkColor: new Color(255, 0, 0),
      cyan: 1,
      magenta: 1,
      yellow: 0.8,
      black: 0.4,
    };
    const shader = new RawShaderMaterial({
      uniforms: {
        paperTexture: { value: null },
        colorTexture: { value: this.colorFBO.texture },
        normalTexture: { value: this.normalFBO.texture },
        inkColor: { value: this.params.inkColor },
        scale: { value: this.params.scale },
        thickness: { value: this.params.thickness },
        contour: { value: this.params.contour },
        cyan: { value: this.params.cyan },
        magenta: { value: this.params.magenta },
        yellow: { value: this.params.yellow },
        black: { value: this.params.black },
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

  generateParams(gui, options = {}) {
    const uniforms = this.renderPass.shader.uniforms;
    const signals = {};
    signals.inkColor = addInkParams(gui, uniforms.inkColor, { scale255: true });
    signals.scale = signal(this.params.scale);
    gui.addSlider("scale", signals.scale, 0.1, 2, 0.01, (v) => (uniforms.scale.value = v));
    signals.thickness = signal(this.params.thickness);
    gui.addSlider("thickness", signals.thickness, 0.0, 1, 0.01, (v) => (uniforms.thickness.value = v));
    signals.contour = signal(this.params.contour);
    gui.addSlider("contour", signals.contour, 0.0, 10, 0.01, (v) => (uniforms.contour.value = v));
    signals.cyan = signal(this.params.cyan);
    gui.addSlider("cyan", signals.cyan, 0.0, 1, 0.01, (v) => (uniforms.cyan.value = v));
    signals.magenta = signal(this.params.magenta);
    gui.addSlider("magenta", signals.magenta, 0.0, 1, 0.01, (v) => (uniforms.magenta.value = v));
    signals.yellow = signal(this.params.yellow);
    gui.addSlider("yellow", signals.yellow, 0.0, 1, 0.01, (v) => (uniforms.yellow.value = v));
    signals.black = signal(this.params.black);
    gui.addSlider("black", signals.black, 0.0, 1, 0.01, (v) => (uniforms.black.value = v));
    signals.paper = addPaperParams(gui, this.renderPass.shader, options.paper);
    return signals;
  }
}

export { Post };
