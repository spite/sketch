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

#define LEVELS 10
#define fLEVELS float(LEVELS)

float sampleSrc(in sampler2D src, in vec2 uv) {
  vec4 color = texture(src, uv);
  float l = luma(color.rgb);
  return l;
}

float sampleStep(in sampler2D src, in vec2 uv, in float level) {
  float l = sampleSrc(src, uv);
  l = round(l*fLEVELS) / fLEVELS;
  return l > level ? 1. : 0.;
}

float findBorder(in sampler2D src, in vec2 uv, in vec2 resolution, in float level){
	float x = thickness / resolution.x;
	float y = thickness / resolution.y;
	float horizEdge = 0.;
	horizEdge -= sampleStep(src, vec2( uv.x - x, uv.y - y ), level ) * 1.0;
	horizEdge -= sampleStep(src, vec2( uv.x - x, uv.y     ), level ) * 2.0;
	horizEdge -= sampleStep(src, vec2( uv.x - x, uv.y + y ), level ) * 1.0;
	horizEdge += sampleStep(src, vec2( uv.x + x, uv.y - y ), level ) * 1.0;
	horizEdge += sampleStep(src, vec2( uv.x + x, uv.y     ), level ) * 2.0;
	horizEdge += sampleStep(src, vec2( uv.x + x, uv.y + y ), level ) * 1.0;
	float vertEdge = 0.;
	vertEdge -= sampleStep(src, vec2( uv.x - x, uv.y - y ), level ) * 1.0;
	vertEdge -= sampleStep(src, vec2( uv.x    , uv.y - y ), level ) * 2.0;
	vertEdge -= sampleStep(src, vec2( uv.x + x, uv.y - y ), level ) * 1.0;
	vertEdge += sampleStep(src, vec2( uv.x - x, uv.y + y ), level ) * 1.0;
	vertEdge += sampleStep(src, vec2( uv.x    , uv.y + y ), level ) * 2.0;
	vertEdge += sampleStep(src, vec2( uv.x + x, uv.y + y ), level ) * 1.0;
	float edge = sqrt((horizEdge * horizEdge) + (vertEdge * vertEdge));
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

float texh(in vec2 p, in float lum) {
  float e = thickness * length(vec2(dFdx(p.x), dFdy(p.y))); 
  
  if (lum < 0.5) {
    float v = abs(mod(p.y+1., 16.0));
    if (v < e) {
      return 0.;
    }
  }

  if (lum < 0.25) {
    float v = abs(mod(p.y, 8.0));
    if (v < e) {
      return 0.;
    }
  }

 return 1.;
}

void main() {
  vec2 size = vec2(textureSize(colorTexture, 0));
  
  float c = 0.;
  float col = 0.;
  float hatch = 1.;

  for(int i=0; i<LEVELS; i++) {
    float f = float(i) / float(LEVELS);
    float ss = scale * mix(1., 4., f);
    vec2 offset = noisiness * vec2(fbm3(vec3(ss*vUv,1.)), fbm3(vec3(ss*vUv.yx,1.)));
    vec2 uv = vUv + offset;

    vec4 color = texture(colorTexture, uv);
    float l = luma(color.rgb);
    l = round(l * float(LEVELS)) / float(LEVELS);

    float b = findBorder(colorTexture, uv, size, f);
    b = clamp(b - 5.*l, 0., 1.);
    c += b;
  
    col += l / fLEVELS;

    if(l<.5) {

      float a = mix(0., 3.2 * TAU, l);
      float s = sin(a);
      float c = cos(a);
      mat2 rot = mat2(c, -s, s, c);
      uv = rot * uv;

      float e = 1.;
      float threshold = mix(50., 400., 2.*l);
      float v = abs(mod(uv.y*size.y+float(i)*threshold/fLEVELS, threshold));
      if (v < e) {
        v = 0.;
      } else {
        v = 1.;
      }
      hatch *= v;//mix(1., texh(uv*size, l), v);
    }
  }

  float ss = scale * 1.;
  vec2 offset = noisiness * vec2(fbm3(vec3(ss*vUv,1.)), fbm3(vec3(ss*vUv.yx,1.)));
  vec2 uv = vUv + offset;
  float normalEdge = length(sobel(normalTexture, uv, size, 3. * thickness));
  normalEdge = aastep(.5, normalEdge);
  c += normalEdge;

  col = clamp(col * 2., 0., 1.);
  hatch = 1. - hatch;

  vec4 paper = texture(paperTexture, .00025 * vUv*size);
  fragColor.rgb = blendDarken(paper.rgb, inkColor/255., 1.-col);
  fragColor.rgb = blendDarken(fragColor.rgb, inkColor/255., c);
  fragColor.rgb = blendDarken(fragColor.rgb, inkColor/255., hatch);
  //fragColor.rgb = vec3(hatch);
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
      thickness: 1,
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
      .add(this.params, "scale", 0.1, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.scale.value = v;
      });
    // controllers["blob"] = gui
    //   .add(this.params, "blob", 0.000001, 1)
    //   .onChange(async (v) => {
    //     this.renderPass.shader.uniforms.blob.value = v;
    //   });
    controllers["thickness"] = gui
      .add(this.params, "thickness", 0.5, 5)
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
