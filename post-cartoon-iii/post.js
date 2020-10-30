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
import { shader as screen } from "../shaders/blend-screen.js";

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
uniform float boost;
uniform float dark;
uniform float mid;
uniform float light;

out vec4 fragColor;

in vec2 vUv;

${sobel}

${luma}

${aastep}

${darken}
${screen}

#define mul(a,b) (b*a)

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
  float normalEdge = 1.- length(sobel(normalTexture, vUv, size, contour));
  normalEdge = smoothstep(.5-thickness, .5+thickness, normalEdge);
  vec4 paper = texture(paperTexture, .00025 * vUv*size);
  
  color.rgb = boost * blendDarken(color.rgb, vec3(0.), .5-normalEdge);
  float l = luma(color.rgb);

  vec3 rgbscreen = color.rgb;

  if(l<dark) {
    vec2 uv = scale * vUv;
    float k = lines(l/dark, rot(uv, 45.), size, thickness);
    rgbscreen = mix(rgbscreen, mix(rgbscreen, inkColor/255., .5), 1.-k);
  } 

  if(l<mid) {
    vec2 uv = scale * vUv;
    float k = lines(l/mid, rot(uv, 15.), size, thickness);
    rgbscreen = mix(rgbscreen, mix(rgbscreen, inkColor/255., .5), 1.-k);
  } 
  
  if(l>light){
    vec2 uv = vUv * size;
    float frequency = .05;

    float w = mix(0., 1., thickness);
    mat2 k_matrix = mat2(0.707, 0.707, -0.707, 0.707);
    vec2 Kst = frequency * scale * mul(k_matrix , uv);
    vec2 Kuv = w * (2. * fract(Kst) - 1.);
    float k = step(0.0, sqrt(l-light) - length(Kuv));
    
    rgbscreen = blendScreen(rgbscreen, vec3(1.), k);
  }

  fragColor.rgb = blendDarken(paper.rgb, rgbscreen, 1.);
  fragColor.a = 1.;
}
`;

const finalFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D colorTexture;

in vec2 vUv;

out vec4 fragColor;

void main() {
  vec2 dir = vUv - vec2( .5 );
	float d = .7 * length( dir );
  normalize( dir );
  float delta = 100.;
	vec2 value = d * dir * delta;
  vec2 resolution = vec2(textureSize(colorTexture, 0));

	vec4 c1 = texture(colorTexture, vUv - value / resolution.x );
	vec4 c2 = texture(colorTexture, vUv );
	vec4 c3 = texture(colorTexture, vUv + value / resolution.y );
	
  fragColor = vec4( c1.r, c2.g, c3.b, c1.a + c2.a + c3.b );
}
`;

class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.colorFBO = getFBO(1, 1);
    this.normalFBO = getFBO(1, 1);
    this.params = {
      scale: 1.5,
      boost: 1.1,
      thickness: 1,
      contour: 4,
      inkColor: new Color(64, 43, 43),
      dark: 0.86,
      mid: 0.62,
      light: 0.62,
    };
    const shader = new RawShaderMaterial({
      uniforms: {
        paperTexture: { value: null },
        colorTexture: { value: this.colorFBO.texture },
        normalTexture: { value: this.normalFBO.texture },
        inkColor: { value: this.params.inkColor },
        boost: { value: this.params.boost },
        scale: { value: this.params.scale },
        thickness: { value: this.params.thickness },
        contour: { value: this.params.contour },
        dark: { value: this.params.dark },
        mid: { value: this.params.mid },
        light: { value: this.params.light },
      },
      vertexShader: orthoVs,
      fragmentShader,
    });
    const finalShader = new RawShaderMaterial({
      uniforms: {
        colorTexture: { value: null },
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

  generateParams(gui) {
    const controllers = {};
    controllers["boost"] = gui
      .add(this.params, "boost", 0.1, 2)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.boost.value = v;
      });
    controllers["scale"] = gui
      .add(this.params, "scale", 0.1, 2)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.scale.value = v;
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
    controllers["dark"] = gui
      .add(this.params, "dark", 0.0, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.dark.value = v;
      });
    controllers["mid"] = gui
      .add(this.params, "mid", 0.0, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.mid.value = v;
      });
    controllers["light"] = gui
      .add(this.params, "light", 0.0, 1)
      .onChange(async (v) => {
        this.renderPass.shader.uniforms.light.value = v;
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
