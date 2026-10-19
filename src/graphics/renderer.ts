import { COUNT, COLUMNS, ROWS, createEdges, gridIndex, type Form, type Palette, type Pointer } from '../shared/field.ts';

const VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform vec3 uRotation;
uniform vec3 uColor;
uniform float uScale;
uniform float uAspect;
uniform float uDpr;
uniform float uTime;
uniform float uDust;
out vec3 vColor;
out float vAlpha;
vec3 rotate(vec3 p) {
  float a=uRotation.x,b=uRotation.y,c=uRotation.z;
  p=vec3(p.x,cos(a)*p.y-sin(a)*p.z,sin(a)*p.y+cos(a)*p.z);
  p=vec3(cos(b)*p.x+sin(b)*p.z,p.y,-sin(b)*p.x+cos(b)*p.z);
  return vec3(cos(c)*p.x-sin(c)*p.y,sin(c)*p.x+cos(c)*p.y,p.z);
}
void main() {
  vec3 point=aPosition;
  if(uDust>.5) { point.x+=sin(uTime*.03+aUV.x*10.)*.1;point.y+=cos(uTime*.04+aUV.y*9.)*.08; }
  vec3 p=rotate(point),n=normalize(rotate(aNormal));
  float perspective=5.5/(5.5+p.z);
  gl_Position=vec4(p.x*uScale*perspective/uAspect,p.y*uScale*perspective+.055,.5+p.z*.065,1.);
  float depth=clamp(1.-(p.z+2.4)/5.,.12,1.);
  float facing=pow(abs(dot(n,normalize(vec3(-.25,.6,1.)))),4.);
  float rim=pow(1.-abs(n.z),3.);
  float edge=pow(abs(aUV.y*2.-1.),8.);
  float thread=.5+.5*sin(aUV.x*6.28318*3.+cos(aUV.y*6.28318)*.65);
  float light=.13+depth*.45+facing*.48+rim*.35+edge*.18;
  vec3 warm=mix(uColor*.47,uColor,thread*.5+.5);
  vec3 highlight=mix(uColor,vec3(1.,.92,.79),.7);
  vColor=mix(warm,highlight,pow(facing,2.)*.5+edge*.12)*light;
  vAlpha=(.2+depth*.65)*(1.-uDust*.91);
  gl_PointSize=(1.35+depth*.85+facing*.65+edge*.4)*uDpr*perspective;
  if(uDust>.5) { vColor=uColor*.45;vAlpha*=.3+.7*aUV.y;gl_PointSize=(.6+aUV.x*.7)*uDpr; }
}`;
const POINT_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColor;
in float vAlpha;
out vec4 color;
void main() {
  float d=length(gl_PointCoord-vec2(.5));
  float halo=exp(-d*d*13.);
  float core=1.-smoothstep(.08,.25,d);
  if(d>.5) discard;
  color=vec4(vColor*(.8+core*.7),vAlpha*halo);
}`;
const LINE_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColor;
in float vAlpha;
out vec4 color;
void main() { color=vec4(vColor,vAlpha*.22); }`;
const QUAD_VERTEX = `#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  vUV=p;
  gl_Position=vec4(p*2.-1.,0.,1.);
}`;
const BLUR_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform vec2 uDirection;
in vec2 vUV;
out vec4 color;
void main() {
  vec3 sum=texture(uImage,vUV).rgb*.227027;
  sum+=texture(uImage,vUV+uDirection*1.384615).rgb*.316216;
  sum+=texture(uImage,vUV-uDirection*1.384615).rgb*.316216;
  sum+=texture(uImage,vUV+uDirection*3.230769).rgb*.070270;
  sum+=texture(uImage,vUV-uDirection*3.230769).rgb*.070270;
  color=vec4(sum,1.);
}`;
const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uAspect;
uniform vec3 uColor;
in vec2 vUV;
out vec4 color;
float grain(vec2 p) { return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main() {
  vec2 q=(vUV-vec2(.5,.54))*vec2(uAspect,1.);
  float halo=exp(-dot(q,q)*3.6);
  vec3 background=vec3(.027,.031,.030)+uColor*halo*.007;
  vec3 scene=texture(uScene,vUV).rgb;
  vec3 bloom=texture(uBloom,vUV).rgb;
  vec3 lit=scene+bloom*.85;
  lit=lit/(vec3(1.)+lit*.38);
  vec3 result=background+lit;
  float vignette=1.-smoothstep(.35,1.25,length((vUV-.5)*vec2(1.,.85)))*.38;
  result*=vignette;
  result+=(grain(gl_FragCoord.xy)-.5)/390.;
  color=vec4(result,1.);
}`;

type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number };
const COLORS: Record<Palette, [number, number, number]> = { copper: [1, .56, .28], silver: [.81, .89, .95], glacial: [.27, .72, .95] };

export class FieldRenderer {
  private gl: WebGL2RenderingContext;
  private points: WebGLProgram;
  private lines: WebGLProgram;
  private blur: WebGLProgram;
  private composite: WebGLProgram;
  private meshVAO: WebGLVertexArrayObject;
  private dustVAO: WebGLVertexArrayObject;
  private positionBuffer: WebGLBuffer;
  private normalBuffer: WebGLBuffer;
  private edgeCount: number;
  private edgeBuffer: WebGLBuffer;
  private form: Form = 'silk';
  private normals = new Float32Array(COUNT * 3);
  private scene?: Target;
  private bloomA?: Target;
  private bloomB?: Target;
  private dpr = 1;
  private width = 1;
  private height = 1;
  private aspect = 1;
  private scale = .65;
  private rotation = [.86, .12, -.31];
  private color = [...COLORS.copper];
  private goalColor = [...COLORS.copper];
  private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private buffers: WebGLBuffer[] = [];
  private programs: WebGLProgram[] = [];
  private dustCount = 550;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.points = this.program(VERTEX, POINT_FRAGMENT);
    this.lines = this.program(VERTEX, LINE_FRAGMENT);
    this.blur = this.program(QUAD_VERTEX, BLUR_FRAGMENT);
    this.composite = this.program(QUAD_VERTEX, COMPOSITE_FRAGMENT);
    this.meshVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.meshVAO);
    this.positionBuffer = this.attribute(0, new Float32Array(COUNT * 3), 3, gl.DYNAMIC_DRAW);
    this.normalBuffer = this.attribute(1, this.normals, 3, gl.DYNAMIC_DRAW);
    const uv = new Float32Array(COUNT * 2);
    for (let i = 0; i < COUNT; i++) { uv[i * 2] = Math.floor(i / COLUMNS) / (ROWS - 1); uv[i * 2 + 1] = (i % COLUMNS) / (COLUMNS - 1); }
    this.attribute(2, uv, 2, gl.STATIC_DRAW);
    const edges = createEdges();
    const index = gl.createBuffer()!; this.buffers.push(index); this.edgeBuffer = index;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edges, gl.STATIC_DRAW);
    this.edgeCount = edges.length;
    this.dustVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.dustVAO);
    const dust = new Float32Array(this.dustCount * 3), dustUV = new Float32Array(this.dustCount * 2), dustNormals = new Float32Array(this.dustCount * 3);
    let seed = 821;
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    for (let i = 0; i < this.dustCount; i++) {
      dust[i * 3] = (random() - .5) * 14;
      dust[i * 3 + 1] = (random() - .5) * 9;
      dust[i * 3 + 2] = random() * 4;
      dustUV[i * 2] = random(); dustUV[i * 2 + 1] = random(); dustNormals[i * 3 + 2] = 1;
    }
    this.attribute(0, dust, 3, gl.STATIC_DRAW); this.attribute(1, dustNormals, 3, gl.STATIC_DRAW); this.attribute(2, dustUV, 2, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
  }

  private program(vertexSource: string, fragmentSource: string) {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(`Shader failed: ${log}`); }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource), fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram()!; gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Program failed: ${gl.getProgramInfoLog(program)}`);
    this.programs.push(program);
    return program;
  }

  private attribute(location: number, values: Float32Array, size: number, usage: number) {
    const gl = this.gl, buffer = gl.createBuffer()!; this.buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, values, usage); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    return buffer;
  }

  private uniform(program: WebGLProgram, name: string) {
    let cache = this.uniforms.get(program);
    if (!cache) { cache = new Map(); this.uniforms.set(program, cache); }
    if (!cache.has(name)) cache.set(name, this.gl.getUniformLocation(program, name));
    return cache.get(name)!;
  }

  private target(width: number, height: number): Target {
    const gl = this.gl, texture = gl.createTexture()!, framebuffer = gl.createFramebuffer()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Render target unavailable');
    return { texture, framebuffer, width, height };
  }

  private deleteTarget(target?: Target) { if (target) { this.gl.deleteTexture(target.texture); this.gl.deleteFramebuffer(target.framebuffer); } }

  resize(width: number, height: number) {
    this.width = Math.max(1, width); this.height = Math.max(1, height); this.aspect = this.width / this.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.width * this.dpr), h = Math.round(this.height * this.dpr);
    if (this.canvas.width === w && this.canvas.height === h && this.scene) return;
    this.canvas.width = w; this.canvas.height = h;
    this.scale = Math.min(.7, this.aspect * .43);
    this.deleteTarget(this.scene); this.deleteTarget(this.bloomA); this.deleteTarget(this.bloomB);
    this.scene = this.target(w, h);
    this.bloomA = this.target(Math.max(1, Math.floor(w / 3)), Math.max(1, Math.floor(h / 3)));
    this.bloomB = this.target(this.bloomA.width, this.bloomA.height);
  }

  palette(palette: Palette) { this.goalColor = [...COLORS[palette]]; }

  topology(form: Form) {
    if (this.form === form) return;
    this.form = form;
    const gl = this.gl, edges = createEdges(form);
    gl.bindVertexArray(this.meshVAO); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edges, gl.STATIC_DRAW); this.edgeCount = edges.length; gl.bindVertexArray(null);
  }

  private geometry(positions: Float32Array) {
    const gl = this.gl;
    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        const a = (row * COLUMNS + column) * 3;
        const x0 = gridIndex(this.form, row - 1, column) * 3, x1 = gridIndex(this.form, row + 1, column) * 3;
        const y0 = gridIndex(this.form, row, column - 1) * 3, y1 = gridIndex(this.form, row, column + 1) * 3;
        const ax = positions[x1]! - positions[x0]!, ay = positions[x1 + 1]! - positions[x0 + 1]!, az = positions[x1 + 2]! - positions[x0 + 2]!;
        const bx = positions[y1]! - positions[y0]!, by = positions[y1 + 1]! - positions[y0 + 1]!, bz = positions[y1 + 2]! - positions[y0 + 2]!;
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const length = Math.hypot(nx, ny, nz) || 1;
        this.normals[a] = nx / length; this.normals[a + 1] = ny / length; this.normals[a + 2] = nz / length;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.normals);
  }

  private meshUniforms(program: WebGLProgram, time: number, dust: number) {
    const gl = this.gl; gl.useProgram(program);
    gl.uniform3f(this.uniform(program, 'uRotation'), this.rotation[0]!, this.rotation[1]!, this.rotation[2]!);
    gl.uniform3f(this.uniform(program, 'uColor'), this.color[0]!, this.color[1]!, this.color[2]!);
    gl.uniform1f(this.uniform(program, 'uScale'), this.scale); gl.uniform1f(this.uniform(program, 'uAspect'), this.aspect);
    gl.uniform1f(this.uniform(program, 'uDpr'), this.dpr); gl.uniform1f(this.uniform(program, 'uTime'), time); gl.uniform1f(this.uniform(program, 'uDust'), dust);
  }

  private blurPass(source: WebGLTexture, target: Target, x: number, y: number) {
    const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer); gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(this.blur); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(this.uniform(this.blur, 'uImage'), 0); gl.uniform2f(this.uniform(this.blur, 'uDirection'), x, y); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(positions: Float32Array, time: number, delta: number) {
    if (!this.scene || !this.bloomA || !this.bloomB) return;
    const gl = this.gl;
    for (let i = 0; i < 3; i++) this.color[i] += (this.goalColor[i]! - this.color[i]!) * Math.min(1, delta * 3);
    this.rotation = [.86 + Math.sin(time * .055) * .17, .12 + time * .045, -.31 + Math.sin(time * .04) * .13];
    this.geometry(positions);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.framebuffer); gl.viewport(0, 0, this.scene.width, this.scene.height); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.bindVertexArray(this.dustVAO); this.meshUniforms(this.points, time, 1); gl.drawArrays(gl.POINTS, 0, this.dustCount);
    gl.bindVertexArray(this.meshVAO); this.meshUniforms(this.lines, time, 0); gl.drawElements(gl.LINES, this.edgeCount, gl.UNSIGNED_SHORT, 0);
    this.meshUniforms(this.points, time, 0); gl.drawArrays(gl.POINTS, 0, COUNT);
    gl.bindVertexArray(null); gl.disable(gl.BLEND);
    this.blurPass(this.scene.texture, this.bloomA, 1.6 / this.bloomA.width, 0);
    this.blurPass(this.bloomA.texture, this.bloomB, 0, 1.6 / this.bloomB.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.useProgram(this.composite);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.scene.texture); gl.uniform1i(this.uniform(this.composite, 'uScene'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.bloomB.texture); gl.uniform1i(this.uniform(this.composite, 'uBloom'), 1);
    gl.uniform1f(this.uniform(this.composite, 'uAspect'), this.aspect); gl.uniform3f(this.uniform(this.composite, 'uColor'), this.color[0]!, this.color[1]!, this.color[2]!);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  pointer(clientX: number, clientY: number): Pointer {
    const bounds = this.canvas.getBoundingClientRect();
    let x = ((clientX - bounds.left) / this.width * 2 - 1) * this.aspect / this.scale;
    let y = (1 - (clientY - bounds.top) / this.height * 2 - .055) / this.scale;
    let z = 0;
    const [pitch, yaw, roll] = this.rotation;
    [x, y] = [Math.cos(-roll!) * x - Math.sin(-roll!) * y, Math.sin(-roll!) * x + Math.cos(-roll!) * y];
    [x, z] = [Math.cos(-yaw!) * x + Math.sin(-yaw!) * z, -Math.sin(-yaw!) * x + Math.cos(-yaw!) * z];
    [y, z] = [Math.cos(-pitch!) * y - Math.sin(-pitch!) * z, Math.sin(-pitch!) * y + Math.cos(-pitch!) * z];
    return { x, y, z, active: true, down: false };
  }

  dispose() {
    const gl = this.gl;
    this.deleteTarget(this.scene); this.deleteTarget(this.bloomA); this.deleteTarget(this.bloomB);
    for (const buffer of this.buffers) gl.deleteBuffer(buffer);
    for (const program of this.programs) gl.deleteProgram(program);
    gl.deleteVertexArray(this.meshVAO); gl.deleteVertexArray(this.dustVAO);
  }
}
