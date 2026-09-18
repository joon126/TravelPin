# 트래블핀 (TravelPin)

지도에 핀을 던져 국내 여행지를 랜덤으로 뽑아주는 한 페이지짜리 웹서비스.

- 현재 지역을 입력하면 그 지역 기준 **최대 이동 거리**(50~400km) 안에서 뽑는다.
- **섬 추가** 토글을 켜면 배/비행기로 가야 하는 관광섬(제주·울릉 등)도 거리 무관하게 후보에 들어간다.
- 결과에는 지역명 · 직선거리 · 예상 운전 시간 · 미니맵이 나오고, 네이버 지도 딥링크와 공유 버튼이 붙는다.
- 외부 지도 API를 쓰지 않는다(요금/쿼터 회피). 미니맵은 자체 SVG.

## 폴더 구조

```
TravelPin/
├── frontend/           # 배포되는 정적 파일 (html / css / js 만)
│   ├── index.html      # 마크업
│   ├── styles.css      # 다크 테마 스타일
│   ├── data.js         # 시·군·구 좌표 + 미니맵 투영 상수(MAP)
│   ├── map-shapes.js   # 시·도 경계 SVG path (생성물, 직접 고치지 말 것)
│   └── app.js          # 뽑기 로직, 미니맵, 공유
├── tools/
│   └── build-map.js    # map-shapes.js 생성기
├── docs/
│   └── PLAN.md         # 확정된 기획 + 남은 작업
├── vercel.json         # 배포 설정 (outputDirectory: frontend)
└── .gitignore
```

## 실행

빌드 도구 없음. `frontend/index.html`을 브라우저로 열면 바로 동작한다.

로컬 서버로 띄우고 싶다면:

```bash
cd frontend
python -m http.server 5500   # http://localhost:5500
```

## 데이터 수정

지역 데이터는 [frontend/data.js](frontend/data.js)의 배열 두 개가 전부다.

- `mainPool` — 거리 기반 뽑기 대상 (225곳)
- `islandPool` — "섬 추가" ON일 때만 들어가는 곳 (4곳: 제주시, 서귀포시, 울릉군, 인천 옹진군)

각 항목은 `{n:"지역명", lat:위도, lng:경도}` 형태다. 좌표는 시청/군청 소재지 기준 근사값이라,
정밀도를 높이려면 이 두 배열만 갈아끼우면 된다. 이름이 겹치는 지역은 `고성군(강원)` / `고성군(경남)`처럼 구분한다.

## 미니맵

[frontend/map-shapes.js](frontend/map-shapes.js)는 시·도 경계 SVG path를 담은 **생성물**이다.
원본은 [southkorea/southkorea-maps](https://github.com/southkorea/southkorea-maps)의 통계청 2013 시·도 경계(28MB, 62만 점)이고,
[tools/build-map.js](tools/build-map.js)가 이를 미니맵 크기에 맞게 단순화해 8천 점으로 줄인다.

```bash
node tools/build-map.js            # 원본을 임시 폴더에 받아서 생성
node tools/build-map.js 원본.json   # 이미 받아둔 파일로 생성
```

좌표는 `data.js`의 `MAP` 상수로 투영한 viewBox 단위다. 빌드 스크립트가 그 값을 `data.js`에서 직접 읽으므로
지도와 핀은 항상 같은 좌표계에 놓인다. **`MAP`을 바꾸면 `map-shapes.js`를 다시 생성해야 한다.**
울릉도·독도는 실제 크기로 그리면 보이지 않아 제외했고, `data.js`의 `islandShapes`가 과장된 타원으로 대신 그린다.

## 배포 (Vercel)

빌드 없는 정적 사이트다. 저장소를 Vercel에 연결하면 `vercel.json`의 `outputDirectory` 설정에 따라
`frontend/`가 그대로 서빙된다. 프레임워크 프리셋은 **Other**, 빌드 명령은 비워두면 된다.

CLI로 할 경우:

```bash
npx vercel        # 프리뷰
npx vercel --prod # 프로덕션
```
