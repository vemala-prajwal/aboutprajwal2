// The compositor.
//
// Draw order, back to front:
//   1  plate        mottled black, vignette, red ember behind the wordmark
//   2  letters      seven quads sharing one glyph atlas
//   3  post         grain, vignette, pulse
//
// Everything is premultiplied, so a single blend mode covers the whole frame.

import {
  createGL, program, unitQuad, texture, upload, bind, loadImage,
} from './renderer.js';
import {
  VERT, FRAG_BG, FRAG_LETTER, FRAG_POST,
} from './shaders.js';

const INK = [0.871, 0.106, 0.110];    // #DE1B1C, sampled from the artwork

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = createGL(canvas);
    this.ok = !!this.gl;
    if (!this.ok) return;

    const gl = this.gl;
    this.quad = unitQuad(gl);
    this.progs = {
      bg: program(gl, VERT, FRAG_BG, 'bg'),
      letter: program(gl, VERT, FRAG_LETTER, 'letter'),
      post: program(gl, VERT, FRAG_POST, 'post'),
    };
    this.tex = {
      glyph: texture(gl),
      grunge: texture(gl, { wrap: 'repeat' }),
      grain: texture(gl, { wrap: 'repeat' }),
    };
    this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.res = [1, 1];
    this.word = null;
    this.layout = null;
    this.parallax = { x: 0, y: 0 };
    // exposed so the distressing can be dialled in against the reference art
    this.wear = 0.44;
    this.wearGain = 2.1;
    this.wearScale = 5.6;
  }

  async loadTextures({ grunge, grain }) {
    const [a, b] = await Promise.all([loadImage(grunge), loadImage(grain)]);
    upload(this.gl, this.tex.grunge, a);
    upload(this.gl, this.tex.grain, b);
  }

  setWord(word) {
    this.word = word;
    upload(this.gl, this.tex.glyph, word.canvas);
  }

  resize(layout) {
    this.layout = layout;
    const { w, h, dpr } = layout;
    const W = Math.round(w * dpr);
    const H = Math.round(h * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.res = [W, H];
    this.gl.viewport(0, 0, W, H);
  }

  // ---------------------------------------------------------------- drawing

  _quad(prog, rect, uv = [0, 0, 1, 1], skew = [0, 0]) {
    const gl = this.gl;
    gl.uniform4f(prog.u.uRect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform2f(prog.u.uRes, this.res[0], this.res[1]);
    if (prog.u.uUV) gl.uniform4f(prog.u.uUV, uv[0], uv[1], uv[2], uv[3]);
    if (prog.u.uSkew) gl.uniform2f(prog.u.uSkew, skew[0], skew[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Letter destination rect in device pixels. */
  letterRect(i) {
    const { word, dpr } = this.layout;
    const W = this.word;
    const s = (word.w * dpr) / W.ink.w;
    const L = W.letters[i];
    return [
      word.x * dpr + (L.x - W.ink.x) * s,
      word.y * dpr + (L.y - W.ink.y) * s,
      L.w * s,
      L.h * s,
    ];
  }

  render(state, time) {
    if (!this.ok || !this.word || !this.layout) return;
    const gl = this.gl;
    const [W, H] = this.res;
    const aspect = W / H;
    gl.bindVertexArray(this.quad);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const bg = this.progs.bg;
    gl.useProgram(bg.p);
    gl.uniform1i(bg.u.uGrain, bind(gl, this.tex.grain, 0));
    gl.uniform1f(bg.u.uTime, time);
    gl.uniform1f(bg.u.uEmber, state.ember);
    gl.uniform1f(bg.u.uAspect, aspect);
    gl.uniform2f(bg.u.uEmberAt, this.layout.ember.x, this.layout.ember.y);
    this._quad(bg, [0, 0, W, H]);

    const letters = this.progs.letter;
    gl.useProgram(letters.p);
    gl.uniform1i(letters.u.uGlyph, bind(gl, this.tex.glyph, 0));
    gl.uniform1i(letters.u.uGrunge, bind(gl, this.tex.grunge, 1));
    gl.uniform3f(letters.u.uInk, INK[0], INK[1], INK[2]);
    gl.uniform2f(letters.u.uGrungeScale, aspect * this.wearScale, this.wearScale);
    gl.uniform2f(letters.u.uGrungeOffset, 0.12, 0.31);
    gl.uniform1f(letters.u.uWear, this.wear);
    gl.uniform1f(letters.u.uWearGain, this.wearGain);
    for (let i = 0; i < this.word.letters.length; i++) {
      const letter = this.word.letters[i];
      const stateLetter = state.letters[i];
      if (stateLetter.opacity <= 0.001) continue;
      const rect = this.letterRect(i);
      gl.uniform1f(letters.u.uOpacity, stateLetter.opacity);
      gl.uniform1f(letters.u.uReveal, stateLetter.reveal);
      gl.uniform1f(letters.u.uSoften,
        stateLetter.soften * 0.026 * (letter.v1 - letter.v0));
      gl.uniform1f(letters.u.uEdgeLight, stateLetter.edge);
      this._quad(letters, rect,
        [letter.u0, letter.v0, letter.u1 - letter.u0, letter.v1 - letter.v0]);
    }

    const post = this.progs.post;
    gl.useProgram(post.p);
    gl.uniform1i(post.u.uGrain, bind(gl, this.tex.grain, 0));
    gl.uniform1f(post.u.uTime, time);
    gl.uniform1f(post.u.uAmount, state.grain);
    gl.uniform1f(post.u.uAspect, aspect);
    gl.uniform1f(post.u.uFlash, state.flash);
    this._quad(post, [0, 0, W, H]);
    gl.bindVertexArray(null);
  }
}
