import {
  Color,
  DoubleSide,
  MeshNormalMaterial,
  RawShaderMaterial,
  TextureLoader,
  RepeatWrapping,
  HalfFloatType,
  RGBAFormat,
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

const normalMat = new MeshNormalMaterial({ side: DoubleSide });

const loader = new TextureLoader();
const noiseTexture = loader.load("../assets/noise1.png");
noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping;

const componentFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D colorTexture;
uniform vec3 component;

uniform float cyan;
uniform float magenta;
uniform float yellow;
uniform float black;

in vec2 vUv;

out vec4 fragColor;

vec4 RGBtoCMYK (vec3 rgb) {
  vec4 cmyk;
	cmyk.xyz = 1.- rgb;
  cmyk.w = min(cmyk.x, min(cmyk.y, cmyk.z)); 
  
  return cmyk;
}

void main() {
  vec4 color = texture(colorTexture, vUv);
  
  vec4 cmyk = RGBtoCMYK(color.rgb);
  cmyk *= vec4(cyan, magenta, yellow, black);

  fragColor = cmyk;
}
`;

const fragmentShader = `#version 300 es
precision highp float;

uniform sampler2D colorTexture;
uniform sampler2D normalTexture;
uniform sampler2D paperTexture;
uniform sampler2D componentTexture;
uniform sampler2D noiseTexture;
uniform vec3 inkColor;
uniform float scale;
uniform float thickness;
uniform float noisiness;
uniform float angle;
uniform float contour;
uniform float border;

out vec4 fragColor;

in vec2 vUv;

${sobel}

${luma}

${aastep}

${darken}
${screen}

#define TAU 6.28318530718

#define LEVELS 10
#define fLEVELS float(LEVELS)

vec4 sampleSrc(in sampler2D src, in vec2 uv) {
  vec4 color = texture(src, uv);
  return color;
}

vec4 sampleStep(in sampler2D src, in vec2 uv, in float level) {
  vec4 l = sampleSrc(src, uv);
  l = round(l*fLEVELS) / fLEVELS;
  return vec4(l.x>level?1.:0., l.y>level?1.:0., l.z>level?1.:0., l.w>level?1.:0.);
}

vec4 findBorder(in sampler2D src, in vec2 uv, in vec2 resolution, in float level){
	float x = thickness / resolution.x;
	float y = thickness / resolution.y;
	vec4 horizEdge = vec4(0.);
	horizEdge -= sampleStep(src, vec2( uv.x - x, uv.y - y ), level ) * 1.0;
	horizEdge -= sampleStep(src, vec2( uv.x - x, uv.y     ), level ) * 2.0;
	horizEdge -= sampleStep(src, vec2( uv.x - x, uv.y + y ), level ) * 1.0;
	horizEdge += sampleStep(src, vec2( uv.x + x, uv.y - y ), level ) * 1.0;
	horizEdge += sampleStep(src, vec2( uv.x + x, uv.y     ), level ) * 2.0;
	horizEdge += sampleStep(src, vec2( uv.x + x, uv.y + y ), level ) * 1.0;
	vec4 vertEdge = vec4(0.);
	vertEdge -= sampleStep(src, vec2( uv.x - x, uv.y - y ), level ) * 1.0;
	vertEdge -= sampleStep(src, vec2( uv.x    , uv.y - y ), level ) * 2.0;
	vertEdge -= sampleStep(src, vec2( uv.x + x, uv.y - y ), level ) * 1.0;
	vertEdge += sampleStep(src, vec2( uv.x - x, uv.y + y ), level ) * 1.0;
	vertEdge += sampleStep(src, vec2( uv.x    , uv.y + y ), level ) * 2.0;
	vertEdge += sampleStep(src, vec2( uv.x + x, uv.y + y ), level ) * 1.0;
	vec4 edge = sqrt((horizEdge * horizEdge) + (vertEdge * vertEdge));
	return edge;
}

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

mat2 rot(in float a) {
  a = a * TAU / 360.;
  float s = sin(a);
  float c = cos(a);
  mat2 rot = mat2(c, -s, s, c);
  return rot;
}

float doHatch(in float l, in float r, in float a, in vec2 uv) {
  if(l>r) {
    return 1.;
  }
  float ra = angle + a + mix(0., 3.2 * TAU, l);
  float s = sin(ra);
  float c = cos(ra);
  mat2 rot = mat2(c, -s, s, c);
  uv = rot * uv;

  float e = thickness;
  float threshold = mix(2., 40., l);
  float v = abs(mod(uv.y+r*threshold, threshold));
  if (v < e) {
    v = 0.;
  } else {
    v = 1.;
  }
  return v;
}

vec3 CMYKtoRGB (vec4 cmyk) {
  float c = cmyk.x;
  float m = cmyk.y;
  float y = cmyk.z;
  float k = cmyk.w;

  float invK = 1.0 - k;
  float r = 1.0 - min(1.0, c * invK + k);
  float g = 1.0 - min(1.0, m * invK + k);
  float b = 1.0 - min(1.0, y * invK + k);
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

void main() {
  vec2 size = vec2(textureSize(colorTexture, 0));
  
  vec4 col = vec4(0.);
  vec4 borders = vec4(0.);
  for(int i=0; i<LEVELS; i++) {
    float f = float(i) / float(LEVELS);
    float ss = scale * mix(1., 4., f);
    vec2 offset = noisiness * vec2(fbm3(vec3(ss*vUv,1.)), fbm3(vec3(ss*vUv.yx,1.)));
    vec2 uv = vUv + offset;

    vec4 b = findBorder(componentTexture, uv, size, f);
    borders += b;

    vec4 c = sampleStep(componentTexture, uv, f);
    col += c / fLEVELS;

  }

  float ss = scale * 5.;
  vec2 offset = noisiness * vec2(fbm3(vec3(ss*vUv,1.)), fbm3(vec3(ss*vUv.yx,1.)));
  vec2 uv = vUv + offset;

  vec4 cc = 1.-texture(componentTexture,uv);
  cc = round(cc*fLEVELS)/fLEVELS;
  //cc *= 2.;
  vec4 hatch = vec4(
    doHatch(cc.x, .75, 75., uv * size),
    doHatch(cc.y, .75, 15., uv * size),
    doHatch(cc.z, .75, 0., uv * size),
    doHatch(cc.w, .75, 45., uv * size)
  );
  
  float normalEdge = length(sobel(normalTexture, uv, size, contour));
  normalEdge = aastep(.5, normalEdge);
 
  vec3 rgb = CMYKtoRGB(col).rgb;
  vec4 paper = texture(paperTexture, .00025 * vUv*size);
  fragColor.rgb = blendDarken(paper.rgb, rgb, 1.);
  fragColor.rgb = blendDarken(fragColor.rgb, inkColor/255., normalEdge);

  fragColor.rgb = blendDarken(fragColor.rgb, CMYKtoRGB(borders).rgb,border *  .5);
  fragColor.rgb = blendDarken(fragColor.rgb, inkColor/255., border * .1 * (1.-borders.w));

  fragColor.rgb *= CMYKtoRGB(1.-vec4(hatch.xyz,1.));
  fragColor.rgb = blendDarken(fragColor.rgb, inkColor/255., 1.-hatch.w);

  //fragColor.rgb = texture(normalTexture, uv).rgb;
  fragColor.a = 1.;
}
`;

class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.colorFBO = getFBO(1, 1);
    this.normalFBO = getFBO(1, 1);
    this.params = {
      scale: 0.72,
      angle: 0,
      thickness: 0.7,
      noisiness: 0.003,
      contour: 2,
      border: 0.5,
      cyan: 1,
      magenta: 0.7,
      yellow: 0.6,
      black: 0.1,
      inkColor: new Color(30, 30, 30),
    };
    const shader = new RawShaderMaterial({
      uniforms: {
        paperTexture: { value: null },
        colorTexture: { value: this.colorFBO.texture },
        componentTexture: { value: null },
        normalTexture: { value: this.normalFBO.texture },
        noiseTexture: { value: noiseTexture },
        inkColor: { value: this.params.inkColor },
        scale: { value: this.params.scale },
        thickness: { value: this.params.thickness },
        contour: { value: this.params.contour },
        border: { value: this.params.border },
        noisiness: { value: this.params.noisiness },
        angle: { value: this.params.angle },
      },
      vertexShader: orthoVs,
      fragmentShader,
    });
    this.renderPass = new ShaderPass(renderer, shader);
    const componentShader = new RawShaderMaterial({
      uniforms: {
        colorTexture: { value: this.colorFBO.texture },
        cyan: { value: this.params.cyan },
        magenta: { value: this.params.magenta },
        yellow: { value: this.params.yellow },
        black: { value: this.params.black },
      },
      vertexShader: orthoVs,
      fragmentShader: componentFragmentShader,
    });
    this.componentPass = new ShaderPass(renderer, componentShader, {
      type: HalfFloatType,
      format: RGBAFormat,
    });
    shader.uniforms.componentTexture.value = this.componentPass.fbo.texture;
  }

  setSize(w, h) {
    this.normalFBO.setSize(w, h);
    this.colorFBO.setSize(w, h);
    this.renderPass.setSize(w, h);
    this.componentPass.setSize(w, h);
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
    this.componentPass.render();
    this.renderPass.render(true);
  }

  generateParams(gui) {
    const controllers = {};
    controllers["scale"] = gui
      .add(this.params, "scale", 0.1, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.scale.value = v;
      });
    controllers["thickness"] = gui
      .add(this.params, "thickness", 0.5, 5)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.thickness.value = v;
      });
    controllers["contour"] = gui
      .add(this.params, "contour", 0, 5)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.contour.value = v;
      });
    controllers["border"] = gui
      .add(this.params, "border", 0, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.border.value = v;
      });
    controllers["noisiness"] = gui
      .add(this.params, "noisiness", 0, 0.02)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.noisiness.value = v;
      });
    controllers["angle"] = gui
      .add(this.params, "angle", 0, Math.PI)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.angle.value = v;
      });
    controllers["cyan"] = gui
      .add(this.params, "cyan", 0, 1)
      .onChange(async (v) => {
        this.componentPass.shader.uniforms.cyan.value = v;
      });
    controllers["magenta"] = gui
      .add(this.params, "magenta", 0, 1)
      .onChange(async (v) => {
        this.componentPass.shader.uniforms.magenta.value = v;
      });
    controllers["yellow"] = gui
      .add(this.params, "yellow", 0, 1)
      .onChange(async (v) => {
        this.componentPass.shader.uniforms.yellow.value = v;
      });
    controllers["black"] = gui
      .add(this.params, "black", 0, 1)
      .onChange(async (v) => {
        this.componentPass.shader.uniforms.black.value = v;
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
