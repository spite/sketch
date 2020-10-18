import {
  MeshStandardMaterial,
  Vector2,
  Color,
} from "../third_party/three.module.js";
import { lines } from "../shaders/lines.js";

class LineMaterial extends MeshStandardMaterial {
  constructor(options) {
    super(options);
    
    this.params = {
      roughness: 0.4,
      metalness: 0.1,
      scale: 1.,
      inkColor: 0x87B41F,
      angle: Math.PI/4,
      thickness: .7,
      min: 0,
      max: 1,
      rim: .45,
    };

    this.uniforms = {
      resolution: { value: new Vector2(1, 1) },
      paperTexture: { value: null },
      scale: { value: this.params.scale },
      angle: { value: this.params.angle },
      thickness: { value: this.params.thickness },
      inkColor: { value: new Color(this.params.inkColor) },
      range: { value: new Vector2(this.params.min, this.params.max) },
      rim: { value: this.params.rim },
    };

    this.onBeforeCompile = (shader, renderer) => {
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
        vWorldPosition = modelViewMatrix * vec4(position, 1.);`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <common>`,
        `#include <common>
        uniform vec2 resolution;
        uniform sampler2D paperTexture;
        uniform float scale;
        uniform vec3 inkColor;
        uniform float thickness;
        uniform vec2 range;
        uniform float angle;
        uniform float rim;

        in vec2 vCoords;
        in vec4 vWorldPosition;

        // from https://www.shadertoy.com/view/Wtl3zs

        #define TAU 6.28318530718

        const float grid = 20.;
        #define pixel_width 2./resolution.y*grid
        #define slowt 1./5.

        float easeInOut(float t) {
            if ((t *= 2.0) < 1.0) {
                return 0.5 * t * t;
            } else {
                return -0.5 * ((t - 1.0) * (t - 3.0) - 1.0);
            }
        }

        float linearstep(float begin, float end, float t) {
            return clamp((t - begin) / (end - begin), 0.0, 1.0);
        }

        float stroke(float d, float size, float width) {
          return smoothstep(pixel_width,0.0,abs(d-size)-width/2.);
        }

        /* discontinuous pseudorandom uniformly distributed in [-0.5, +0.5]^3 */
        vec3 random3(vec3 c) {
          float j = 4096.0*sin(dot(c,vec3(17.0, 59.4, 15.0)));
          vec3 r;
          r.z = fract(512.0*j);
          j *= .125;
          r.x = fract(512.0*j);
          j *= .125;
          r.y = fract(512.0*j);
          return r-0.5;
        }

        /* skew constants for 3d simplex functions */
        const float F3 =  0.3333333;
        const float G3 =  0.1666667;

        /* 3d simplex noise */
        float simplex3d(vec3 p) {
          /* 1. find current tetrahedron T and it's four vertices */
          /* s, s+i1, s+i2, s+1.0 - absolute skewed (integer) coordinates of T vertices */
          /* x, x1, x2, x3 - unskewed coordinates of p relative to each of T vertices*/
          
          /* calculate s and x */
          vec3 s = floor(p + dot(p, vec3(F3)));
          vec3 x = p - s + dot(s, vec3(G3));
          
          /* calculate i1 and i2 */
          vec3 e = step(vec3(0.0), x - x.yzx);
          vec3 i1 = e*(1.0 - e.zxy);
          vec3 i2 = 1.0 - e.zxy*(1.0 - e);
            
          /* x1, x2, x3 */
          vec3 x1 = x - i1 + G3;
          vec3 x2 = x - i2 + 2.0*G3;
          vec3 x3 = x - 1.0 + 3.0*G3;
          
          /* 2. find four surflets and store them in d */
          vec4 w, d;
          
          /* calculate surflet weights */
          w.x = dot(x, x);
          w.y = dot(x1, x1);
          w.z = dot(x2, x2);
          w.w = dot(x3, x3);
          
          /* w fades from 0.6 at the center of the surflet to 0.0 at the margin */
          w = max(0.6 - w, 0.0);
          
          /* calculate surflet components */
          d.x = dot(random3(s), x);
          d.y = dot(random3(s + i1), x1);
          d.z = dot(random3(s + i2), x2);
          d.w = dot(random3(s + 1.0), x3);
          
          /* multiply d by w^4 */
          w *= w;
          w *= w;
          d *= w;
          
          /* 3. return the sum of the four surflets */
          return dot(d, vec4(52.0));
        }


        /////////

        float aastep(float threshold, float value) {
          #ifdef GL_OES_standard_derivatives
            float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
            return smoothstep(threshold-afwidth, threshold+afwidth, value);
          #else
            return step(threshold, value);
          #endif  
        }

        float hetched(vec2 p, float l, float attn)
        { 
          float a = angle;
          float s = sin(a);
          float c = cos(a);
          mat2 rot = mat2(c, -s, s, c);
          p = rot * p;

          vec2 uv = p;//(fragCoord.xy-resolution.xy*.5)/resolution.y;
          uv.x *= grid;
          vec2 id = floor(uv);
          vec2 gv = fract(uv)*2.-1.;
          
          float offset = simplex3d(vec3(uv*2., slowt))*.2;
          gv.x += offset;
          float width = .1+ simplex3d(vec3(uv*1.5, slowt))* .15;
          width += (1.-l) * thickness;
          width *= attn;
          return smoothstep(pixel_width+width,width,abs(gv.x));
        }

        float texcube(in vec3 p, in vec3 n, in float l) {
          vec3 f = pow(n,vec3(2.));
          vec3 v = vec3(hetched(p.yz,l,f.x), hetched(p.zx,l,f.y), 0.*hetched(p.xy,l,1.-f.z));
          return dot(v, f);
        }

        float luma(vec3 color) {
          return dot(color, vec3(0.299, 0.587, 0.114));
        }
        float luma(vec4 color) {
          return dot(color.rgb, vec3(0.299, 0.587, 0.114));
        }
        float blendColorBurn(float base, float blend) {
          return (blend==0.0)?blend:max((1.0-((1.0-base)/blend)),0.0);
        }
        
        vec3 blendColorBurn(vec3 base, vec3 blend) {
          return vec3(blendColorBurn(base.r,blend.r),blendColorBurn(base.g,blend.g),blendColorBurn(base.b,blend.b));
        }
        
        vec3 blendColorBurn(vec3 base, vec3 blend, float opacity) {
          return (blendColorBurn(base, blend) * opacity + base * (1.0 - opacity));
        }
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float l = luma(gl_FragColor.rgb);
        l = range.x + range.y * l;
        ivec2 size = textureSize(paperTexture, 0);
        vec4 paper = texture(paperTexture, gl_FragCoord.xy / vec2(float(size.x), float(size.y)));
        vec3 coords = scale *  vWorldPosition.xyz/ vWorldPosition.w;

        vec3 n = normalize(vNormal);

        // Compute curvature
        vec3 dx = dFdx(n);
        vec3 dy = dFdy(n);
        vec3 xneg = n - dx;
        vec3 xpos = n + dx;
        vec3 yneg = n - dy;
        vec3 ypos = n + dy;
        float depth = length(vWorldPosition);
        float curvature = abs((cross(xneg, xpos).y - cross(yneg, ypos).x) *40.);
        l *= 1. - (.5 + .5 * curvature) * rim;
        
        vec3 qr = coords.xyz;
        float line = texcube(coords, vNormal, l);
        float r = line;//aastep(l, line);
        gl_FragColor.rgb = blendColorBurn(paper.rgb, inkColor, r);
        //gl_FragColor.rgb = vec3(l);
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
  gui.add(params, "scale", .1, 3,.001).onChange((v) => (material.uniforms.scale.value = v));
  gui.add(params, "angle", 0, Math.PI,.001).onChange((v) => (material.uniforms.angle.value = v));
  gui.add(params, "thickness", 0, 1,.001).onChange((v) => (material.uniforms.thickness.value = v));
  gui.add(params, "min", 0, 1,.001).onChange((v) => (material.uniforms.range.value.x = v));
  gui.add(params, "max", 0, 1,.001).onChange((v) => (material.uniforms.range.value.y = v));
  gui.add(params, "rim", 0, 1,.001).onChange((v) => (material.uniforms.rim.value = v));
}

export { LineMaterial, generateParams };
