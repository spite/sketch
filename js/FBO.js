import {
  WebGLRenderTarget,
  ClampToEdgeWrapping,
  LinearFilter,
  RGBAFormat,
  UnsignedByteType,
} from "../third_party/three.module.js";

function getFBO(w, h, options = {}) {
  const fbo = new WebGLRenderTarget(w, h, {
    wrapS: options.wrapS || ClampToEdgeWrapping,
    wrapT: options.wrapT || ClampToEdgeWrapping,
    minFilter: options.minFilter || LinearFilter,
    magFilter: options.magFilter || LinearFilter,
    format: options.format || RGBAFormat,
    type: options.type || UnsignedByteType,
    stencilBuffer: options.stencilBuffer || false,
    depthBuffer: options.depthBuffer || true,
  });
  return fbo;
}

export { getFBO };
