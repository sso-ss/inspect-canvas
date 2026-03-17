# inspect-canvas

[🇺🇸 English](README.md) | 🇰🇷 한국어

> 디자이너를 위한 Figma 스타일 브라우저 인스펙터.  
> 요소를 클릭 → 시각적으로 편집 → 소스 코드에 바로 저장.

---

## 왜 만들었나

Claude, ChatGPT, v0, Lovable, Bolt 같은 AI 도구 덕분에 디자이너도 Figma 디자인에서 코드를 직접 생성할 수 있게 되었습니다. 개발 경험이 없어도요.

하지만 결과물이 처음부터 완벽한 경우는 거의 없습니다. 폰트 크기가 미묘하게 다르거나, 패딩이 안 맞거나, 색상이 미세하게 다르거나.

이런 작은 차이를 고치는 과정은 고통스럽습니다:

1. 브라우저에서 차이를 발견
2. DevTools에서 해당 요소를 찾으려고 시도 — 개발자를 위한 도구라 디자이너에겐 낯섦
3. 어떤 CSS 속성을 어떤 값으로 바꿔야 하는지 파악
4. AI에게 돌아가서 변경사항을 말로 설명
5. 코드를 다시 생성하고, 복사하고, 맞기를 기도
6. 반복

Figma에 익숙한 디자이너도 DevTools 앞에서는 완전히 길을 잃습니다. 패널 모양도 다르고, 용어도 다르고, 코딩을 이미 알고 있다고 가정하는 도구입니다.

**inspect-canvas는 그 간극을 메웁니다.**

생성된 앱을 Figma 오른쪽 패널처럼 생긴 인스펙터로 감싸줍니다. 요소를 클릭하면 복잡한 CSS 대신 익숙한 컨트롤을 볼 수 있습니다: 색상 피커, 폰트 크기, 여백, 테두리 반경, 레이아웃 방향. 값을 바꾸고 Apply를 누르면 소스 파일에 직접 반영됩니다. DevTools 없이. 코드 편집 없이. AI와 왔다 갔다 할 필요 없이.

디자이너가 마지막 10%의 디테일을 직접 다듬을 수 있도록 하는 것이 목표입니다.

---

## 기능

- **Figma 스타일 속성 패널** — 색상 피커, 타이포그래피, 여백, 레이아웃, 테두리 반경, 위치, 스트로크
- **클릭으로 선택** — 프리뷰에서 아무 요소나 클릭해서 검사하고 편집
- **뷰포트 프리셋** — 디바이스 프리셋으로 반응형 미리보기 (iPhone, iPad, 데스크톱, Full HD)
- **두 가지 모드** — 실행 중인 개발 서버 프록시 (`http://localhost:5173`) 또는 로컬 폴더 직접 서빙
- **소스에 직접 반영** — 변경사항이 소스 파일에 바로 패치됩니다 (HTML/CSS, React + Tailwind, Next.js)
- **React + Tailwind** — 편집하면 올바른 Tailwind 클래스가 `.tsx` 소스에 기록됩니다 (예: `text-lg`, `text-blue-500`)
- **Next.js 지원** — App Router와 Pages Router 모두 지원, 변경 후 자동 핫 리로드
- **AI 연동** — `.inspect-canvas.json`을 생성해서 AI 어시스턴트(GitHub Copilot, Claude)가 선택한 요소와 변경 요청을 정확히 파악할 수 있습니다

---

## 설치

```bash
npm install -g inspect-canvas
# 설치 없이 바로 사용:
npx inspect-canvas
```

### 원클릭 설치 (터미널 필요 없음)

터미널이 익숙하지 않다면 포함된 설치 스크립트를 사용하세요. Node.js 설치(필요시), inspect-canvas 글로벌 설치, AI 연동 설정을 한 번에 처리합니다.

| 플랫폼 | 파일 | 실행 방법 |
|--------|------|----------|
| **Mac** | `Install Inspect Canvas.command` | Finder에서 더블클릭 |
| **Windows** | `setup.bat` | 파일 탐색기에서 더블클릭 |

두 스크립트 모두 다음을 수행합니다:
1. Node.js 확인 (없으면 설치 안내)
2. npm으로 inspect-canvas 글로벌 설치
3. AI 연동을 위한 `.github/copilot-instructions.md` 설정

> **팁:** Mac에서 "열 수 없습니다" 경고가 뜨면 파일을 우클릭 → 열기를 선택하세요.

---

## 사용법

### 실행 중인 개발 서버 검사

```bash
inspect-canvas http://localhost:5173
```

### 로컬 폴더 서빙

```bash
inspect-canvas ./my-project
```

### 옵션

```
inspect-canvas <url-or-folder> [options]

  -p, --port <port>     인스펙터 서버 포트 (기본값: 3100)
  -o, --output <dir>    .inspect-canvas.json 저장 경로 (기본값: 현재 디렉토리)
  --no-open             브라우저 자동으로 열지 않기
  -h, --help            도움말 표시
```

### Node.js API

```ts
import { startInspectServer } from 'inspect-canvas';

await startInspectServer({
  url: 'http://localhost:5173', // 또는 localDir: './my-project'
  port: 3100,
  outputDir: './',
  openBrowser: true,
});
```

---

## 작동 방식

1. **열기** — inspect-canvas가 사이트를 플로팅 인스펙터 패널이 있는 셸로 감쌉니다
2. **클릭** — 요소를 클릭하면 현재 속성이 패널에 표시됩니다
3. **편집** — 패널에서 직접 값을 조정합니다 (색상 피커, 숫자 입력, 드롭다운)
4. **적용** — Apply를 누르면 소스 파일에 반영됩니다 (HTML/CSS, React/Tailwind, Next.js)
5. **AI 연동** — 프로젝트 루트에 `.inspect-canvas.json` 파일이 생성되어, AI에게 "이 요소 업데이트해줘"라고 말하면 정확히 무엇을 바꿔야 하는지 알 수 있습니다

---

## `.inspect-canvas.json`

클릭할 때마다 이 파일이 업데이트됩니다:

```json
{
  "tag": "h1",
  "selector": ".hero > h1",
  "text": "Welcome to my site",
  "styles": {
    "fontSize": "48px",
    "color": "#1a1a2e",
    "fontWeight": "700"
  },
  "size": { "width": 640, "height": 72 },
  "position": { "x": 400, "y": 120 },
  "source": "src/Hero.tsx:14",
  "instruction": "폰트 크기를 56px로, 색상을 #3B82F6으로 변경",
  "timestamp": "2026-03-15T10:00:00.000Z"
}
```

AI 도구들(그리고 `.github/copilot-instructions.md`를 통한 GitHub Copilot)이 이 파일을 읽고, 셀렉터, 현재 스타일, 소스 파일, 변경 요청을 파악합니다.

---

## 요구사항

- Node.js 18+

---

## 만든 사람

sso-ss

## 라이선스

MIT
