import {
  Color,
  MeshStandardMaterial,
  RepeatWrapping,
  TextureLoader,
  Vector2,
} from "../third_party/three.module.js";

class CrossHatchMaterial extends MeshStandardMaterial {
  constructor(options) {
    super(options);

    const loader = new TextureLoader();
    const noiseTexture = loader.load("../assets/noise1.png");
    noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping;

    this.params = {
      roughness: 0.2,
      metalness: 0.1,
      inkColor: 0x160D04,
      threshold: .5,
      min: .4,
      max: 1,
      e: .2
    };

    this.uniforms = {
      inkColor: {value: new Color(this.params.inkColor)},
      resolution: { value: new Vector2(1, 1) },
      paperTexture: { value: null },
      noiseTexture: { value: noiseTexture },
      threshold: { value: this.params.threshold },
      range: { value: new Vector2(this.params.min, this.params.max)},
      e: {value: this.params.e}
    }
    
    this.onBeforeCompile = (shader, renderer) => {
      const texture = loader.load("../assets/Craft_Light.jpg");
      for (const uniformName of Object.keys(this.uniforms)) {
        shader.uniforms[uniformName] = this.uniforms[uniformName];
      }

      shader.vertexShader = shader.vertexShader.replace(
        `#include <common>`,
        `#include <common>
        out vec2 vCoords;
        out vec4 vWorldPosition;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        `#include <uv_vertex>`,
        `#include <uv_vertex>
        vCoords = uv;
        vWorldPosition = modelMatrix * vec4(position, 1.);`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <common>`,
        `#include <common>
        uniform vec2 resolution;
        uniform sampler2D paperTexture;
        uniform sampler2D noiseTexture;
        uniform vec3 inkColor;
        uniform float threshold;
        uniform vec2 range;
        uniform float e;
        in vec2 vCoords;
        in vec4 vWorldPosition;
        #define TAU 6.28318530718
        
        // adapted from https://www.shadertoy.com/view/4lfXDM

        float noise( in vec2 x ){return texture(noiseTexture, x*.01).x;}
        float texh(in vec2 p, in float str)
        {
            p*= .7;
            float rz= 1.;
            for (int i=0;i<10;i++)
            {
                float g = texture(noiseTexture,vec2(0.025,.5)*p).x;
                g = smoothstep(0.-str*0.1,2.3-str*0.1,g);
                rz = min(1.-g,rz);
                p.xy = p.yx;
                p += .07;
                p *= 1.2;
                if (float(i) > str)break;
            }
            return rz * 1.05;
        }

        float texcube(in vec3 p, in vec3 n, in float str) {
          vec3 v = vec3(texh(p.yz,str), texh(p.zx,str), texh(p.xy,str));
          return dot(v, n*n);
        }

        float luma(vec3 color) {
          return dot(color, vec3(0.299, 0.587, 0.114));
        }
        float luma(vec4 color) {
          return dot(color.rgb, vec3(0.299, 0.587, 0.114));
        }
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float l = 1. - luma(gl_FragColor.rgb);
        l = smoothstep(range.x, range.y, l);
        float l2 = l;//.5 * smoothstep(0., 1., luma(gl_FragColor.rgb)-threshold);
        ivec2 size = textureSize(paperTexture, 0);
        vec4 paper = texture(paperTexture, gl_FragCoord.xy / vec2(float(size.x), float(size.y)));
        float line = texcube(vWorldPosition.xyz, vNormal, l*10.);
        float line2 = clamp(0.,1.,texcube(vWorldPosition.xyz, vNormal, l2*10.)-threshold);
        line = smoothstep(.5-e, .5+e, line);
        line2 = smoothstep(.5-e, .5+e, line2);
        gl_FragColor.rgb = mix( inkColor.rgb, paper.rgb, .25 + .75 * line);
        gl_FragColor.rgb += vec3(4.*line2);
        `
      );
    };
  }
}

function generateParams(gui, material) {
  const params = material.params;
  gui.add(params, "roughness", 0, 1).onChange((v) => (material.roughness = v));
  gui.add(params, "metalness", 0, 1).onChange((v) => (material.metalness = v));
  gui.addColor(params, "inkColor").onChange((v) => (material.uniforms.inkColor.value.set(v)));
  gui.add(params, "min", 0, 1,.01).onChange((v) => (material.uniforms.range.value.x = v));
  gui.add(params, "max", 0, 1,.01).onChange((v) => (material.uniforms.range.value.y = v));
  gui.add(params, "threshold", 0, 1,.01).onChange((v) => (material.uniforms.threshold.value = v));
  gui.add(params, "e", 0, 1,.01).onChange((v) => (material.uniforms.e.value = v));
}
export { CrossHatchMaterial, generateParams };
