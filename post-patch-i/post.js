import {
  Color,
  DoubleSide,
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
import { Material as CoordsMaterial } from "./CoordsMaterial.js";

const normalMat = new MeshNormalMaterial({ side: DoubleSide });
const coordsMat = new CoordsMaterial({ side: DoubleSide });

const loader = new TextureLoader();
const noiseTexture = loader.load("../assets/noise1.png");
noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping;

const fragmentShader = `#version 300 es
precision highp float;

uniform sampler2D colorTexture;
uniform sampler2D normalTexture;
uniform sampler2D paperTexture;
uniform sampler2D noiseTexture;
uniform sampler2D coordsTexture;

uniform vec3 inkColor;
uniform float scale;
uniform float noiseScale;
uniform float noisiness;
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
  a = a * TAU / 360.;
  float s = sin(a);
  float c = cos(a);
  mat2 rot = mat2(c, -s, s, c);
  return rot;
}


vec2 noise(vec2 x){
  return fract(cos(dot(x,vec2(134.,1.61034)))*vec2(416418.0,1265.7486));
}

float calc(in vec2 uv, float f) {
  vec2 uv00 = vec2(0,0)+floor(uv);
  vec2 uv01 = vec2(0,1)+floor(uv);
  vec2 uv10 = vec2(1,0)+floor(uv);
  vec2 uv11 = vec2(1,1)+floor(uv);

  vec3 col = vec3(0);
  vec2 n00 = noise(uv00);
  vec2 n01 = noise(uv01);
  vec2 n10 = noise(uv10);
  vec2 n11 = noise(uv11);
  uv00 = ceil(uv00) + n00-.5;
  uv01 = ceil(uv01) + n01-.5;
  uv10 = ceil(uv10) + n10-.5;
  uv11 = ceil(uv11) + n11-.5;

  vec2 uv0 = mix(uv00,uv01, float(distance(uv00,uv)>distance(uv01,uv)));
  vec2 uv1 = mix(uv10,uv11, float(distance(uv10,uv)>distance(uv11,uv)));
  vec2 uvC = mix(uv0,uv1,   float(distance(uv0,uv) >distance(uv1,uv)));
  vec2 uvL = uv-uvC;
  vec2 vn = noise(uvC)-.5;
  float g = dot(uvL,normalize(vn));
  float v = .5 + .5 * (sin(15.*g));
  float e = .001;
  return smoothstep(f-e, f+e, v);//aastep(f, v);
}

float hetched(in vec2 p, float ll) {
  float line = 1.;
  if(ll<.8){
    line *= calc(p/40., .01);
  }
  if(ll<.6){
    line *= calc(p/20., .05);
  }
  if(ll<.4){
    line *= calc(p/10., .3);
  }
  if(ll<.2){
    line *= calc(p/10., .5);
  }
  return ll + line;
}

float texcube(in vec3 p, in vec3 n, in float q, in float a) {
  mat2 r = rot(a*TAU/360.);
  vec3 v = vec3(hetched(r*p.yz,q), hetched(r*p.zx,q), hetched(r*p.xy,q));
  float f = dot(v, n*n);
  //float f = hetched(r*p.xy,q);
  return clamp(f, 0., 1.);
}

void main() {
  vec2 size = vec2(textureSize(colorTexture, 0));
  float e = .01;

  vec4 color = texture(colorTexture, vUv);
  float normalEdge = 1.- length(sobel(normalTexture, vUv, size, contour));
  normalEdge = smoothstep(.5-thickness, .5+thickness, normalEdge);
  color *= normalEdge;
  color *= 3.;
  
  vec4 paper = texture(paperTexture, .00025 * vUv*size);

  vec4 cmyk;
	cmyk.xyz = .5 - .5 * color.rgb;
  cmyk.w = min(cmyk.x, min(cmyk.y, cmyk.z)); // Create K

  vec3 coords = scale * texture(coordsTexture, vUv).rgb;
  vec3 normal = texture(normalTexture, vUv).rgb;

  float c = cyan * texcube(coords, normal, cmyk.x, 75.);
  float m = magenta * texcube(coords, normal, cmyk.y, 15.);
  float y = yellow*texcube(coords, normal, cmyk.z, 0.);
  float k = black*texcube(coords, normal, cmyk.w, 45.);
  
  vec3 rgbscreen = 1.-vec3(c,m,y);
  rgbscreen = mix(rgbscreen, inkColor/255., k);

  fragColor.rgb = blendDarken(paper.rgb, rgbscreen, 1.);
  fragColor.a = 1.;
}
`;

class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.colorFBO = getFBO(1, 1);
    this.coordsFBO = getFBO(1, 1, { type: HalfFloatType });
    this.normalFBO = getFBO(1, 1);
    this.params = {
      scale: 100,
      noiseScale: 0.05,
      noisiness: 0.2,
      thickness: 1,
      contour: 1,
      inkColor: new Color(0, 0, 0),
      cyan: 1,
      magenta: 0.9,
      yellow: 0.8,
      black: 0.2,
    };
    const shader = new RawShaderMaterial({
      uniforms: {
        paperTexture: { value: null },
        colorTexture: { value: this.colorFBO.texture },
        coordsTexture: { value: this.coordsFBO.texture },
        normalTexture: { value: this.normalFBO.texture },
        inkColor: { value: this.params.inkColor },
        scale: { value: this.params.scale },
        noiseScale: { value: this.params.noiseScale },
        noisiness: { value: this.params.noisiness },
        thickness: { value: this.params.thickness },
        contour: { value: this.params.contour },
        cyan: { value: this.params.cyan },
        magenta: { value: this.params.magenta },
        yellow: { value: this.params.yellow },
        black: { value: this.params.black },
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
    this.coordsFBO.setSize(w, h);
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
    this.renderer.setRenderTarget(this.coordsFBO);
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
        this.renderPass.shader.uniforms.scale.value = v;
      });
    controllers["noiseScale"] = gui
      .add(this.params, "noiseScale", 0, 0.1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.noiseScale.value = v;
      });
    controllers["noisiness"] = gui
      .add(this.params, "noisiness", 0, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.noisiness.value = v;
      });
    controllers["thickness"] = gui
      .add(this.params, "thickness", 0.0, 3)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.thickness.value = v;
      });
    controllers["contour"] = gui
      .add(this.params, "contour", 0.0, 10)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.contour.value = v;
      });
    controllers["cyan"] = gui
      .add(this.params, "cyan", 0.0, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.cyan.value = v;
      });
    controllers["magenta"] = gui
      .add(this.params, "magenta", 0.0, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.magenta.value = v;
      });
    controllers["yellow"] = gui
      .add(this.params, "yellow", 0.0, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.yellow.value = v;
      });
    controllers["black"] = gui
      .add(this.params, "black", 0.0, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.black.value = v;
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
