# 트래블핀 (TravelPin)

지도에 핀을 던져 국내 여행지를 랜덤으로 뽑아주는 한 페이지짜리 웹서비스.

- 현재 지역을 입력하면 그 지역 기준 **최대 이동 거리**(50~400km) 안에서 뽑는다.
- **섬 추가** 토글을 켜면 배/비행기로 가야 하는 관광섬(제주·울릉 등)도 거리 무관하게 후보에 들어간다.
- 결과에는 지역명 · 직선거리 · 예상 운전 시간 · 미니맵이 나오고, 네이버 지도 딥링크와 공유 버튼이 붙는다.
- 외부 지도 API를 쓰지 않는다(요금/쿼터 회피). 미니맵은 자체 SVG.

## 폴더 구조

```
TravelPin/
├── frontend/          # 배포되는 정적 파일 (html / css / js 만)
│   ├── index.html     # 마크업
│   ├── styles.css     # 다크 테마 스타일
│   ├── data.js        # 시·군·구 좌표 데이터 (mainPool / islandPool)
│   └── app.js         # 뽑기 로직, 미니맵, 공유
├── docs/
│   └── PLAN.md        # 확정된 기획 + 남은 작업
├── vercel.json        # 배포 설정 (outputDirectory: frontend)
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

## 배포 (Vercel)

빌드 없는 정적 사이트다. 저장소를 Vercel에 연결하면 `vercel.json`의 `outputDirectory` 설정에 따라
`frontend/`가 그대로 서빙된다. 프레임워크 프리셋은 **Other**, 빌드 명령은 비워두면 된다.

CLI로 할 경우:

```bash
npx vercel        # 프리뷰
npx vercel --prod # 프로덕션
```
