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
import { signal } from "../third_party/guspira.js";
import { addInkParams, addPaperParams } from "../js/params.js";
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
uniform vec3 paperColor;
uniform float scale;
uniform float hatchScale;
uniform float contour;
uniform float paperGrid;
uniform float objectGrid;
uniform float angleDark;
uniform float angleLight;
uniform float light;
uniform float dark;

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
  float e = 4. * 100. * length(vec2(dFdx(fragCoord.x), dFdy(fragCoord.y))); 
  float f = 4.*smoothstep(1.-e, 1., c);
  return f;
}

#define TAU 6.28318530718

mat2 rot(in float a) {
  float s = sin(a);
  float c = cos(a);
  mat2 rot = mat2(c, -s, s, c);
  return rot;
}

// from https://www.shadertoy.com/view/wdK3Dy

float grid(vec2 fragCoord, float space, float gridWidth)
{
    vec2 p  = fragCoord - vec2(.5);
    vec2 size = vec2(gridWidth - .5);
    
    vec2 a1 = mod(p - size, space);
    vec2 a2 = mod(p + size, space);
    vec2 a = a2 - a1;
       
    float g = min(a.x, a.y);
    return clamp(g, 0., 1.0);
}

void main() {
  vec2 size = vec2(textureSize(colorTexture, 0));
  float e = .01;

  vec4 color = texture(colorTexture, vUv);
  float normalEdge = 1.- length(sobel(normalTexture, vUv, size, contour));
  normalEdge = 1.-clamp(smoothstep(.5-e, .5+e, normalEdge), 0., 1.);

  vec4 front = texture(coordsFrontTexture, vUv);
  vec4 back = texture(coordsBackTexture, vUv);

  vec4 paper = texture(paperTexture, .00025 * vUv*size);
  float l = clamp(2. * luma(color.rgb), 0., 1.);
  mat2 r = rot(angleDark);
  float hatchDark = 0.;
  if(l<.75) {
    hatchDark = (1.-l/.75) * lines(.275, r*hatchScale*vUv, size, 1.) * color.a;
  }

  l = clamp(luma(color.rgb) - .75, 0., 1.)*3.;
  r = rot(angleLight);
  float hatchLight = 0.;
  if(l>.5) {
    hatchLight = ((l-.5)*2.) * lines(.5, r*hatchScale*vUv, size, 1.) * color.a;
  }

  if(mod(length(back.xz), .2) < e) {
    back.a = 1.;
  }
  float stripe = (1.-min(front.a, .25 + back.a)) * color.a;
  
  float gridLines = .5 + .5 * grid(gl_FragCoord.xy, 50., 1.);
  float gridLines2 = grid(gl_FragCoord.xy, 200., 2.);

  fragColor.rgb = blendDarken(paper.rgb, paperColor.rgb / 255., 1.);
  
  fragColor.rgb = blendScreen(fragColor.rgb, vec3(1.), paperGrid * (1.-gridLines));
  fragColor.rgb = blendScreen(fragColor.rgb, vec3(1.), paperGrid * (1.-gridLines2));

  float w = (objectGrid* stripe) + (dark *hatchDark) + (light * hatchLight) + normalEdge;
  fragColor.rgb = blendScreen(fragColor.rgb, inkColor.rgb / 255., w);
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
      hatchScale: 1.5,
      contour: 2,
      paperGrid: 0.25,
      objectGrid: 0.25,
      inkColor: new Color(255, 255, 255),
      paperColor: new Color(23, 89, 160),
      angleGrid: 0,
      angleDark: (45 * Math.PI) / 180,
      angleLight: (45 * Math.PI) / 180,
      dark: 0.5,
      light: 0.1,
    };
    const shader = new RawShaderMaterial({
      uniforms: {
        paperTexture: { value: null },
        colorTexture: { value: this.colorFBO.texture },
        coordsFrontTexture: { value: this.coordsFrontFBO.texture },
        coordsBackTexture: { value: this.coordsBackFBO.texture },
        normalTexture: { value: this.normalFBO.texture },
        inkColor: { value: this.params.inkColor },
        paperColor: { value: this.params.paperColor },
        scale: { value: this.params.scale },
        hatchScale: { value: this.params.hatchScale },
        contour: { value: this.params.contour },
        paperGrid: { value: this.params.paperGrid },
        objectGrid: { value: this.params.objectGrid },
        angleDark: { value: this.params.angleDark },
        angleLight: { value: this.params.angleLight },
        noiseTexture: { value: noiseTexture },
        dark: { value: this.params.dark },
        light: { value: this.params.light },
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

  generateParams(gui, options = {}) {
    const uniforms = this.renderPass.shader.uniforms;
    const signals = {};
    signals.inkColor = addInkParams(gui, uniforms.inkColor, { scale255: true, label: "ink color" });
    signals.paperColor = addInkParams(gui, uniforms.paperColor, { scale255: true, label: "paper color" });
    signals.scale = signal(this.params.scale);
    gui.addSlider("scale", signals.scale, 10, 200, 0.01, (v) => (coordsMat.uniforms.scale.value = v));
    signals.hatchScale = signal(this.params.hatchScale);
    gui.addSlider("hatchScale", signals.hatchScale, 0.01, 2, 0.01, (v) => (uniforms.hatchScale.value = v));
    signals.contour = signal(this.params.contour);
    gui.addSlider("contour", signals.contour, 0.0, 10, 0.01, (v) => (uniforms.contour.value = v));
    signals.paperGrid = signal(this.params.paperGrid);
    gui.addSlider("paperGrid", signals.paperGrid, 0.0, 1, 0.01, (v) => (uniforms.paperGrid.value = v));
    signals.objectGrid = signal(this.params.objectGrid);
    gui.addSlider("objectGrid", signals.objectGrid, 0.0, 1, 0.01, (v) => (uniforms.objectGrid.value = v));
    signals.angleGrid = signal(this.params.angleGrid);
    gui.addSlider("angleGrid", signals.angleGrid, 0.0, Math.PI, 0.01, (v) => (coordsMat.uniforms.angleGrid.value = v));
    signals.angleDark = signal(this.params.angleDark);
    gui.addSlider("angleDark", signals.angleDark, 0.0, Math.PI, 0.01, (v) => (uniforms.angleDark.value = v));
    signals.angleLight = signal(this.params.angleLight);
    gui.addSlider("angleLight", signals.angleLight, 0.0, Math.PI, 0.01, (v) => (uniforms.angleLight.value = v));
    signals.dark = signal(this.params.dark);
    gui.addSlider("dark", signals.dark, 0.0, 1, 0.01, (v) => (uniforms.dark.value = v));
    signals.light = signal(this.params.light);
    gui.addSlider("light", signals.light, 0.0, 1, 0.01, (v) => (uniforms.light.value = v));
    signals.paper = addPaperParams(gui, this.renderPass.shader, options.paper);
    return signals;
  }
}

export { Post };
