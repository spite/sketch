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
import { signal } from "../third_party/guspira.js";
import { addPaperParams } from "../js/params.js";
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

  int SHADELEVELS = 5;
  float shadeCol = 1.;//SHADELEVELS;

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

  if(shadeCol >= 4./fLevels) {
    color = vec3(253.,228.,168.)/255.;
  }
  else if(shadeCol >= 3./fLevels) {
    float l = mod(vUv.y*size.y, 10.) > 5. ? 0.:1.;
    color = mix(vec3(126.,164.,174.)/255.,vec3(253.,228.,168.)/255.,l);
  }
  else if(shadeCol >= 2./fLevels) {
    color = vec3(126.,164.,174.)/255.;
  }
  else if(shadeCol >= 1./fLevels) {
    color = vec3(216.,27.,33.)/255.;
  }
  else {
    color = vec3(0.,50.,76.)/255.;
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

  generateParams(gui, options = {}) {
    const uniforms = this.renderPass.shader.uniforms;
    const signals = {};
    signals.lumaRange = signal([this.params.min, this.params.max]);
    gui.addRangeSlider("luma range", signals.lumaRange, 0, 1, 0.01, ([lo, hi]) => {
      uniforms.minLuma.value = lo;
      uniforms.maxLuma.value = hi;
    });
    signals.scale = signal(this.params.scale);
    gui.addSlider("scale", signals.scale, 0.1, 1, 0.01, (v) => (uniforms.scale.value = v));
    signals.noisiness = signal(this.params.noisiness);
    gui.addSlider("noisiness", signals.noisiness, 0.0, 0.01, 0.001, (v) => (uniforms.noisiness.value = v));
    signals.blur = signal(this.params.blur);
    gui.addSlider("blur", signals.blur, 0, 7, 1, (v) => (this.params.blur = v));
    signals.blurBorder = signal(this.params.blurBorder);
    gui.addSlider("blurBorder", signals.blurBorder, 0, 7, 1, (v) => (this.params.blurBorder = v));
    signals.paper = addPaperParams(gui, this.renderPass.shader, options.paper);
    return signals;
  }
}

export { Post };
