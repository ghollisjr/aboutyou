import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AudioManager } from './src/lib/audio.js';

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
  const [screenFade, setScreenFade] = useState(0); // 0 = clear, 1 = black
  const screenFadeRef = useRef(0);
  const screenFadeTargetRef = useRef(0);
  const [interactPrompt, setInteractPrompt] = useState(null); // { name, inputHint }
  const [lookingAtRing, setLookingAtRing] = useState(false);
  const lookingAtRingRef = useRef(false);
  const [buttonVignette, setButtonVignette] = useState(0); // 0-1 intensity
  const buttonVignetteRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [showFps, setShowFps] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [qualityToast, setQualityToast] = useState(null);
  const fpsDataRef = useRef({ frames: 0, lastTime: 0, value: 0, frameTimeMs: 0 });
  const fpsDisplayRef = useRef(null);
  const qualityRef = useRef('high');
  const totalArtRef = useRef(0);
  const audioManagerRef = useRef(null);
  const enterGameRef = useRef(null);
  const [masterVolume, setMasterVolume] = useState(0.5);
  
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
    const widthSteps = 6;
    const vertices = [];
    const indices = [];
    const uvs = [];

    // Subtle ripple along the length of the strip
    const rippleWaves = 5;    // undulations around the loop
    const rippleAmp = 0.04;   // small displacement

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      for (let j = 0; j <= widthSteps; j++) {
        const t = (j / widthSteps - 0.5) * width;
        // Standard Möbius
        const r = radius + t * Math.cos(theta / 2);
        let x = r * Math.cos(theta);
        let y = r * Math.sin(theta);
        let z = t * Math.sin(theta / 2);

        // Ripple along theta, displaced in the surface normal direction
        const ripple = rippleAmp * Math.sin(theta * rippleWaves);
        const nx = -Math.sin(theta / 2) * Math.cos(theta);
        const ny = -Math.sin(theta / 2) * Math.sin(theta);
        const nz = Math.cos(theta / 2);
        x += ripple * nx;
        y += ripple * ny;
        z += ripple * nz;

        vertices.push(x, z, y); // swap y/z so strip is horizontal
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
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    return geometry;
  }

  function createKleinBottle(scale = 1, uSegments = 60, vSegments = 30) {
    // Figure-8 Klein bottle immersion — shows the self-intersection clearly
    // u in [0, 2π], v in [0, 2π]
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const uvs = [];

    const aa = 2; // radius scaling (smaller = more visible figure-8 proportions)

    for (let i = 0; i <= uSegments; i++) {
      const u = (i / uSegments) * Math.PI * 2;

      for (let j = 0; j <= vSegments; j++) {
        const v = (j / vSegments) * Math.PI * 2;

        const cosV2 = Math.cos(v / 2), sinV2 = Math.sin(v / 2);
        const sinU = Math.sin(u), sin2U = Math.sin(2 * u);
        const cosV = Math.cos(v), sinV = Math.sin(v);

        const r = aa + cosV2 * sinU - sinV2 * sin2U;
        const x = r * cosV;
        const y = r * sinV;
        const z = (sinV2 * sinU + cosV2 * sin2U) * 2.0; // stretch height to show figure-8

        vertices.push(x * scale, z * scale, y * scale);
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
    const mat = material || new THREE.MeshStandardMaterial({
      color: 0xeeeeff,
      roughness: 0.2,
      metalness: 0.6
    });

    // Real Utah Teapot from Martin Newell's Bezier patch data
    // size, segments, bottom, lid, body, fitLid, blinn
    const geom = new TeapotGeometry(scale, 15, true, true, true, true, true);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.material.side = THREE.DoubleSide;
    return mesh;
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

    // Regular tetrahedron vertices with base parallel to floor (XZ plane)
    // Circumscribed on unit sphere, centered at origin
    const v0 = [0, 1, 0];                                         // apex
    const v1 = [0, -1/3, 2*Math.sqrt(2)/3];                       // base front
    const v2 = [-Math.sqrt(6)/3, -1/3, -Math.sqrt(2)/3];          // base back-left
    const v3 = [Math.sqrt(6)/3, -1/3, -Math.sqrt(2)/3];           // base back-right
    const verts = [v0, v1, v2, v3];

    // Collect leaf tetrahedra positions and sizes
    const leaves = [];
    function subdivide(cx, cy, cz, s, lvl) {
      if (lvl === 0) {
        leaves.push({ x: cx, y: cy, z: cz, s });
        return;
      }
      const hs = s / 2;
      // Place 4 sub-tetrahedra at the 4 vertex directions, each offset by s/2
      for (const v of verts) {
        subdivide(
          cx + v[0] * hs,
          cy + v[1] * hs,
          cz + v[2] * hs,
          hs, lvl - 1
        );
      }
    }
    subdivide(0, 0, 0, size, level);

    // Build each leaf as a custom tetrahedron with matching orientation
    const geoms = leaves.map(p => {
      const g = new THREE.BufferGeometry();
      const s = p.s;
      // Vertices of this tetrahedron
      const tv = verts.map(v => [p.x + v[0] * s, p.y + v[1] * s, p.z + v[2] * s]);
      // 4 triangular faces (CCW winding from outside)
      const faces = [
        [tv[0], tv[1], tv[2]],
        [tv[0], tv[2], tv[3]],
        [tv[0], tv[3], tv[1]],
        [tv[1], tv[3], tv[2]],
      ];
      const pos = [];
      const normals = [];
      for (const [a, b, c] of faces) {
        const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
        const ac = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
        const n = [
          ab[1]*ac[2] - ab[2]*ac[1],
          ab[2]*ac[0] - ab[0]*ac[2],
          ab[0]*ac[1] - ab[1]*ac[0],
        ];
        const len = Math.sqrt(n[0]*n[0] + n[1]*n[1] + n[2]*n[2]);
        n[0] /= len; n[1] /= len; n[2] /= len;
        pos.push(...a, ...b, ...c);
        normals.push(...n, ...n, ...n);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
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
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mat2 = new THREE.MeshStandardMaterial({
      color: 0xff44aa,
      transparent: true,
      opacity: 0.6,
      roughness: 0.2,
      metalness: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false
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
    mesh2.scale.set(-1, -1, -1); // Invert through origin to get dual tetrahedron
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

  function createCinquefoilKnot(tubularSegments = 128, radialSegments = 16) {
    class CinquefoilCurve extends THREE.Curve {
      getPoint(t) {
        const s = t * Math.PI * 2;
        // (2,5) torus knot — cinquefoil
        const r = 2 + Math.cos(5 * s);
        const x = r * Math.cos(2 * s);
        const y = r * Math.sin(2 * s);
        const z = -Math.sin(5 * s);
        return new THREE.Vector3(x, y, z).multiplyScalar(0.3);
      }
    }

    const path = new CinquefoilCurve();
    const geometry = new THREE.TubeGeometry(path, tubularSegments, 0.08, radialSegments, true);
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



  function createGyroid(scale = 0.8, resolution = 30) {
    // Marching cubes isosurface extraction of the gyroid:
    // cos(x)sin(y) + cos(y)sin(z) + cos(z)sin(x) = 0
    const gridSize = resolution;
    const domain = 2 * Math.PI;
    const step = domain / gridSize;

    function gyroidField(x, y, z) {
      return Math.cos(x) * Math.sin(y) + Math.cos(y) * Math.sin(z) + Math.cos(z) * Math.sin(x);
    }

    function gyroidGradient(x, y, z) {
      const nx = -Math.sin(x) * Math.sin(y) + Math.cos(z) * Math.cos(x);
      const ny = Math.cos(x) * Math.cos(y) - Math.sin(y) * Math.sin(z);
      const nz = Math.cos(y) * Math.cos(z) - Math.sin(z) * Math.sin(x);
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      return [nx / len, ny / len, nz / len];
    }

    // Marching tetrahedra: split each cube into 6 tetrahedra, extract triangles
    // More robust than marching cubes, no lookup table needed
    const n = gridSize + 1;
    const origin = -domain / 2;

    // Sample field
    const field = new Float32Array(n * n * n);
    for (let iz = 0; iz < n; iz++)
      for (let iy = 0; iy < n; iy++)
        for (let ix = 0; ix < n; ix++)
          field[iz * n * n + iy * n + ix] = gyroidField(origin + ix * step, origin + iy * step, origin + iz * step);

    const getField = (ix, iy, iz) => field[iz * n * n + iy * n + ix];
    const getPos = (ix, iy, iz) => [origin + ix * step, origin + iy * step, origin + iz * step];

    const vertices = [];
    const normals = [];

    // Interpolate zero crossing between two points
    function interpVertex(p0, v0, p1, v1) {
      const t = v0 / (v0 - v1);
      const x = p0[0] + t * (p1[0] - p0[0]);
      const y = p0[1] + t * (p1[1] - p0[1]);
      const z = p0[2] + t * (p1[2] - p0[2]);
      return [x, y, z];
    }

    // Process one tetrahedron: 4 vertices with positions and field values
    function processTetra(p, v) {
      // Classify vertices as inside (< 0) or outside (>= 0)
      let idx = 0;
      for (let i = 0; i < 4; i++) if (v[i] < 0) idx |= (1 << i);
      if (idx === 0 || idx === 15) return; // all same sign

      // Generate triangles for each of the 14 non-trivial cases
      // By symmetry, we only need to handle idx <= 7 (complement gives flipped winding)
      let flip = false;
      if (idx > 7) { idx = 15 - idx; flip = true; }

      const emitTri = (a, b, c) => {
        const s = scale / (domain / 2);
        const pts = flip ? [c, b, a] : [a, b, c];
        for (const pt of pts) {
          vertices.push(pt[0] * s, pt[1] * s, pt[2] * s);
          const grad = gyroidGradient(pt[0], pt[1], pt[2]);
          normals.push(grad[0], grad[1], grad[2]);
        }
      };

      // Cases by number of inside vertices (1, 2, or 3 via complement)
      if (idx === 1) { // vertex 0 inside
        emitTri(interpVertex(p[0],v[0],p[1],v[1]), interpVertex(p[0],v[0],p[2],v[2]), interpVertex(p[0],v[0],p[3],v[3]));
      } else if (idx === 2) { // vertex 1 inside
        emitTri(interpVertex(p[1],v[1],p[0],v[0]), interpVertex(p[1],v[1],p[3],v[3]), interpVertex(p[1],v[1],p[2],v[2]));
      } else if (idx === 4) { // vertex 2 inside
        emitTri(interpVertex(p[2],v[2],p[0],v[0]), interpVertex(p[2],v[2],p[1],v[1]), interpVertex(p[2],v[2],p[3],v[3]));
      } else if (idx === 8 - 8) { /* handled by complement */ }
      else if (idx === 3) { // vertices 0,1 inside
        const a = interpVertex(p[0],v[0],p[2],v[2]);
        const b = interpVertex(p[0],v[0],p[3],v[3]);
        const c = interpVertex(p[1],v[1],p[3],v[3]);
        const d = interpVertex(p[1],v[1],p[2],v[2]);
        emitTri(a, b, c); emitTri(a, c, d);
      } else if (idx === 5) { // vertices 0,2 inside
        const a = interpVertex(p[0],v[0],p[1],v[1]);
        const b = interpVertex(p[0],v[0],p[3],v[3]);
        const c = interpVertex(p[2],v[2],p[3],v[3]);
        const d = interpVertex(p[2],v[2],p[1],v[1]);
        emitTri(a, b, c); emitTri(a, c, d);
      } else if (idx === 6) { // vertices 1,2 inside
        const a = interpVertex(p[1],v[1],p[0],v[0]);
        const b = interpVertex(p[1],v[1],p[3],v[3]);
        const c = interpVertex(p[2],v[2],p[3],v[3]);
        const d = interpVertex(p[2],v[2],p[0],v[0]);
        emitTri(a, b, c); emitTri(a, c, d);
      } else if (idx === 7) { // vertices 0,1,2 inside (vertex 3 outside)
        emitTri(interpVertex(p[0],v[0],p[3],v[3]), interpVertex(p[2],v[2],p[3],v[3]), interpVertex(p[1],v[1],p[3],v[3]));
      }
    }

    // Cube corner indices (local)
    const cubeCorners = [
      [0,0,0],[1,0,0],[1,1,0],[0,1,0],
      [0,0,1],[1,0,1],[1,1,1],[0,1,1]
    ];
    // 6 tetrahedra decomposition of a cube (consistent orientation)
    const tetIndices = [
      [0,1,3,5],[1,2,3,5],[2,3,5,6],[3,5,6,7],[0,3,4,5],[3,4,5,7]
    ];

    for (let iz = 0; iz < gridSize; iz++) {
      for (let iy = 0; iy < gridSize; iy++) {
        for (let ix = 0; ix < gridSize; ix++) {
          // Get 8 corner positions and field values
          const cPos = cubeCorners.map(c => getPos(ix+c[0], iy+c[1], iz+c[2]));
          const cVal = cubeCorners.map(c => getField(ix+c[0], iy+c[1], iz+c[2]));

          // Process 6 tetrahedra
          for (const tet of tetIndices) {
            processTetra(
              [cPos[tet[0]], cPos[tet[1]], cPos[tet[2]], cPos[tet[3]]],
              [cVal[tet[0]], cVal[tet[1]], cVal[tet[2]], cVal[tet[3]]]
            );
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

    const material = new THREE.MeshStandardMaterial({
      color: 0x8844dd,
      roughness: 0.3,
      metalness: 0.5,
      side: THREE.DoubleSide
    });

    return new THREE.Mesh(geometry, material);
  }

  function createTesseract(scale = 1.0) {
    // 4D hypercube vertices: all combinations of ±1 in 4 dimensions
    const verts4D = [];
    for (let i = 0; i < 16; i++) {
      verts4D.push([
        (i & 1) ? 1 : -1,
        (i & 2) ? 1 : -1,
        (i & 4) ? 1 : -1,
        (i & 8) ? 1 : -1,
      ]);
    }

    // Edges: connect vertices that differ in exactly one coordinate
    const edges = [];
    for (let i = 0; i < 16; i++) {
      for (let j = i + 1; j < 16; j++) {
        let diff = 0;
        for (let k = 0; k < 4; k++) {
          if (verts4D[i][k] !== verts4D[j][k]) diff++;
        }
        if (diff === 1) edges.push([i, j]);
      }
    }

    // Project 4D → 3D using perspective projection from w
    function project(v4, angle1, angle2) {
      // Rotate in xw and yw planes
      const cosA = Math.cos(angle1), sinA = Math.sin(angle1);
      const cosB = Math.cos(angle2), sinB = Math.sin(angle2);

      // Rotate xw plane
      let x = v4[0] * cosA - v4[3] * sinA;
      let w = v4[0] * sinA + v4[3] * cosA;
      // Rotate yw plane
      let y = v4[1] * cosB - w * sinB;
      w = v4[1] * sinB + w * cosB;

      let z = v4[2];

      // Perspective projection from 4D (camera at w=4)
      const d = 3;
      const perspScale = d / (d - w);
      return {
        x: x * perspScale * scale,
        y: y * perspScale * scale,
        z: z * perspScale * scale,
        w: w, // store for coloring
      };
    }

    const group = new THREE.Group();

    // Create small spheres at each vertex
    const sphereGeom = new THREE.SphereGeometry(0.06 * scale, 8, 6);
    const vertexMeshes = [];
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x44aaff,
        emissive: 0x2266cc,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.8,
      });
      const sphere = new THREE.Mesh(sphereGeom, mat);
      group.add(sphere);
      vertexMeshes.push(sphere);
    }

    // Create edges using Line2 fat lines for visible thickness
    const edgePositions = new Float32Array(edges.length * 6); // 2 verts × 3 coords per edge
    const edgeGeometry = new LineSegmentsGeometry();
    edgeGeometry.setPositions(edgePositions);
    const edgeMaterial = new LineMaterial({
      color: 0x88ccff,
      linewidth: 3, // pixels
      transparent: true,
      opacity: 0.8,
    });
    const edgeLines = new LineSegments2(edgeGeometry, edgeMaterial);
    group.add(edgeLines);

    // Update function called each frame
    group.userData.updateTesseract = (time, resolution) => {
      const angle1 = time * 0.3; // xw rotation
      const angle2 = time * 0.2; // yw rotation

      // LineMaterial needs resolution to compute screen-space width
      if (resolution) edgeMaterial.resolution.copy(resolution);

      const projected = verts4D.map(v => project(v, angle1, angle2));

      // Update vertex positions and colors
      for (let i = 0; i < 16; i++) {
        const p = projected[i];
        vertexMeshes[i].position.set(p.x, p.y, p.z);
        // Color by w depth: blue (far) → cyan (near)
        const t = (p.w + 1) / 2; // normalize -1..1 → 0..1
        vertexMeshes[i].material.color.setHSL(0.55 - t * 0.1, 0.8, 0.4 + t * 0.3);
        vertexMeshes[i].material.emissive.setHSL(0.55 - t * 0.1, 0.8, 0.2 + t * 0.15);
      }

      // Update edge positions
      const pos = new Float32Array(edges.length * 6);
      for (let e = 0; e < edges.length; e++) {
        const [i, j] = edges[e];
        const pi = projected[i], pj = projected[j];
        pos[e * 6 + 0] = pi.x; pos[e * 6 + 1] = pi.y; pos[e * 6 + 2] = pi.z;
        pos[e * 6 + 3] = pj.x; pos[e * 6 + 4] = pj.y; pos[e * 6 + 5] = pj.z;
      }
      edgeGeometry.setPositions(pos);
    };

    // Initial projection
    group.userData.updateTesseract(0);

    return group;
  }

  // Extracted museum init so useEffect can defer it
  const initMuseum = (mobile) => {
    // Lock to landscape on mobile
    // Landscape lock on mobile
    if (mobile && screen.orientation?.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }

    // Auto-detect quality level
    if (mobile || navigator.hardwareConcurrency <= 4) qualityRef.current = 'medium';
    if (navigator.hardwareConcurrency <= 2) qualityRef.current = 'low';

    const qualitySettings = {
      high: {
        sierpinskiLevel: 4, mengerLevel: 3,
        romanescoMaxDepth: 3,
        gyroidResolution: 30,        torusKnotTubular: 128, torusKnotRadial: 32,
        trefoilTubular: 128, trefoilRadial: 16,
        kleinU: 60, kleinV: 30,
        mobiusSegments: 100,
        wireframes: true, pixelRatio: mobile ? Math.min(window.devicePixelRatio, 2) : window.devicePixelRatio, antialias: !mobile
      },
      medium: {
        sierpinskiLevel: 3, mengerLevel: 2,
        romanescoMaxDepth: 2,
        gyroidResolution: 20,        torusKnotTubular: 64, torusKnotRadial: 16,
        trefoilTubular: 64, trefoilRadial: 8,
        kleinU: 30, kleinV: 15,
        mobiusSegments: 50,
        wireframes: true, pixelRatio: Math.min(window.devicePixelRatio, 1.5), antialias: false
      },
      low: {
        sierpinskiLevel: 2, mengerLevel: 1,
        romanescoMaxDepth: 1,
        gyroidResolution: 12,        torusKnotTubular: 32, torusKnotRadial: 8,
        trefoilTubular: 32, trefoilRadial: 8,
        kleinU: 16, kleinV: 10,
        mobiusSegments: 24,
        wireframes: false, pixelRatio: 1.0, antialias: false
      }
    };
    // Start mobile at medium quality to avoid high-DPI performance issues
    if (mobile && qualityRef.current === 'high') qualityRef.current = 'medium';
    const q = qualitySettings[qualityRef.current];

    // Three.js setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 25, 65);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: q.antialias });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(q.pixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    // Post-processing for trip effect
    const tripShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        intensity: { value: 0 },
        // Ring rendering via cylindrical projection (360° visibility)
        ringPos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
        ringCol: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
        ringRad: { value: [0, 0, 0, 0, 0] },
        ringOpacity: { value: 0.0 },
        ringAligned: { value: 0.0 },
        camPos: { value: new THREE.Vector3() },
        camRotInv: { value: new THREE.Matrix3() },
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
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float intensity;
        uniform vec3 ringPos[5];
        uniform vec3 ringCol[5];
        uniform float ringRad[5];
        uniform float ringOpacity;
        uniform float ringAligned;
        uniform vec3 camPos;
        uniform mat3 camRotInv;
        uniform vec2 resolution;
        varying vec2 vUv;

        #define PI 3.14159265

        // Smooth pseudo-noise via layered sin
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p = rot * p * 2.0;
            a *= 0.5;
          }
          return v;
        }

        // HSV hue to RGB (full saturation, full value)
        vec3 hueToRGB(float h) {
          return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        }

        void main() {
          vec2 uv = vUv;
          float aspect = resolution.x / resolution.y;

          // Center and aspect-correct
          vec2 p = (uv - 0.5) * 2.0;
          p.x *= aspect;

          // Polar coordinates
          float dist = length(p);
          float angle = atan(p.y, p.x);

          // Kaleidoscope: fold angle into N segments (tighter)
          float segments = 8.0;
          float ka = mod(angle, 2.0 * PI / segments);
          ka = abs(ka - PI / segments);
          vec2 kp = vec2(cos(ka), sin(ka)) * dist;

          // Tunnel: scroll radial coordinate inward over time
          float tunnel = 1.0 / (dist + 0.1) + time * 0.8;

          // Domain warp: distort coordinates with fbm (tighter patterns)
          vec2 warpUV = kp * 5.0 + vec2(tunnel, time * 0.3);
          float warp1 = fbm(warpUV);
          float warp2 = fbm(warpUV + vec2(warp1 * 2.0 + time * 0.2, warp1 * 1.5 - time * 0.15));

          // Full-spectrum color via rotating hue
          // Map warp values + time into hue angles that sweep the full color wheel
          float hue = fract(warp2 * 0.8 + time * 0.06);
          float hue2 = fract(warp1 * 0.6 - time * 0.04 + 0.33);
          float hue3 = fract((warp1 + warp2) * 0.5 + time * 0.08 + 0.66);

          vec3 col1 = hueToRGB(hue);
          vec3 col2 = hueToRGB(hue2);
          vec3 col3 = hueToRGB(hue3);

          // Mixing weights with deeper dark fluctuations
          float h1 = sin(warp2 * 8.0 + time * 1.2) * 0.5 + 0.5;
          float h2 = sin(warp2 * 6.0 - time * 0.8 + 2.0) * 0.5 + 0.5;
          float h3 = sin(warp1 * 7.0 + time * 0.6 + 4.0) * 0.5 + 0.5;

          // Dark pulse: periodically dips brightness toward black
          float darkPulse = sin(time * 0.7) * sin(time * 1.3 + warp1 * 3.0);
          float darkness = smoothstep(-0.2, -0.8, darkPulse); // 0 = normal, 1 = dark

          vec3 background = mix(col1 * 0.7, col2 * 0.8, h1);
          background = mix(background, col3 * 0.6, h2 * 0.5);
          // Apply dark fluctuation
          background *= mix(1.0, 0.08, darkness);

          // Add tunnel radial glow
          float tunnelGlow = exp(-dist * 1.5) * (sin(tunnel * 4.0) * 0.3 + 0.5);
          background += hueToRGB(fract(hue + 0.5)) * 0.3 * tunnelGlow * mix(1.0, 0.15, darkness);

          // Moiré interference (tighter)
          float moire = sin(dist * 50.0 - time * 4.0) * sin(angle * 12.0 + time * 2.0);
          background += vec3(0.06) * moire * mix(1.0, 0.1, darkness);

          // Scene texture (used during transition)
          vec4 sceneColor = texture2D(tDiffuse, uv);
          float sceneBrightness = dot(sceneColor.rgb, vec3(0.299, 0.587, 0.114));

          // Hemispheric projection: map screen to ±90° viewing angles
          // Rings behind the camera are reflected to front hemisphere
          vec2 centered = (uv - 0.5) * 2.0;
          float angScale = PI * 0.5;  // ±90° coverage
          float pixelYaw = centered.x * angScale;
          float pixelPitch = centered.y * angScale / aspect;

          // Draw rings via hemispheric projection — portal style with oscillation
          vec3 ringGlow = vec3(0.0);   // additive glow accumulator
          float portalInside = 0.0;    // how many rings enclose this pixel (portal interior)
          float ringBand = 0.0;        // ring edge brightness

          if (ringOpacity > 0.01) {
            for (int i = 0; i < 5; i++) {
              vec3 toRing = ringPos[i] - camPos;
              vec3 localDir = camRotInv * toRing;
              float dist = length(toRing);

              // Reflect behind-camera rings to front hemisphere
              if (localDir.z > 0.0) {
                localDir.x = -localDir.x;
                localDir.z = -localDir.z;
              }

              // Angular position with per-ring oscillation
              float fi = float(i);
              float rYaw = atan(localDir.x, -localDir.z)
                + sin(time * 1.7 + fi * 2.3) * 0.008
                + sin(time * 3.1 + fi * 1.1) * 0.004;
              float rPitch = atan(localDir.y, length(vec2(localDir.x, localDir.z)))
                + cos(time * 2.1 + fi * 1.7) * 0.006;

              // Angular radius with breathing
              float breathe = 1.0 + sin(time * 1.5 + fi * 1.3) * 0.06;
              float aRad = atan(ringRad[i], dist) * breathe;
              float aThick = atan(0.12, dist);

              // Angular distance from this pixel to ring center
              float dYaw = rYaw - pixelYaw;
              float dPitch = rPitch - pixelPitch;
              float aDist = sqrt(dYaw * dYaw + dPitch * dPitch);

              // Ring band — glowing edge with soft falloff
              float edge = abs(aDist - aRad);
              float ring = smoothstep(aThick * 1.5, 0.0, edge);

              // Outer glow halo
              float halo = exp(-edge * edge / (aThick * aThick * 8.0)) * 0.4;

              // Per-ring pulse when aligned
              float pulse = 1.0;
              if (ringAligned > 0.5) {
                pulse = sin(time * 10.0 + fi) * 0.3 + 0.7;
              }

              // Additive color contribution (rings blend together)
              vec3 col = ringCol[i];
              ringGlow += col * (ring + halo) * pulse * ringOpacity;

              // Track if pixel is inside this ring (for portal interior)
              if (aDist < aRad) {
                portalInside += smoothstep(aRad, aRad * 0.5, aDist) * ringOpacity * pulse;
              }
            }
          }

          // Portal interior swirl — visible where rings overlap
          float swirlAngle = atan(centered.y, centered.x);
          float swirlDist = length(centered);
          float swirl = sin(swirlAngle * 3.0 - time * 4.0 + swirlDist * 6.0) * 0.5 + 0.5;
          float swirl2 = sin(swirlAngle * 5.0 + time * 3.0 - swirlDist * 8.0) * 0.5 + 0.5;
          vec3 portalSwirl = mix(
            vec3(0.3, 0.1, 0.6),
            vec3(0.1, 0.8, 1.0),
            swirl * swirl2
          );
          // Portal interior intensifies with overlap count — 1 ring = subtle, 5 = full portal
          float portalStrength = smoothstep(1.0, 4.0, portalInside);

          // Blend scene and background based on intensity
          vec3 base = mix(
            mix(background, sceneColor.rgb * 2.5, smoothstep(0.01, 0.15, sceneBrightness)),
            background,
            intensity
          );

          // Layer: base → portal interior → ring glow
          vec3 finalColor = mix(base, portalSwirl * 1.5, portalStrength * 0.6);
          finalColor += ringGlow * 2.0;

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `
    });

    // Render target for post-processing
    const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
    const warpTripTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
    const tripScene = new THREE.Scene();
    const tripCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tripQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      tripShaderMaterial
    );
    tripScene.add(tripQuad);

    // Bloom post-processing
    const bloomComposer = new EffectComposer(renderer);
    const bloomRenderPass = new RenderPass(scene, camera);
    bloomComposer.addPass(bloomRenderPass);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.25, // strength
      0.4,  // radius
      0.9   // threshold
    );
    bloomComposer.addPass(bloomPass);
    bloomComposer.addPass(new OutputPass());

    // Trip bloom composer (renders trip quad through bloom)
    const tripBloomComposer = new EffectComposer(renderer);
    const tripBloomRenderPass = new RenderPass(tripScene, tripCamera);
    tripBloomComposer.addPass(tripBloomRenderPass);
    const tripBloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.25, 0.4, 0.9
    );
    tripBloomComposer.addPass(tripBloomPass);
    tripBloomComposer.addPass(new OutputPass());

    const useBloom = () => qualityRef.current !== 'low';

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

    // Ceiling - dark plane overhead; transforms into starfield after 4 art activations
    const ceilingGeometry = new THREE.PlaneGeometry(40, 40);
    const ceilingMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime:   { value: 0.0 },
        uReveal: { value: 0.0 },
        uCamPos: { value: new THREE.Vector3() }
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uReveal;
        uniform vec3  uCamPos;
        varying vec3  vWorldPos;

        // Hash helpers
        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        vec2 hash22(vec2 p) {
          float n = hash21(p);
          return vec2(n, hash21(p + n));
        }

        // Smooth noise
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        // 4-octave FBM
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p = rot * p * 2.0;
            a *= 0.5;
          }
          return v;
        }

        // Star layer — uses direction on sky dome, not surface UVs
        float starLayer(vec2 dir, float scale, float seed) {
          vec2 gv = fract(dir * scale) - 0.5;
          vec2 id = floor(dir * scale);
          float d = length(gv - (hash22(id + seed) - 0.5) * 0.7);
          float brightness = hash21(id + seed + 77.0);
          float starMask = step(0.7, brightness);
          float twinkle = sin(uTime * (1.5 + brightness * 3.0) + brightness * 6.28) * 0.5 + 0.5;
          float size = mix(0.015, 0.045, brightness);
          float star = smoothstep(size, 0.0, d) * starMask;
          star *= mix(0.4, 1.5, brightness) * mix(0.5, 1.0, twinkle);
          return star;
        }

        void main() {
          // Base dark color — nearly black to match lit MeshStandardMaterial look
          vec3 baseColor = vec3(0.02, 0.02, 0.03);

          // View direction projected onto sky dome (infinite distance)
          vec3 viewDir = normalize(vWorldPos - uCamPos);
          // Use spherical-ish mapping: xz direction as sky coordinates
          // This makes stars fixed in world space like a real sky
          vec2 skyUV = viewDir.xz / (abs(viewDir.y) + 0.001);

          // Stars — three density layers
          float stars = 0.0;
          stars += starLayer(skyUV, 8.0,  0.0);
          stars += starLayer(skyUV, 16.0, 100.0);
          stars += starLayer(skyUV, 32.0, 200.0);

          // Star color — mostly white, hint of blue/gold on bright ones
          vec3 starColor = mix(vec3(0.8, 0.85, 1.0), vec3(1.0, 0.95, 0.8), hash21(skyUV * 13.0));

          // Nebula — subtle purple/blue/magenta color wash
          float t = uTime * 0.02;
          float n1 = fbm(skyUV * 1.5 + vec2(t, -t * 0.7));
          float n2 = fbm(skyUV * 2.0 + vec2(-t * 0.5, t * 1.2) + 50.0);
          vec3 nebula = vec3(0.0);
          nebula += vec3(0.15, 0.05, 0.25) * n1;  // purple
          nebula += vec3(0.05, 0.1,  0.3)  * n2;  // blue
          nebula += vec3(0.2,  0.02, 0.15) * n1 * n2; // magenta

          // Aurora — slow-moving teal/purple bands
          float auroraY = skyUV.y * 2.0 + uTime * 0.03;
          float aWave = sin(auroraY + fbm(skyUV + uTime * 0.05) * 3.0);
          float aBand = smoothstep(0.0, 0.6, aWave) * smoothstep(1.0, 0.6, aWave);
          float aPulse = 0.5 + 0.5 * sin(uTime * 0.1 + skyUV.x * 3.0);
          vec3 auroraColor = mix(vec3(0.0, 0.6, 0.5), vec3(0.4, 0.1, 0.6), aPulse);
          vec3 aurora = auroraColor * aBand * 0.2;

          // Compose starfield
          vec3 sky = vec3(0.01, 0.01, 0.03); // deep space
          sky += nebula * 0.6;
          sky += aurora;
          sky += starColor * stars;

          // Mix base → starfield based on reveal
          vec3 col = mix(baseColor, sky, uReveal);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.FrontSide
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
        new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false })
      );
      labelPlane.position.set(0, 1.0, 0.92);
      group.add(labelPlane);

      // Art mesh on top — compute bounding box so it sits just above pedestal
      // Use manual override if provided (for animated shapes whose bounds change over time)
      const box = new THREE.Box3().setFromObject(artMesh);
      const bottomExtent = artMesh.userData.bottomExtent !== undefined
        ? artMesh.userData.bottomExtent : -box.min.y;
      artMesh.position.y = 1.2 + bottomExtent + 0.15; // pedestal top + bottom clearance + small gap
      group.add(artMesh);

      // Add subtle wireframe overlay to all geometry in the art mesh (skip if low quality or opted out)
      if (q.wireframes && !artMesh.userData.skipWireframe) {
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
            wire.userData.isQualityWireframe = true;
            if (!obj.frustumCulled) wire.frustumCulled = false;
            obj.add(wire);
          }
        });
      }

      // Invisible interaction volume covering pedestal + art area
      const interactionBox = new THREE.Mesh(
        new THREE.BoxGeometry(2, 3.5, 2),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      interactionBox.position.y = 1.75;
      interactionBox.userData.isInteractionBox = true;
      interactionBox.layers.set(1); // Remove from default camera layer (0) so it never renders
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
    const teapotMesh = createTeapot(0.5, teapotMaterial);
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
    const mobiusGeometry = createMobiusStrip(1.0, 0.4, q.mobiusSegments);
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
    const kleinGeometry = createKleinBottle(0.4, q.kleinU, q.kleinV);
    const kleinMesh = new THREE.Mesh(
      kleinGeometry,
      new THREE.MeshStandardMaterial({
        color: 0xffaa44,
        emissive: 0x885522,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.45,
        roughness: 0.15,
        metalness: 0.5,
        side: THREE.DoubleSide,
        envMap: envTexture,
        envMapIntensity: 0.8,
        depthWrite: false
      })
    );
    const kleinPedestal = createPedestal('Klein Bottle', kleinMesh, new THREE.Vector3(0, 0, -15));
    scene.add(kleinPedestal);
    artPieces.push({ mesh: kleinPedestal, artMesh: kleinMesh, id: 'klein', examined: false, rotatable: true, isHidden: true });

    // --- Maze Art Pieces (beyond back wall, Z < -20) ---

    // M1: Sierpinski Tetrahedron — Room 1 west alcove
    const sierpinskiMesh = createSierpinskiTetrahedron(q.sierpinskiLevel, 0.9);
    const sierpinskiPedestal = createPedestal('Sierpinski Tetrahedron', sierpinskiMesh, new THREE.Vector3(-15, 0, -27.5));
    scene.add(sierpinskiPedestal);
    artPieces.push({ mesh: sierpinskiPedestal, artMesh: sierpinskiMesh, id: 'sierpinski', examined: false, rotatable: true, isHidden: true });

    // M2: Lorenz Attractor — Room 2 east alcove
    const lorenzMesh = createLorenzAttractor();
    const lorenzPedestal = createPedestal('Lorenz Attractor', lorenzMesh, new THREE.Vector3(15, 0, -27.5));
    scene.add(lorenzPedestal);
    artPieces.push({ mesh: lorenzPedestal, artMesh: lorenzMesh, id: 'lorenz', examined: false, rotatable: true, isHidden: true });

    // M3: Gyroid Surface — main corridor west
    const gyroidMesh = createGyroid(0.8, q.gyroidResolution);
    gyroidMesh.material.envMap = envTexture;
    gyroidMesh.material.envMapIntensity = 0.6;
    const gyroidPedestal = createPedestal('Gyroid Surface', gyroidMesh, new THREE.Vector3(-6, 0, -27.5));
    scene.add(gyroidPedestal);
    artPieces.push({ mesh: gyroidPedestal, artMesh: gyroidMesh, id: 'gyroid', examined: false, rotatable: true, isHidden: true });

    // M4: Tesseract — central walkway
    const tesseractMesh = createTesseract(0.55);
    tesseractMesh.userData.skipWireframe = true;
    tesseractMesh.userData.bottomExtent = 1.20; // numerically computed worst-case during 4D rotation
    const tesseractPedestal = createPedestal('Tesseract', tesseractMesh, new THREE.Vector3(1, 0, -34.5));
    scene.add(tesseractPedestal);
    artPieces.push({ mesh: tesseractPedestal, artMesh: tesseractMesh, id: 'tesseract', examined: false, rotatable: true, isHidden: true });

    // M5: Stella Octangula — deep west room
    const stellaMesh = createStellaOctangula(0.8);
    const stellaPedestal = createPedestal('Stella Octangula', stellaMesh, new THREE.Vector3(-12, 0, -35));
    scene.add(stellaPedestal);
    artPieces.push({ mesh: stellaPedestal, artMesh: stellaMesh, id: 'stella', examined: false, rotatable: true, isHidden: true });

    // M6: Trefoil Knot — deep west alcove south
    const cinquefoilMesh = createCinquefoilKnot(q.trefoilTubular, q.trefoilRadial);
    cinquefoilMesh.material.envMap = envTexture;
    cinquefoilMesh.material.envMapIntensity = 1.0;
    const cinquefoilPedestal = createPedestal('Cinquefoil Knot', cinquefoilMesh, new THREE.Vector3(-12, 0, -42));
    scene.add(cinquefoilPedestal);
    artPieces.push({ mesh: cinquefoilPedestal, artMesh: cinquefoilMesh, id: 'cinquefoil', examined: false, rotatable: true, isHidden: true });

    // M7: Menger Sponge — deep east room
    const mengerMesh = createMengerSponge(q.mengerLevel, 1.2);
    const mengerPedestal = createPedestal('Menger Sponge', mengerMesh, new THREE.Vector3(1, 0, -42));
    scene.add(mengerPedestal);
    artPieces.push({ mesh: mengerPedestal, artMesh: mengerMesh, id: 'menger', examined: false, rotatable: true, isHidden: true });

    // M8: Compound of 5 Cubes — deep east alcove south
    const fivecubesMesh = createFiveCubes(0.7);
    const fivecubesPedestal = createPedestal('Compound of 5 Cubes', fivecubesMesh, new THREE.Vector3(13, 0, -42));
    scene.add(fivecubesPedestal);
    artPieces.push({ mesh: fivecubesPedestal, artMesh: fivecubesMesh, id: 'fivecubes', examined: false, rotatable: true, isHidden: true });

    // M9: Octahedron — center deep passage
    const octaGeom = new THREE.OctahedronGeometry(1.0);
    const octaMesh = new THREE.Mesh(
      octaGeom,
      new THREE.MeshStandardMaterial({
        color: 0xff8844,
        roughness: 0.25,
        metalness: 0.6,
        emissive: 0x442200,
        emissiveIntensity: 0.3,
        envMap: envTexture,
        envMapIntensity: 0.5
      })
    );
    const octaEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(octaGeom),
      new THREE.LineBasicMaterial({ color: 0xffcc88 })
    );
    octaMesh.add(octaEdges);
    const octaPedestal = createPedestal('Octahedron', octaMesh, new THREE.Vector3(13, 0, -35));
    scene.add(octaPedestal);
    artPieces.push({ mesh: octaPedestal, artMesh: octaMesh, id: 'octahedron', examined: false, rotatable: true, isHidden: true });

    // --- 6. Torus Knot (smooth → envMap, chrome) ---
    const torusKnotMesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.8, 0.25, q.torusKnotTubular, q.torusKnotRadial, 3, 2),
      new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.05,
        metalness: 0.95,
        envMap: envTexture,
        envMapIntensity: 1.2
      })
    );
    const torusKnotPedestal = createPedestal('Trefoil Knot', torusKnotMesh, new THREE.Vector3(0, 0, 8));
    scene.add(torusKnotPedestal);
    artPieces.push({ mesh: torusKnotPedestal, artMesh: torusKnotMesh, id: 'trefoil', examined: false, rotatable: true });

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
    
    // The Button — self-illuminated, no external light
    const buttonGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 32);
    const buttonMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0066,
      emissive: 0xff0066,
      emissiveIntensity: 0.8,
      roughness: 0.6,
      metalness: 0.1
    });
    const button = new THREE.Mesh(buttonGeometry, buttonMaterial);
    button.position.y = 1.13;
    button.rotation.x = 0;
    tableGroup.add(button);
    
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
    label.position.set(0, 0.85, -0.78);
    label.rotation.y = Math.PI;
    tableGroup.add(label);
    
    // Invisible interaction volume for trip button table
    const tableInteractionBox = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    tableInteractionBox.position.y = 1;
    tableInteractionBox.userData.isInteractionBox = true;
    tableInteractionBox.layers.set(1);
    tableGroup.add(tableInteractionBox);

    // Pulsing animation for button
    let buttonPulseTime = 0;

    tableGroup.position.set(0, 0, 19);
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

    // Ensure all art piece materials have consistent metallic sheen
    artPieces.forEach(piece => {
      const target = piece.artMesh || piece.mesh;
      if (!target) return;
      target.traverse(obj => {
        if (!obj.material || !obj.material.isMeshStandardMaterial) return;
        const mat = obj.material;
        if (!mat.envMap) {
          mat.envMap = envTexture;
          mat.envMapIntensity = Math.max(mat.envMapIntensity || 0, 0.6);
        }
        mat.metalness = Math.max(mat.metalness, 0.6);
        mat.roughness = Math.min(mat.roughness, 0.3);
        mat.needsUpdate = true;
      });
    });

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

    // Populate trip shader ring uniforms
    tripShaderMaterial.uniforms.ringPos.value = circlePositions.map(d => d.pos.clone());
    tripShaderMaterial.uniforms.ringCol.value = circlePositions.map(d => new THREE.Color(d.color));
    tripShaderMaterial.uniforms.ringRad.value = circlePositions.map(d => d.radius);

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

    // Store total regular art piece count for UI
    totalArtRef.current = artPieces.filter(p => !p.isButton && !p.isTripExit).length;

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

    // Add collision boxes for pedestals and trip button table
    artPieces.forEach(piece => {
      if (piece.isTripExit) return;
      const pos = piece.mesh.position;
      // Pedestal base is 1.8x1.8, table is 1.5x1.5 — use 2x2 to match interaction box
      interiorWallCollisions.push({ x: pos.x, z: pos.z, width: 2, depth: 2 });
    });

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
    let gameFinished = false;
    const finishGame = (allowAudioFinish) => {
      if (gameFinished) return;
      gameFinished = true;
      // Stop ambient loop timer so it doesn't restart after stopAll
      stopAmbientMusic(0.05);
      if (allowAudioFinish) {
        // Let current sounds finish naturally, then stop any remaining
        setTimeout(() => am.stopAll(), 3000);
      } else {
        am.stopAll();
      }

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
      
      // Calculate openness: 100% for finding all pieces + 100% for tripping = 200% max
      const pieceOpenness = foundRegular / regularObjects; // 0–1 (100% for all pieces)
      const tripOpenness = trippedBalls; // 0 or 1 (100% for tripping)
      let abstractnessLevel = pieceOpenness + tripOpenness; // 0–2

      if (gameState.completionMethod === 'early') {
        // No penalty — you get credit for what you found
      }

      const results = {
        uniqueDescriptions,
        totalArt: regularObjects,
        abstractnessLevel,
        viewsExplored,
        totalRotations: gameState.rotationsPerformed,
        completionMethod: gameState.completionMethod,
        completionRatio: foundRegular / regularObjects,
        totalTime
      };

      console.log('Game completed!', results);
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      // Fade to black, then show results
      screenFadeTargetRef.current = 1;
      setTimeout(() => {
        setCompletionResults(results);
      }, 1500);
    };

    // Player setup
    camera.position.set(0, 1.6, 15);
    const baseMoveSpeed = 0.1;
    const baseLookSpeed = 0.002;

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

    // Floating math objects during trip
    let floatingObjects = [];
    let _floatingHitBoxArray = [];
    const floatingHitBoxMap = new Map();
    const floatingScene = new THREE.Scene();
    floatingScene.add(new THREE.AmbientLight(0xffffff, 1.5));

    // Hyperspace warp transition state
    let warpActive = false;
    let warpStartTime = 0;
    const WARP_DURATION = 3.0; // seconds
    let warpPendingTripData = null; // stores trip setup data during warp

    // Warp shader — hyperspace jump then trip iris-in
    const warpShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tTrip: { value: null },
        progress: { value: 0 }, // 0–1 over warp duration
        time: { value: 0 },
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
        uniform sampler2D tDiffuse;
        uniform sampler2D tTrip;
        uniform float progress;
        uniform float time;
        uniform vec2 resolution;
        varying vec2 vUv;

        #define PI 3.14159265

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec2 center = vec2(0.5);
          vec2 uv = vUv;
          vec2 toCenter = uv - center;
          float dist = length(toCenter);
          float angle = atan(toCenter.y, toCenter.x);
          float aspect = resolution.x / resolution.y;

          // Phase 1 (0.0–0.5): Hyperspace — scene stretches into star lines
          // Phase 2 (0.5–0.65): Everything goes white-hot
          // Phase 3 (0.65–0.75): White fades to black
          // Phase 4 (0.75–1.0): Trip scene iris-opens from center in darkness

          // --- Phase 1: Hyperspace streaks ---
          float streakPhase = smoothstep(0.0, 0.5, progress);

          // Increasing radial motion blur of the scene
          float blurStrength = streakPhase * streakPhase * 0.3;
          vec3 color = vec3(0.0);
          for (int i = 0; i < 16; i++) {
            float t = float(i) / 16.0;
            vec2 sampleUV = mix(uv, center, blurStrength * t);
            color += texture2D(tDiffuse, sampleUV).rgb;
          }
          color /= 16.0;

          // Star streaks — thin bright radial lines (like stars stretching)
          // Multiple layers of streaks at different densities
          float streak1 = pow(abs(sin(angle * 60.0 + hash(vec2(floor(angle * 60.0 / PI))) * 6.28)), 40.0);
          float streak2 = pow(abs(sin(angle * 120.0 + hash(vec2(floor(angle * 120.0 / PI))) * 6.28)), 60.0);
          float streak3 = pow(abs(sin(angle * 30.0 + hash(vec2(floor(angle * 30.0 / PI))) * 6.28)), 30.0);

          // Streaks get longer from center outward, intensify with progress
          float streakIntensity = streakPhase * streakPhase;
          float radialFade = smoothstep(0.0, 0.3, dist); // no streaks at very center
          float streaks = (streak1 * 0.6 + streak2 * 0.3 + streak3 * 0.8) * radialFade;

          // Streak color: white-blue core with slight color variation
          vec3 streakColor = mix(vec3(0.7, 0.8, 1.0), vec3(1.0), streaks);
          color += streaks * streakIntensity * streakColor * 2.0;

          // Scene gets brighter as you accelerate
          color *= 1.0 + streakPhase * 3.0;

          // --- Phase 2: White-hot flash ---
          float whiteness = smoothstep(0.4, 0.6, progress);
          color = mix(color, vec3(4.0), whiteness);

          // --- Phase 3: White fades to black ---
          float darkness = smoothstep(0.6, 0.75, progress);
          color *= 1.0 - darkness;

          // --- Phase 4: Trip iris opens from black ---
          float irisPhase = smoothstep(0.75, 1.0, progress);
          if (irisPhase > 0.0) {
            vec3 tripColor = texture2D(tTrip, uv).rgb;
            float irisRadius = irisPhase * 0.95;
            float edgeSoftness = 0.06;
            float irisMask = smoothstep(irisRadius, max(0.0, irisRadius - edgeSoftness), dist);
            color = mix(color, tripColor, irisMask);
          }

          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    const warpScene = new THREE.Scene();
    const warpCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const warpQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), warpShaderMaterial);
    warpScene.add(warpQuad);

    // Controls state
    const keys = {};
    const mouse = { x: 0, y: 0, isDragging: false };
    let yaw = 0;
    let pitch = 0;
    let headBobPhase = 0;
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
      try {
        const result = renderer.domElement.requestPointerLock();
        if (result && result.catch) {
          result.catch(() => {
            pointerLockSupported = false;
            console.log('Pointer lock not available, using click-and-drag fallback');
          });
        }
      } catch (e) {
        pointerLockSupported = false;
        console.log('Pointer lock not available, using click-and-drag fallback');
      }
    };

    const onPointerLockChange = () => {
      pointerLocked = document.pointerLockElement === renderer.domElement;
    };

    const onPointerLockError = () => {
      pointerLockSupported = false;
      console.log('Pointer lock error, using fallback controls');
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);

    // Mobile joystick state — tracked by touch.identifier
    let moveTouch = { id: null, startX: 0, startY: 0, currentX: 0, currentY: 0 };
    let lookTouch = { id: null, startX: 0, startY: 0, currentX: 0, currentY: 0 };

    // Event listeners
    const onKeyDown = (e) => {
      keys[e.code] = true;
      if (e.code === 'KeyF') setShowFps(prev => !prev);
    };
    const onKeyUp = (e) => { keys[e.code] = false; };
    
    const onMouseDown = (e) => {
      if (!mobile) {
        if (pointerLockSupported && !pointerLocked) {
          requestPointerLock();
          skipNextClick = true; // skip the click event from this same mousedown
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
        // Pointer lock mode (event-driven, use base rate)
        yaw -= e.movementX * baseLookSpeed;
        pitch -= e.movementY * baseLookSpeed;
        if (!trippingRef.current) pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
      } else if (mouse.isDragging) {
        // Fallback mode (click and drag)
        yaw -= e.movementX * baseLookSpeed;
        pitch -= e.movementY * baseLookSpeed;
        if (!trippingRef.current) pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
      }
    };

    // Max interaction distance
    const maxInteractDistance = 3;

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

    // Cached objects to avoid per-frame allocations
    const _forward = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const _resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
    const _raycaster = new THREE.Raycaster();
    _raycaster.layers.set(1);
    const _screenCenter = new THREE.Vector2(0, 0);
    const _interactionBoxArray = interactionBoxes.map(ib => ib.box);

    const findTargetPiece = () => {
      _raycaster.setFromCamera(_screenCenter, camera);
      _raycaster.far = maxInteractDistance;
      const intersects = _raycaster.intersectObjects(_interactionBoxArray, false);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const match = interactionBoxes.find(ib => ib.box === hit);
        return match ? match.piece : null;
      }
      return null;
    };

    const findFloatingTarget = () => {
      if (_floatingHitBoxArray.length === 0) return null;
      _raycaster.setFromCamera(_screenCenter, camera);
      _raycaster.far = 60;
      const intersects = _raycaster.intersectObjects(_floatingHitBoxArray, false);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const floater = floatingHitBoxMap.get(hit);
        return (floater && !floater.examined) ? floater : null;
      }
      return null;
    };

    // Shared activation logic
    const activatePiece = (artPiece) => {
      if (!artPiece || artPiece.examined) return;

      artPiece.examined = true;
      gameStateRef.current.artPiecesExamined.add(artPiece.id);
      setExaminedCount(gameStateRef.current.artPiecesExamined.size);

      if (am.initialized && !artPiece.isButton) {
        let snd;
        if (activateSoundIdx < activateSoundsEarly.length) {
          snd = activateSoundsEarly[activateSoundIdx];
          activateSoundIdx++;
        } else {
          snd = activateSoundsLate[Math.floor(Math.random() * activateSoundsLate.length)];
        }
        const handle = am.play(snd, { volume: 0.6 });
        // Start ambient music after the 4th activation sound finishes
        if (activateSoundIdx === activateSoundsEarly.length && !ambientPlaying && handle) {
          const sndDur = am.getDuration(snd);
          setTimeout(() => {
            if (!ambientPlaying && !trippingRef.current) startAmbientLoop();
          }, sndDur * 1000);
        }
      }

      if (artPiece.isHidden) {
        gameStateRef.current.hiddenAreasFound.add(artPiece.id);
      }

      // Special handling for the trip button — start hyperspace warp
      if (artPiece.isButton) {
        gameStateRef.current.trippedBalls = true;

        // End button cinematic if still active
        buttonCinematicActive = false;
        buttonCinematicDone = true;

        // Stop trip bass and ambient music when button is pressed
        if (tripBassHandle) { am.stop(tripBassHandle, { fadeOut: 0.05 }); tripBassHandle = null; }
        if (tripBassLoopHandle) { am.stop(tripBassLoopHandle, { fadeOut: 0.05 }); tripBassLoopHandle = null; }
        tripBassPlaying = false;
        stopAmbientMusic(0.05);

        if (artPiece.buttonMesh) {
          artPiece.buttonMesh.position.y = 1.08;
          setTimeout(() => { artPiece.buttonMesh.position.y = 1.13; }, 200);
        }

        // Start hyperspace warp — trip setup deferred until warp completes
        warpActive = true;
        warpStartTime = performance.now();

        // Instantly kill button vignette so it doesn't darken the warp
        buttonVignetteRef.current = 0;
        setButtonVignette(0);

        // Pre-compute trip data so it's ready when warp ends
        const tripStarts = [
          { pos: [7.10, 2, 0], yaw: 0.172, pitch: -0.547 },
          { pos: [19.00, 2, 0], yaw: -0.126, pitch: 0.647 },
        ];
        const start = tripStarts[Math.floor(Math.random() * tripStarts.length)];

        // Pre-spawn floating clones (hidden until trip starts)
        const pendingFloaters = [];
        artPieces.forEach(piece => {
          if (piece.isButton || piece.isTripExit || piece.examined || !piece.artMesh) return;
          const clone = piece.artMesh.clone();
          clone.traverse(obj => {
            if (obj.material) {
              obj.material = obj.material.clone();
              if (obj.material.emissive) {
                obj.material.emissive.set(0xffffff);
                obj.material.emissiveIntensity = 0.6;
              }
            }
          });
          const scale = 0.4 + Math.random() * 0.2;
          clone.scale.multiplyScalar(scale);
          const sphereRadius = 10 + Math.random() * 8;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          clone.position.set(
            start.pos[0] + sphereRadius * Math.sin(phi) * Math.cos(theta),
            start.pos[1] + sphereRadius * Math.cos(phi),
            start.pos[2] + sphereRadius * Math.sin(phi) * Math.sin(theta)
          );
          pendingFloaters.push({ clone, piece });
        });

        warpPendingTripData = { start, pendingFloaters };
      }

      // Visual feedback - pulse emissive (traverse to handle Groups and line materials)
      if (!artPiece.isButton && !artPiece.isTripExit) {
        const feedbackRoot = artPiece.artMesh || artPiece.mesh;
        const restores = [];
        feedbackRoot.traverse(obj => {
          const mat = obj.material;
          if (!mat) return;
          if (mat.emissive) {
            const orig = mat.emissive.getHex();
            const origIntensity = mat.emissiveIntensity;
            // Scale flash down for shiny objects so total brightness is consistent
            // Highly metallic + low roughness + strong envMap = already bright
            const envContrib = (mat.metalness || 0) * (1 - (mat.roughness || 0.5)) * (mat.envMapIntensity || 0);
            const flashIntensity = Math.max(0.15, 0.6 - envContrib * 0.5);
            mat.emissive.set(0xffffff);
            mat.emissiveIntensity = flashIntensity;
            restores.push(() => { mat.emissive.set(orig); mat.emissiveIntensity = origIntensity; });
          } else if (mat.color) {
            const orig = mat.color.getHex();
            const hadVertexColors = mat.vertexColors;
            mat.color.set(0xffffff);
            if (hadVertexColors) { mat.vertexColors = false; mat.needsUpdate = true; }
            restores.push(() => {
              mat.color.set(orig);
              if (hadVertexColors) { mat.vertexColors = true; mat.needsUpdate = true; }
            });
          }
        });
        if (restores.length > 0) {
          setTimeout(() => restores.forEach(fn => fn()), 300);
        }
      }

      gameStateRef.current.timeSpentPerPiece[artPiece.id] = Date.now();

      // Check for sober completion
      const regularObjects = artPieces.filter(p => !p.isButton && !p.isTripExit).length;
      const foundRegular = Array.from(gameStateRef.current.artPiecesExamined).filter(
        id => id !== 'tripButton' && id !== 'tripPortal'
      ).length;

      if (foundRegular === regularObjects && !trippingRef.current) {
        gameStateRef.current.completionMethod = 'sober';
        setTimeout(() => finishGame(true), 500);
      }
    };

    const activateFloatingPiece = (floater) => {
      if (!floater || floater.examined) return;
      floater.examined = true;
      floater.fadeStartTime = performance.now();

      // Mark source piece as examined
      floater.source.examined = true;
      gameStateRef.current.artPiecesExamined.add(floater.source.id);
      setExaminedCount(gameStateRef.current.artPiecesExamined.size);
      gameStateRef.current.timeSpentPerPiece[floater.source.id] = Date.now();

      // Play activation sound — always use late sounds during trip
      if (am.initialized) {
        const snd = activateSoundsLate[Math.floor(Math.random() * activateSoundsLate.length)];
        am.play(snd, { volume: 0.6 });
      }

      // Set materials to bright white emissive, make transparent
      floater.mesh.traverse(obj => {
        if (!obj.material) return;
        obj.material.transparent = true;
        obj.material.depthWrite = false;
        if (obj.material.emissive) {
          obj.material.emissive.set(0xffffff);
          obj.material.emissiveIntensity = 1.5;
        } else if (obj.material.color) {
          obj.material.color.set(0xffffff);
        }
      });

      // Freeze velocity, capture base scale and start position
      floater.velocity.set(0, 0, 0);
      floater._baseScale = floater.mesh.scale.clone();
      floater._rushStartPos = floater.mesh.position.clone();
    };

    // Hover glow tracking
    let hoveredPiece = null;
    let hoveredOriginalEmissive = null;

    const onClick = (e) => {
      if (trippingRef.current) {
        const floater = findFloatingTarget();
        if (floater) activateFloatingPiece(floater);
        return;
      }
      if (!mobile && pointerLockSupported && !pointerLocked) return;
      if (skipNextClick) { skipNextClick = false; return; }

      const target = findTargetPiece();
      if (target) activatePiece(target);
    };

    // Touch controls for mobile — identifier-based dual joystick
    const onTouchStart = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.clientX < window.innerWidth / 2) {
          // Left side - movement joystick
          if (moveTouch.id === null) {
            moveTouch = {
              id: touch.identifier,
              startX: touch.clientX,
              startY: touch.clientY,
              currentX: touch.clientX,
              currentY: touch.clientY
            };
          }
        } else {
          // Right side - look joystick
          if (lookTouch.id === null) {
            lookTouch = {
              id: touch.identifier,
              startX: touch.clientX,
              startY: touch.clientY,
              currentX: touch.clientX,
              currentY: touch.clientY
            };
          }
        }
      }
    };

    const onTouchMove = (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === moveTouch.id) {
          moveTouch.currentX = touch.clientX;
          moveTouch.currentY = touch.clientY;
        } else if (touch.identifier === lookTouch.id) {
          lookTouch.currentX = touch.clientX;
          lookTouch.currentY = touch.clientY;
        }
      }
    };

    const onTouchEnd = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === moveTouch.id) {
          moveTouch = { id: null, startX: 0, startY: 0, currentX: 0, currentY: 0 };
        } else if (touch.identifier === lookTouch.id) {
          lookTouch = { id: null, startX: 0, startY: 0, currentX: 0, currentY: 0 };
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onClick);
    
    const goFullscreen = () => {
      const el = document.documentElement;
      const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (rfs) rfs.call(el).catch(() => {});
    };

    // Expose enter-game action so the "enter museum" button can trigger pointer lock / fullscreen
    enterGameRef.current = () => {
      if (mobile) {
        goFullscreen();
      } else {
        requestPointerLock();
      }
    };

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
      bloomComposer.setSize(window.innerWidth, window.innerHeight);
      tripBloomComposer.setSize(window.innerWidth, window.innerHeight);
      warpTripTarget.setSize(window.innerWidth, window.innerHeight);
      _resolution.set(window.innerWidth, window.innerHeight);
      portalOverlayMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
      tripShaderMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
      warpShaderMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onResize);
    document.addEventListener('webkitfullscreenchange', onResize);

    // Rolling FPS monitor for auto-downgrade
    const fpsBuffer = new Float32Array(180); // ~3 seconds at 60fps
    let fpsBufferIdx = 0;
    let fpsBufferFilled = false;

    // Audio setup
    const am = new AudioManager();
    audioManagerRef.current = am;
    am.init();
    am.setMasterVolume(0.5);

    const base = import.meta.env.BASE_URL;
    const audioManifest = {
      footstep:      `${base}audio/footstep.mp3`,
      activate1:     `${base}audio/activate1.mp3`,
      activate2:     `${base}audio/activate2.mp3`,
      activate3:     `${base}audio/activate3.mp3`,
      activate4:     `${base}audio/activate4.mp3`,
      activate5:     `${base}audio/activate5.mp3`,
      activate6:     `${base}audio/activate6.mp3`,
      activate7:     `${base}audio/activate7.mp3`,
      activate8:     `${base}audio/activate8.mp3`,
      activate9:     `${base}audio/activate9.mp3`,
      activate10:    `${base}audio/activate10.mp3`,
      museum1:       `${base}audio/museum1.mp3`,
      tripbass:      `${base}audio/tripbass.mp3`,
      tripbass_loop: `${base}audio/tripbass_loop.mp3`,
    };
    const activateSoundsEarly = ['activate1', 'activate2', 'activate3', 'activate4'];
    const activateSoundsLate = ['activate5', 'activate6', 'activate7', 'activate8', 'activate9', 'activate10'];
    let activateSoundIdx = 0;
    let tripBassHandle = null;
    let tripBassLoopHandle = null;
    let tripBassPlaying = false;

    // Ambient music state
    let ambientHandle = null;
    let ambientPlaying = false;
    let ambientLoopTimer = null;
    const AMBIENT_LOOP_POINT = 64; // restart next copy at 64s; last 8s of old overlaps with first 8s of new
    const AMBIENT_VOLUME = 0.6;
    let ambientHandles = []; // track all playing copies for fade/stop

    // Starfield ceiling state
    let starfieldActive = false;
    let starfieldReveal = 0;

    const startAmbientLoop = () => {
      if (ambientPlaying) return;
      ambientPlaying = true;
      starfieldActive = true;
      const h = am.play('museum1', { volume: AMBIENT_VOLUME });
      if (h) ambientHandles.push(h);
      scheduleAmbientLoop();
    };

    const scheduleAmbientLoop = () => {
      if (ambientLoopTimer) clearTimeout(ambientLoopTimer);
      ambientLoopTimer = setTimeout(() => {
        if (!ambientPlaying) return;
        // Start next copy at full volume — both play simultaneously during the 8s overlap
        // The old copy plays to its natural end
        const h = am.play('museum1', { volume: AMBIENT_VOLUME });
        if (h) ambientHandles.push(h);
        // Clean up handles that have finished naturally
        ambientHandles = ambientHandles.filter(h => am.playing.has(h));
        scheduleAmbientLoop();
      }, AMBIENT_LOOP_POINT * 1000);
    };

    const stopAmbientMusic = (fadeOut = 0.05) => {
      ambientPlaying = false;
      if (ambientLoopTimer) { clearTimeout(ambientLoopTimer); ambientLoopTimer = null; }
      ambientHandles.forEach(h => am.stop(h, { fadeOut }));
      ambientHandles = [];
    };
    let lastFootstepTime = 0;
    let prevCamX = 0;
    let prevCamZ = 0;
    let audioLoaded = false;

    am.loadAll(audioManifest).then(() => {
      audioLoaded = true;
      prevCamX = camera.position.x;
      prevCamZ = camera.position.z;
    });

    // "Trip balls" button cinematic lock state
    let buttonCinematicActive = false;
    let buttonCinematicDone = false;
    let buttonCinematicStart = 0;
    let buttonCinematicTargetYaw = 0;
    let buttonCinematicTargetPitch = 0;
    let buttonCinematicStartX = 0;
    let buttonCinematicStartZ = 0;
    let buttonCinematicButtonX = 0;
    let buttonCinematicButtonZ = 0;

    // Game loop — fixed simulation timestep for smooth movement
    const FIXED_DT = 1 / 60;
    let lastHoverTarget = null;
    let lastTime = performance.now();
    let accumulator = 0;
    const animate = () => {
      requestAnimationFrame(animate);
      const currentTime = performance.now();
      const rawDelta = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      // Cap to avoid spiral-of-death on tab-away
      accumulator += Math.min(rawDelta, 0.1);
      // Use rawDelta for FPS display/monitoring, FIXED_DT for simulation
      const deltaTime = FIXED_DT;

      // Frame time counter (update DOM ref directly to avoid re-renders)
      const fpsData = fpsDataRef.current;
      if (fpsData.lastTime === 0) fpsData.lastTime = currentTime;
      fpsData.frames++;
      if (currentTime - fpsData.lastTime >= 500) {
        const elapsed = currentTime - fpsData.lastTime;
        fpsData.frameTimeMs = (elapsed / fpsData.frames).toFixed(1);
        fpsData.value = Math.round(fpsData.frames / (elapsed / 1000));
        fpsData.frames = 0;
        fpsData.lastTime = currentTime;
        if (fpsDisplayRef.current) {
          const fwd = _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
          fpsDisplayRef.current.textContent =
            fpsData.frameTimeMs + ' ms (' + fpsData.value + ' fps)\n' +
            'pos: ' + camera.position.x.toFixed(2) + ', ' + camera.position.y.toFixed(2) + ', ' + camera.position.z.toFixed(2) + '\n' +
            'fwd: ' + fwd.x.toFixed(3) + ', ' + fwd.y.toFixed(3) + ', ' + fwd.z.toFixed(3);
        }
      }

      // Rolling FPS monitor for auto-downgrade (use raw delta for accuracy)
      fpsBuffer[fpsBufferIdx] = rawDelta > 0 ? 1 / rawDelta : 60;
      fpsBufferIdx = (fpsBufferIdx + 1) % fpsBuffer.length;
      if (fpsBufferIdx === 0) fpsBufferFilled = true;

      if (fpsBufferFilled && qualityRef.current !== 'low') {
        const count = fpsBuffer.length;
        let sum = 0;
        for (let i = 0; i < count; i++) sum += fpsBuffer[i];
        const avgFps = sum / count;

        if (avgFps < 25) {
          const prev = qualityRef.current;
          const next = prev === 'high' ? 'medium' : 'low';
          qualityRef.current = next;
          // Runtime adjustments (no geometry rebuild)
          const nq = qualitySettings[next];
          renderer.setPixelRatio(nq.pixelRatio);
          if (!nq.wireframes) {
            scene.traverse(obj => {
              if (obj.userData.isQualityWireframe) obj.visible = false;
            });
          }
          setQualityToast('Quality reduced to ' + next);
          setTimeout(() => setQualityToast(null), 3000);
          // Reset buffer so we don't immediately trigger again
          fpsBufferFilled = false;
          fpsBufferIdx = 0;
        }
      }

      // Fixed-timestep simulation loop for smooth movement
      const simSteps = Math.min(Math.floor(accumulator / FIXED_DT), 4); // max 4 steps to avoid spiral
      accumulator -= simSteps * FIXED_DT;
      // moveSpeed/lookSpeed are per-tick at fixed 60fps
      const moveSpeed = baseMoveSpeed;
      const lookSpeed = baseLookSpeed;

      if (!buttonCinematicActive && !warpActive)
      for (let _simStep = 0; _simStep < simSteps; _simStep++) {
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
            if (trippingRef.current) {
              // Trip mode: both stick axes move along world X
              const gpMoveX = (leftStickX - leftStickY) * moveSpeed;
              const newX = camera.position.x + gpMoveX;
              if (!checkCollision(newX, camera.position.z)) {
                camera.position.x = newX;
              }
            } else {
              const forward = _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
              forward.y = 0;
              forward.normalize();
              const right = _right.set(1, 0, 0).applyQuaternion(camera.quaternion);

              const moveX = (-leftStickY * forward.x + leftStickX * right.x) * moveSpeed;
              const moveZ = (-leftStickY * forward.z + leftStickX * right.z) * moveSpeed;

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
          }

          // Apply look from right stick
          if (rightStickX !== 0 || rightStickY !== 0) {
            yaw -= rightStickX * 0.05;
            // Y-axis: negative by default (not inverted), unless invertY is true
            pitch += (invertYRef.current ? rightStickY : -rightStickY) * 0.05;
            if (!trippingRef.current) pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
          }
          
          // A button (button 0) - interact with art or floating objects
          const aPressed = gamepad.buttons[0]?.pressed;
          if (aPressed && !gamepadAWasPressed) {
            if (trippingRef.current) {
              const floater = findFloatingTarget();
              if (floater) activateFloatingPiece(floater);
            } else {
              const target = findTargetPiece();
              if (target) activatePiece(target);
            }
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
      const forward = _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0;
      forward.normalize();
      const right = _right.set(1, 0, 0).applyQuaternion(camera.quaternion);

      let moveX = 0;
      let moveY = 0; // Vertical movement
      let moveZ = 0;

      // During trip: constrain to X-axis movement only, lock look direction
      if (trippingRef.current) {
        // Keyboard: A/D/W/S and all arrows move along X axis
        if (keys['KeyA'] || keys['ArrowLeft'] || keys['KeyW'] || keys['ArrowUp']) {
          moveX -= moveSpeed;
        }
        if (keys['KeyD'] || keys['ArrowRight'] || keys['KeyS'] || keys['ArrowDown']) {
          moveX += moveSpeed;
        }

        // Mobile joystick: both axes move along world X
        const joystickRadius = 50;
        const deadZone = 5;
        if (moveTouch.id !== null) {
          const dx = moveTouch.currentX - moveTouch.startX;
          const dy = moveTouch.currentY - moveTouch.startY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > deadZone) {
            const clamped = Math.min(dist, joystickRadius);
            const nx = (dx / dist) * clamped / joystickRadius;
            const ny = (dy / dist) * clamped / joystickRadius;
            moveX += (nx - ny) * moveSpeed;
          }
        }

      } else {
        // Keyboard movement
        if (keys['KeyW'] || keys['ArrowUp']) {
          moveX += forward.x * moveSpeed;
          moveZ += forward.z * moveSpeed;
        }
        if (keys['KeyS'] || keys['ArrowDown']) {
          moveX -= forward.x * moveSpeed;
          moveZ -= forward.z * moveSpeed;
        }
        if (keys['KeyA'] || keys['ArrowLeft']) {
          moveX -= right.x * moveSpeed;
          moveZ -= right.z * moveSpeed;
        }
        if (keys['KeyD'] || keys['ArrowRight']) {
          moveX += right.x * moveSpeed;
          moveZ += right.z * moveSpeed;
        }

        // Mobile joystick movement (clamped to max radius)
        const joystickRadius = 50; // px — full speed at this distance
        const deadZone = 5;

        if (moveTouch.id !== null) {
          const dx = moveTouch.currentX - moveTouch.startX;
          const dy = moveTouch.currentY - moveTouch.startY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > deadZone) {
            const clamped = Math.min(dist, joystickRadius);
            const nx = (dx / dist) * clamped / joystickRadius;
            const ny = (dy / dist) * clamped / joystickRadius;

            moveX -= ny * forward.x * moveSpeed;
            moveZ -= ny * forward.z * moveSpeed;
            moveX += nx * right.x * moveSpeed;
            moveZ += nx * right.z * moveSpeed;
          }
        }
      }

      // Mobile look joystick (clamped, continuous rotation) — always active
      const joystickRadiusLook = 50;
      const deadZoneLook = 5;
      if (lookTouch.id !== null) {
        const dx = lookTouch.currentX - lookTouch.startX;
        const dy = lookTouch.currentY - lookTouch.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > deadZoneLook) {
          const clamped = Math.min(dist, joystickRadiusLook);
          const nx = (dx / dist) * clamped / joystickRadiusLook;
          const ny = (dy / dist) * clamped / joystickRadiusLook;

          yaw -= nx * lookSpeed * 15;
          pitch -= ny * lookSpeed * 15;
          if (!trippingRef.current) pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
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
      
      // Apply Y movement with head bob
      if (trippingRef.current) {
        // Lock Y at ring height during trip — no bob
        camera.position.y = 2;
        headBobPhase = 0;
      } else {
        // Detect walking: any horizontal movement this tick
        const isWalking = Math.abs(moveX) > 0.001 || Math.abs(moveZ) > 0.001;
        if (isWalking) {
          headBobPhase += FIXED_DT * 4 * Math.PI; // 2 Hz — synced with footstep audio
          camera.position.y = 2 + Math.sin(headBobPhase) * 0.03;
        } else {
          // Settle toward nearest multiple of PI so bob ends at y=2
          const nearestPi = Math.round(headBobPhase / Math.PI) * Math.PI;
          headBobPhase += (nearestPi - headBobPhase) * 0.1;
          camera.position.y = 2 + Math.sin(headBobPhase) * 0.03;
        }
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

      } // end fixed-timestep simulation loop

      // Visual delta for animations outside the sim loop (adapts to actual display refresh rate)
      const vizDelta = Math.min(rawDelta, 0.1);

      // Button cinematic: smoothly lerp camera to look at button and slide closer
      if (buttonCinematicActive) {
        // Shortest-arc yaw lerp (avoid spinning 360° when crossing ±π)
        let yawDiff = buttonCinematicTargetYaw - yaw;
        yawDiff = yawDiff - Math.round(yawDiff / (2 * Math.PI)) * 2 * Math.PI;
        yaw += yawDiff * 3 * vizDelta;
        pitch += (buttonCinematicTargetPitch - pitch) * 3 * vizDelta;
        camera.rotation.order = 'YXZ';
        camera.rotation.y = yaw;
        camera.rotation.x = pitch;
        // Slowly slide camera toward button (30% of the way over the cinematic duration)
        const t = Math.min((currentTime - buttonCinematicStart) / 3000, 1);
        const slide = t * 0.3;
        camera.position.x = buttonCinematicStartX + (buttonCinematicButtonX - buttonCinematicStartX) * slide;
        camera.position.z = buttonCinematicStartZ + (buttonCinematicButtonZ - buttonCinematicStartZ) * slide;
        orthoCamera.position.copy(camera.position);
        orthoCamera.rotation.copy(camera.rotation);
        if (currentTime - buttonCinematicStart >= 3000) {
          buttonCinematicActive = false;
          buttonCinematicDone = true;
        }
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
      // Throttle raycasting on mobile (every 3rd frame)
      // Skip raycast updates during button cinematic to preserve hover state
      if (!buttonCinematicActive && (!mobile || (fpsData.frames % 3 === 0))) {
        lastHoverTarget = trippingRef.current ? null : findTargetPiece();
      }
      // Floating object hover during trip
      if (trippingRef.current && (!mobile || (fpsData.frames % 3 === 0))) {
        const floater = findFloatingTarget();
        if (floater) {
          const action = 'to experience';
          const inputHint = gamepadIndex !== null ? `press A ${action}` : mobile ? `touch ${action}` : `click ${action}`;
          setInteractPrompt({ name: '', inputHint });
        } else {
          // Only clear prompt if we were showing one for a floating object
          if (!lastHoverTarget) setInteractPrompt(null);
        }
      }
      const hoverTarget = lastHoverTarget;
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
          const inputHint = gamepadIndex !== null ? `press A ${action}` : mobile ? `touch ${action}` : `click ${action}`;
          setInteractPrompt({ name: '', inputHint });
        }
        if (hoveredPiece.isButton) {
          // Trigger cinematic lock on first approach
          if (!buttonCinematicDone && !buttonCinematicActive) {
            buttonCinematicActive = true;
            buttonCinematicStart = currentTime;
            // Capture target based on button's current apparent position
            const bm = hoveredPiece.buttonMesh || hoveredPiece.mesh;
            const bwp = new THREE.Vector3();
            bm.getWorldPosition(bwp);
            const dx = bwp.x - camera.position.x;
            const dy = bwp.y - camera.position.y;
            const dz = bwp.z - camera.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            buttonCinematicTargetYaw = Math.atan2(-dx, -dz);
            buttonCinematicTargetPitch = Math.asin(dy / dist);
            buttonCinematicStartX = camera.position.x;
            buttonCinematicStartZ = camera.position.z;
            buttonCinematicButtonX = bwp.x;
            buttonCinematicButtonZ = bwp.z;
          }
          // Gradually ramp up vignette and button brightness
          buttonVignetteRef.current = Math.min(1, buttonVignetteRef.current + vizDelta * 0.4);
          setButtonVignette(buttonVignetteRef.current);
          if (hoveredPiece.buttonMesh) {
            hoveredPiece.buttonMesh.material.emissiveIntensity = 0.8 + buttonVignetteRef.current * 0.7;
          }
        } else {
          // Ramp oscillation amplitude up smoothly
          hoveredPiece._oscAmplitude = Math.min(0.1, hoveredPiece._oscAmplitude + vizDelta * 0.2);
        }
      } else {
        if (hoveredPiece && !hoveredPiece.isButton) {
          // Mark for ramp-down (handled below)
        }
        if (hoveredPiece && hoveredPiece.isButton) {
          if (hoveredPiece.buttonMesh) {
            hoveredPiece.buttonMesh.material.emissiveIntensity = 0.8;
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
          piece._oscAmplitude = Math.max(0, piece._oscAmplitude - vizDelta * 0.3);
        }

        if (piece._oscAmplitude > 0.001) {
          const amp = piece._oscAmplitude;
          piece.artMesh.position.y = piece._baseArtY + amp + Math.sin(currentTime / 1000 * Math.PI) * amp;
        } else if (piece._oscAmplitude !== undefined && piece._oscAmplitude <= 0.001) {
          piece.artMesh.position.y = piece._baseArtY;
          piece._oscAmplitude = 0;
        }
      });

      // Fade vignette down when not hovering button or during warp/trip
      if (!hoveredPiece || !hoveredPiece.isButton || warpActive || trippingRef.current) {
        if (buttonVignetteRef.current > 0) {
          const fadeSpeed = (warpActive || trippingRef.current) ? 2.0 : 0.8;
          buttonVignetteRef.current = Math.max(0, buttonVignetteRef.current - vizDelta * fadeSpeed);
          setButtonVignette(buttonVignetteRef.current);
        }
      }

      // Rotate art pieces that are being examined (just the art, not the pedestal)
      artPieces.forEach(piece => {
        if (piece.examined && piece.rotatable) {
          const target = piece.artMesh || piece.mesh;
          const rotAmount = 0.6 * vizDelta; // ~0.01 at 60fps, scales with actual framerate
          target.rotation.y += rotAmount;
          gameStateRef.current.rotationsPerformed += rotAmount;
        }
      });

      // Animate tesseract 4D rotation
      if (tesseractMesh.userData.updateTesseract) {
        tesseractMesh.userData.updateTesseract(currentTime / 1000, _resolution);
      }

      // Animate button pulse
      buttonPulseTime += vizDelta * 2;
      button.position.y = 1.13 + Math.sin(buttonPulseTime) * 0.02;
      buttonMaterial.emissiveIntensity = 0.8 + Math.sin(buttonPulseTime * 2) * 0.3;

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
        
        // Animate floating math objects
        for (let i = floatingObjects.length - 1; i >= 0; i--) {
          const f = floatingObjects[i];
          if (f.examined) {
            // Rush toward camera, growing and spinning
            const elapsed = (performance.now() - f.fadeStartTime) / 1000;
            const fadeDuration = 1.8;
            const fadeProgress = Math.min(1.0, elapsed / fadeDuration);

            // Accelerating rush toward camera (ease-in quadratic — grows faster early)
            const rushT = fadeProgress * fadeProgress;
            const camPos = camera.position;
            f.mesh.position.lerpVectors(f._rushStartPos, camPos, rushT);

            // Scale up as it approaches — starts at base, ends at 8x, quadratic for faster early growth
            const scaleMult = 1.0 + 7.0 * rushT;
            f.mesh.scale.copy(f._baseScale).multiplyScalar(scaleMult);

            // Ramp emissive brighter as it gets closer
            f.mesh.traverse(obj => {
              if (obj.material) {
                if (obj.material.emissive) obj.material.emissiveIntensity = 1.5 + 3.0 * rushT;
                // Fade out opacity in last 20%
                if (fadeProgress > 0.8) {
                  obj.material.transparent = true;
                  obj.material.depthWrite = false;
                  obj.material.opacity = 1.0 - ((fadeProgress - 0.8) / 0.2);
                }
              }
            });

            // Spin faster and faster
            const spinSpeed = 3.0 + 15.0 * rushT;
            f.mesh.rotation.x += spinSpeed * vizDelta;
            f.mesh.rotation.y += spinSpeed * 1.3 * vizDelta;

            if (fadeProgress >= 1.0) {
              floatingScene.remove(f.mesh);
              scene.remove(f.hitBox);
              floatingHitBoxMap.delete(f.hitBox);
              const hbIdx = _floatingHitBoxArray.indexOf(f.hitBox);
              if (hbIdx !== -1) _floatingHitBoxArray.splice(hbIdx, 1);
              floatingObjects.splice(i, 1);
            }
          } else {
            // Normal floating motion
            f.mesh.position.addScaledVector(f.velocity, vizDelta);
            f.mesh.rotation.x += f.angularVelocity.x * vizDelta;
            f.mesh.rotation.y += f.angularVelocity.y * vizDelta;
            f.mesh.rotation.z += f.angularVelocity.z * vizDelta;

            // Bounce off spherical boundary (radius 25 from origin)
            const distFromCenter = f.mesh.position.length();
            if (distFromCenter > 25) {
              // Reflect velocity inward
              const normal = f.mesh.position.clone().normalize();
              f.velocity.reflect(normal);
              f.mesh.position.normalize().multiplyScalar(25);
            }

            // Sync hitbox
            f.hitBox.position.copy(f.mesh.position);
          }
        }

        // Show exit zone (DISABLED FOR TESTING)
        // exitZoneMaterial.opacity = Math.min(0.3, exitZoneMaterial.opacity + deltaTime * 2);

        // Hide 3D ring meshes — rings are drawn by the trip shader via cylindrical projection
        alignmentCircles.forEach(circle => {
          circle.mesh.visible = false;
        });

        // Update trip shader ring uniforms
        tripShaderMaterial.uniforms.ringOpacity.value = Math.min(0.8, tripShaderMaterial.uniforms.ringOpacity.value + vizDelta * 2);
        tripShaderMaterial.uniforms.camPos.value.copy(camera.position);
        camera.updateMatrixWorld(true);
        const camRotInv = new THREE.Matrix3().setFromMatrix4(camera.matrixWorldInverse);
        tripShaderMaterial.uniforms.camRotInv.value.copy(camRotInv);

        // Check if player is looking at any ring (~15 degrees)
        {
          const fwd = _forward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
          let seesRing = false;
          for (const circle of alignmentCircles) {
            const toRing = circle.position.clone().sub(camera.position);
            const dist = toRing.length();
            if (dist < 0.5) continue; // too close to meaningfully check
            toRing.normalize();
            const dot = fwd.dot(toRing);
            if (Math.abs(dot) > Math.cos(0.26)) { // ~15 degrees, either direction
              seesRing = true;
              break;
            }
          }
          if (seesRing !== lookingAtRingRef.current) {
            lookingAtRingRef.current = seesRing;
            setLookingAtRing(seesRing);
          }
        }

        // Check alignment — strict position and look direction
        const positionTolerance = 0.5;  // ±0.5 units on X axis
        const angleTolerance = 0.06;    // ~3.4 degrees

        const inPosition = Math.abs(camera.position.x) < positionTolerance;

        // Check if looking along Z axis (either direction)
        const forward = _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
        const lookingForward = Math.abs(forward.z) > Math.cos(angleTolerance) && Math.abs(forward.x) < Math.sin(angleTolerance) && Math.abs(forward.y) < Math.sin(angleTolerance);
        
        const aligned = inPosition && lookingForward;
        
        // Debug logging every 60 frames (~1 second)
        if (currentTime % 1000 < 16) {
          console.log('Alignment Debug:', {
            position: `${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}`,
            posOffsetX: `${Math.abs(camera.position.x).toFixed(2)} < ${positionTolerance}`,
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
          alignmentTimeRef.current += vizDelta * 1000;
          const progress = Math.min(100, (alignmentTimeRef.current / alignmentRequired) * 100);
          setAlignmentProgress(progress);
          
          console.log(`⏱️ Alignment time: ${alignmentTimeRef.current.toFixed(0)}ms / ${alignmentRequired}ms (${progress.toFixed(1)}%)`);
          
          // Pulse rings when aligned (handled in shader)
          tripShaderMaterial.uniforms.ringAligned.value = 1.0;
          
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
          tripShaderMaterial.uniforms.ringAligned.value = 0.0;
          // Fade portal overlay out when not aligned
          portalOverlayMaterial.uniforms.intensity.value = Math.max(0, portalOverlayMaterial.uniforms.intensity.value - vizDelta * 2);
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

        // Clean up floating objects
        floatingObjects.forEach(f => {
          floatingScene.remove(f.mesh);
          scene.remove(f.hitBox);
        });
        floatingObjects = [];
        _floatingHitBoxArray = [];
        floatingHitBoxMap.clear();

        // Hide exit zone
        exitZoneMaterial.opacity = Math.max(0, exitZoneMaterial.opacity - vizDelta * 2);
        
        // Hide circles when not tripping
        alignmentCircles.forEach(circle => {
          circle.material.opacity = 0;
          circle.mesh.visible = false;
        });
        tripShaderMaterial.uniforms.ringOpacity.value = 0;
        tripShaderMaterial.uniforms.ringAligned.value = 0;
        portalOverlayQuad.visible = false;
        portalOverlayMaterial.uniforms.intensity.value = 0;
        setIsAligned(false);
        wasAlignedRef.current = false;
        alignmentTimeRef.current = 0;
        setAlignmentProgress(0);
        lookingAtRingRef.current = false;
        setLookingAtRing(false);
      }

      // Audio per-frame updates
      if (am.initialized && audioLoaded) {
        // Footsteps: play twice per second while moving
        // During cinematic, keep prev position in sync to suppress footsteps
        if (buttonCinematicActive) {
          prevCamX = camera.position.x;
          prevCamZ = camera.position.z;
        }
        const dx = camera.position.x - prevCamX;
        const dz = camera.position.z - prevCamZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        prevCamX = camera.position.x;
        prevCamZ = camera.position.z;

        if (dist > 0.001 && currentTime - lastFootstepTime >= 500 && !trippingRef.current) {
          am.play('footstep', { volume: 0.4 });
          lastFootstepTime = currentTime;
        }

        // Trip bass: play when in range of trip button, stop when out of range
        const buttonInRange = hoveredPiece && hoveredPiece.isButton && !hoveredPiece.examined;
        if (buttonInRange && !tripBassPlaying) {
          tripBassPlaying = true;
          tripBassHandle = am.play('tripbass', { volume: 0.6 });
          // Schedule crossfade: start loop before intro ends, overlap with fade
          const crossfadeDur = 0.15; // 150ms crossfade overlap
          const introDur = am.getDuration('tripbass');
          if (introDur > crossfadeDur) {
            setTimeout(() => {
              if (!tripBassPlaying || !tripBassHandle) return;
              // Fade out intro tail
              am.stop(tripBassHandle, { fadeOut: crossfadeDur });
              tripBassHandle = null;
              // Fade in loop
              tripBassLoopHandle = am.play('tripbass_loop', { loop: true, volume: 0.6, fadeIn: crossfadeDur });
            }, (introDur - crossfadeDur) * 1000);
          }
          // Fade ambient music down quickly
          ambientHandles.forEach(h => am.setVolume(h, 0, 0.3));
        } else if (!buttonInRange && tripBassPlaying) {
          tripBassPlaying = false;
          if (tripBassHandle) { am.stop(tripBassHandle, { fadeOut: 0.05 }); tripBassHandle = null; }
          if (tripBassLoopHandle) { am.stop(tripBassLoopHandle, { fadeOut: 0.05 }); tripBassLoopHandle = null; }
          // Fade ambient music back up
          ambientHandles.forEach(h => am.setVolume(h, AMBIENT_VOLUME, 0.3));
        }
      }

      // Hyperspace warp transition
      if (warpActive) {
        const warpElapsed = (currentTime - warpStartTime) / 1000;
        const warpProgress = Math.min(1, warpElapsed / WARP_DURATION);
        warpShaderMaterial.uniforms.progress.value = warpProgress;

        // Warp FOV — zoom out dramatically during the rush
        const fovBoost = Math.sin(warpProgress * Math.PI) * 40;
        camera.fov = 75 + fovBoost;
        camera.updateProjectionMatrix();

        if (warpProgress >= 1) {
          // Warp complete — teleport into trip realm
          warpActive = false;
          camera.fov = 75;
          camera.updateProjectionMatrix();

          const data = warpPendingTripData;
          warpPendingTripData = null;

          trippingRef.current = true;
          setIsTripping(true);
          tripStartTime = warpStartTime;
          // Start at full intensity so there's no brightness dip after warp
          tripShaderMaterial.uniforms.intensity.value = 1.0;

          camera.position.set(...data.start.pos);
          prevCamX = camera.position.x;
          prevCamZ = camera.position.z;
          yaw = data.start.yaw;
          pitch = data.start.pitch;

          // Add floating objects to scene
          floatingObjects = [];
          _floatingHitBoxArray = [];
          floatingHitBoxMap.clear();
          data.pendingFloaters.forEach(({ clone, piece }) => {
            floatingScene.add(clone);
            const radius = 0.7;
            const hitBox = new THREE.Mesh(
              new THREE.SphereGeometry(radius, 8, 6),
              new THREE.MeshBasicMaterial({ visible: false })
            );
            hitBox.position.copy(clone.position);
            hitBox.layers.set(1);
            scene.add(hitBox);
            const entry = {
              mesh: clone,
              hitBox,
              source: piece,
              examined: false,
              fadeStartTime: 0,
              velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.8,
                (Math.random() - 0.5) * 0.4,
                (Math.random() - 0.5) * 0.8
              ),
              angularVelocity: new THREE.Vector3(
                (Math.random() - 0.5) * 1.6,
                (Math.random() - 0.5) * 1.6,
                (Math.random() - 0.5) * 1.6
              )
            };
            floatingObjects.push(entry);
            _floatingHitBoxArray.push(hitBox);
            floatingHitBoxMap.set(hitBox, entry);
          });
        }
      }

      // Update starfield ceiling
      if (starfieldActive && starfieldReveal < 1) {
        starfieldReveal = Math.min(1, starfieldReveal + vizDelta * 0.15);
      }
      if (starfieldReveal > 0) {
        ceilingMaterial.uniforms.uReveal.value = starfieldReveal;
        ceilingMaterial.uniforms.uTime.value += vizDelta;
        ceilingMaterial.uniforms.uCamPos.value.copy(activeCamera.position);
      }

      // Update trip effect
      if (trippingRef.current) {
        // Use elapsed time since trip started (in seconds)
        const elapsedSeconds = (currentTime - tripStartTime) / 1000;
        tripShaderMaterial.uniforms.time.value = elapsedSeconds;
        tripShaderMaterial.uniforms.intensity.value = Math.min(1, tripShaderMaterial.uniforms.intensity.value + vizDelta * 0.5);
        
        // Debug: log time value occasionally
        if (currentTime % 2000 < 16) {
          console.log('Shader time:', elapsedSeconds.toFixed(3), 'intensity:', tripShaderMaterial.uniforms.intensity.value.toFixed(3));
        }
      } else {
        tripShaderMaterial.uniforms.intensity.value = Math.max(0, tripShaderMaterial.uniforms.intensity.value - vizDelta * 2);
      }

      // Animate screen fade
      const fadeCurrent = screenFadeRef.current;
      const fadeTarget = screenFadeTargetRef.current;
      if (Math.abs(fadeCurrent - fadeTarget) > 0.001) {
        screenFadeRef.current += (fadeTarget - fadeCurrent) * Math.min(1, vizDelta * 2);
        setScreenFade(screenFadeRef.current);
      }

      // Update bloom render pass camera to match active camera
      bloomRenderPass.camera = activeCamera;

      // Render with or without post-processing
      if (warpActive) {
        // Hyperspace warp: render museum scene to texture
        renderer.setRenderTarget(renderTarget);
        renderer.render(scene, activeCamera);
        warpShaderMaterial.uniforms.tDiffuse.value = renderTarget.texture;
        warpShaderMaterial.uniforms.time.value = (currentTime - warpStartTime) / 1000;

        // Render trip shader to separate target for iris-in (progress > 0.75)
        if (warpShaderMaterial.uniforms.progress.value > 0.7) {
          // Set trip shader to full intensity for the preview
          const warpElapsedSec = (currentTime - warpStartTime) / 1000;
          tripShaderMaterial.uniforms.time.value = warpElapsedSec;
          tripShaderMaterial.uniforms.intensity.value = 1.0;
          tripShaderMaterial.uniforms.tDiffuse.value = renderTarget.texture;
          renderer.setRenderTarget(warpTripTarget);
          renderer.render(tripScene, tripCamera);
          warpShaderMaterial.uniforms.tTrip.value = warpTripTarget.texture;
          // Reset intensity so it doesn't affect later frames
          tripShaderMaterial.uniforms.intensity.value = 0;
        }

        renderer.setRenderTarget(null);
        renderer.render(warpScene, warpCamera);
      } else if (trippingRef.current || tripShaderMaterial.uniforms.intensity.value > 0.01) {
        // Render to texture
        renderer.setRenderTarget(renderTarget);
        renderer.render(scene, activeCamera);

        // Apply post-processing
        tripShaderMaterial.uniforms.tDiffuse.value = renderTarget.texture;
        renderer.setRenderTarget(null);

        if (useBloom()) {
          tripBloomComposer.render();
        } else {
          renderer.render(tripScene, tripCamera);
        }

        // Render floating objects on top of trip shader (separate scene)
        // Clear only depth buffer so floating objects aren't occluded by the fullscreen quad
        if (floatingObjects.length > 0) {
          renderer.autoClear = false;
          renderer.clearDepth();
          renderer.render(floatingScene, activeCamera);
          renderer.autoClear = true;
        }

        // Portal glow overlay (additive, on top of trip effect)
        if (portalOverlayQuad.visible) {
          renderer.autoClear = false;
          renderer.render(portalOverlayScene, portalOverlayCamera);
          renderer.autoClear = true;
        }
      } else {
        // Normal render (with or without bloom)
        if (useBloom()) {
          bloomComposer.render();
        } else {
          renderer.render(scene, activeCamera);
        }
      }
      // Hide loading screen after first frame
      if (!firstFrameRendered) {
        firstFrameRendered = true;
        setLoading(false);
      }
    };
    let firstFrameRendered = false;
    animate();

    // Finish button handler (via custom event from React onClick)
    const finishHandler = () => {
      if (!gameStateRef.current.completionMethod) {
        gameStateRef.current.completionMethod = 'early';
      }
      finishGame();
    };
    window.addEventListener('museum-finish', finishHandler);

    // Return cleanup function
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
      document.removeEventListener('fullscreenchange', onResize);
      document.removeEventListener('webkitfullscreenchange', onResize);

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
      am.dispose();
      audioManagerRef.current = null;
    };
  };

  useEffect(() => {
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(mobile);

    // Portrait detection for mobile
    const checkOrientation = () => setIsPortrait(window.innerHeight > window.innerWidth);
    if (mobile) {
      checkOrientation();
      window.addEventListener('resize', checkOrientation);
    }

    // Defer heavy work: double-RAF ensures the loading screen is painted first
    let cleanupFn = null;
    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          cleanupFn = initMuseum(mobile);
        }
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (mobile) window.removeEventListener('resize', checkOrientation);
      if (cleanupFn) cleanupFn();
    };
  }, [onComplete]);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#1a1a2e' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Screen fade overlay */}
      {screenFade > 0.001 && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: `rgba(0,0,0,${screenFade})`,
          pointerEvents: 'none',
          zIndex: 150
        }} />
      )}

      {/* Loading screen */}
      {loading && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: '#1a1a2e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 400
        }}>
          <div style={{
            color: 'rgba(255,255,255,0.6)',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '1.2rem',
            fontWeight: '300',
            letterSpacing: '2px'
          }}>
            loading museum...
          </div>
        </div>
      )}

      {/* FPS counter (F key toggle) */}
      {showFps && (
        <div
          ref={fpsDisplayRef}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '4px 8px',
            background: 'rgba(0,0,0,0.6)',
            color: '#0f0',
            fontFamily: 'monospace',
            fontSize: '14px',
            zIndex: 300,
            pointerEvents: 'none',
            whiteSpace: 'pre'
          }}
        >
          -- ms
        </div>
      )}

      {/* Quality toast notification */}
      {qualityToast && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 20px',
          background: 'rgba(0,0,0,0.7)',
          color: '#ffcc44',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          borderRadius: '4px',
          zIndex: 300,
          pointerEvents: 'none',
          whiteSpace: 'nowrap'
        }}>
          {qualityToast}
        </div>
      )}

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
                ? 'touch left side to move, right side to look around.'
                : 'mouse to look around. wasd to move. gamepad supported.'
              }
            </p>
            <button
              onClick={() => { setInstructions(false); if (enterGameRef.current) enterGameRef.current(); }}
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
      {completionResults && (() => {
        const method = completionResults.completionMethod;
        const headerColor = method === 'trip' ? '#00ffff'
          : method === 'sober' ? '#ffcc44' : '#cccccc';
        const headerShadow = method === 'trip'
          ? '0 0 20px rgba(0,255,255,0.8), 0 0 40px rgba(0,255,255,0.4)'
          : method === 'sober'
          ? '0 0 20px rgba(255,204,68,0.6), 0 0 40px rgba(255,204,68,0.3)'
          : 'none';
        const minutes = Math.floor(completionResults.totalTime / 60);
        const seconds = Math.floor(completionResults.totalTime % 60);
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        const openPct = Math.round(completionResults.abstractnessLevel * 100);
        const barPct = Math.min(openPct, 100); // cap bar width at 100%
        const fadeInKeyframes = `@keyframes resultsFadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`;
        return (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          animation: 'resultsBgFade 1.5s ease-out'
        }}>
          <style>{fadeInKeyframes}{`
            @keyframes resultsBgFade { from { opacity: 0; } to { opacity: 1; } }
            @keyframes openBarFill { from { width: 0%; } to { width: ${barPct}%; } }
          `}</style>
          <div style={{
            color: 'white',
            textAlign: 'center',
            maxWidth: '500px',
            padding: '40px',
            fontFamily: 'system-ui, sans-serif'
          }}>
            <h2 style={{
              fontSize: '2rem',
              fontWeight: '300',
              marginBottom: '24px',
              color: headerColor,
              textShadow: headerShadow,
              animation: 'resultsFadeIn 0.8s ease-out both',
              animationDelay: '0.2s'
            }}>
              {method === 'trip' ? 'transcendence achieved'
                : method === 'sober' ? 'exhibition complete'
                : 'museum visited'}
            </h2>
            <div style={{ lineHeight: '2.2', fontSize: '15px', marginBottom: '30px' }}>
              <div style={{ opacity: 0.8, animation: 'resultsFadeIn 0.6s ease-out both', animationDelay: '0.7s' }}>
                Art pieces examined: {completionResults.uniqueDescriptions} / {totalArtRef.current}
              </div>
              <div style={{ opacity: 0.8, animation: 'resultsFadeIn 0.6s ease-out both', animationDelay: '1.2s' }}>
                Completion: {method === 'trip' ? 'psychedelic portal'
                  : method === 'sober' ? 'full gallery tour'
                  : 'early departure'}
              </div>
              <div style={{ opacity: 0.8, animation: 'resultsFadeIn 0.6s ease-out both', animationDelay: '1.7s' }}>
                Time played: {timeStr}
              </div>
              <div style={{ opacity: 0.8, animation: 'resultsFadeIn 0.6s ease-out both', animationDelay: '2.2s' }}>
                <div style={{ marginBottom: '4px' }}>Openness: {openPct}%</div>
                <div style={{
                  width: '100%',
                  height: '6px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${barPct}%`,
                    background: openPct > 100
                      ? 'linear-gradient(90deg, #00ffff, #ff00ff, #ffff00, #00ffff)'
                      : `linear-gradient(90deg, ${headerColor}, ${method === 'trip' ? '#8855ff' : method === 'sober' ? '#ff8844' : '#888888'})`,
                    borderRadius: '3px',
                    animation: 'openBarFill 1s ease-out both',
                    animationDelay: '2.4s'
                  }} />
                </div>
              </div>
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
                letterSpacing: '1px',
                opacity: 0,
                animation: 'resultsFadeIn 0.8s ease-out both',
                animationDelay: '2.8s'
              }}
            >
              continue
            </button>
          </div>
        </div>
        );
      })()}

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
            <div style={{ fontSize: '12px', opacity: 0.5 }}>
              {isMobile 
                ? 'Left: move | Right: look' 
                : gamepadConnected 
                  ? '🎮 Gamepad connected | Left stick: move | Right stick: look | A: interact'
                  : 'Mouse to look | WASD to move'}
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
          </div>

          {/* Ring hint - shown when looking at a ring but not yet aligned */}
          {isTripping && lookingAtRing && !isAligned && (
            <div style={{
              position: 'absolute',
              top: '60%',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(255,255,255,0.9)',
              fontSize: '16px',
              fontWeight: '400',
              letterSpacing: '3px',
              textShadow: '0 0 12px rgba(200,100,255,0.9), 0 0 24px rgba(0,0,0,1)',
              fontFamily: 'system-ui, sans-serif',
              pointerEvents: 'none',
              textAlign: 'center',
              transition: 'opacity 0.4s ease',
            }}>
              change your perspective to align
            </div>
          )}

          {/* Trip hint */}
          {isTripping && !isAligned && (
            <div style={{
              position: 'absolute',
              bottom: '12%',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(220,200,255,1)',
              fontSize: '14px',
              fontWeight: '300',
              letterSpacing: '2px',
              textShadow: '0 0 10px rgba(150,100,255,0.8), 0 0 20px rgba(0,0,0,0.9)',
              fontFamily: 'system-ui, sans-serif',
              pointerEvents: 'none',
              textAlign: 'center'
            }}>
              find alignment and transcend finding
            </div>
          )}

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
              textShadow: '0 0 20px rgba(0,255,255,1), 0 0 40px rgba(0,255,255,0.8), 0 0 4px rgba(0,0,0,1)',
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
              top: '45%',
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

          {/* Volume slider */}
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            opacity: 0.6
          }}>
            <span style={{ color: 'white', fontFamily: 'system-ui, sans-serif', fontSize: '12px' }}>
              {masterVolume === 0 ? '\u{1F507}' : '\u{1F50A}'}
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterVolume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setMasterVolume(v);
                if (audioManagerRef.current) audioManagerRef.current.setMasterVolume(v);
              }}
              style={{ width: '80px', cursor: 'pointer' }}
            />
          </div>

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
            i've seen enough
          </button>

          {/* Mobile joystick indicators */}
          {isMobile && (
            <>
              {/* Left joystick - movement */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '70px',
                transform: 'translateY(-50%)',
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
              {/* Right joystick - look */}
              <div style={{
                position: 'absolute',
                top: '50%',
                right: '70px',
                transform: 'translateY(-50%)',
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
            </>
          )}

          {/* Portrait orientation warning */}
          {isMobile && isPortrait && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.95)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500
            }}>
              <div style={{ color: 'white', textAlign: 'center', fontFamily: 'system-ui' }}>
                <div style={{ fontSize: '3rem' }}>⟳</div>
                <p>rotate your device to landscape</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WanderingMuseum;
