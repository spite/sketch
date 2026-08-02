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
import { shader as screen } from "../shaders/blend-screen.js";

const normalMat = new MeshNormalMaterial({ side: DoubleSide });

const fragmentShader = `#version 300 es
precision highp float;

uniform sampler2D colorTexture;
uniform sampler2D normalTexture;
uniform sampler2D paperTexture;
uniform vec3 inkColor;
uniform float scale;
uniform float levels;
uniform float thickness;
uniform float contour;
uniform float minLuma;
uniform float maxLuma;
uniform float minLight;
uniform float lightBoost;
uniform float expLight;

out vec4 fragColor;

in vec2 vUv;

${sobel}

${luma}

${aastep}

${darken}
${screen}

#define mul(a,b) (b*a)

void main() {
  vec2 size = vec2(textureSize(colorTexture, 0));
  float e = .01;
  vec4 color = texture(colorTexture, vUv);
  float normalEdge = 1.- length(sobel(normalTexture, vUv, size, contour));
  //normalEdge = smoothstep(.5-thickness, .5+thickness, normalEdge);
  vec4 paper = texture(paperTexture, .00025 * vUv*size);
  
  float l0 = luma(color.rgb);
  float l = smoothstep(minLuma, maxLuma, l0);

  float shadeCol = round(l * levels) / levels;

  shadeCol *= normalEdge;

  vec3 rgbscreen = mix(vec3(1.), inkColor/255., 1.-shadeCol);

  vec3 dots = vec3(0.);
  vec2 uv = vUv * size;
  float frequency = .05;

  // adapted from https://github.com/libretro/glsl-shaders/blob/master/misc/cmyk-halftone-dot.glsl

  mat2 k_matrix = mat2(0.707, 0.707, -0.707, 0.707);
  vec2 Kst = frequency * scale * mul(k_matrix , uv);
  vec2 Kuv = (2. * fract(Kst) - 1.);
  float k = step(0.0, minLight + expLight*exp(l) + sqrt((l+minLight)*thickness) - length(Kuv));
    
  dots = lightBoost*(l+minLight)*vec3(k);

  fragColor.rgb = blendDarken(paper.rgb, rgbscreen, 1.);
  fragColor.rgb = blendScreen(fragColor.rgb, dots, 1.);
  fragColor.a = 1.;
}
`;

const finalFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D colorTexture;
uniform float delta;

in vec2 vUv;

out vec4 fragColor;

${luma}

void main() {
  vec2 dir = vUv - vec2( .5 );
	float d = .7 * length( dir );
  normalize( dir );
	vec2 value = d * dir * delta;
  vec2 resolution = vec2(textureSize(colorTexture, 0));

	vec4 c1 = texture(colorTexture, vUv - value / resolution.x );
	vec4 c2 = texture(colorTexture, vUv );
	vec4 c3 = texture(colorTexture, vUv + value / resolution.y );
	float c = luma(vec3(c1.r,c2.g,c3.b));
  fragColor = vec4(c,c,c, 1.);
}
`;

class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.colorFBO = getFBO(1, 1);
    this.normalFBO = getFBO(1, 1);
    this.params = {
      scale: 2.5,
      thickness: 0.4,
      minLight: 0.1,
      contour: 4,
      inkColor: new Color(13, 13, 13),
      min: 0.34,
      max: 0.71,
      lightBoost: 1.01,
      expLight: 0.2,
      aberration: 80,
      levels: 100,
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
        minLuma: { value: this.params.min },
        maxLuma: { value: this.params.max },
        minLight: { value: this.params.minLight },
        lightBoost: { value: this.params.lightBoost },
        expLight: { value: this.params.expLight },
        levels: { value: this.params.levels },
      },
      vertexShader: orthoVs,
      fragmentShader,
    });
    const finalShader = new RawShaderMaterial({
      uniforms: {
        colorTexture: { value: null },
        delta: { value: this.params.aberration },
      },
      vertexShader: orthoVs,
      fragmentShader: finalFragmentShader,
    });
    this.renderPass = new ShaderPass(renderer, shader);
    this.finalPass = new ShaderPass(renderer, finalShader);
    finalShader.uniforms.colorTexture.value = this.renderPass.fbo.texture;
  }

  setSize(w, h) {
    this.normalFBO.setSize(w, h);
    this.colorFBO.setSize(w, h);
    this.renderPass.setSize(w, h);
    this.finalPass.setSize(w, h);
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
    this.renderPass.render();
    this.finalPass.render(true);
  }

  generateParams(gui, options = {}) {
    const uniforms = this.renderPass.shader.uniforms;
    const signals = {};
    signals.inkColor = addInkParams(gui, uniforms.inkColor, { scale255: true });
    signals.levels = signal(this.params.levels);
    gui.addSlider("levels", signals.levels, 1, 100, 0.01, (v) => (uniforms.levels.value = v));
    signals.scale = signal(this.params.scale);
    gui.addSlider("scale", signals.scale, 0.1, 4, 0.01, (v) => (uniforms.scale.value = v));
    signals.thickness = signal(this.params.thickness);
    gui.addSlider("thickness", signals.thickness, 0.0, 3, 0.01, (v) => (uniforms.thickness.value = v));
    signals.contour = signal(this.params.contour);
    gui.addSlider("contour", signals.contour, 0.0, 10, 0.01, (v) => (uniforms.contour.value = v));
    signals.lumaRange = signal([this.params.min, this.params.max]);
    gui.addRangeSlider("luma range", signals.lumaRange, 0, 1, 0.01, ([lo, hi]) => {
      uniforms.minLuma.value = lo;
      uniforms.maxLuma.value = hi;
    });
    signals.minLight = signal(this.params.minLight);
    gui.addSlider("minLight", signals.minLight, 0.0, 1, 0.01, (v) => (uniforms.minLight.value = v));
    signals.lightBoost = signal(this.params.lightBoost);
    gui.addSlider("lightBoost", signals.lightBoost, 0.0, 10, 0.01, (v) => (uniforms.lightBoost.value = v));
    signals.expLight = signal(this.params.expLight);
    gui.addSlider("expLight", signals.expLight, 0.0, 1, 0.001, (v) => (uniforms.expLight.value = v));
    signals.aberration = signal(this.params.aberration);
    gui.addSlider("aberration", signals.aberration, 0.0, 100, 0.1, (v) => (this.finalPass.shader.uniforms.delta.value = v));
    signals.paper = addPaperParams(gui, this.renderPass.shader, options.paper);
    return signals;
  }
}

export { Post };
