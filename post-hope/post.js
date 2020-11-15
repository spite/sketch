import {
  Color,
  DoubleSide,
  MeshNormalMaterial,
  RawShaderMaterial,
  TextureLoader,
  RepeatWrapping,
  HalfFloatType,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
} from "../third_party/three.module.js";
import { ShaderPass } from "../js/ShaderPass.js";
import { ShaderPingPongPass } from "../js/ShaderPingPongPass.js";
import { getFBO } from "../js/FBO.js";
import { shader as orthoVs } from "../shaders/ortho-vs.js";
import { shader as sobel } from "../shaders/sobel.js";
import { shader as aastep } from "../shaders/aastep.js";
import { shader as luma } from "../shaders/luma.js";
import { generateParams as generatePaperParams } from "../js/paper.js";
import { shader as darken } from "../shaders/blend-darken.js";
import { shader as screen } from "../shaders/blend-screen.js";
import { blur5 } from "../shaders/fast-separable-gaussian-blur.js";

const normalMat = new MeshNormalMaterial({ side: DoubleSide });

const loader = new TextureLoader();
const noiseTexture = loader.load("../assets/noise1.png");
noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping;

const blurFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D inputTexture;
uniform vec2 direction;

${blur5}

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 size = vec2(textureSize(inputTexture, 0));
  fragColor = blur5(inputTexture, vUv, size, direction);
}
`;

const fragmentShader = `#version 300 es
precision highp float;

uniform sampler2D colorTexture;
uniform sampler2D shadeTexture;
uniform sampler2D normalTexture;
uniform sampler2D paperTexture;
uniform sampler2D componentTexture;
uniform sampler2D noiseTexture;

uniform float minLuma;
uniform float maxLuma;
uniform float scale;
uniform float noisiness;

out vec4 fragColor;

in vec2 vUv;

${sobel}

${luma}

${aastep}

${darken}
${screen}

#define TAU 6.28318530718

#define LEVELS 5
#define fLEVELS float(LEVELS)

vec4 sampleSrc(in sampler2D src, in vec2 uv) {
  vec4 color = texture(src, uv);
  return color;
}

vec4 sampleStep(in sampler2D src, in vec2 uv, in float level) {
  vec4 l = sampleSrc(src, uv);
  l = smoothstep(minLuma, maxLuma, l);
  l = round(l*fLEVELS) / fLEVELS;
  return vec4(l.x>level?1.:0., l.y>level?1.:0., l.z>level?1.:0., l.w>level?1.:0.);
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

#define TAU 6.28318530718

void main() {
  vec2 size = vec2(textureSize(colorTexture, 0));
  
  float ss = scale * 1.;
  vec2 offset = noisiness * vec2(fbm3(vec3(ss*vUv,1.)), fbm3(vec3(ss*vUv.yx,1.)));
  vec2 uv = vUv + offset;
  vec4 border = sobel(colorTexture, uv, size, 5.);

  float shadeCol = 1.;

  int SHADELEVELS = 5;
  float fLevels = float(SHADELEVELS);
  for(int i=0; i<SHADELEVELS; i++) {
    float f = float(i) / float(SHADELEVELS);
    float ss = scale * mix(1., 4., f);
    vec2 offset = noisiness * vec2(fbm3(vec3(ss*vUv,1.)), fbm3(vec3(ss*vUv.yx,1.)));
    vec2 uv = vUv + offset;

    vec4 c = sampleStep(shadeTexture, uv, f);
    float lc = luma(c.rgb);
    if(lc<=f){
      shadeCol = f;
      break;
    }
  }

  shadeCol *= 1.-smoothstep(.5,.5, luma(border.rgb));
  vec3 color = vec3(1.);

  if(shadeCol == 0.) {
    color = vec3(0.,50.,76.)/255.;
  }
  if(shadeCol == 1./fLEVELS) {
    color = vec3(216.,27.,33.)/255.;
  }
  if(shadeCol == 2./fLEVELS) {
    color = vec3(126.,164.,174.)/255.;
  }
  if(shadeCol == 3./fLEVELS) {
    float l = mod(vUv.y*size.y, 10.) > 5. ? 0.:1.;
    color = mix(vec3(126.,164.,174.)/255.,vec3(253.,228.,168.)/255.,l);
  }
  if(shadeCol >= 4./fLEVELS) {
    color = vec3(253.,228.,168.)/255.;
  }

  fragColor.rgb = texture(paperTexture, vUv).rgb;
  fragColor.rgb = blendDarken(fragColor.rgb, color, 1.);

  fragColor.a = 1.;
}
`;

class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.shadeFBO = getFBO(1, 1);
    this.normalFBO = getFBO(1, 1);
    this.params = {
      roughness: 0.2,
      metalness: 0.1,
      scale: 1,
      min: 0.0,
      max: 1,
      blur: 2,
      blurBorder: 2,
      noisiness: 0.0,
    };
    const shader = new RawShaderMaterial({
      uniforms: {
        paperTexture: { value: null },
        colorTexture: { value: null },
        shadeTexture: { value: this.shadeFBO.texture },
        componentTexture: { value: null },
        normalTexture: { value: this.normalFBO.texture },
        noiseTexture: { value: noiseTexture },
        scale: { value: this.params.scale },
        noisiness: { value: this.params.noisiness },
        blur: { value: this.params.blur },
        blurBorder: { value: this.params.blurBorder },
        minLuma: { value: this.params.min },
        maxLuma: { value: this.params.max },
      },
      vertexShader: orthoVs,
      fragmentShader,
    });
    const blurShader = new RawShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
        direction: { value: new Vector2() },
      },
      vertexShader: orthoVs,
      fragmentShader: blurFragmentShader,
    });
    this.blurPass = new ShaderPingPongPass(renderer, blurShader, {
      format: RGBAFormat,
      type: UnsignedByteType,
    });
    this.blurShadePass = new ShaderPingPongPass(renderer, blurShader, {
      format: RGBAFormat,
      type: UnsignedByteType,
    });
    this.renderPass = new ShaderPass(renderer, shader);
  }

  setSize(w, h) {
    this.normalFBO.setSize(w, h);
    this.shadeFBO.setSize(w, h);
    this.renderPass.setSize(w, h);
    this.blurPass.setSize(w, h);
    this.blurShadePass.setSize(w, h);
  }

  render(scene, camera) {
    this.renderer.setRenderTarget(this.shadeFBO);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);

    scene.overrideMaterial = normalMat;
    this.renderer.setRenderTarget(this.normalFBO);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    scene.overrideMaterial = null;

    this.blurPass.shader.uniforms.inputTexture.value = this.normalFBO.texture;
    for (let i = 0; i < 6; i++) {
      if (i < this.params.blurBorder) {
        var d = (i + 1) * 2;
        this.blurPass.shader.uniforms.direction.value.set(d, 0);
        this.blurPass.render();
        this.blurPass.shader.uniforms.inputTexture.value = this.blurPass.fbos[
          this.blurPass.currentFBO
        ].texture;
        this.blurPass.shader.uniforms.direction.value.set(0, d);
        this.blurPass.render();
        this.blurPass.shader.uniforms.inputTexture.value = this.blurPass.fbos[
          this.blurPass.currentFBO
        ].texture;
      }
    }
    this.renderPass.shader.uniforms.colorTexture.value = this.blurPass.shader.uniforms.inputTexture.value = this.blurPass.fbos[
      this.blurPass.currentFBO
    ].texture;
    if (this.params.blurBorder === 0) {
      this.renderPass.shader.uniforms.colorTexture.value = this.normalFBO.texture;
    }

    this.blurShadePass.shader.uniforms.inputTexture.value = this.shadeFBO.texture;
    for (let i = 0; i < 6; i++) {
      if (i < this.params.blur) {
        var d = (i + 1) * 2;
        this.blurShadePass.shader.uniforms.direction.value.set(d, 0);
        this.blurShadePass.render();
        this.blurShadePass.shader.uniforms.inputTexture.value = this.blurShadePass.fbos[
          this.blurShadePass.currentFBO
        ].texture;
        this.blurShadePass.shader.uniforms.direction.value.set(0, d);
        this.blurShadePass.render();
        this.blurShadePass.shader.uniforms.inputTexture.value = this.blurShadePass.fbos[
          this.blurShadePass.currentFBO
        ].texture;
      }
    }
    this.renderPass.shader.uniforms.shadeTexture.value = this.blurShadePass.shader.uniforms.inputTexture.value = this.blurShadePass.fbos[
      this.blurShadePass.currentFBO
    ].texture;
    if (this.params.blur === 0) {
      this.renderPass.shader.uniforms.shadeTexture.value = this.shadeFBO.texture;
    }

    this.renderPass.render(true);
  }

  generateParams(gui) {
    const controllers = {};
    controllers["min"] = gui
      .add(this.params, "min", 0, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.minLuma.value = v;
      });
    controllers["max"] = gui
      .add(this.params, "max", 0.0, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.maxLuma.value = v;
      });
    controllers["scale"] = gui
      .add(this.params, "scale", 0.1, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.scale.value = v;
      });
    controllers["noisiness"] = gui
      .add(this.params, "noisiness", 0.0, 0.01, 0.001)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.noisiness.value = v;
      });
    controllers["blur"] = gui.add(this.params, "blur", 0, 7, 1);
    controllers["blurBorder"] = gui.add(this.params, "blurBorder", 0, 7, 1);
    controllers["paper"] = generatePaperParams(gui, this.renderPass.shader);
    return controllers;
  }
}

export { Post };
