/**
 * WebGL post-processing over the 2D canvas: bloom (bright parts bleed light)
 * and a gentle CRT look (scanlines, vignette, a hint of color fringing). The
 * game always draws to the 2D canvas; this pass only displays it. `create`
 * returns null when WebGL isn't available, and the plain canvas is used.
 */

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_crt;
varying vec2 v_uv;
void main() {
  vec2 px = 1.0 / u_res;
  vec3 col = texture2D(u_tex, v_uv).rgb;
  // Bloom: a ring blur at two radii, keeping only what's brighter than mid grey.
  vec3 bloom = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    vec2 o = vec2(cos(a), sin(a));
    bloom += max(texture2D(u_tex, v_uv + o * px * 5.0).rgb - 0.5, 0.0);
    bloom += max(texture2D(u_tex, v_uv + o * px * 13.0).rgb - 0.5, 0.0) * 0.6;
  }
  col += bloom * 0.16;
  if (u_crt > 0.5) {
    // Fine scanlines (every other device pixel row), a soft vignette, slight color fringing.
    col *= 0.93 + 0.07 * step(0.5, fract(gl_FragCoord.y * 0.5));
    vec2 d = v_uv - 0.5;
    col *= 1.0 - dot(d, d) * 0.5;
    col.r = mix(col.r, texture2D(u_tex, v_uv + vec2(px.x, 0.0)).r, 0.35);
    col.b = mix(col.b, texture2D(u_tex, v_uv - vec2(px.x, 0.0)).b, 0.35);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class PostFx {
  private constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGLRenderingContext,
    private readonly tex: WebGLTexture,
    private readonly uRes: WebGLUniformLocation | null,
    private readonly uCrt: WebGLUniformLocation | null,
  ) {}

  /** Set up the pass on `canvas`, or null if WebGL (or the shader) fails. */
  static create(canvas: HTMLCanvasElement): PostFx | null {
    try {
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: true });
      if (!gl) return null;
      // Software WebGL (no GPU) would cost far more than the pass is worth: use the plain canvas.
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return null;
      const shader = (type: number, src: string): WebGLShader | null => {
        const s = gl.createShader(type);
        if (!s) return null;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
      };
      const vs = shader(gl.VERTEX_SHADER, VERT);
      const fs = shader(gl.FRAGMENT_SHADER, FRAG);
      const prog = gl.createProgram();
      if (!vs || !fs || !prog) return null;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a_pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const tex = gl.createTexture();
      if (!tex) return null;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_tex'), 0);
      return new PostFx(canvas, gl, tex, gl.getUniformLocation(prog, 'u_res'), gl.getUniformLocation(prog, 'u_crt'));
    } catch {
      return null;
    }
  }

  /** Show `source` through the pass. `crt`: scanlines and vignette as well as bloom. */
  render(source: HTMLCanvasElement, crt: boolean): void {
    const gl = this.gl;
    if (this.canvas.width !== source.width || this.canvas.height !== source.height) {
      this.canvas.width = source.width;
      this.canvas.height = source.height;
    }
    gl.viewport(0, 0, source.width, source.height);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    gl.uniform2f(this.uRes, source.width, source.height);
    gl.uniform1f(this.uCrt, crt ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
