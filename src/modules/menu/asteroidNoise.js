// src/modules/menu/asteroidNoise.js
//
// The GLSL noise library the menu's asteroid materials paste into their
// shaders. It came from MenuBackgroundSystem.js unchanged.

/**
 * GLSL noise functions chunk ported from the original procedural study.
 * Contains: Simplex 3D, FBM, Ridge, Voronoi/Worley
 */
export function getNoiseGLSL() {
  return `
      // --- Utilities ---
      vec3 mod289_3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289_4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute4(vec4 x) { return mod289_4(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt4(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      // --- Simplex Noise 3D ---
      float snoise3(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289_3(i);
        vec4 p = permute4(permute4(permute4(
                  i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt4(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }

      // --- FBM ---
      float fbm3(vec3 p, int octaves) {
        float amplitude = 0.5;
        float frequency = 1.0;
        float total = 0.0;
        float normalization = 0.0;
        for (int i = 0; i < 6; ++i) {
          if(i >= octaves) break;
          total += snoise3(p * frequency) * amplitude;
          normalization += amplitude;
          amplitude *= 0.5;
          frequency *= 2.0;
        }
        return total / normalization;
      }

      // --- Ridge / Ridged Multifractal (study parity) ---
      float ridge(float h, float offset) {
        h = abs(h);
        h = offset - h;
        h = h * h;
        return h;
      }

      float ridgedMF(vec3 p, int octaves, float lacunarity, float gain) {
        float sum = 0.0;
        float amp = 0.5;
        float freq = 1.0;
        float prev = 1.0;

        for (int i = 0; i < 6; ++i) {
          if (i >= octaves) break;
          float n = snoise3(p * freq);
          float r = ridge(n, 1.0);
          sum += r * amp * prev;
          prev = r;
          freq *= lacunarity;
          amp *= gain;
        }

        return sum;
      }

      // --- Voronoi/Worley ---
      vec3 voronoiLCSN(vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        float id = 0.0;
        vec2 res = vec2(8.0);
        for(int k = -1; k <= 1; k++) {
          for(int j = -1; j <= 1; j++) {
            for(int i = -1; i <= 1; i++) {
              vec3 b = vec3(float(i), float(j), float(k));
              vec3 p_hash = p + b;
              float hash = fract(sin(dot(p_hash, vec3(127.1, 311.7, 74.7))) * 43758.5453);
              vec3 r = vec3(b) - f + (hash * 0.7);
              float d = dot(r, r);
              if(d < res.x) {
                res.y = res.x;
                res.x = d;
                id = hash;
              } else if(d < res.y) {
                res.y = d;
              }
            }
          }
        }
        return vec3(sqrt(res.x), id, sqrt(res.y));
      }

      // --- Warped Noise (Flow Texture) ---
      float warpedNoise(vec3 p) {
        float q = fbm3(p, 4);
        float r = fbm3(p + q * 2.5, 4);
        return fbm3(p + r * 4.0, 4);
      }

      // --- Crack Network ---
      float getCracks(vec3 p) {
        vec3 x = p * 4.0;
        vec3 cellI = floor(x);
        vec3 cellF = fract(x);
        float m_dist = 1.0;
        for(int k = -1; k <= 1; k++) {
          for(int j = -1; j <= 1; j++) {
            for(int l = -1; l <= 1; l++) {
              vec3 b = vec3(float(l), float(j), float(k));
              vec3 p_hash = cellI + b;
              vec3 r = vec3(b) - cellF + fract(sin(dot(p_hash, vec3(127.1, 311.7, 74.7))) * 43758.5453);
              float d = dot(r, r);
              if(d < m_dist) m_dist = d;
            }
          }
        }
        return 1.0 - sqrt(m_dist);
      }
    `;
}
