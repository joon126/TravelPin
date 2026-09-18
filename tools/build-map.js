/* ==========================================================================
   frontend/map-shapes.js 생성기
   --------------------------------------------------------------------------
   원본: southkorea/southkorea-maps (kostat 2013 시·도 경계, 통계청 자료 기반)
         https://github.com/southkorea/southkorea-maps

   원본 GeoJSON은 28MB / 62만 점이라 그대로 못 쓴다. 이 스크립트가
   (1) frontend/data.js의 MAP 상수로 투영하고
   (2) 미니맵 렌더 크기에서 안 보이는 점과 섬을 걷어낸 뒤
   (3) 시·도별 SVG path 문자열로 뽑아낸다.

   투영 상수는 data.js에서 직접 읽으므로 앱과 항상 같은 좌표계다.
   울릉도·독도는 실제 크기로 그리면 안 보여서 제외하고,
   app.js가 islandShapes의 과장된 타원으로 따로 그린다.

   사용법:
     node tools/build-map.js [원본.json 경로]
     (경로를 안 주면 임시 폴더에 내려받는다)
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const SOURCE_URL = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea_provinces_geo.json';

// 렌더 임계값 (viewBox 단위). 미니맵은 240px 안팎으로 그려지므로 1단위 ≈ 1.2px.
const SIMPLIFY_TOLERANCE = 0.12;  // 이보다 덜 튀어나온 굴곡은 버린다
const MIN_ISLAND_SIZE = 0.45;     // 가로·세로 모두 이보다 작은 섬은 버린다
const EXCLUDE_EAST_OF = 130.0;    // 울릉도·독도는 app.js가 따로 그린다

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'frontend', 'map-shapes.js');

/* ---------------------------------------------- data.js의 투영 상수 재사용 */

function loadProjection() {
  const src = fs.readFileSync(path.join(ROOT, 'frontend', 'data.js'), 'utf8');
  const sandbox = {};
  new Function('g', src + '\ng.MAP = MAP;')(sandbox);
  const MAP = sandbox.MAP;
  MAP.pxPerLat = MAP.pxPerLng / Math.cos(MAP.centerLat * Math.PI / 180);
  return MAP;
}

/* ------------------------------------------------------------------ 유틸 */

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    }).on('error', reject);
  });
}

// Douglas-Peucker. 굴곡이 tolerance보다 작으면 중간 점을 버린다.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const sqTol = tolerance * tolerance;

  const sqSegDist = (p, a, b) => {
    let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    return (p[0] - x) ** 2 + (p[1] - y) ** 2;
  };

  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSq = sqTol, index = -1;
    for (let i = first + 1; i < last; i++) {
      const sq = sqSegDist(points[i], points[first], points[last]);
      if (sq > maxSq) { maxSq = sq; index = i; }
    }
    if (index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/* ------------------------------------------------------------------ 변환 */

async function main() {
  const MAP = loadProjection();
  const toXY = ([lng, lat]) => [
    MAP.cx + (lng - MAP.centerLng) * MAP.pxPerLng,
    MAP.cy - (lat - MAP.centerLat) * MAP.pxPerLat
  ];

  let srcPath = process.argv[2];
  if (!srcPath) {
    srcPath = path.join(os.tmpdir(), 'skorea_provinces_geo.json');
    if (!fs.existsSync(srcPath)) {
      process.stdout.write('원본 GeoJSON 내려받는 중… ');
      await download(SOURCE_URL, srcPath);
      console.log('완료');
    }
  }

  const geo = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  const stats = { rings: 0, kept: 0, pointsIn: 0, pointsOut: 0 };
  const provinces = [];

  for (const feature of geo.features) {
    const name = feature.properties.name;
    const geom = feature.geometry;
    const polygons = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    const subpaths = [];

    for (const polygon of polygons) {
      // 울릉도·독도는 app.js가 과장된 타원으로 그린다
      if (polygon[0].some(c => c[0] > EXCLUDE_EAST_OF)) continue;

      polygon.forEach((ring, ringIndex) => {
        stats.rings++;
        stats.pointsIn += ring.length;

        const projected = ring.map(toXY);
        const xs = projected.map(p => p[0]), ys = projected.map(p => p[1]);
        const w = Math.max(...xs) - Math.min(...xs);
        const h = Math.max(...ys) - Math.min(...ys);

        // 바깥 링이 너무 작으면 그 폴리곤 통째로 버린다 (구멍은 크기와 무관하게 유지)
        if (ringIndex === 0 && w < MIN_ISLAND_SIZE && h < MIN_ISLAND_SIZE) return;

        const simplified = simplify(projected, SIMPLIFY_TOLERANCE);
        if (simplified.length < 4) return;

        stats.kept++;
        stats.pointsOut += simplified.length;
        subpaths.push(
          simplified
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
            .join('') + 'Z'
        );
      });
    }

    if (subpaths.length) provinces.push({ name, d: subpaths.join('') });
  }

  const body = provinces
    .map(p => `  { n: ${JSON.stringify(p.name)}, d: ${JSON.stringify(p.d)} }`)
    .join(',\n');

  const out = `/* ==========================================================================
   시·도 경계 SVG path — tools/build-map.js가 생성한다. 직접 고치지 말 것.

   원본: southkorea/southkorea-maps (통계청 2013 시·도 경계)
   좌표계: frontend/data.js의 MAP 상수로 투영한 viewBox 단위
           (단순화 ${SIMPLIFY_TOLERANCE} / 최소 섬 크기 ${MIN_ISLAND_SIZE})
   울릉도·독도는 실제 크기로는 안 보여서 제외했다. app.js가 따로 그린다.
   ========================================================================== */

const provinceShapes = [
${body}
];
`;

  fs.writeFileSync(OUT, out);

  const all = provinces.flatMap(p => p.d.match(/-?\d+\.?\d*/g).map(Number));
  const xs = all.filter((_, i) => i % 2 === 0), ys = all.filter((_, i) => i % 2 === 1);
  console.log(`시·도 ${provinces.length}개 / 링 ${stats.kept}개 (원본 ${stats.rings}개)`);
  console.log(`점 ${stats.pointsIn.toLocaleString()} → ${stats.pointsOut.toLocaleString()}`);
  console.log(`bbox x ${Math.min(...xs).toFixed(1)}~${Math.max(...xs).toFixed(1)} / y ${Math.min(...ys).toFixed(1)}~${Math.max(...ys).toFixed(1)}`);
  console.log(`${OUT} — ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
