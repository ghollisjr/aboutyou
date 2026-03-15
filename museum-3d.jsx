import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const WanderingMuseum = ({ onComplete }) => {
  const containerRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);
  const [instructions, setInstructions] = useState(true);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [invertY, setInvertY] = useState(false);
  const invertYRef = useRef(false);
  const [isTripping, setIsTripping] = useState(false);
  const trippingRef = useRef(false);
  const [examinedCount, setExaminedCount] = useState(0);
  const [isAligned, setIsAligned] = useState(false);
  const [alignmentProgress, setAlignmentProgress] = useState(0);
  const alignmentTimeRef = useRef(0);
  const wasAlignedRef = useRef(false); // Track previous alignment state
  const [completionResults, setCompletionResults] = useState(null);
  const [interactPrompt, setInteractPrompt] = useState(null); // { name, inputHint }
  const [buttonVignette, setButtonVignette] = useState(0); // 0-1 intensity
  const buttonVignetteRef = useRef(0);
  
  // Update ref when state changes
  useEffect(() => {
    invertYRef.current = invertY;
  }, [invertY]);

  useEffect(() => {
    trippingRef.current = isTripping;
  }, [isTripping]);
  
  // Game state refs
  const gameStateRef = useRef({
    artPiecesExamined: new Set(),
    hiddenAreasFound: new Set(),
    timeSpentPerPiece: {},
    totalExplorationTime: 0,
    pathTaken: [],
    rotationsPerformed: 0,
    startTime: Date.now(),
    trippedBalls: false,
    completionMethod: null // 'early', 'sober', 'trip'
  });

  // --- Parametric Geometry Builders ---

  function createMobiusStrip(radius = 1, width = 0.4, segments = 100) {
    const geometry = new THREE.BufferGeometry();
    const widthSteps = 2;
    const vertices = [];
    const indices = [];
    const normals = [];
    const uvs = [];

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      for (let j = 0; j <= widthSteps; j++) {
        const t = (j / widthSteps - 0.5) * width;
        const x = (radius + t * Math.cos(theta / 2)) * Math.cos(theta);
        const y = (radius + t * Math.cos(theta / 2)) * Math.sin(theta);
        const z = t * Math.sin(theta / 2);
        vertices.push(x, z, y); // swap y/z so strip is horizontal

        // Approximate normal via cross product of partial derivatives
        const dTheta = 0.001;
        const x2 = (radius + t * Math.cos((theta + dTheta) / 2)) * Math.cos(theta + dTheta);
        const y2 = (radius + t * Math.cos((theta + dTheta) / 2)) * Math.sin(theta + dTheta);
        const z2 = t * Math.sin((theta + dTheta) / 2);
        const dt = 0.001;
        const x3 = (radius + (t + dt) * Math.cos(theta / 2)) * Math.cos(theta);
        const y3 = (radius + (t + dt) * Math.cos(theta / 2)) * Math.sin(theta);
        const z3 = (t + dt) * Math.sin(theta / 2);
        const tx1 = x2 - x, ty1 = z2 - z, tz1 = y2 - y;
        const tx2 = x3 - x, ty2 = z3 - z, tz2 = y3 - y;
        let nx = ty1 * tz2 - tz1 * ty2;
        let ny = tz1 * tx2 - tx1 * tz2;
        let nz = tx1 * ty2 - ty1 * tx2;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        normals.push(nx / len, ny / len, nz / len);

        uvs.push(i / segments, j / widthSteps);
      }
    }

    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < widthSteps; j++) {
        const a = i * (widthSteps + 1) + j;
        const b = a + widthSteps + 1;
        const c = a + 1;
        const d = b + 1;
        indices.push(a, b, c);
        indices.push(c, b, d);
      }
    }

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return geometry;
  }

  function createKleinBottle(scale = 1, uSegments = 60, vSegments = 30) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const uvs = [];
    const a = 2.0;

    for (let i = 0; i <= uSegments; i++) {
      const u = (i / uSegments) * Math.PI * 2;
      for (let j = 0; j <= vSegments; j++) {
        const v = (j / vSegments) * Math.PI * 2;
        const cosU = Math.cos(u), sinU = Math.sin(u);
        const cosUh = Math.cos(u / 2), sinUh = Math.sin(u / 2);
        const sinV = Math.sin(v), sin2V = Math.sin(2 * v);

        const x = (a + cosUh * sinV - sinUh * sin2V) * cosU * scale;
        const y = (a + cosUh * sinV - sinUh * sin2V) * sinU * scale;
        const z = (sinUh * sinV + cosUh * sin2V) * scale;
        vertices.push(x, z, y); // swap y/z for upright orientation

        uvs.push(i / uSegments, j / vSegments);
      }
    }

    for (let i = 0; i < uSegments; i++) {
      for (let j = 0; j < vSegments; j++) {
        const ai = i * (vSegments + 1) + j;
        const b = ai + vSegments + 1;
        const c = ai + 1;
        const d = b + 1;
        indices.push(ai, b, c);
        indices.push(c, b, d);
      }
    }

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    return geometry;
  }

  function createTeapot(scale = 1, material = null) {
    const group = new THREE.Group();

    // Lathe body - teapot silhouette profile
    const profile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.6, 0),
      new THREE.Vector2(0.9, 0.1),
      new THREE.Vector2(1.1, 0.3),
      new THREE.Vector2(1.2, 0.5),
      new THREE.Vector2(1.25, 0.8),
      new THREE.Vector2(1.2, 1.1),
      new THREE.Vector2(1.1, 1.3),
      new THREE.Vector2(1.0, 1.5),
      new THREE.Vector2(0.9, 1.6),
      new THREE.Vector2(0.85, 1.65),
      new THREE.Vector2(0.8, 1.7),
      // Lid rim
      new THREE.Vector2(0.85, 1.72),
      new THREE.Vector2(0.8, 1.75),
      new THREE.Vector2(0.6, 1.8),
      new THREE.Vector2(0.4, 1.85),
      new THREE.Vector2(0.2, 1.88),
      // Lid knob
      new THREE.Vector2(0.15, 1.9),
      new THREE.Vector2(0.12, 1.95),
      new THREE.Vector2(0.08, 2.0),
      new THREE.Vector2(0, 2.02),
    ];
    profile.forEach(p => { p.x *= scale; p.y *= scale; });

    const bodyMaterial = material || new THREE.MeshStandardMaterial({
      color: 0xeeeeff,
      roughness: 0.2,
      metalness: 0.6
    });

    const bodyGeometry = new THREE.LatheGeometry(profile, 32);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // Handle (torus on the side)
    const handleGeometry = new THREE.TorusGeometry(0.4 * scale, 0.08 * scale, 12, 24, Math.PI);
    const handle = new THREE.Mesh(handleGeometry, bodyMaterial);
    handle.position.set(-1.15 * scale, 1.0 * scale, 0);
    handle.rotation.z = Math.PI / 2;
    group.add(handle);

    // Spout (tapered cylinder)
    const spoutGeometry = new THREE.CylinderGeometry(0.06 * scale, 0.12 * scale, 0.8 * scale, 12);
    const spout = new THREE.Mesh(spoutGeometry, bodyMaterial);
    spout.position.set(1.1 * scale, 1.1 * scale, 0);
    spout.rotation.z = -Math.PI / 4;
    group.add(spout);

    return group;
  }

  // --- Maze Geometry Builders ---

  function createSierpinskiTetrahedron(level = 2, size = 1) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0xff6644,
      roughness: 0.4,
      metalness: 0.3,
      flatShading: true
    });

    // Collect positions and sizes, then merge into single geometry
    const positions = [];
    function collectTetra(cx, cy, cz, s, lvl) {
      if (lvl === 0) {
        positions.push({ x: cx, y: cy, z: cz, s });
        return;
      }
      const hs = s / 2;
      const h = s * Math.sqrt(2 / 3);
      const hh = h / 2;
      const off = hs * 0.5;
      collectTetra(cx, cy + hh * 0.5, cz, hs, lvl - 1);
      collectTetra(cx - off, cy - hh * 0.5, cz - off * 0.577, hs, lvl - 1);
      collectTetra(cx + off, cy - hh * 0.5, cz - off * 0.577, hs, lvl - 1);
      collectTetra(cx, cy - hh * 0.5, cz + off * 1.155, hs, lvl - 1);
    }
    collectTetra(0, 0, 0, size, level);

    // Merge all tetrahedra into one geometry
    const geoms = positions.map(p => {
      const g = new THREE.TetrahedronGeometry(p.s);
      g.translate(p.x, p.y, p.z);
      return g;
    });
    const merged = mergeGeometries(geoms);
    geoms.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, material);
    group.add(mesh);

    // Single merged edge lines
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(merged),
      new THREE.LineBasicMaterial({ color: 0xffaa88 })
    );
    group.add(edges);

    return group;
  }

  // Simple geometry merge helper
  function mergeGeometries(geometries) {
    let totalVerts = 0, totalIndices = 0;
    const infos = geometries.map(g => {
      const pos = g.attributes.position;
      const idx = g.index;
      const info = { pos, idx, vertCount: pos.count, idxCount: idx ? idx.count : 0 };
      totalVerts += pos.count;
      totalIndices += idx ? idx.count : pos.count;
      return info;
    });
    const mergedPos = new Float32Array(totalVerts * 3);
    const mergedNorm = new Float32Array(totalVerts * 3);
    const mergedIdx = new Uint32Array(totalIndices);
    let vertOffset = 0, idxOffset = 0;
    for (const g of geometries) {
      const pos = g.attributes.position.array;
      const norm = g.attributes.normal ? g.attributes.normal.array : null;
      mergedPos.set(pos, vertOffset * 3);
      if (norm) mergedNorm.set(norm, vertOffset * 3);
      if (g.index) {
        for (let i = 0; i < g.index.count; i++) {
          mergedIdx[idxOffset + i] = g.index.array[i] + vertOffset;
        }
        idxOffset += g.index.count;
      } else {
        for (let i = 0; i < g.attributes.position.count; i++) {
          mergedIdx[idxOffset + i] = vertOffset + i;
        }
        idxOffset += g.attributes.position.count;
      }
      vertOffset += g.attributes.position.count;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3));
    merged.setIndex(new THREE.BufferAttribute(mergedIdx, 1));
    return merged;
  }

  function createStellaOctangula(size = 1) {
    const group = new THREE.Group();

    const mat1 = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.6,
      roughness: 0.2,
      metalness: 0.5,
      side: THREE.DoubleSide
    });
    const mat2 = new THREE.MeshStandardMaterial({
      color: 0xff44aa,
      transparent: true,
      opacity: 0.6,
      roughness: 0.2,
      metalness: 0.5,
      side: THREE.DoubleSide
    });

    const geom1 = new THREE.TetrahedronGeometry(size);
    const mesh1 = new THREE.Mesh(geom1, mat1);
    group.add(mesh1);
    mesh1.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geom1),
      new THREE.LineBasicMaterial({ color: 0x88bbff })
    ));

    const geom2 = new THREE.TetrahedronGeometry(size);
    const mesh2 = new THREE.Mesh(geom2, mat2);
    mesh2.rotation.x = Math.PI;
    group.add(mesh2);
    mesh2.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geom2),
      new THREE.LineBasicMaterial({ color: 0xff88cc })
    ));

    return group;
  }

  function createLorenzAttractor() {
    const points = [];
    const colors = [];
    let x = 0.1, y = 0, z = 0;
    const dt = 0.005;
    const sigma = 10, rho = 28, beta = 8 / 3;
    const numPoints = 8000;

    for (let i = 0; i < numPoints; i++) {
      const dx = sigma * (y - x) * dt;
      const dy = (x * (rho - z) - y) * dt;
      const dz = (x * y - beta * z) * dt;
      x += dx; y += dy; z += dz;
      points.push(x * 0.03, z * 0.03 - 0.8, y * 0.03); // scale and center

      // Warm→cool gradient
      const t = i / numPoints;
      colors.push(1 - t * 0.5, 0.3 + t * 0.3, t);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 1 });
    return new THREE.Line(geometry, material);
  }

  function createFiveCubes(size = 0.7) {
    const group = new THREE.Group();
    const cubeColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff];
    const goldenAngle = Math.PI / 5; // 36 degrees

    for (let i = 0; i < 5; i++) {
      const geom = new THREE.BoxGeometry(size, size, size);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom),
        new THREE.LineBasicMaterial({ color: cubeColors[i], linewidth: 1 })
      );
      // Each cube rotated by golden angle increments around different axes
      edges.rotation.x = goldenAngle * i;
      edges.rotation.y = goldenAngle * i * 1.5;
      edges.rotation.z = goldenAngle * i * 0.7;
      group.add(edges);
    }
    return group;
  }

  function createTrefoilKnot() {
    class TrefoilCurve extends THREE.Curve {
      getPoint(t) {
        const s = t * Math.PI * 2;
        const x = Math.sin(s) + 2 * Math.sin(2 * s);
        const y = Math.cos(s) - 2 * Math.cos(2 * s);
        const z = -Math.sin(3 * s);
        return new THREE.Vector3(x, y, z).multiplyScalar(0.35);
      }
    }

    const path = new TrefoilCurve();
    const geometry = new THREE.TubeGeometry(path, 128, 0.08, 16, true);
    const material = new THREE.MeshStandardMaterial({
      color: 0x22ccaa,
      roughness: 0.05,
      metalness: 0.95
    });
    return new THREE.Mesh(geometry, material);
  }

  function createMengerSponge(level = 2, size = 1) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0xddaa33,
      roughness: 0.3,
      metalness: 0.6
    });

    // Collect cube positions, then merge
    const cubes = [];
    function collectCubes(cx, cy, cz, s, lvl) {
      if (lvl === 0) {
        cubes.push({ x: cx, y: cy, z: cz, s });
        return;
      }
      const ns = s / 3;
      for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
          for (let z = -1; z <= 1; z++) {
            const absSum = (x === 0 ? 1 : 0) + (y === 0 ? 1 : 0) + (z === 0 ? 1 : 0);
            if (absSum >= 2) continue;
            collectCubes(cx + x * ns, cy + y * ns, cz + z * ns, ns, lvl - 1);
          }
        }
      }
    }
    collectCubes(0, 0, 0, size, level);

    const geoms = cubes.map(c => {
      const g = new THREE.BoxGeometry(c.s, c.s, c.s);
      g.translate(c.x, c.y, c.z);
      return g;
    });
    const merged = mergeGeometries(geoms);
    geoms.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, material);
    group.add(mesh);

    return group;
  }

  function createApollonianGasket() {
    const group = new THREE.Group();
    // 3D Apollonian gasket: recursively pack tangent spheres
    // Limited depth + deduplication to keep sphere count manageable
    const spheres = []; // { x, y, z, r }
    const placed = new Set();

    function key(x, y, z, r) {
      return `${Math.round(x*100)},${Math.round(y*100)},${Math.round(z*100)},${Math.round(r*100)}`;
    }

    function addSphere(x, y, z, r, depth) {
      if (r < 0.04 || depth > 3) return;
      const k = key(x, y, z, r);
      if (placed.has(k)) return;
      placed.add(k);
      spheres.push({ x, y, z, r, depth });

      const nr = r * 0.42;
      const d = r + nr;
      // 6 cardinal directions only
      const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
      for (const [dx, dy, dz] of dirs) {
        addSphere(x + dx*d, y + dy*d, z + dz*d, nr, depth + 1);
      }
    }

    addSphere(0, 0, 0, 0.45, 0);

    // Merge by depth for color variation — one draw call per level
    const byDepth = {};
    spheres.forEach(s => {
      if (!byDepth[s.depth]) byDepth[s.depth] = [];
      byDepth[s.depth].push(s);
    });

    // Use low-poly spheres, fewer segments for smaller spheres
    Object.keys(byDepth).forEach(d => {
      const depth = parseInt(d);
      const hue = depth * 0.2;
      const color = new THREE.Color().setHSL(hue, 0.7, 0.55);
      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.25,
        metalness: 0.6,
        transparent: true,
        opacity: 0.85
      });

      const segs = Math.max(6, 12 - depth * 2);
      const geoms = byDepth[d].map(s => {
        const g = new THREE.SphereGeometry(s.r, segs, segs);
        g.translate(s.x, s.y, s.z);
        return g;
      });
      const merged = mergeGeometries(geoms);
      geoms.forEach(g => g.dispose());
      group.add(new THREE.Mesh(merged, material));
    });

    return group;
  }

  function createGyroid(scale = 0.8, resolution = 30) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const normals = [];

    // Sample gyroid isosurface using marching approach
    const size = 2 * Math.PI;
    const step = size / resolution;

    for (let i = 0; i <= resolution; i++) {
      for (let j = 0; j <= resolution; j++) {
        const u = (i / resolution) * 2 * Math.PI;
        const v = (j / resolution) * 2 * Math.PI;
        // Parametric approximation of gyroid surface
        const x = Math.cos(u) * Math.sin(v);
        const y = Math.cos(v) * Math.sin(u + v);
        const z = Math.cos(u + v) * Math.sin(u);
        vertices.push(x * scale, y * scale, z * scale);

        // Approximate normal
        const eps = 0.01;
        const xu = Math.cos(u + eps) * Math.sin(v) - x;
        const yu = Math.cos(v) * Math.sin(u + eps + v) - y;
        const zu = Math.cos(u + eps + v) * Math.sin(u + eps) - z;
        const xv = Math.cos(u) * Math.sin(v + eps) - x;
        const yv = Math.cos(v + eps) * Math.sin(u + v + eps) - y;
        const zv = Math.cos(u + v + eps) * Math.sin(u) - z;
        let nx = yu * zv - zu * yv;
        let ny = zu * xv - xu * zv;
        let nz = xu * yv - yu * xv;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        normals.push(nx / len, ny / len, nz / len);
      }
    }

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const a = i * (resolution + 1) + j;
        const b = a + resolution + 1;
        const c = a + 1;
        const d = b + 1;
        indices.push(a, b, c);
        indices.push(c, b, d);
      }
    }

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

    const material = new THREE.MeshStandardMaterial({
      color: 0x8844dd,
      roughness: 0.3,
      metalness: 0.5,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  function createSaddleSurface(scale = 0.8, resolution = 20) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];

    for (let i = 0; i <= resolution; i++) {
      for (let j = 0; j <= resolution; j++) {
        const x = (i / resolution - 0.5) * 2;
        const y = (j / resolution - 0.5) * 2;
        const z = x * x - y * y;
        vertices.push(x * scale, z * scale * 0.5, y * scale);
      }
    }

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const a = i * (resolution + 1) + j;
        const b = a + resolution + 1;
        const c = a + 1;
        const d = b + 1;
        indices.push(a, b, c);
        indices.push(c, b, d);
      }
    }

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();

    const group = new THREE.Group();

    const solidMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: 0xcc5588,
      roughness: 0.3,
      metalness: 0.4,
      side: THREE.DoubleSide
    }));
    group.add(solidMesh);

    // Wireframe overlay
    const wireframe = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xff88aa, linewidth: 1, transparent: true, opacity: 0.3 })
    );
    group.add(wireframe);

    return group;
  }

  useEffect(() => {
    // Detect mobile
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(mobile);

    // Three.js setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 25, 65);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.appendChild(renderer.domElement);

    // Post-processing for trip effect
    const tripShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        intensity: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float intensity;
        varying vec2 vUv;
        
        void main() {
          vec2 uv = vUv;
          
          // Now time is in seconds since trip started, so we can use it directly!
          // Different speeds for each channel (Hz = cycles per second)
          float r = sin(uv.x * 10.0 + time * 2.0) * 0.5 + 0.5;  // 2 rad/s ≈ 0.3 Hz
          float g = sin(uv.y * 10.0 + time * 3.0) * 0.5 + 0.5;  // 3 rad/s ≈ 0.5 Hz
          float b = sin((uv.x + uv.y) * 10.0 + time * 1.5) * 0.5 + 0.5;  // 1.5 rad/s ≈ 0.24 Hz
          
          vec3 background = vec3(r, g, b);
          
          // Get circles
          vec4 circleColor = texture2D(tDiffuse, uv);
          float brightness = dot(circleColor.rgb, vec3(0.299, 0.587, 0.114));
          
          // Blend
          vec3 finalColor = mix(
            background,
            circleColor.rgb * 2.5,
            smoothstep(0.01, 0.15, brightness)
          );
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `
    });

    // Render target for post-processing
    const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
    const tripScene = new THREE.Scene();
    const tripCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tripQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      tripShaderMaterial
    );
    tripScene.add(tripQuad);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0xffffff, 1.5, 50);
    pointLight1.position.set(0, 5, 0);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xffffff, 1.2, 40);
    pointLight2.position.set(-10, 5, -10);
    scene.add(pointLight2);

    const pointLight3 = new THREE.PointLight(0xffffff, 1.2, 40);
    pointLight3.position.set(10, 5, 10);
    scene.add(pointLight3);

    const pointLight4 = new THREE.PointLight(0xffffff, 1.0, 40);
    pointLight4.position.set(10, 5, -10);
    scene.add(pointLight4);

    const pointLight5 = new THREE.PointLight(0xffffff, 1.0, 40);
    pointLight5.position.set(-10, 5, 10);
    scene.add(pointLight5);

    // --- Procedural floor texture: polished stone tiles ---
    const floorTexSize = 512;
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = floorTexSize;
    floorCanvas.height = floorTexSize;
    const floorCtx = floorCanvas.getContext('2d');
    const tileCount = 8; // 8x8 grid of tiles
    const tileSize = floorTexSize / tileCount;
    const groutWidth = 3;
    // Grout color
    floorCtx.fillStyle = '#1a1a28';
    floorCtx.fillRect(0, 0, floorTexSize, floorTexSize);
    // Draw tiles with subtle color variation
    for (let ty = 0; ty < tileCount; ty++) {
      for (let tx = 0; tx < tileCount; tx++) {
        const variation = Math.floor(Math.random() * 12) - 6;
        const base = 42 + variation;
        const r = base, g = base, b = base + 8;
        floorCtx.fillStyle = `rgb(${r},${g},${b})`;
        floorCtx.fillRect(
          tx * tileSize + groutWidth, ty * tileSize + groutWidth,
          tileSize - groutWidth * 2, tileSize - groutWidth * 2
        );
        // Subtle diagonal marble vein on some tiles
        if (Math.random() > 0.6) {
          floorCtx.save();
          floorCtx.globalAlpha = 0.08;
          floorCtx.strokeStyle = '#aaaacc';
          floorCtx.lineWidth = 1 + Math.random() * 2;
          floorCtx.beginPath();
          const x0 = tx * tileSize + groutWidth;
          const y0 = ty * tileSize + groutWidth;
          const w = tileSize - groutWidth * 2;
          floorCtx.moveTo(x0 + Math.random() * w * 0.3, y0);
          floorCtx.bezierCurveTo(
            x0 + w * 0.4, y0 + w * 0.5,
            x0 + w * 0.6, y0 + w * 0.5,
            x0 + w, y0 + w * (0.7 + Math.random() * 0.3)
          );
          floorCtx.stroke();
          floorCtx.restore();
        }
      }
    }
    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(5, 5); // 5 repetitions across 40 units = tiles feel ~1m each

    const floorGeometry = new THREE.PlaneGeometry(40, 40);
    const floorMaterial = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.4,
      metalness: 0.15
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Debug: Visual indicator for exit zone (3D box in center of space)
    const exitZoneGeometry = new THREE.BoxGeometry(4, 10, 30);
    const exitZoneMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      wireframe: true
    });
    const exitZone = new THREE.Mesh(exitZoneGeometry, exitZoneMaterial);
    exitZone.position.set(0, 5, 0);
    exitZone.visible = false;
    scene.add(exitZone);

    // Ceiling - dark plane overhead to contain light
    const ceilingGeometry = new THREE.PlaneGeometry(40, 40);
    const ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e1e2e,
      roughness: 0.95,
      metalness: 0.0
    });
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 6;
    scene.add(ceiling);

    // --- Procedural wall texture: vertical panels with baseboard ---
    const wallTexW = 512, wallTexH = 256;
    const wallCanvas = document.createElement('canvas');
    wallCanvas.width = wallTexW;
    wallCanvas.height = wallTexH;
    const wallCtx = wallCanvas.getContext('2d');
    // Base wall color (warm dark gray)
    wallCtx.fillStyle = '#3d3d4e';
    wallCtx.fillRect(0, 0, wallTexW, wallTexH);
    // Vertical panel dividers
    const panelCount = 6;
    const panelW = wallTexW / panelCount;
    for (let p = 0; p < panelCount; p++) {
      // Slight per-panel color variation
      const v = Math.floor(Math.random() * 6) - 3;
      const pb = 61 + v;
      wallCtx.fillStyle = `rgb(${pb},${pb},${pb + 10})`;
      wallCtx.fillRect(p * panelW + 2, 4, panelW - 4, wallTexH - 30);
      // Thin trim line between panels
      wallCtx.fillStyle = '#2a2a38';
      wallCtx.fillRect(p * panelW, 0, 2, wallTexH);
    }
    // Baseboard strip at bottom
    wallCtx.fillStyle = '#252530';
    wallCtx.fillRect(0, wallTexH - 26, wallTexW, 26);
    // Baseboard top edge highlight
    wallCtx.fillStyle = '#4a4a5a';
    wallCtx.fillRect(0, wallTexH - 28, wallTexW, 2);
    // Crown molding at top
    wallCtx.fillStyle = '#4a4a5a';
    wallCtx.fillRect(0, 0, wallTexW, 3);
    wallCtx.fillStyle = '#2a2a38';
    wallCtx.fillRect(0, 3, wallTexW, 1);

    const wallTexture = new THREE.CanvasTexture(wallCanvas);
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.ClampToEdgeWrapping;
    wallTexture.repeat.set(4, 1); // 4 panel groups across each wall face

    // Walls to create gallery rooms
    const wallMaterial = new THREE.MeshStandardMaterial({
      map: wallTexture,
      roughness: 0.85,
      metalness: 0.05,
      transparent: true,
      opacity: 1.0
    });

    // Main room walls
    // Back wall split into two segments with 6-unit gap for maze entrance
    const wall1a = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 0.5), wallMaterial);
    wall1a.position.set(-11, 3, -20);
    scene.add(wall1a);

    const wall1b = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 0.5), wallMaterial);
    wall1b.position.set(12, 3, -20);
    scene.add(wall1b);

    const wallGeometry = new THREE.BoxGeometry(40, 6, 0.5);

    const wall2 = new THREE.Mesh(wallGeometry, wallMaterial);
    wall2.position.set(0, 3, 20);
    scene.add(wall2);

    const wallGeometry2 = new THREE.BoxGeometry(0.5, 6, 40);

    const wall3 = new THREE.Mesh(wallGeometry2, wallMaterial);
    wall3.position.set(-20, 3, 0);
    scene.add(wall3);

    const wall4 = new THREE.Mesh(wallGeometry2, wallMaterial);
    wall4.position.set(20, 3, 0);
    scene.add(wall4);

    // Collect outer walls for visibility control
    const outerWalls = [wall1a, wall1b, wall2, wall3, wall4];

    // Create interior wall with opening (creates hidden area)
    const interiorWallGeometry = new THREE.BoxGeometry(15, 6, 0.5);
    const interiorWall1 = new THREE.Mesh(interiorWallGeometry, wallMaterial);
    interiorWall1.position.set(-5, 3, -10);
    scene.add(interiorWall1);

    const interiorWall2 = new THREE.Mesh(interiorWallGeometry, wallMaterial);
    interiorWall2.position.set(8, 3, -10);
    scene.add(interiorWall2);

    // Warm glow from hidden room, visible through the gap in the interior wall
    const hiddenRoomGlow = new THREE.PointLight(0xffaa44, 2.0, 25);
    hiddenRoomGlow.position.set(0, 3, -14);
    scene.add(hiddenRoomGlow);

    // Procedural environment map for reflective surfaces (reveals curvature on smooth shapes)
    const envSize = 128;
    const envCanvas = document.createElement('canvas');
    envCanvas.width = envSize;
    envCanvas.height = envSize;
    const envCtx = envCanvas.getContext('2d');
    // Gradient from dark bottom to bright top with warm/cool tones
    const envGrad = envCtx.createLinearGradient(0, envSize, 0, 0);
    envGrad.addColorStop(0, '#1a1a2e');
    envGrad.addColorStop(0.3, '#2a2a4a');
    envGrad.addColorStop(0.5, '#4a4a6a');
    envGrad.addColorStop(0.7, '#8888aa');
    envGrad.addColorStop(0.85, '#bbbbdd');
    envGrad.addColorStop(1.0, '#ffffff');
    envCtx.fillStyle = envGrad;
    envCtx.fillRect(0, 0, envSize, envSize);
    // Add some horizontal streaks for more visible reflections
    envCtx.globalAlpha = 0.15;
    for (let i = 0; i < 8; i++) {
      const y = Math.random() * envSize;
      envCtx.fillStyle = i % 2 === 0 ? '#ffffff' : '#aaccff';
      envCtx.fillRect(0, y, envSize, 2 + Math.random() * 4);
    }
    envCtx.globalAlpha = 1.0;
    const envTexture = new THREE.CanvasTexture(envCanvas);
    envTexture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = envTexture;

    // Art pieces - mathematical sculptures on pedestals
    const artPieces = [];

    // Pedestal factory function
    const createPedestal = (name, artMesh, position) => {
      const group = new THREE.Group();

      const pedestalMaterial = new THREE.MeshStandardMaterial({
        color: 0xdddddd, roughness: 0.6, metalness: 0.1
      });
      const columnMaterial = new THREE.MeshStandardMaterial({
        color: 0x555555, roughness: 0.7, metalness: 0.2
      });

      // Base slab
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.8), pedestalMaterial);
      base.position.y = 0.05;
      group.add(base);

      // Column
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16), columnMaterial);
      column.position.y = 0.6;
      group.add(column);

      // Top slab
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.5), pedestalMaterial);
      top.position.y = 1.15;
      group.add(top);

      // Name plate (canvas texture)
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 256;
      labelCanvas.height = 64;
      const labelCtx = labelCanvas.getContext('2d');
      labelCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      labelCtx.fillRect(0, 0, 256, 64);
      labelCtx.fillStyle = '#ffffff';
      labelCtx.font = 'bold 20px system-ui';
      labelCtx.textAlign = 'center';
      labelCtx.fillText(name, 128, 40);
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const labelPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.3),
        new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
      );
      labelPlane.position.set(0, 0.6, 0.92);
      group.add(labelPlane);

      // Art mesh on top
      artMesh.position.y = 1.2 + 1.3; // top of pedestal + offset for art center (clearance for oscillation)
      group.add(artMesh);

      // Add subtle wireframe overlay to all geometry in the art mesh
      const wireframeMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.08,
        depthWrite: false
      });
      artMesh.traverse(obj => {
        if (obj.geometry && obj.isMesh) {
          const wire = new THREE.LineSegments(
            new THREE.WireframeGeometry(obj.geometry),
            wireframeMat
          );
          obj.add(wire);
        }
      });

      // Invisible interaction volume covering pedestal + art area
      const interactionBox = new THREE.Mesh(
        new THREE.BoxGeometry(2, 3.5, 2),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      interactionBox.position.y = 1.75;
      interactionBox.userData.isInteractionBox = true;
      group.add(interactionBox);

      group.position.set(position.x, position.y, position.z);
      return group;
    };

    // --- 1. Utah Teapot (smooth → envMap) ---
    const teapotMaterial = new THREE.MeshStandardMaterial({
      color: 0xeeeeff,
      roughness: 0.15,
      metalness: 0.7,
      envMap: envTexture,
      envMapIntensity: 1.0
    });
    const teapotMesh = createTeapot(0.7, teapotMaterial);
    const teapotPedestal = createPedestal('Utah Teapot', teapotMesh, new THREE.Vector3(-8, 0, -5));
    scene.add(teapotPedestal);
    artPieces.push({ mesh: teapotPedestal, artMesh: teapotMesh, id: 'teapot', examined: false, rotatable: true });

    // --- 2. Icosahedron (faceted → edge lines) ---
    const icoGeom = new THREE.IcosahedronGeometry(1.0);
    const icoMesh = new THREE.Mesh(
      icoGeom,
      new THREE.MeshStandardMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0.85,
        emissive: 0x224488,
        emissiveIntensity: 0.4,
        roughness: 0.2,
        metalness: 0.5,
        envMap: envTexture,
        envMapIntensity: 0.5
      })
    );
    // Edge lines for faceted shape
    const icoEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(icoGeom),
      new THREE.LineBasicMaterial({ color: 0xaaddff, linewidth: 1 })
    );
    icoMesh.add(icoEdges);
    const icoPedestal = createPedestal('Icosahedron', icoMesh, new THREE.Vector3(8, 0, -5));
    scene.add(icoPedestal);
    artPieces.push({ mesh: icoPedestal, artMesh: icoMesh, id: 'icosahedron', examined: false, rotatable: true });

    // --- 3. Dodecahedron (faceted → edge lines) ---
    const dodecGeom = new THREE.DodecahedronGeometry(1.0);
    const dodecMesh = new THREE.Mesh(
      dodecGeom,
      new THREE.MeshStandardMaterial({
        color: 0x22cc88,
        roughness: 0.3,
        metalness: 0.8,
        emissive: 0x114422,
        emissiveIntensity: 0.2,
        envMap: envTexture,
        envMapIntensity: 0.5
      })
    );
    const dodecEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(dodecGeom),
      new THREE.LineBasicMaterial({ color: 0x88ffcc, linewidth: 1 })
    );
    dodecMesh.add(dodecEdges);
    const dodecPedestal = createPedestal('Dodecahedron', dodecMesh, new THREE.Vector3(-10, 0, 5));
    scene.add(dodecPedestal);
    artPieces.push({ mesh: dodecPedestal, artMesh: dodecMesh, id: 'dodecahedron', examined: false, rotatable: true });

    // --- 4. Möbius Strip (smooth → envMap) ---
    const mobiusGeometry = createMobiusStrip(1.0, 0.4, 100);
    const mobiusMesh = new THREE.Mesh(
      mobiusGeometry,
      new THREE.MeshStandardMaterial({
        color: 0xaa66ff,
        emissive: 0x552288,
        emissiveIntensity: 0.3,
        roughness: 0.2,
        metalness: 0.7,
        side: THREE.DoubleSide,
        envMap: envTexture,
        envMapIntensity: 0.8
      })
    );
    const mobiusPedestal = createPedestal('Möbius Strip', mobiusMesh, new THREE.Vector3(10, 0, 5));
    scene.add(mobiusPedestal);
    artPieces.push({ mesh: mobiusPedestal, artMesh: mobiusMesh, id: 'mobius', examined: false, rotatable: true });

    // --- 5. Klein Bottle (smooth → envMap, hidden room) ---
    const kleinGeometry = createKleinBottle(0.4, 60, 30);
    const kleinMesh = new THREE.Mesh(
      kleinGeometry,
      new THREE.MeshStandardMaterial({
        color: 0xffaa44,
        emissive: 0x885522,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.8,
        roughness: 0.15,
        metalness: 0.5,
        side: THREE.DoubleSide,
        envMap: envTexture,
        envMapIntensity: 0.8
      })
    );
    const kleinPedestal = createPedestal('Klein Bottle', kleinMesh, new THREE.Vector3(0, 0, -15));
    scene.add(kleinPedestal);
    artPieces.push({ mesh: kleinPedestal, artMesh: kleinMesh, id: 'klein', examined: false, rotatable: true, isHidden: true });

    // --- Maze Art Pieces (beyond back wall, Z < -20) ---

    // M1: Sierpinski Tetrahedron — Room 1 west alcove
    const sierpinskiMesh = createSierpinskiTetrahedron(3, 0.9);
    const sierpinskiPedestal = createPedestal('Sierpinski Tetrahedron', sierpinskiMesh, new THREE.Vector3(-15, 0, -27.5));
    scene.add(sierpinskiPedestal);
    artPieces.push({ mesh: sierpinskiPedestal, artMesh: sierpinskiMesh, id: 'sierpinski', examined: false, rotatable: true, isHidden: true });

    // M2: Lorenz Attractor — Room 2 east alcove
    const lorenzMesh = createLorenzAttractor();
    const lorenzPedestal = createPedestal('Lorenz Attractor', lorenzMesh, new THREE.Vector3(15, 0, -27.5));
    scene.add(lorenzPedestal);
    artPieces.push({ mesh: lorenzPedestal, artMesh: lorenzMesh, id: 'lorenz', examined: false, rotatable: true, isHidden: true });

    // M3: Gyroid Surface — main corridor west
    const gyroidMesh = createGyroid(0.8, 30);
    gyroidMesh.material.envMap = envTexture;
    gyroidMesh.material.envMapIntensity = 0.6;
    const gyroidPedestal = createPedestal('Gyroid Surface', gyroidMesh, new THREE.Vector3(-6, 0, -27.5));
    scene.add(gyroidPedestal);
    artPieces.push({ mesh: gyroidPedestal, artMesh: gyroidMesh, id: 'gyroid', examined: false, rotatable: true, isHidden: true });

    // M4: Hyperbolic Paraboloid — main corridor east
    const saddleMesh = createSaddleSurface(0.8, 20);
    const saddlePedestal = createPedestal('Hyperbolic Paraboloid', saddleMesh, new THREE.Vector3(7, 0, -27.5));
    scene.add(saddlePedestal);
    artPieces.push({ mesh: saddlePedestal, artMesh: saddleMesh, id: 'saddle', examined: false, rotatable: true, isHidden: true });

    // M5: Stella Octangula — deep west room
    const stellaMesh = createStellaOctangula(0.8);
    const stellaPedestal = createPedestal('Stella Octangula', stellaMesh, new THREE.Vector3(-12, 0, -35));
    scene.add(stellaPedestal);
    artPieces.push({ mesh: stellaPedestal, artMesh: stellaMesh, id: 'stella', examined: false, rotatable: true, isHidden: true });

    // M6: Trefoil Knot — deep west alcove south
    const trefoilMesh = createTrefoilKnot();
    trefoilMesh.material.envMap = envTexture;
    trefoilMesh.material.envMapIntensity = 1.0;
    const trefoilPedestal = createPedestal('Trefoil Knot', trefoilMesh, new THREE.Vector3(-12, 0, -42));
    scene.add(trefoilPedestal);
    artPieces.push({ mesh: trefoilPedestal, artMesh: trefoilMesh, id: 'trefoil', examined: false, rotatable: true, isHidden: true });

    // M7: Menger Sponge — deep east room
    const mengerMesh = createMengerSponge(2, 1.2);
    const mengerPedestal = createPedestal('Menger Sponge', mengerMesh, new THREE.Vector3(13, 0, -35));
    scene.add(mengerPedestal);
    artPieces.push({ mesh: mengerPedestal, artMesh: mengerMesh, id: 'menger', examined: false, rotatable: true, isHidden: true });

    // M8: Compound of 5 Cubes — deep east alcove south
    const fivecubesMesh = createFiveCubes(0.7);
    const fivecubesPedestal = createPedestal('Compound of 5 Cubes', fivecubesMesh, new THREE.Vector3(13, 0, -42));
    scene.add(fivecubesPedestal);
    artPieces.push({ mesh: fivecubesPedestal, artMesh: fivecubesMesh, id: 'fivecubes', examined: false, rotatable: true, isHidden: true });

    // M9: Apollonian Gasket — center deep passage
    const apollonianMesh = createApollonianGasket();
    const apollonianPedestal = createPedestal('Apollonian Gasket', apollonianMesh, new THREE.Vector3(1, 0, -42));
    scene.add(apollonianPedestal);
    artPieces.push({ mesh: apollonianPedestal, artMesh: apollonianMesh, id: 'apollonian', examined: false, rotatable: true, isHidden: true });

    // --- 6. Torus Knot (smooth → envMap, chrome) ---
    const torusKnotMesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.8, 0.25, 128, 32, 3, 2),
      new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.05,
        metalness: 0.95,
        envMap: envTexture,
        envMapIntensity: 1.2
      })
    );
    const torusKnotPedestal = createPedestal('Torus Knot', torusKnotMesh, new THREE.Vector3(0, 0, 8));
    scene.add(torusKnotPedestal);
    artPieces.push({ mesh: torusKnotPedestal, artMesh: torusKnotMesh, id: 'torusknot', examined: false, rotatable: true });

    // THE BUTTON - Trip Balls Table
    const tableGroup = new THREE.Group();
    
    // Table top
    const tableTopGeometry = new THREE.BoxGeometry(1.5, 0.1, 1.5);
    const tableTopMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x4a4a4a,
      roughness: 0.7,
      metalness: 0.3
    });
    const tableTop = new THREE.Mesh(tableTopGeometry, tableTopMaterial);
    tableTop.position.y = 1;
    tableGroup.add(tableTop);
    
    // Table legs
    const tableLegGeometry = new THREE.BoxGeometry(0.1, 1, 0.1);
    const tableLegMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a3a });
    const legPositions = [
      [-0.6, 0.5, -0.6],
      [0.6, 0.5, -0.6],
      [-0.6, 0.5, 0.6],
      [0.6, 0.5, 0.6]
    ];
    legPositions.forEach(pos => {
      const leg = new THREE.Mesh(tableLegGeometry, tableLegMaterial);
      leg.position.set(...pos);
      tableGroup.add(leg);
    });
    
    // The Button
    const buttonGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 32);
    const buttonMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff0066,
      emissive: 0xff0066,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.8
    });
    const button = new THREE.Mesh(buttonGeometry, buttonMaterial);
    button.position.y = 1.13;
    button.rotation.x = 0;
    tableGroup.add(button);
    
    // Button glow effect
    const buttonLight = new THREE.PointLight(0xff0066, 1, 3);
    buttonLight.position.y = 1.2;
    tableGroup.add(buttonLight);
    
    // "trip balls" name plate (same style as pedestal labels)
    const btnLabelCanvas = document.createElement('canvas');
    btnLabelCanvas.width = 256;
    btnLabelCanvas.height = 64;
    const btnLabelCtx = btnLabelCanvas.getContext('2d');
    btnLabelCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    btnLabelCtx.fillRect(0, 0, 256, 64);
    btnLabelCtx.fillStyle = '#ffffff';
    btnLabelCtx.font = 'bold 20px system-ui';
    btnLabelCtx.textAlign = 'center';
    btnLabelCtx.fillText('trip balls', 128, 40);

    const btnLabelTexture = new THREE.CanvasTexture(btnLabelCanvas);
    const btnLabelMaterial = new THREE.MeshBasicMaterial({
      map: btnLabelTexture,
      transparent: true
    });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), btnLabelMaterial);
    label.position.set(0, 0.5, 0.78);
    tableGroup.add(label);
    
    // Invisible interaction volume for trip button table
    const tableInteractionBox = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    tableInteractionBox.position.y = 1;
    tableInteractionBox.userData.isInteractionBox = true;
    tableGroup.add(tableInteractionBox);

    // Pulsing animation for button
    let buttonPulseTime = 0;

    tableGroup.position.set(0, 0, 0);
    scene.add(tableGroup);
    
    // Add button to interactable objects
    const tripButton = { 
      mesh: tableGroup, 
      id: 'tripButton', 
      examined: false, 
      rotatable: false,
      isButton: true,
      buttonMesh: button
    };
    artPieces.push(tripButton);

    // Trip Exit Portal - screen-space glow overlay (rendered in tripScene)
    // Portal shader renders a dynamic glow/vortex centered on screen
    const portalOverlayMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: 0 }, // 0 = invisible, 1 = full
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float intensity;
        uniform vec2 resolution;
        varying vec2 vUv;

        void main() {
          vec2 uv = (vUv - 0.5) * 2.0;
          float aspect = resolution.x / resolution.y;
          uv.x *= aspect;
          float dist = length(uv);
          float angle = atan(uv.y, uv.x);

          // Expanding radius based on intensity - fills more of the screen as it grows
          float radius = intensity * 1.8;

          // Dark vignette that closes in from edges
          float vignette = smoothstep(radius + 0.5, radius - 0.2, dist);
          float darkness = (1.0 - vignette) * intensity;

          // Multiple swirling layers
          float swirl1 = sin(angle * 3.0 - time * 5.0 + dist * 10.0) * 0.5 + 0.5;
          float swirl2 = sin(angle * 5.0 + time * 4.0 - dist * 15.0) * 0.5 + 0.5;
          float swirl3 = sin(angle * 7.0 - time * 3.0 + dist * 6.0) * 0.5 + 0.5;

          // Massive central glow that expands
          float pulse = 0.7 + 0.3 * sin(time * 6.0);
          float pulse2 = 0.8 + 0.2 * sin(time * 8.0 + 1.0);
          float glow = exp(-dist * max(0.5, 3.0 - intensity * 2.5)) * pulse;
          float innerGlow = exp(-dist * max(0.3, 5.0 - intensity * 4.5)) * pulse2;

          // Expanding ring waves
          float wave1 = smoothstep(0.06, 0.0, abs(dist - mod(time * 0.8, 2.0))) * 0.8;
          float wave2 = smoothstep(0.06, 0.0, abs(dist - mod(time * 0.8 + 1.0, 2.0))) * 0.6;
          float ring1 = smoothstep(0.05, 0.0, abs(dist - 0.2 * intensity - 0.15 * sin(time * 2.5)));
          float ring2 = smoothstep(0.06, 0.0, abs(dist - 0.5 * intensity + 0.1 * sin(time * 3.5)));
          float ring3 = smoothstep(0.08, 0.0, abs(dist - 0.8 * intensity - 0.12 * sin(time * 2.0)));
          float ring4 = smoothstep(0.1, 0.0, abs(dist - 1.2 * intensity + 0.08 * sin(time * 4.0)));

          // Dramatic lens flare rays
          float rays = pow(abs(sin(angle * 4.0 + time * 2.5)), 6.0) * exp(-dist * 0.8) * intensity;
          float rays2 = pow(abs(sin(angle * 6.0 - time * 2.0)), 10.0) * exp(-dist * 1.0) * intensity;
          float rays3 = pow(abs(sin(angle * 2.0 + time * 1.0)), 4.0) * exp(-dist * 0.6) * intensity * 0.5;

          // Spiral arms
          float spiral = sin(angle * 2.0 + dist * 8.0 - time * 6.0) * 0.5 + 0.5;
          float spiralGlow = spiral * exp(-dist * (2.0 - intensity)) * 0.5;

          // Color: white-hot center → cyan → purple → dark edges
          vec3 whiteHot = vec3(1.0, 1.0, 1.0);
          vec3 cyanCore = vec3(0.2, 0.9, 1.0);
          vec3 blueMiddle = vec3(0.1, 0.4, 1.0);
          vec3 purpleEdge = vec3(0.6, 0.1, 0.9);
          vec3 color = mix(purpleEdge, blueMiddle, exp(-dist * 1.0));
          color = mix(color, cyanCore, exp(-dist * 2.0));
          color = mix(color, whiteHot, exp(-dist * (4.0 - intensity * 2.0)) * intensity);

          // Combine all effects
          float brightness = glow * 0.8
            + innerGlow * 1.5 * intensity
            + (ring1 + ring2 + ring3 + ring4) * 0.5 * swirl1
            + (wave1 + wave2) * swirl2
            + rays * 0.6 + rays2 * 0.4 + rays3 * 0.3
            + spiralGlow * swirl3
            + swirl2 * exp(-dist * 2.0) * 0.3;

          // Chromatic flicker
          color.r += sin(time * 9.0) * 0.08 * intensity;
          color.g += sin(time * 7.0 + 2.0) * 0.04 * intensity;
          color.b += sin(time * 5.0 + 1.0) * 0.1 * intensity;

          // Final: bright portal glow in center, dark tunnel around it
          vec3 finalColor = color * brightness * intensity * 2.0;
          float finalAlpha = max(darkness, brightness * intensity);
          // Mix in black for the peripheral darkening
          finalColor = mix(finalColor, vec3(0.0), darkness * (1.0 - brightness * 0.5));
          finalAlpha = clamp(finalAlpha, 0.0, 1.0);

          gl_FragColor = vec4(finalColor, finalAlpha);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    // This gets added to the trip overlay scene later, not the main scene
    const portalOverlayQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      portalOverlayMaterial
    );
    portalOverlayQuad.renderOrder = 1000;
    portalOverlayQuad.visible = false;

    // We'll use a separate scene for the portal overlay
    const portalOverlayScene = new THREE.Scene();
    const portalOverlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    portalOverlayScene.add(portalOverlayQuad);

    // Alignment circles for trip exit puzzle
    const alignmentCircles = [];
    const circlePositions = [
      { pos: new THREE.Vector3(0, 2, -8), radius: 0.5, color: 0xff00ff },   // Close, small
      { pos: new THREE.Vector3(0, 2, -12), radius: 1.0, color: 0x00ffff },  // Medium
      { pos: new THREE.Vector3(0, 2, -16), radius: 1.5, color: 0xffff00 },  // Far, large
      { pos: new THREE.Vector3(0, 2, 8), radius: 0.7, color: 0xff0066 },    // Behind, small
      { pos: new THREE.Vector3(0, 2, 12), radius: 1.2, color: 0x00ff66 },   // Behind, medium
    ];

    circlePositions.forEach((data, i) => {
      const ringGeometry = new THREE.RingGeometry(data.radius - 0.1, data.radius + 0.1, 64);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: data.color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.copy(data.pos);
      ring.renderOrder = 999;
      scene.add(ring);
      
      alignmentCircles.push({ 
        mesh: ring,
        material: ringMaterial,
        position: data.pos,
        radius: data.radius 
      });
    });

    // Alignment state
    const alignmentRequired = 2000; // Must stay aligned for 2 seconds
    
    const tripPortal = {
      mesh: new THREE.Group(), // Dummy mesh (portal is screen-space overlay)
      id: 'tripPortal',
      examined: false,
      rotatable: false,
      isTripExit: true
    };
    artPieces.push(tripPortal);

    // Collision boxes for walls (x, z, width, depth)
    const walls = [
      // Outer walls (back wall split for maze entrance gap at X=[-2, 4])
      { x: -11, z: -20, width: 18, depth: 0.5 },  // Back wall left
      { x: 12, z: -20, width: 16, depth: 0.5 },   // Back wall right
      { x: 0, z: 20, width: 40, depth: 0.5 },     // South wall
      { x: -20, z: 0, width: 0.5, depth: 40 },    // West wall
      { x: 20, z: 0, width: 0.5, depth: 40 },     // East wall
    ];
    
    const interiorWallCollisions = [
      { x: -5, z: -10, width: 15, depth: 0.5 },   // Interior wall left section
      { x: 8, z: -10, width: 15, depth: 0.5 }     // Interior wall right section
    ];

    // --- Maze beyond back wall (Z < -20) ---
    // Entry gap in back wall: X=[-2, 4] (6 units wide)
    // Maze extends from Z=-20 to Z=-46, X=-20 to X=20
    const mazeWallDefs = [
      // Entry corridor (6 wide, 4 deep)
      { w: 0.5, d: 4, x: -2, z: -22 },               // W1: entry left wall
      { w: 0.5, d: 4, x: 4, z: -22 },                // W2: entry right wall
      // T-junction north wall (gap aligned with entry)
      { w: 18, d: 0.5, x: -11, z: -24 },             // W3: T north west, X=[-20,-2]
      { w: 16, d: 0.5, x: 12, z: -24 },              // W4: T north east, X=[4,20]
      // Maze perimeter
      { w: 0.5, d: 22, x: -20, z: -35 },             // W5: west boundary, Z=[-46,-24]
      { w: 0.5, d: 22, x: 20, z: -35 },              // W6: east boundary, Z=[-46,-24]
      { w: 40, d: 0.5, x: 0, z: -46 },               // W7: south boundary
      // Room dividers (partial walls, 3 units deep, gap at south)
      { w: 0.5, d: 3, x: -10, z: -25.5 },            // W8: Room 1 divider, Z=[-27,-24]
      { w: 0.5, d: 3, x: 10, z: -25.5 },             // W9: Room 2 divider, Z=[-27,-24]
      // South wall of main corridor (gaps between segments)
      { w: 8, d: 0.5, x: -16, z: -31 },              // W10: far west, X=[-20,-12]
      { w: 8, d: 0.5, x: 16, z: -31 },               // W11: far east, X=[12,20]
      // Deep section dividers (partial, gap at south Z=-38 to -46)
      { w: 0.5, d: 7, x: -3, z: -34.5 },             // W12: deep west/center, Z=[-38,-31]
      { w: 0.5, d: 7, x: 5, z: -34.5 },              // W13: center/deep east, Z=[-38,-31]
      // Deep room cross-walls (alcoves for deepest pieces)
      { w: 6, d: 0.5, x: -12, z: -38 },              // W14: Room 3 alcove, X=[-15,-9]
      { w: 6, d: 0.5, x: 13, z: -38 },               // W15: Room 4 alcove, X=[10,16]
    ];

    const mazeWalls = [];
    mazeWallDefs.forEach(def => {
      const geom = new THREE.BoxGeometry(def.w, 6, def.d);
      const mesh = new THREE.Mesh(geom, wallMaterial);
      mesh.position.set(def.x, 3, def.z);
      scene.add(mesh);
      mazeWalls.push(mesh);
      interiorWallCollisions.push({ x: def.x, z: def.z, width: def.w, depth: def.d });
    });

    // Maze floor and ceiling
    const mazeFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 26),
      floorMaterial
    );
    mazeFloor.rotation.x = -Math.PI / 2;
    mazeFloor.position.set(0, 0, -33);
    scene.add(mazeFloor);

    const mazeCeiling = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 26),
      ceilingMaterial
    );
    mazeCeiling.rotation.x = Math.PI / 2;
    mazeCeiling.position.set(0, 6, -33);
    scene.add(mazeCeiling);

    // --- Maze Lighting ---
    const mazeLights = [];

    // Entry corridor
    const mazeLight1 = new THREE.PointLight(0xffcc88, 0.8, 15);
    mazeLight1.position.set(1, 4, -22);
    scene.add(mazeLight1);
    mazeLights.push(mazeLight1);

    // Main corridor west
    const mazeLight2 = new THREE.PointLight(0xffcc88, 0.8, 18);
    mazeLight2.position.set(-6, 4, -27.5);
    scene.add(mazeLight2);
    mazeLights.push(mazeLight2);

    // Main corridor east
    const mazeLight3 = new THREE.PointLight(0xffcc88, 0.8, 18);
    mazeLight3.position.set(7, 4, -27.5);
    scene.add(mazeLight3);
    mazeLights.push(mazeLight3);

    // Room 1 (west alcove): red/orange
    const mazeLight4 = new THREE.PointLight(0xff6644, 0.6, 12);
    mazeLight4.position.set(-15, 4, -27.5);
    scene.add(mazeLight4);
    mazeLights.push(mazeLight4);

    // Room 2 (east alcove): cool blue
    const mazeLight5 = new THREE.PointLight(0x4488ff, 0.6, 12);
    mazeLight5.position.set(15, 4, -27.5);
    scene.add(mazeLight5);
    mazeLights.push(mazeLight5);

    // Deep west: dim green
    const mazeLight6 = new THREE.PointLight(0x44cc44, 0.5, 12);
    mazeLight6.position.set(-12, 4, -35);
    scene.add(mazeLight6);
    mazeLights.push(mazeLight6);

    // Deep east: dim purple
    const mazeLight7 = new THREE.PointLight(0x8844cc, 0.5, 12);
    mazeLight7.position.set(13, 4, -35);
    scene.add(mazeLight7);
    mazeLights.push(mazeLight7);

    // Center deep: cold blue
    const mazeLight8 = new THREE.PointLight(0x4466aa, 0.5, 12);
    mazeLight8.position.set(1, 4, -40);
    scene.add(mazeLight8);
    mazeLights.push(mazeLight8);

    // Deep south west alcove
    const mazeLight9 = new THREE.PointLight(0xffaa66, 0.4, 10);
    mazeLight9.position.set(-12, 4, -42);
    scene.add(mazeLight9);
    mazeLights.push(mazeLight9);

    // Deep south east alcove
    const mazeLight10 = new THREE.PointLight(0xffaa66, 0.4, 10);
    mazeLight10.position.set(13, 4, -42);
    scene.add(mazeLight10);
    mazeLights.push(mazeLight10);

    // Collision detection helper
    const checkCollision = (newX, newZ, radius = 0.5) => {
      // Check outer walls
      for (const wall of walls) {
        const halfWidth = wall.width / 2;
        const halfDepth = wall.depth / 2;
        
        // AABB collision check
        if (newX + radius > wall.x - halfWidth &&
            newX - radius < wall.x + halfWidth &&
            newZ + radius > wall.z - halfDepth &&
            newZ - radius < wall.z + halfDepth) {
          return true; // Collision detected
        }
      }
      
      // Check interior walls only when not tripping
      if (!trippingRef.current) {
        for (const wall of interiorWallCollisions) {
          const halfWidth = wall.width / 2;
          const halfDepth = wall.depth / 2;
          
          if (newX + radius > wall.x - halfWidth &&
              newX - radius < wall.x + halfWidth &&
              newZ + radius > wall.z - halfDepth &&
              newZ - radius < wall.z + halfDepth) {
            return true;
          }
        }
      }
      
      return false; // No collision
    };

    // Finish game function - defined early so it's accessible from event handlers
    const finishGame = () => {
      const gameState = gameStateRef.current;
      const totalTime = (Date.now() - gameState.startTime) / 1000;

      // Calculate metrics for Openness
      const regularObjects = artPieces.filter(p => !p.isButton && !p.isTripExit).length;
      const foundRegular = Array.from(gameState.artPiecesExamined).filter(
        id => id !== 'tripButton' && id !== 'tripPortal'
      ).length;
      
      const uniqueDescriptions = foundRegular;
      const viewsExplored = gameState.pathTaken.length;
      const hiddenFound = gameState.hiddenAreasFound.size > 0 ? 1 : 0;
      const trippedBalls = gameState.trippedBalls ? 1 : 0;
      
      // Determine completion method if not already set
      if (!gameState.completionMethod) {
        gameState.completionMethod = 'early'; // Left early
      }
      
      // Calculate base abstractness
      let abstractnessLevel = 0;
      
      if (gameState.completionMethod === 'sober') {
        // Sober completion - found all objects without tripping
        abstractnessLevel = Math.min(1, (
          (uniqueDescriptions / regularObjects) * 0.5 +  // Found everything
          (hiddenFound) * 0.3 +
          Math.min(1, gameState.rotationsPerformed / 10) * 0.2
        ));
      } else if (gameState.completionMethod === 'trip') {
        // Trip completion - found the portal while tripping (max openness!)
        abstractnessLevel = Math.min(1, (
          (uniqueDescriptions / regularObjects) * 0.3 +
          (hiddenFound) * 0.2 +
          Math.min(1, gameState.rotationsPerformed / 10) * 0.1 +
          0.4  // Huge bonus for navigating the trip exit
        ));
      } else {
        // Early exit - penalized based on incompletion
        const completionRatio = foundRegular / regularObjects;
        abstractnessLevel = Math.min(1, (
          completionRatio * 0.4 +
          (hiddenFound) * 0.2 +
          Math.min(1, gameState.rotationsPerformed / 10) * 0.1 +
          (trippedBalls) * 0.3
        )) * 0.7;  // 30% penalty for early exit
      }

      const results = {
        uniqueDescriptions,
        abstractnessLevel,
        viewsExplored,
        totalRotations: gameState.rotationsPerformed,
        completionMethod: gameState.completionMethod,
        completionRatio: foundRegular / regularObjects
      };

      console.log('Game completed!', results);
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      setCompletionResults(results);
    };

    // Player setup
    camera.position.set(0, 1.6, 15);
    const moveSpeed = 0.1;
    const lookSpeed = 0.002;

    // Orthographic camera for trip mode - flattens Z axis
    const orthoSize = 10;
    const aspect = window.innerWidth / window.innerHeight;
    const orthoCamera = new THREE.OrthographicCamera(
      -orthoSize * aspect, orthoSize * aspect,
      orthoSize, -orthoSize,
      0.1, 1000
    );
    orthoCamera.position.set(0, 1.6, 0);
    orthoCamera.lookAt(0, 1.6, -10);

    // Active camera reference
    let activeCamera = camera;
    
    // Trip start time for shader animation
    let tripStartTime = 0;

    // Controls state
    const keys = {};
    const mouse = { x: 0, y: 0, isDragging: false };
    let yaw = 0;
    let pitch = 0;
    let pointerLocked = false;
    let pointerLockSupported = true;
    let skipNextClick = false;
    let gamepadIndex = null;
    let gamepadAWasPressed = false;

    // Gamepad detection
    const onGamepadConnected = (e) => {
      gamepadIndex = e.gamepad.index;
      setGamepadConnected(true);
      console.log('Gamepad connected:', e.gamepad.id);
    };

    const onGamepadDisconnected = (e) => {
      if (e.gamepad.index === gamepadIndex) {
        gamepadIndex = null;
        setGamepadConnected(false);
        console.log('Gamepad disconnected');
      }
    };

    window.addEventListener('gamepadconnected', onGamepadConnected);
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected);

    // Check for already connected gamepads
    const checkExistingGamepads = () => {
      const gamepads = navigator.getGamepads();
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
          gamepadIndex = i;
          setGamepadConnected(true);
          console.log('Gamepad detected:', gamepads[i].id);
          break;
        }
      }
    };
    checkExistingGamepads();

    // Pointer lock
    const requestPointerLock = () => {
      renderer.domElement.requestPointerLock().catch(() => {
        // Pointer lock failed (probably in iframe), use fallback
        pointerLockSupported = false;
        console.log('Pointer lock not available, using click-and-drag fallback');
      });
    };

    const onPointerLockChange = () => {
      const wasLocked = pointerLocked;
      pointerLocked = document.pointerLockElement === renderer.domElement;
      if (!wasLocked && pointerLocked) {
        skipNextClick = true;
      }
    };

    const onPointerLockError = () => {
      pointerLockSupported = false;
      console.log('Pointer lock error, using fallback controls');
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);

    // Mobile joystick state
    let joystick = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 };
    let lookTouch = { active: false, lastX: 0, lastY: 0 };

    // Event listeners
    const onKeyDown = (e) => { keys[e.key.toLowerCase()] = true; };
    const onKeyUp = (e) => { keys[e.key.toLowerCase()] = false; };
    
    const onMouseDown = (e) => {
      if (!mobile) {
        if (pointerLockSupported && !pointerLocked) {
          requestPointerLock();
        } else if (!pointerLockSupported) {
          // Fallback: click and drag
          mouse.isDragging = true;
        }
      }
    };

    const onMouseUp = () => {
      if (!pointerLockSupported) {
        mouse.isDragging = false;
      }
    };
    
    const onMouseMove = (e) => {
      if (pointerLocked) {
        // Pointer lock mode
        yaw -= e.movementX * lookSpeed;
        pitch -= e.movementY * lookSpeed;
        pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
      } else if (mouse.isDragging) {
        // Fallback mode (click and drag)
        yaw -= e.movementX * lookSpeed;
        pitch -= e.movementY * lookSpeed;
        pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
      }
    };

    // Max interaction distance
    const maxInteractDistance = 8;

    // Shared function to find what piece the player is looking at within range
    // Collect all interaction boxes for efficient raycasting
    const interactionBoxes = [];
    artPieces.forEach(p => {
      p.mesh.traverse(child => {
        if (child.userData.isInteractionBox) {
          interactionBoxes.push({ box: child, piece: p });
        }
      });
    });

    const findTargetPiece = () => {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      raycaster.far = maxInteractDistance;
      const boxes = interactionBoxes.map(ib => ib.box);
      const intersects = raycaster.intersectObjects(boxes, false);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const match = interactionBoxes.find(ib => ib.box === hit);
        return match ? match.piece : null;
      }
      return null;
    };

    // Shared activation logic
    const activatePiece = (artPiece) => {
      if (!artPiece || artPiece.examined) return;

      artPiece.examined = true;
      gameStateRef.current.artPiecesExamined.add(artPiece.id);
      setExaminedCount(gameStateRef.current.artPiecesExamined.size);

      if (artPiece.isHidden) {
        gameStateRef.current.hiddenAreasFound.add(artPiece.id);
      }

      // Special handling for the trip button
      if (artPiece.isButton) {
        gameStateRef.current.trippedBalls = true;
        setIsTripping(true);
        tripStartTime = performance.now();

        const randomX = (Math.random() - 0.5) * 30; // -15 to 15
        const randomZ = (Math.random() - 0.5) * 30; // -15 to 15 (main room only)
        camera.position.set(
          Math.max(-19, Math.min(19, randomX)),
          1.6,
          Math.max(-19, Math.min(19, randomZ))
        );
        yaw = Math.random() * Math.PI * 2;
        pitch = (Math.random() - 0.5) * 0.5;

        if (artPiece.buttonMesh) {
          artPiece.buttonMesh.position.y = 1.08;
          setTimeout(() => { artPiece.buttonMesh.position.y = 1.13; }, 200);
        }
      }

      // Visual feedback - pulse emissive
      const feedbackMesh = artPiece.artMesh || artPiece.mesh;
      const feedbackMat = feedbackMesh.material;
      if (feedbackMat && !artPiece.isButton && !artPiece.isTripExit) {
        const originalEmissive = feedbackMat.emissive?.getHex() || 0x000000;
        feedbackMat.emissive = new THREE.Color(0xffffff);
        setTimeout(() => {
          if (feedbackMat) feedbackMat.emissive = new THREE.Color(originalEmissive);
        }, 300);
      }

      gameStateRef.current.timeSpentPerPiece[artPiece.id] = Date.now();

      // Check for sober completion
      const regularObjects = artPieces.filter(p => !p.isButton && !p.isTripExit).length;
      const foundRegular = Array.from(gameStateRef.current.artPiecesExamined).filter(
        id => id !== 'tripButton' && id !== 'tripPortal'
      ).length;

      if (foundRegular === regularObjects && !trippingRef.current) {
        gameStateRef.current.completionMethod = 'sober';
        setTimeout(() => finishGame(), 500);
      }
    };

    // Hover glow tracking
    let hoveredPiece = null;
    let hoveredOriginalEmissive = null;

    const onClick = (e) => {
      if (!mobile && pointerLockSupported && !pointerLocked) return;
      if (skipNextClick) { skipNextClick = false; return; }

      const target = findTargetPiece();
      if (target) activatePiece(target);
    };

    // Touch controls for mobile
    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        if (touch.clientX < window.innerWidth / 2) {
          // Left side - joystick
          joystick = {
            active: true,
            startX: touch.clientX,
            startY: touch.clientY,
            currentX: touch.clientX,
            currentY: touch.clientY
          };
        } else {
          // Right side - look
          lookTouch = {
            active: true,
            lastX: touch.clientX,
            lastY: touch.clientY
          };
        }
      }
    };

    const onTouchMove = (e) => {
      e.preventDefault();
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (joystick.active && touch.clientX < window.innerWidth / 2) {
          joystick.currentX = touch.clientX;
          joystick.currentY = touch.clientY;
        } else if (lookTouch.active && touch.clientX >= window.innerWidth / 2) {
          const deltaX = touch.clientX - lookTouch.lastX;
          const deltaY = touch.clientY - lookTouch.lastY;
          yaw -= deltaX * lookSpeed * 2;
          pitch -= deltaY * lookSpeed * 2;
          pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
          lookTouch.lastX = touch.clientX;
          lookTouch.lastY = touch.clientY;
        }
      }
    };

    const onTouchEnd = (e) => {
      joystick.active = false;
      lookTouch.active = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onClick);
    
    if (mobile) {
      renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
      renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
      renderer.domElement.addEventListener('touchend', onTouchEnd);
    }

    const onResize = () => {
      const aspect = window.innerWidth / window.innerHeight;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      
      // Update orthographic camera
      orthoCamera.left = -orthoSize * aspect;
      orthoCamera.right = orthoSize * aspect;
      orthoCamera.top = orthoSize;
      orthoCamera.bottom = -orthoSize;
      orthoCamera.updateProjectionMatrix();
      
      renderer.setSize(window.innerWidth, window.innerHeight);
      portalOverlayMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // Game loop
    let lastTime = performance.now();
    const animate = () => {
      requestAnimationFrame(animate);
      const currentTime = performance.now();
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      // Process gamepad input
      if (gamepadIndex !== null) {
        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[gamepadIndex];
        
        if (gamepad) {
          // Debug: log all axes to find right stick mapping
          // (Uncomment if you need to debug controller mappings)
          // if (gamepad.axes.some(v => Math.abs(v) > 0.15)) {
          //   console.log('Axes:', gamepad.axes.map((v, i) => `[${i}]:${v.toFixed(2)}`).join(' '));
          // }
          
          // Left stick - movement (axes 0 and 1)
          const leftStickX = Math.abs(gamepad.axes[0]) > 0.15 ? gamepad.axes[0] : 0;
          const leftStickY = Math.abs(gamepad.axes[1]) > 0.15 ? gamepad.axes[1] : 0;
          
          // Right stick - look
          // Different controllers map differently:
          // - Most standard: axes 2,3
          // - Xbox Series S/X: axes 4,5
          let rightStickX = 0;
          let rightStickY = 0;
          
          // Try axes 4 and 5 first (Xbox Series controllers)
          if (gamepad.axes.length > 5) {
            rightStickX = Math.abs(gamepad.axes[4]) > 0.15 ? gamepad.axes[4] : 0;
            rightStickY = Math.abs(gamepad.axes[5]) > 0.15 ? gamepad.axes[5] : 0;
          }
          
          // Fallback to axes 2 and 3 (standard mapping)
          if (rightStickX === 0 && rightStickY === 0 && gamepad.axes.length > 3) {
            rightStickX = Math.abs(gamepad.axes[2]) > 0.15 ? gamepad.axes[2] : 0;
            rightStickY = Math.abs(gamepad.axes[3]) > 0.15 ? gamepad.axes[3] : 0;
          }
          
          // Apply movement from left stick
          if (leftStickX !== 0 || leftStickY !== 0) {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0;
            forward.normalize();
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            
            const moveX = (-leftStickY * forward.x + leftStickX * right.x) * moveSpeed * 1.5;
            const moveZ = (-leftStickY * forward.z + leftStickX * right.z) * moveSpeed * 1.5;
            
            const newX = camera.position.x + moveX;
            const newZ = camera.position.z + moveZ;
            
            // Check X axis movement
            if (!checkCollision(newX, camera.position.z)) {
              camera.position.x = newX;
            }
            
            // Check Z axis movement
            if (!checkCollision(camera.position.x, newZ)) {
              camera.position.z = newZ;
            }
          }
          
          // Vertical movement with shoulder buttons when tripping
          if (trippingRef.current) {
            // L1/LB (button 4) - go up
            if (gamepad.buttons[4]?.pressed) {
              camera.position.y += moveSpeed;
            }
            // L2/LT (button 6) - go down  
            if (gamepad.buttons[6]?.pressed) {
              camera.position.y -= moveSpeed;
            }
          }
          
          // Apply look from right stick
          if (rightStickX !== 0 || rightStickY !== 0) {
            yaw -= rightStickX * 0.05;
            // Y-axis: negative by default (not inverted), unless invertY is true
            pitch += (invertYRef.current ? rightStickY : -rightStickY) * 0.05;
            pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
          }
          
          // A button (button 0) - interact with art
          const aPressed = gamepad.buttons[0]?.pressed;
          if (aPressed && !gamepadAWasPressed) {
            const target = findTargetPiece();
            if (target) activatePiece(target);
          }
          gamepadAWasPressed = aPressed;
        }
      }

      // Update camera rotation
      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      // Sync orthographic camera with perspective camera
      orthoCamera.position.copy(camera.position);
      orthoCamera.rotation.copy(camera.rotation);

      // Switch active camera based on trip state
      if (trippingRef.current) {
        activeCamera = orthoCamera;
      } else {
        activeCamera = camera;
      }

      // Movement
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

      let moveX = 0;
      let moveY = 0; // Vertical movement
      let moveZ = 0;

      // Keyboard movement
      if (keys['w'] || keys['arrowup']) {
        moveX += forward.x * moveSpeed;
        moveZ += forward.z * moveSpeed;
      }
      if (keys['s'] || keys['arrowdown']) {
        moveX -= forward.x * moveSpeed;
        moveZ -= forward.z * moveSpeed;
      }
      if (keys['a'] || keys['arrowleft']) {
        moveX -= right.x * moveSpeed;
        moveZ -= right.z * moveSpeed;
      }
      if (keys['d'] || keys['arrowright']) {
        moveX += right.x * moveSpeed;
        moveZ += right.z * moveSpeed;
      }
      
      // Vertical movement (only when tripping - flying mode)
      if (trippingRef.current) {
        if (keys['q'] || keys[' ']) { // Q or Space to go up
          moveY += moveSpeed;
        }
        if (keys['e'] || keys['shift']) { // E or Shift to go down
          moveY -= moveSpeed;
        }
      }

      // Mobile joystick movement
      if (joystick.active) {
        const deltaX = joystick.currentX - joystick.startX;
        const deltaY = joystick.currentY - joystick.startY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        if (distance > 5) {
          const normalizedX = deltaX / 100;
          const normalizedY = deltaY / 100;
          
          moveX -= normalizedY * forward.x * moveSpeed;
          moveZ -= normalizedY * forward.z * moveSpeed;
          moveX += normalizedX * right.x * moveSpeed;
          moveZ += normalizedX * right.z * moveSpeed;
        }
      }

      // Apply movement with collision detection
      const newX = camera.position.x + moveX;
      const newY = camera.position.y + moveY;
      const newZ = camera.position.z + moveZ;

      // Check X axis movement
      if (!checkCollision(newX, camera.position.z)) {
        camera.position.x = newX;
      }

      // Check Z axis movement
      if (!checkCollision(camera.position.x, newZ)) {
        camera.position.z = newZ;
      }
      
      // Apply Y movement (no collision check when flying)
      if (trippingRef.current) {
        camera.position.y = newY;
        // Constrain vertical bounds
        camera.position.y = Math.max(0.5, Math.min(15, camera.position.y));
      } else {
        // Keep at ground level when not tripping
        camera.position.y = 1.6;
      }

      // Constrain player within horizontal bounds
      // When tripping, keep player in main room only (no maze access)
      if (trippingRef.current) {
        camera.position.x = Math.max(-19, Math.min(19, camera.position.x));
        camera.position.z = Math.max(-19, Math.min(19, camera.position.z));
      } else {
        camera.position.x = Math.max(-19, Math.min(19, camera.position.x));
        camera.position.z = Math.max(-45.5, Math.min(19, camera.position.z));
      }

      // Track path
      if (gameStateRef.current.pathTaken.length === 0 || 
          currentTime - gameStateRef.current.pathTaken[gameStateRef.current.pathTaken.length - 1].time > 500) {
        gameStateRef.current.pathTaken.push({
          x: camera.position.x,
          z: camera.position.z,
          time: currentTime
        });
      }

      // Hover feedback: oscillation for art pieces, vignette for trip button
      const hoverTarget = findTargetPiece();
      if (hoverTarget && !hoverTarget.examined && !hoverTarget.isTripExit) {
        if (hoveredPiece !== hoverTarget) {
          hoveredPiece = hoverTarget;
          if (!hoverTarget.isButton) {
            const target = hoveredPiece.artMesh || hoveredPiece.mesh;
            if (hoveredPiece._baseArtY === undefined) {
              hoveredPiece._baseArtY = target.position.y;
            }
            if (hoveredPiece._oscAmplitude === undefined) {
              hoveredPiece._oscAmplitude = 0;
            }
          }
          const action = hoverTarget.isButton ? 'to trip balls' : 'to examine';
          const inputHint = gamepadIndex !== null ? `press A ${action}` : `click ${action}`;
          setInteractPrompt({ name: '', inputHint });
        }
        if (hoveredPiece.isButton) {
          // Gradually ramp up vignette and button brightness
          buttonVignetteRef.current = Math.min(1, buttonVignetteRef.current + deltaTime * 0.4);
          setButtonVignette(buttonVignetteRef.current);
          if (hoveredPiece.buttonMesh) {
            hoveredPiece.buttonMesh.material.emissiveIntensity = 0.5 + buttonVignetteRef.current * 2.5;
          }
        } else {
          // Ramp oscillation amplitude up smoothly
          hoveredPiece._oscAmplitude = Math.min(0.3, hoveredPiece._oscAmplitude + deltaTime * 0.3);
        }
      } else {
        if (hoveredPiece && !hoveredPiece.isButton) {
          // Mark for ramp-down (handled below)
        }
        if (hoveredPiece && hoveredPiece.isButton) {
          if (hoveredPiece.buttonMesh) {
            hoveredPiece.buttonMesh.material.emissiveIntensity = 0.5;
          }
        }
        if (hoveredPiece) {
          hoveredPiece = null;
          setInteractPrompt(null);
        }
      }

      // Update all art piece oscillations (smooth ramp up/down)
      artPieces.forEach(piece => {
        if (piece.isButton || piece.isTripExit || !piece.artMesh) return;
        if (piece._baseArtY === undefined) return;

        // Ramp down amplitude for non-hovered pieces
        if (piece !== hoveredPiece && piece._oscAmplitude > 0) {
          piece._oscAmplitude = Math.max(0, piece._oscAmplitude - deltaTime * 0.3);
        }

        if (piece._oscAmplitude > 0.001) {
          const amp = piece._oscAmplitude;
          piece.artMesh.position.y = piece._baseArtY + amp + Math.sin(currentTime / 1000 * Math.PI) * amp;
        } else if (piece._oscAmplitude !== undefined && piece._oscAmplitude <= 0.001) {
          piece.artMesh.position.y = piece._baseArtY;
          piece._oscAmplitude = 0;
        }
      });

      // Fade vignette down when not hovering button
      if (!hoveredPiece || !hoveredPiece.isButton) {
        if (buttonVignetteRef.current > 0) {
          buttonVignetteRef.current = Math.max(0, buttonVignetteRef.current - deltaTime * 0.8);
          setButtonVignette(buttonVignetteRef.current);
        }
      }

      // Rotate art pieces that are being examined (just the art, not the pedestal)
      artPieces.forEach(piece => {
        if (piece.examined && piece.rotatable) {
          const target = piece.artMesh || piece.mesh;
          target.rotation.y += 0.01;
          gameStateRef.current.rotationsPerformed += 0.01;
        }
      });

      // Animate button pulse
      buttonPulseTime += deltaTime * 2;
      button.position.y = 1.13 + Math.sin(buttonPulseTime) * 0.02;
      buttonMaterial.emissiveIntensity = 0.5 + Math.sin(buttonPulseTime * 2) * 0.3;

      // Animate trip portal and alignment circles (only visible when tripping)
      if (trippingRef.current) {
        // Hide walls and ceiling completely when tripping
        outerWalls.forEach(wall => wall.visible = false);
        ceiling.visible = false;

        // Hide interior walls completely (they block the circles)
        interiorWall1.visible = false;
        interiorWall2.visible = false;
        mazeWalls.forEach(w => w.visible = false);
        mazeLights.forEach(l => l.visible = false);
        mazeFloor.visible = false;
        mazeCeiling.visible = false;

        // Hide floor
        floor.visible = false;
        
        // Hide all art pieces
        artPieces.forEach(piece => {
          if (!piece.isTripExit && piece.mesh) {
            piece.mesh.visible = false;
          }
        });
        
        // Show exit zone (DISABLED FOR TESTING)
        // exitZoneMaterial.opacity = Math.min(0.3, exitZoneMaterial.opacity + deltaTime * 2);
        
        // Make circles visible and always render
        alignmentCircles.forEach(circle => {
          circle.mesh.visible = true;
          circle.material.opacity = Math.min(0.8, circle.material.opacity + deltaTime * 2);
          circle.mesh.lookAt(activeCamera.position);
        });

        // Check alignment - now checking 3D box
        const boxTolerance = { x: 2.0, y: 5.0, z: 20.0 }; // Box: 4 wide, 10 tall, spans full Z
        const boxCenter = { x: 0, y: 5, z: 0 };
        const angleTolerance = 0.15; // About 8.6 degrees
        
        // Check if player is inside 3D box
        const inPositionX = Math.abs(camera.position.x - boxCenter.x) < boxTolerance.x;
        const inPositionY = Math.abs(camera.position.y - boxCenter.y) < boxTolerance.y;
        const inPositionZ = Math.abs(camera.position.z - boxCenter.z) < boxTolerance.z;
        const inPosition = inPositionX && inPositionY && inPositionZ;
        
        // Check if looking towards circles (forward or backward along Z axis)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const lookingForward = Math.abs(forward.z) > Math.cos(angleTolerance) && Math.abs(forward.x) < Math.sin(angleTolerance);
        
        const aligned = inPosition && lookingForward;
        
        // Debug logging every 60 frames (~1 second)
        if (currentTime % 1000 < 16) {
          console.log('Alignment Debug:', {
            position: `${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}`,
            inPositionX: `${Math.abs(camera.position.x - boxCenter.x).toFixed(2)} < ${boxTolerance.x}`,
            inPositionY: `${Math.abs(camera.position.y - boxCenter.y).toFixed(2)} < ${boxTolerance.y}`,
            inPositionZ: `${Math.abs(camera.position.z - boxCenter.z).toFixed(2)} < ${boxTolerance.z}`,
            inPosition,
            forwardVector: `${forward.x.toFixed(2)}, ${forward.y.toFixed(2)}, ${forward.z.toFixed(2)}`,
            lookingForward,
            aligned
          });
        }
        
        if (aligned && !wasAlignedRef.current) {
          console.log('🎯 ALIGNMENT ACHIEVED!');
          setIsAligned(true);
          wasAlignedRef.current = true;
          alignmentTimeRef.current = 0;
        } else if (!aligned && wasAlignedRef.current) {
          console.log('❌ ALIGNMENT LOST');
          setIsAligned(false);
          wasAlignedRef.current = false;
          alignmentTimeRef.current = 0;
        }
        
        if (aligned) {
          alignmentTimeRef.current += deltaTime * 1000;
          const progress = Math.min(100, (alignmentTimeRef.current / alignmentRequired) * 100);
          setAlignmentProgress(progress);
          
          console.log(`⏱️ Alignment time: ${alignmentTimeRef.current.toFixed(0)}ms / ${alignmentRequired}ms (${progress.toFixed(1)}%)`);
          
          // Pulse circles when aligned
          alignmentCircles.forEach((circle, i) => {
            const pulse = Math.sin(currentTime / 100 + i) * 0.3 + 0.7;
            circle.material.opacity = pulse;
          });
          
          // Portal overlay intensifies as you stay aligned
          const progressRatio = Math.min(1, alignmentTimeRef.current / alignmentRequired);
          portalOverlayQuad.visible = true;
          portalOverlayMaterial.uniforms.intensity.value = progressRatio;
          
          // Complete when fully aligned for required time
          if (alignmentTimeRef.current >= alignmentRequired) {
            console.log('✅ TRIP EXIT COMPLETE!');
            gameStateRef.current.completionMethod = 'trip';
            finishGame();
          }
        } else {
          setAlignmentProgress(0);
          // Fade portal overlay out when not aligned
          portalOverlayMaterial.uniforms.intensity.value = Math.max(0, portalOverlayMaterial.uniforms.intensity.value - deltaTime * 2);
          if (portalOverlayMaterial.uniforms.intensity.value <= 0) {
            portalOverlayQuad.visible = false;
          }
        }

        // Update portal shader time
        portalOverlayMaterial.uniforms.time.value = (currentTime - tripStartTime) / 1000;
      } else {
        // Show walls, ceiling when not tripping
        outerWalls.forEach(wall => wall.visible = true);
        ceiling.visible = true;

        // Show interior walls
        interiorWall1.visible = true;
        interiorWall2.visible = true;
        mazeWalls.forEach(w => w.visible = true);
        mazeLights.forEach(l => l.visible = true);
        mazeFloor.visible = true;
        mazeCeiling.visible = true;

        // Show floor
        floor.visible = true;
        
        // Show all art pieces
        artPieces.forEach(piece => {
          if (piece.mesh) {
            piece.mesh.visible = true;
          }
        });
        
        // Hide exit zone
        exitZoneMaterial.opacity = Math.max(0, exitZoneMaterial.opacity - deltaTime * 2);
        
        // Hide circles when not tripping
        alignmentCircles.forEach(circle => {
          circle.material.opacity = 0;
          circle.mesh.visible = false;
        });
        portalOverlayQuad.visible = false;
        portalOverlayMaterial.uniforms.intensity.value = 0;
        setIsAligned(false);
        wasAlignedRef.current = false;
        alignmentTimeRef.current = 0;
        setAlignmentProgress(0);
      }

      // Update trip effect
      if (trippingRef.current) {
        // Use elapsed time since trip started (in seconds)
        const elapsedSeconds = (currentTime - tripStartTime) / 1000;
        tripShaderMaterial.uniforms.time.value = elapsedSeconds;
        tripShaderMaterial.uniforms.intensity.value = Math.min(1, tripShaderMaterial.uniforms.intensity.value + deltaTime * 0.5);
        
        // Debug: log time value occasionally
        if (currentTime % 2000 < 16) {
          console.log('Shader time:', elapsedSeconds.toFixed(3), 'intensity:', tripShaderMaterial.uniforms.intensity.value.toFixed(3));
        }
      } else {
        tripShaderMaterial.uniforms.intensity.value = Math.max(0, tripShaderMaterial.uniforms.intensity.value - deltaTime * 2);
      }

      // Render with or without post-processing
      if (trippingRef.current || tripShaderMaterial.uniforms.intensity.value > 0.01) {
        // Render to texture
        renderer.setRenderTarget(renderTarget);
        renderer.render(scene, activeCamera);

        // Apply post-processing
        tripShaderMaterial.uniforms.tDiffuse.value = renderTarget.texture;
        renderer.setRenderTarget(null);
        renderer.render(tripScene, tripCamera);

        // Portal glow overlay (additive, on top of trip effect)
        if (portalOverlayQuad.visible) {
          renderer.autoClear = false;
          renderer.render(portalOverlayScene, portalOverlayCamera);
          renderer.autoClear = true;
        }
      } else {
        // Normal render
        renderer.render(scene, activeCamera);
      }
    };
    animate();

    // Finish button handler (via custom event from React onClick)
    const finishHandler = () => {
      if (!gameStateRef.current.completionMethod) {
        gameStateRef.current.completionMethod = 'early';
      }
      finishGame();
    };
    window.addEventListener('museum-finish', finishHandler);

    // Cleanup
    return () => {
      window.removeEventListener('gamepadconnected', onGamepadConnected);
      window.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('pointerlockerror', onPointerLockError);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      
      if (mobile) {
        renderer.domElement.removeEventListener('touchstart', onTouchStart);
        renderer.domElement.removeEventListener('touchmove', onTouchMove);
        renderer.domElement.removeEventListener('touchend', onTouchEnd);
      }

      window.removeEventListener('museum-finish', finishHandler);

      if (document.pointerLockElement) {
        document.exitPointerLock();
      }

      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [onComplete]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* Instructions overlay */}
      {instructions && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            color: 'white',
            textAlign: 'center',
            maxWidth: '600px',
            padding: '40px',
            fontFamily: 'system-ui, sans-serif'
          }}>
            <h2 style={{ fontSize: '2rem', fontWeight: '300', marginBottom: '20px' }}>
              museum
            </h2>
            <p style={{ opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
              {isMobile 
                ? 'Touch left side to move, right side to look around. Tap art pieces to examine them.'
                : 'Click and drag to look around. WASD to move. Click art pieces to examine them. Gamepad supported!'
              }
            </p>
            <button
              onClick={() => setInstructions(false)}
              style={{
                padding: '12px 32px',
                background: 'white',
                color: 'black',
                border: 'none',
                fontSize: '1rem',
                fontWeight: '300',
                cursor: 'pointer',
                letterSpacing: '1px'
              }}
            >
              enter museum
            </button>
          </div>
        </div>
      )}

      {/* Completion summary overlay */}
      {completionResults && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200
        }}>
          <div style={{
            color: 'white',
            textAlign: 'center',
            maxWidth: '500px',
            padding: '40px',
            fontFamily: 'system-ui, sans-serif'
          }}>
            <h2 style={{ fontSize: '2rem', fontWeight: '300', marginBottom: '24px' }}>
              {completionResults.completionMethod === 'trip' ? 'transcendence achieved'
                : completionResults.completionMethod === 'sober' ? 'exhibition complete'
                : 'museum visited'}
            </h2>
            <div style={{ opacity: 0.7, lineHeight: '2', fontSize: '15px', marginBottom: '30px' }}>
              <div>Art pieces examined: {completionResults.uniqueDescriptions} / 15</div>
              <div>Completion: {completionResults.completionMethod === 'trip' ? 'psychedelic portal'
                : completionResults.completionMethod === 'sober' ? 'full gallery tour'
                : 'early departure'}</div>
              <div>Openness score: {Math.round(completionResults.abstractnessLevel * 100)}%</div>
            </div>
            <button
              onClick={() => {
                if (onComplete && typeof onComplete === 'function') {
                  onComplete(completionResults);
                }
              }}
              style={{
                padding: '14px 40px',
                background: 'white',
                color: 'black',
                border: 'none',
                fontSize: '1rem',
                fontWeight: '300',
                cursor: 'pointer',
                letterSpacing: '1px'
              }}
            >
              continue
            </button>
          </div>
        </div>
      )}

      {/* UI overlay */}
      {!instructions && !completionResults && (
        <>
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            color: 'white',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
            opacity: 0.6
          }}>
            <div>
              Art examined: {examinedCount - (gameStateRef.current.artPiecesExamined.has('tripButton') ? 1 : 0) - (gameStateRef.current.artPiecesExamined.has('tripPortal') ? 1 : 0)} / 15
              {examinedCount - (gameStateRef.current.artPiecesExamined.has('tripButton') ? 1 : 0) - (gameStateRef.current.artPiecesExamined.has('tripPortal') ? 1 : 0) >= 15 && !isTripping && (
                <span style={{ color: '#00ff00', marginLeft: '10px' }}>✓ Complete!</span>
              )}
            </div>
            <div style={{ marginTop: '5px', fontSize: '12px', opacity: 0.5 }}>
              {isMobile 
                ? 'Left: move | Right: look' 
                : gamepadConnected 
                  ? '🎮 Gamepad connected | Left stick: move | Right stick: look | A: interact'
                  : 'Click + drag to look | WASD to move'}
            </div>
            {gamepadConnected && (
              <button
                onClick={() => setInvertY(!invertY)}
                style={{
                  marginTop: '8px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  background: invertY ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: 'white',
                  cursor: 'pointer',
                  fontFamily: 'system-ui, sans-serif'
                }}
              >
                Y-Axis: {invertY ? 'Inverted' : 'Normal'}
              </button>
            )}
            {isTripping && (
              <div style={{ 
                marginTop: '8px', 
                fontSize: '16px', 
                opacity: 1.0, 
                color: '#ffffff', 
                fontWeight: 'bold',
                textShadow: '0 0 10px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)'
              }}>
                ✨ reality.exe has stopped working ✨
              </div>
            )}
          </div>

          {/* Alignment text - centered and large */}
          {isTripping && isAligned && (
            <div style={{
              position: 'absolute',
              top: '40%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#00ffff',
              fontSize: '48px',
              fontWeight: 'bold',
              textShadow: '0 0 20px rgba(0,255,255,1), 0 0 40px rgba(0,255,255,0.8)',
              fontFamily: 'system-ui, sans-serif',
              pointerEvents: 'none'
            }}>
              Alignment: {Math.round(alignmentProgress)}%
            </div>
          )}

          {/* Crosshair (only show on desktop when pointer locked) */}
          {!isMobile && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none'
            }}>
              <div style={{
                width: '20px',
                height: '2px',
                background: interactPrompt ? 'rgba(255,255,100,0.8)' : 'rgba(255,255,255,0.5)',
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)'
              }} />
              <div style={{
                width: '2px',
                height: '20px',
                background: interactPrompt ? 'rgba(255,255,100,0.8)' : 'rgba(255,255,255,0.5)',
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)'
              }} />
            </div>
          )}

          {/* Button vignette overlay */}
          {buttonVignette > 0.01 && (
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              pointerEvents: 'none',
              background: `radial-gradient(ellipse at center, transparent ${30 - buttonVignette * 15}%, rgba(0,0,0,${buttonVignette * 0.7}) ${60 - buttonVignette * 20}%, rgba(0,0,0,${buttonVignette * 0.95}) 100%)`,
            }} />
          )}

          {/* Interact prompt */}
          {interactPrompt && (
            <div style={{
              position: 'absolute',
              top: '58%',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(255,255,200,0.9)',
              fontSize: '14px',
              fontFamily: 'system-ui, sans-serif',
              fontWeight: '300',
              textShadow: '0 0 8px rgba(0,0,0,0.8)',
              pointerEvents: 'none',
              letterSpacing: '1px'
            }}>
              {interactPrompt.inputHint}
            </div>
          )}

          <button
            onClick={() => {
              if (!gameStateRef.current.completionMethod) {
                gameStateRef.current.completionMethod = 'early';
              }
              // Release pointer lock before finishing
              if (document.pointerLockElement) {
                document.exitPointerLock();
              }
              // Trigger finishGame via a custom event since finishGame is inside useEffect
              window.dispatchEvent(new CustomEvent('museum-finish'));
            }}
            style={{
              position: 'absolute',
              bottom: '30px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '12px 32px',
              background: 'white',
              color: 'black',
              border: 'none',
              fontSize: '14px',
              fontWeight: '300',
              cursor: 'pointer',
              letterSpacing: '1px',
              opacity: 0.9
            }}
          >
            leave museum
          </button>

          {/* Mobile joystick indicator */}
          {isMobile && (
            <div style={{
              position: 'absolute',
              bottom: '100px',
              left: '40px',
              width: '80px',
              height: '80px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderRadius: '50%',
              pointerEvents: 'none'
            }}>
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '30px',
                height: '30px',
                background: 'rgba(255,255,255,0.4)',
                borderRadius: '50%'
              }} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WanderingMuseum;