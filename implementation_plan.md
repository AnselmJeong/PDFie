# PDFie implementation plan

_`PRD.md`를 실제 코드로 옮기기 위한 단계별 실행 계약 — 2026-08-04_

---

## 📋 실행 규칙

이 계획의 목적은 다른 agent가 저장소를 처음 접해도 범위와 순서를 추측하지 않고 구현할 수 있게 하는 것이다. 모든 단계는 이전 단계의 exit criteria를 통과한 후 진행한다.

### 시작 전 필수 읽기 순서

1. `/Volumes/Aquatope/_DEV_/PDFie/PRD.md`
2. `/Volumes/Aquatope/_DEV_/PDFie/implementation_plan.md`
3. `/Volumes/Aquatope/_DEV_/Interactive_Learning/electrobun.config.ts`
4. `/Volumes/Aquatope/_DEV_/Interactive_Learning/src/bun/`
5. `/Volumes/Aquatope/_DEV_/Interactive_Learning/src/bun/preppy-service.ts`
6. `/Volumes/Aquatope/_DEV_/PDF_to_MD/pdf-to-md/electrobun.config.ts`
7. `/Volumes/Aquatope/_DEV_/PDF_to_MD/pdf-to-md/src/bun/`
8. `/Volumes/Aquatope/_DEV_/MD_Reader/package.json`
9. `/Volumes/Aquatope/_DEV_/MD_Reader/src/renderer/src/App.tsx`
10. `/Volumes/Aquatope/_DEV_/MD_Reader/src/renderer/src/components/ChatPanel/`
11. `/Volumes/Aquatope/_DEV_/MD_Reader/src/renderer/src/store/useChatStore.ts`
12. `/Volumes/Aquatope/_DEV_/MD_Reader/src/main/ai-chat-service.ts`
13. `/Volumes/Aquatope/_DEV_/MD_Reader/src/main/chat-session-service.ts`
14. `/Volumes/Aquatope/_DEV_/Preppy/ARTICLE_MODE.md`
15. `/Volumes/Aquatope/_DEV_/Preppy/PDF_CHAPTER_HIERARCHY.md`

### 절대 규칙

- PDFie 이외의 모든 기준 저장소를 구현 중 수정하지 않는다.
- 모든 기준 저장소의 `.git`, `node_modules`, `out`, `dist`, `.venv`, cache를 복사하지 않는다.
- 사용자 소유의 dirty/untracked 파일을 정리하거나 삭제하지 않는다.
- Phase 0은 `bundleCEF: false`와 macOS native renderer로 시작한다. CEF는 원인 분리 spike 이전에 켜지 않는다.
- Phase 1부터 Phase 11은 Electrobun native 확정을 전제로 한다. Phase 0에서 CEF 또는 Electron이 선택되면 진행을 멈추고 두 최상위 문서를 먼저 갱신한다.
- Phase 0 runtime gate가 끝나기 전에 MD Reader main-process code를 대량 이식하지 않는다.
- Electron preload, `ipcMain`, `ipcRenderer`, electron-builder config와 Electron 전용 path helper를 PDFie에 그대로 복사하지 않는다.
- Electrobun view에서 Bun filesystem, process 또는 database API를 직접 사용하지 않는다.
- Bun/view 경계는 `src/shared/rpc/`의 typed RPC schema로 정의한다.
- runtime writable data는 `Utils.paths.userData`, cache 또는 logs 아래에만 저장하고 app resource directory에 쓰지 않는다.
- viewer selection benchmark를 통과하기 전에 production viewer를 확정하지 않는다.
- article/book 분류 전에 Docling을 선행 실행하지 않는다.
- usable bookmark가 있는 book에 Docling을 기본 실행하지 않는다.
- 현재 page가 바뀔 때마다 Docling 또는 전체 문서 extraction을 다시 실행하지 않는다.
- 원본 PDF를 변환된 Markdown으로 대체해 표시하지 않는다.
- raw file path를 임의 RPC payload나 remote URL에 노출하지 않는다.
- `pdf_item_index` 또는 viewer DOM node를 영구 locator로 저장하지 않는다.
- 테스트가 실패한 채 다음 phase로 넘어가지 않는다.

### 의사결정 기록

Phase 0에서 `docs/decisions/000-desktop-runtime.md`와 `docs/decisions/001-pdf-viewer.md`를 작성한다. 선택 이유만 적지 말고 fixture별 실제 결과, 실패, native/CEF/Electron packaging 결과와 버린 후보의 tradeoff를 기록한다. 두 decision이 완료된 이후 framework나 viewer를 바꾸려면 새 ADR과 회귀 검증이 필요하다.

## ⚙️ 목표 디렉터리 구조

초기 scaffold가 끝난 뒤 최소한 다음 경계를 갖는다. 실제 파일을 추가할 때 책임이 겹치면 새 파일을 만들기보다 이 경계를 우선 정리한다.

```text
PDFie/
├── PRD.md
├── implementation_plan.md
├── docs/
│   ├── decisions/
│   └── qa/
├── scripts/
│   ├── prepare-python-runtime.ts
│   └── verify-packaged-app.ts
├── tests/
│   ├── fixtures/pdf/
│   ├── golden-selection/
│   ├── unit/
│   └── integration/
├── src/
│   ├── bun/
│   │   ├── ai/
│   │   ├── pdf/
│   │   │   ├── analysis-cache.ts
│   │   │   ├── analysis-service.ts
│   │   │   ├── document-source-bridge.ts
│   │   │   ├── document-repository.ts
│   │   │   ├── preppy-worker.ts
│   │   │   └── worker-process.ts
│   │   ├── rpc-handlers.ts
│   │   └── index.ts
│   ├── views/main/
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── components/
│   │   │   ├── ChatPanel/
│   │   │   └── PdfReader/
│   │   ├── features/pdf/
│   │   │   ├── adapters/
│   │   │   ├── context/
│   │   │   └── selection/
│   │   ├── store/
│   │   └── styles/
│   └── shared/
│       ├── ai/
│       ├── rpc/
│       └── pdf/
│           ├── classification.ts
│           ├── context-types.ts
│           ├── domain.ts
│           └── rpc.ts
├── python/
├── electrobun.config.ts
├── package.json
└── tsconfig.json
```

## 🔍 Phase 0 — 기술 spike와 hard gate

### 목적

핵심 가치인 selection 정확도와 production packaging 가능성을 코드베이스 전체보다 먼저 검증한다. 이 phase에서는 MD Reader sidebar를 아직 통합하지 않는다.

### 0.1 저장소와 최소 harness 준비

1. PDFie에서 Git 저장소를 초기화한다.
2. Electrobun + React + TypeScript의 최소 harness를 만든다.
3. 현재 설치할 Electrobun version과 generated config type을 공식 문서 및 typecheck로 확인한다. API가 빠르게 바뀌므로 과거 config field를 추측하지 않는다.
4. package name, app identifier와 product name은 처음부터 PDFie로 설정한다.
5. macOS deployment target은 14 이상으로 명시한다.
6. macOS config는 CEF를 포함하지 않고 native renderer를 기본값으로 둔다.
7. Bun entrypoint는 `src/bun/index.ts`, React view entrypoint는 `src/views/main/index.tsx`로 둔다.
8. `views://main/index.html`에서 main view를 열고 Bun/view 사이에 최소 typed RPC round trip을 만든다.
9. formatter, typecheck, lint와 최소 unit test runner를 추가한다.
10. dev, typecheck, unit test, dev build와 stable build script가 동작하게 한다.

예상 script contract:

```json
{
  "scripts": {
    "dev": "electrobun dev",
    "dev:watch": "electrobun dev --watch",
    "build:dev": "electrobun build",
    "build:stable": "electrobun build --env=stable",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:viewer": "vitest run tests/golden-selection"
  }
}
```

package manager와 script runner는 Bun을 사용한다. 현재 라이브러리의 정확한 설정은 구현 시 공식 문서를 다시 확인하되, `/Volumes/Aquatope/_DEV_/Interactive_Learning/electrobun.config.ts`의 검증된 macOS native config와 build layout을 비교 기준으로 사용한다. `bundleCEF: false`와 native renderer라는 의미는 유지하되 config key 이름은 설치 version의 TypeScript type을 따른다.

### 0.2 PDF source bridge spike

Electron custom protocol을 그대로 옮기지 않는다. Bun process만 raw path를 알고 view에는 임시 `documentId`만 노출하는 `PdfSourceBridge` contract를 먼저 만든다.

다음 두 전달 방식을 long-book fixture로 비교한다.

1. typed RPC로 PDF bytes를 받아 view에서 Blob URL을 만드는 방식
2. Bun-owned loopback source server가 random port와 per-launch token으로 range request를 제공하는 방식

비교 항목은 첫 page 시간, 300페이지 문서의 peak memory, bytes duplicate copy, range request 지원, 취소, token 노출과 packaged app 동작이다. loopback 방식을 선택하면 `127.0.0.1`에만 bind하고 path 대신 document ID를 사용하며, 고정 token·directory listing·임의 path query를 금지한다. 선택 결과는 runtime ADR에 포함하고 이후 viewer는 `PdfSourceBridge`만 참조한다.

### 0.3 Fixture corpus 준비

commit 가능한 fixture는 직접 생성했거나 재배포 허용이 명확해야 한다. Preppy의 실제 책/논문 example은 로컬 수동 QA에는 사용할 수 있지만 라이선스 확인 없이 PDFie에 복사하지 않는다.

최소 fixture 유형:

| ID | 유형 | 반드시 검증할 selection |
| --- | --- | --- |
| `single-column-en` | 영어 단일 column | 문장, 문단, punctuation |
| `two-column-paper` | 학술 2단 편집 | column 경계, footnote |
| `korean-paper` | 한국어 text layer | 조사·문장부호·줄바꿈 |
| `ligature-hyphen` | ligature와 줄끝 hyphen | copy text 정규화 |
| `rotated-page` | 90도 회전 page | rect와 text |
| `multi-page` | page를 넘는 선택 | page별 rect |
| `scanned-image` | text layer 없음 | 설명 가능한 실패 |
| `long-book` | 300페이지 이상 | virtualization과 memory |
| `nested-bookmarks` | Part → Chapter | outline tree |
| `bad-bookmarks` | 외부·중복·역행 destination | fallback 판정 |

각 golden case는 다음 형식으로 저장한다.

```json
{
  "fixture": "two-column-paper.pdf",
  "caseId": "left-column-paragraph-1",
  "expectedText": "...",
  "expectedPages": [1],
  "notes": "The right column must not be included."
}
```

pointer drag 자체는 자동화가 불안정할 수 있으므로 두 층으로 검증한다.

1. selection plugin/API unit-level fixture
2. 실제 Electrobun native view에서 사람이 golden 시작·끝을 drag하는 manual checklist

### 0.4 Candidate A: EmbedPDF headless

1. Extend UI source를 참고하되 component 전체를 복사하지 않는다.
2. 다음 plugin만으로 최소 viewer를 만든다.
   - document manager
   - viewport, scroll, render/tiling
   - selection
   - search
   - bookmark
   - zoom, rotate
3. local PDF는 0.2에서 선택한 `PdfSourceBridge`로 연다.
4. selection의 formatted result에서 text, page index, rect를 수집한다.
5. bookmark tree와 destination page를 수집한다.
6. PDFium WASM을 `build.copy` 대상의 로컬 asset으로 지정하고 `views://`에서 결정적으로 찾는다.
7. PDFium worker와 image encoder worker의 Blob URL module-worker 생성이 native WebKit에서 동작하는지 확인한다.
8. CSP의 `worker-src`, `script-src`, `connect-src`와 WASM 실행에 필요한 최소 권한만 기록한다.
9. `SharedArrayBuffer`가 실제 선택 configuration에서 필요한지 확인하고, 필요할 때만 cross-origin isolation 전략을 별도 기록한다.
10. development와 stable packaged `.app`에서 같은 fixture를 연다.

기록할 값:

- first page time
- selection golden 결과
- 300페이지 scroll memory trend
- WASM asset path와 CSP 요구사항
- package size 변화
- Electrobun native stable `.app` 성공 여부
- Blob module worker 생성과 WASM MIME/fetch 결과
- `views://`와 source bridge의 CSP 요구사항
- 선택 rect가 zoom/rotation 후 맞는지

### 0.5 Candidate B: PDFSlick

1. `@pdfslick/react`로 같은 최소 viewer를 만든다.
2. `textLayerMode`를 명시하고 제공 CSS를 정확히 포함한다.
3. store에서 page, zoom과 `documentOutline`을 adapter 형태로 읽는다.
4. DOM selection과 PDF.js text item을 page/bbox locator로 정규화한다.
5. Candidate A와 동일 fixture, 동일 측정법을 사용한다.
6. native WebKit development build와 stable packaged `.app`에서 worker/CMap asset을 확인한다.

### 0.6 Runtime fallback gate

Phase 0은 다음 순서를 바꾸지 않는다.

1. Electrobun native + EmbedPDF를 먼저 검증한다.
2. EmbedPDF가 native WebKit에서만 실패하면 동일 commit과 fixture를 Electrobun CEF에서 재실행해 browser-engine 원인인지 분리한다.
3. PDFSlick은 native WebKit에서 selection golden gate를 통과할 때만 대안이 된다. PDF.js 기반이라는 이유로 낮은 selection 정확도를 허용하지 않는다.
4. CEF에서만 필수 gate가 통과하면 CEF를 즉시 production 기본값으로 만들지 않는다.
5. 같은 최소 viewer를 Electron Chromium에서 실행하고 MD Reader main-process 재사용 이점, app 크기, startup, memory, worker packaging과 유지보수 비용을 비교한다.
6. 결과를 `docs/decisions/000-desktop-runtime.md`에 기록하고 Phase 1 전에 Electrobun native, Electrobun CEF 또는 Electron 중 하나를 확정한다.

기본 추천은 Electrobun native다. Electrobun CEF와 Electron은 fallback 후보이며, CEF를 포함한다면 Electrobun의 native bundle 이점이 줄어든다는 비용을 decision에 명시한다. native WebKit이 모든 필수 gate를 통과하면 CEF와 Electron 비교는 실행하지 않는다.

### 0.7 Viewer 결정

다음 우선순위로 결정한다.

1. selection text와 reading order 정확성
2. page/bbox locator 안정성
3. 확정 runtime의 stable packaged app 동작
4. long-document performance
5. bookmark와 page API 접근성
6. MD Reader style로 감쌀 수 있는 정도
7. maintenance와 license

UI가 더 예쁘다는 이유로 정확성이 낮은 후보를 선택하지 않는다. native runtime에서 둘 다 golden gate를 통과하지 못하면 React-PDF로 되돌아가지 않는다. 먼저 0.6의 browser-engine 원인 분리를 끝내고, direct PDF.js viewer 또는 다른 PDFium integration을 조사하는 별도 decision을 만든다.

### Exit criteria

- [ ] 최소 20개 golden selection 결과가 기록됨
- [ ] 선택 후보가 모든 필수 golden case를 통과함
- [ ] nested bookmark를 tree로 읽을 수 있음
- [ ] 300페이지 PDF가 virtualized scroll됨
- [ ] PDF source bridge가 raw path 없이 development와 packaged app에서 동작함
- [ ] Electrobun native gate 결과가 development와 stable packaged app에서 기록됨
- [ ] 확정 runtime의 development와 stable packaged app에서 fixture가 열림
- [ ] 확정 runtime에서 Blob/module worker, WASM, CMap/font asset이 offline packaged app에서 로드됨
- [ ] `docs/decisions/000-desktop-runtime.md` 완료
- [ ] `docs/decisions/001-pdf-viewer.md` 완료
- [ ] runtime ADR이 Electrobun native를 확정하면 stable artifact에 CEF가 포함되지 않음
- [ ] runtime ADR이 CEF 또는 Electron을 선택하면 Phase 1 전에 `PRD.md`와 이 계획을 갱신하고 현재 실행을 중단함
- [ ] baseline tests와 build 통과

권장 commit: `spike: validate PDF viewer selection and packaging`

## 📦 Phase 1 — MD Reader 기반 app shell과 AI 재사용

### 목적

검증된 viewer harness에 MD Reader의 app chrome과 AI sidebar를 선택적으로 이식한다. Markdown과 EPUB reader code는 가져오지 않는다.

### 1.1 이식할 영역

실제 MD Reader 상태를 먼저 확인하고 아래 목록을 기능 단위로 이식한다. Electron과 Node import가 없는 React/shared 코드는 선택적으로 복사할 수 있지만, main-process 파일은 제품 동작의 기준으로 읽고 Electrobun Bun service로 포팅한다.

Bun-side service 포팅 후보:

- `agent-memory-files.ts`
- `agent-memory-service.ts`
- `agent-memory-settings.ts`
- `ai-chat-service.ts`
- `ai-chat-types.ts`
- `ai-provider-settings.ts`
- `chat-session-service.ts`
- `mem0-client.ts`
- `memory-extractor.ts`
- `ollama-openai-client.ts`
- `ollama-service.ts`
- `ollama-web-search-service.ts`
- `settings-service.ts`
- `simple-store.ts`
- `web-research.ts`

Main view 후보:

- `components/ChatPanel/`
- `store/useChatStore.ts`
- AI 관련 `SettingsModal` 영역
- `utils/ollama-model-filter.ts`
- AI sidebar markdown style
- theme와 sidebar width 관련 UI store

Shared 후보:

- `shared/ai-prompts.ts`

각 후보마다 원본 MD Reader commit, 가져온 제품 동작, 제외한 Electron 의존성과 PDFie target 파일을 `docs/decisions/002-md-reader-ai-port.md`에 기록한다.

### 1.2 가져오지 않을 영역

- Markdown renderer와 editor/save behavior
- EPUB renderer, CFI, annotation와 reading progress service
- Markdown/EPUB `chat-context.ts`
- TTS는 별도 요청 전까지 제외
- MD/EPUB file extension 처리
- 기존 `documentContent` 전체를 system prompt에 붙이는 code path
- Electron `preload`, `ipcMain`, `ipcRenderer`와 window lifecycle code
- electron-builder, electron-vite와 Electron custom protocol code
- `better-sqlite3` native binding의 무검증 직접 복사

### 1.3 App shell 정리

1. product copy를 PDFie로 변경한다.
2. toolbar와 welcome screen을 PDF 전용으로 바꾼다.
3. main layout은 PDF surface + resizable AI sidebar를 유지한다.
4. theme는 MD Reader와 동일한 light/sepia/dark 의미를 유지한다.
5. sidebar component가 PDF store를 직접 읽지 않도록 message submit input을 typed contract로 바꾼다.
6. `src/shared/rpc/ai-rpc.ts`에서 model listing, settings, streaming start/stop, chat session과 memory request/message schema를 정의한다.
7. view는 `Electroview` RPC client만 사용하고 Bun service는 `BrowserView.defineRPC` handler 뒤에 둔다.
8. Electron dialog/path/app APIs는 Electrobun `Utils`와 Bun-owned service로 바꾼다.
9. app 종료 시 저장과 AI/worker cleanup은 Electrobun `before-quit` lifecycle에서 수행한다.

### 1.4 Porting verification

- model list가 로드된다.
- AI provider settings가 저장된다.
- streaming, stop, error가 동작한다.
- chat session 저장과 복원이 동작한다.
- sidebar width와 font size가 복구된다.
- PDF를 열지 않아도 sidebar 오류로 app이 crash하지 않는다.
- RPC payload validation 실패가 Bun process crash로 이어지지 않는다.
- stable packaged app에서 provider settings와 chat persistence가 복구된다.

### Exit criteria

- [ ] Markdown/EPUB dependency가 PDFie runtime에 없음
- [ ] MD Reader AI sidebar 동작 parity checklist 통과
- [ ] AI service와 main view 사이 typed RPC 유지
- [ ] Electron runtime, preload와 IPC dependency가 PDFie에 없음
- [ ] Bun-owned persistence가 `Utils.paths.userData` 아래에서 동작
- [ ] build, typecheck, tests 통과

권장 commit: `feat: scaffold PDFie with the MD Reader AI shell`

## 💾 Phase 2 — PDF identity, source bridge, domain과 persistence

### 목적

viewer와 AI가 공유할 안정적인 PDF identity와 재시작 가능한 상태를 만든다.

### 2.1 Shared types

다음 파일을 먼저 작성한다.

- `src/shared/pdf/domain.ts`
- `src/shared/pdf/rpc.ts`
- `src/shared/pdf/classification.ts`
- `src/shared/pdf/context-types.ts`

`PRD.md`의 type을 그대로 옮기되 view-only instance와 RPC DTO를 구분한다. 모든 RPC payload는 serializer가 지원하는 명시적 DTO만 사용하고 `File`, DOM node, viewer plugin instance, database row object와 raw filesystem path를 넘기지 않는다.

### 2.2 Document open service

1. Bun process에서 Electrobun `Utils.openFileDialog`를 사용해 `.pdf`만 허용하는 open dialog를 만든다.
2. file stat과 magic bytes를 검증한다.
3. stream으로 SHA-256을 계산한다.
4. cryptographically random한 `documentId`를 발급하고 path mapping을 Bun memory에 둔다.
5. Phase 0에서 확정한 `PdfSourceBridge`를 구현하고 viewer에는 source descriptor만 반환한다.
6. loopback source server를 선택했다면 `127.0.0.1` bind, per-launch secret, document allowlist, range request, origin/CSP 제한과 shutdown close를 구현한다.
7. RPC Blob 방식을 선택했다면 300페이지 fixture의 memory budget을 회귀 테스트하고 사용이 끝난 Blob URL을 revoke한다.
8. close 시 mapping과 token을 정리하되 최근 문서 path는 Bun-owned persistence에 저장한다.

### 2.3 Persistence schema

기존 chat DB와 충돌하지 않는 migration으로 다음 logical table을 만든다.

```text
pdf_documents
  document_hash PK
  last_path
  file_name
  page_count
  document_type
  document_type_confidence
  document_type_source
  classification_evidence_json
  extraction_mode
  structure_mode
  analysis_version
  current_page
  zoom
  rotation
  updated_at

pdf_semantic_units
  document_hash
  unit_id
  kind
  title
  parent_title
  page_start
  page_end
  source
  sort_order
```

기본 DB adapter는 Bun runtime에 맞는 SQLite implementation을 사용한다. MD Reader의 `better-sqlite3` 호출을 view나 service에 흩뜨리지 말고 `DocumentRepository`, `ChatRepository`, `SettingsRepository` interface 뒤에 둔다. native binding을 선택하려면 stable packaged app에서 load가 검증되어야 한다.

chunk 본문은 SQLite blob에 넣지 않고 `Utils.paths.userData` 아래 versioned cache file에 둔다. migration은 idempotent해야 하며 legacy chat table을 삭제하지 않는다.

### 2.4 Store

`usePdfDocumentStore`는 tab UI state만 담당한다. file hash, persisted record와 analysis 결과는 Bun service가 source of truth다. 대용량 PDF bytes와 전체 document text를 Zustand에 넣지 않는다.

### Tests

- hash가 path와 무관하게 동일함
- magic-byte가 아닌 가짜 `.pdf` 거부
- source bridge의 path traversal, 잘못된 document ID와 token 거부
- 같은 PDF 재열기 시 tab/cache 재사용
- migration 재실행 안전
- restart 후 page/zoom/type 복원

### Exit criteria

- [ ] document identity가 SHA-256 기반
- [ ] main view가 raw filesystem API와 raw PDF path를 사용하지 않음
- [ ] PDF bytes를 base64로 Zustand에 저장하지 않음
- [ ] source bridge가 app 종료 시 listener, token과 Blob resource를 정리함
- [ ] persistence integration test 통과

권장 commit: `feat: add secure PDF identity and persistent document state`

## 📚 Phase 3 — Production viewer adapter

### 목적

Phase 0의 승자를 정식 adapter로 격리하고 PDFie chrome에 연결한다.

### 3.1 Adapter 구현

다음을 구현한다.

- `PdfViewerAdapter` interface
- 선정 viewer adapter
- selection normalizer
- bookmark normalizer
- active-page subscription
- page text accessor
- page/bbox navigation

viewer library의 raw store나 plugin type은 adapter 디렉터리 밖으로 export하지 않는다.

### 3.2 Reader UI

최소 component:

- `PdfReader.tsx`
- `PdfToolbar.tsx`
- `PdfNavigationRail.tsx`
- `PdfSelectionMenu.tsx`
- `PdfLoadingState.tsx`
- `PdfErrorState.tsx`
- `PdfStatus.tsx`

selection menu는 native copy를 방해하지 않으며 selection이 확정된 뒤 나타난다. `Explain`, `Summarize`, `Ask AI`는 동일한 `PdfSelection` DTO를 사용한다.

### 3.3 Reading progress

- active page update를 debounce해 main persistence로 보낸다.
- page가 chapter 경계를 넘으면 context switch event를 발생시킨다.
- zoom과 rotation을 문서 hash별로 저장한다.
- scroll 중 매 frame DB write를 하지 않는다.

### Tests

- adapter contract test
- selection rect PDF coordinate 정규화
- zoom/rotation 후 locator round trip
- tab 전환 시 viewer instance cleanup
- password/copy permission/no-text-layer state

### Exit criteria

- [ ] viewer-specific API가 adapter 밖에 새지 않음
- [ ] golden selection suite가 정식 component에서도 통과
- [ ] page/zoom/rotation 복원
- [ ] long PDF tab close 후 resource 해제

권장 commit: `feat: integrate the validated PDF viewer adapter`

## 🔍 Phase 4 — Fast article/book classifier

### 목적

Docling 없이 빠른 facts만으로 routing을 결정하고 불확실성을 사용자에게 노출한다.

### 4.1 Fast facts collector

viewer adapter에서 다음만 요청한다.

- metadata
- page count
- normalized outline
- first 3 page text
- final 20% 내 최대 3 page text
- text item/printable ratio

문서 전체 text를 classifier를 위해 선행 추출하지 않는다.

### 4.2 Pure classifier

`classifyPdfDocument(facts)`는 외부 상태 없이 다음을 반환한다.

```ts
interface ClassificationResult {
  documentType: 'article' | 'book' | 'unknown'
  confidence: number
  articleScore: number
  bookScore: number
  evidence: Array<{ code: string; weight: number; detail?: string }>
}
```

PRD scoring table을 초기 계약으로 구현한다. regex는 DOI, ISBN, heading label을 별도 module로 두고 multilingual fixture를 추가한다.

### 4.3 User override

- toolbar/status 영역에 `논문`, `책` control을 둔다.
- confidence가 높으면 compact label로 표시한다.
- `unknown` 또는 낮은 confidence면 눈에 띄되 읽기를 막지 않는 선택 control을 보인다.
- 사용자가 변경하면 이전 derived structure를 invalidation하고 새 routing을 실행한다.
- user override는 자동 재분석으로 덮어쓰지 않는다.

### Corpus test

저작권 문제가 없는 최소 20 article + 20 book corpus manifest를 만든다. PDF 자체를 commit할 수 없으면 local fixture path가 아닌 추출한 fast-facts JSON을 commit해 classifier regression에 사용한다.

목표:

- high-confidence auto result의 오분류율 5% 이하
- ambiguous 문서는 잘못 확정하기보다 `unknown`
- user override persistence 100%

### Exit criteria

- [ ] classifier unit tests와 corpus report 완료
- [ ] Docling process를 시작하지 않고 판별
- [ ] confidence/evidence 저장
- [ ] unknown UI와 override persistence 동작

권장 commit: `feat: route PDFs by article and book semantics`

## 📚 Phase 5 — Bookmark book structure

### 목적

usable bookmark가 있는 book을 Docling 없이 semantic chapter로 구조화한다.

### 5.1 Preppy hierarchy logic port

`/Volumes/Aquatope/_DEV_/Preppy/PDF_CHAPTER_HIERARCHY.md`를 porting contract로 사용한다. 함수 하나만 복사하지 말고 다음 동작을 함께 옮긴다.

- title normalization과 control character 제거
- outline tree 구축
- frontmatter/backmatter classification
- Part/Book/Volume/Unit/Roman numeral container 판별
- mixed depth child chapter 선택
- oversized content node guardrail
- parent title과 outline level 보존
- selected semantic unit의 page range 계산

Docling item mapping과 Markdown slicing은 bookmark-only path에 가져오지 않는다.

### 5.2 Usability validator

반드시 별도 pure function으로 만든다.

```ts
validateOutline(outline, pageCount): {
  usable: boolean
  reasons: string[]
  units: PdfSemanticUnit[]
}
```

외부 URI, destination 해석 실패, 중복/역행 page, container-only tree, 낮은 coverage를 fixture로 검증한다.

### 5.3 Page lookup

정렬된 semantic unit으로 `pageNumber → unitId` binary lookup을 만든다. frontmatter page는 첫 chapter로 거짓 귀속하지 말고 `null` 또는 frontmatter unit을 반환한다.

### 5.4 Navigation과 chat context

- outline click은 viewer adapter를 통해 이동한다.
- active page가 새 semantic chapter로 들어가면 chat context key를 바꾼다.
- Part는 rail grouping label이며 기본 chat session owner가 아니다.

### Exit criteria

- [ ] nested Part → Chapter fixture 통과
- [ ] Notes/Index가 기본 chapter로 선택되지 않음
- [ ] usable outline book에서 worker spawn이 0회
- [ ] page lookup과 chat context switch 통과

권장 commit: `feat: derive book chapters from PDF bookmarks`

## 📚 Phase 6 — Native text index와 article mode

### 목적

article과 bookmark book에서 Docling 없이 AI context에 사용할 page-aware chunk index를 만든다.

### 6.1 Native text quality gate

page별로 다음을 측정한다.

- text item 존재 여부
- printable character 비율
- replacement/control character 비율
- 극단적으로 긴 무공백 token
- column reading-order anomaly의 보수적 signal
- image-only page 비율

결과는 `native-ok`, `needs-docling`, `needs-ocr`, `restricted`로 분류하고 diagnostics에 근거를 기록한다.

### 6.2 Article unit

- `pageStart = 1`, `pageEnd = pageCount`인 단일 article unit을 만든다.
- heading은 chunk metadata일 뿐 chat session 경계가 아니다.
- late References heading을 찾으면 기본 retrieval index에서 이후 chunk를 제외한다.
- References 원문을 삭제하지 않고 별도 excluded flag로 보존한다.

### 6.3 Native chunking

1. page text item의 reading order를 viewer engine 결과에서 얻는다.
2. heading path와 page locator를 유지한다.
3. paragraph boundary를 우선하고 token budget에서만 분할한다.
4. 너무 작은 peer chunk는 같은 heading 아래에서만 병합한다.
5. stable chunk ID를 만든다.
6. `chunks-v1.jsonl`에 atomic write한다.

초기 chunk 목표는 400–900 tokens이며 heading, table 또는 page boundary를 무조건 깨서 숫자를 맞추지 않는다.

### Tests

- article은 정확히 하나의 chat semantic unit
- section 이동에도 같은 chat key
- References 기본 제외와 명시 검색 가능
- Korean/English paragraph chunking
- cache atomic write와 corruption recovery

### Exit criteria

- [ ] native article에서 Docling spawn 0회
- [ ] bookmark book도 native chunk index 생성 가능
- [ ] 모든 chunk에 page provenance 존재
- [ ] article session이 section 이동에서 유지됨

권장 commit: `feat: build native page-aware article and book indexes`

## 💬 Phase 7 — AI context assembler와 citation navigation

### 목적

MD Reader의 전체 `documentContent` 주입을 구조화된 PDF context로 교체한다.

### 7.1 Context request contract

```ts
interface PdfContextRequest {
  documentHash: string
  contextKey: string
  question: string
  activePage: number
  selection: PdfSelection | null
  semanticUnitId: string | null
  modelContextWindow?: number
}
```

### 7.2 Assembler algorithm

1. selection을 source 0으로 추가한다.
2. 선택 주변 또는 active page 주변 chunk를 추가한다.
3. 현재 article/chapter 안에서 lexical retrieval을 수행한다.
4. 질문이 전체 문서 비교를 명시할 때만 global retrieval을 허용한다.
5. 중복 text를 제거한다.
6. token budget을 넘으면 낮은 score source부터 제거한다.
7. source ID와 page metadata를 포함한 prompt section을 만든다.

MVP retrieval은 deterministic local lexical search로 시작한다. embedding/RAG는 별도 성능 근거 없이 먼저 도입하지 않는다.

### 7.3 Chat store 변경

- `sendMessage({ documentContent })`를 제거하거나 PDF path에서 사용하지 못하게 한다.
- `sendMessage({ contextBundle })` 형태로 명시한다.
- streaming 시작 시 context key를 snapshot한다.
- streaming 중 page/chapter가 바뀌어도 완료 메시지는 snapshot session에 저장한다.
- selection 원문 언어를 prompt instruction에 반영한다.

### 7.4 Citation UI

- 모델 응답의 자유 형식 page 숫자를 신뢰하지 않는다.
- 전달한 source ID에 대응하는 citation chip만 interactive하게 만든다.
- chip click은 `goToPage` 후 bbox overlay를 잠시 표시한다.
- bbox가 없으면 page top으로 이동한다.

### Tests

- priority ordering
- budget truncation
- duplicate elimination
- cross-chapter global retrieval opt-in
- selection language preservation
- streaming race와 context snapshot
- invalid source ID 무시

### Exit criteria

- [ ] 전체 document/chapter 무조건 주입 code가 없음
- [ ] selection이 항상 첫 source
- [ ] context budget test 통과
- [ ] citation click이 page/bbox로 이동
- [ ] chapter 전환 중 streaming race test 통과

권장 commit: `feat: assemble page-aware AI context for PDFs`

## ⚙️ Phase 8 — Preppy/Docling fallback worker

### 목적

bookmark 또는 native text로 충분하지 않은 문서만 background worker로 분석한다.

### 8.1 재사용 전략

Preppy 전체 source를 무기한 복제하지 않는다. 다음 중 하나를 명시적으로 결정하고 decision note를 남긴다.

1. PDFie에 version-pinned Python package로 포함
2. 필요한 module을 vendoring하고 upstream commit을 기록
3. 별도 worker bundle로 packaging

어느 안이든 Preppy version/commit과 cache `analysisVersion`을 함께 기록한다.

Python runtime은 개발자 machine의 `.venv`, Homebrew Python 또는 interactive shell PATH에 의존하지 않는다. `/Volumes/Aquatope/_DEV_/Interactive_Learning/scripts/prepare-python-runtime.ts`와 `python/.bundle/<platform>/runtime` layout을 기준으로 PDFie 전용 self-contained runtime을 준비하고, Electrobun `build.copy`로 stable artifact에 포함한다. `.venv/bin/python`이 외부 절대 경로 symlink인지 확인하지 않고 복사하는 방식은 금지한다.

### 8.2 PDFie용 Preppy contract 보강

현재 Preppy 결과를 바로 신뢰하기 전에 다음을 제공해야 한다.

- outline-derived chapter의 `page_end`
- heading뿐 아니라 AI chunk에 필요한 paragraph/table/caption item
- page와 bbox provenance
- stable chunk IDs
- page-to-chapter lookup 가능한 reader index
- progress event와 cancellation

Preppy 자체를 수정해야 한다면 변경은 `/Volumes/Aquatope/_DEV_/Preppy` working tree에 직접 하지 않는다. 먼저 PDFie에서 필요한 adapter/schema를 작성하고, upstream 변경이 필요하다는 근거와 별도 작업 범위를 사용자에게 보고한다.

### 8.3 Worker lifecycle

- 한 hash당 하나의 job만 실행
- queued/running/completed/failed/cancelled 상태
- typed RPC message로 전달하는 structured progress
- explicit timeout
- cancellation에서 child tree 종료
- stdout/stderr size 제한과 secret redaction
- temporary output 후 atomic rename
- `Bun.spawn`에 명시적인 executable, `cwd`, `PATH`, `PYTHONPATH`와 environment 전달
- dev와 packaged mode의 runtime/resource 후보 경로 분리
- writable output과 environment는 `Utils.paths.userData` 아래에 배치
- Electrobun `before-quit`에서 app shutdown cleanup

packaged worker resolver는 다음 순서를 갖는다.

1. app bundle에 복사된 `python/.bundle/<platform>/runtime/bin/python3`
2. 명시적인 PDFie 개발 runtime
3. 개발 모드에서만 허용한 `uv run` fallback

production stable app에서는 3번 fallback이 실행되면 실패로 취급한다. `process.cwd()`만으로 worker root를 찾지 않으며, resource 후보를 중앙 `resolveBundledResource()` helper에서 계산한다.

### 8.4 Routing matrix

| Document | Structure | Text | Worker 역할 |
| --- | --- | --- | --- |
| Article | 단일 문서 | 정상 | 실행 안 함 |
| Article | 단일 문서 | 불량 | text/figure/table extraction |
| Book | bookmark 정상 | 정상 | 실행 안 함 |
| Book | bookmark 정상 | 불량 | text extraction만, 경계 유지 |
| Book | bookmark 없음 | 정상/불량 | chapter detection + extraction |
| Unknown | 미결정 | 불량 | 사용자 유형 결정 전 실행 안 함 |

### 8.5 Result adapter

Preppy manifest/document/chunks를 PDFie `PdfSemanticUnit`과 `PdfTextChunk`로 변환한다. 원본 Preppy artifact를 cache에 보존하되 main view는 직접 읽지 않는다.

### Tests

- duplicate job suppression
- progress/cancel/timeout
- invalid JSON/schema rejection
- partial output cleanup
- bookmark boundary 유지 + Docling text 조합
- app shutdown orphan check
- restricted `PATH=/usr/bin:/bin`에서 bundled interpreter와 Preppy import smoke
- packaged `.app.tar.zst` 또는 실제 `.app` 내부 runtime/package 존재 확인

### Exit criteria

- [ ] native fast path에서 Python process 0회
- [ ] fallback 결과가 PDFie schema로 검증됨
- [ ] cancel/timeout/orphan process tests 통과
- [ ] clean environment에서 bundled Python/Preppy가 system Python 없이 실행됨
- [ ] 실패 후 native reading 유지

권장 commit: `feat: add cached Preppy fallback analysis`

## 🏠 Phase 9 — UX state와 polish

### 목적

기술 상태를 읽기 흐름을 방해하지 않는 명확한 UI로 표현한다.

### 9.1 상태 UI

다음 상태를 각각 fixture 또는 story로 재현한다.

- empty/recent files
- loading first page
- classifying
- article ready
- bookmark book ready
- unknown type
- Docling queued/running/completed
- Docling failed
- no text layer
- password required
- copy restricted
- corrupt PDF

### 9.2 Layout parity

- MD Reader의 AI sidebar width, typography, streaming layout을 유지한다.
- PDF viewer 기본 toolbar를 그대로 중복 표시하지 않는다.
- 일치 구절을 표시하는 search/bookmark rail과 AI sidebar가 좁은 창에서 충돌하지 않게 한다.
- 중요하지 않은 분석 세부사항은 status popover에 progressive disclosure한다.
- 모든 상태를 card 안에 넣거나 modal로 차단하지 않는다.

### 9.3 Accessibility와 keyboard

PRD shortcut을 구현하고 layout-independent key를 사용한다. Electrobun `ApplicationMenu`에 role-based Edit menu의 undo, redo, cut, copy, paste, delete와 select-all을 정의해 macOS native shortcut이 PDF selection과 입력창에서 모두 동작하게 한다. focus trap은 password dialog처럼 modal 의미가 실제로 있는 곳에만 사용한다. selection menu와 citation overlay는 keyboard와 screen reader label을 제공한다.

### Exit criteria

- [ ] 모든 key state가 명시적으로 렌더링됨
- [ ] keyboard-only core reading/AI flow 통과
- [ ] light/sepia/dark visual QA 통과
- [ ] reduced-motion QA 통과
- [ ] 1024px 폭에서도 reader와 sidebar 사용 가능

권장 commit: `feat: complete PDF reading states and accessibility`

## 🔐 Phase 10 — Security와 production packaging

### 목적

development shell 밖의 실제 `.app`에서 안전하게 동작하도록 한다.

### 10.1 Electrobun hardening

- main view는 trusted bundled `views://main/index.html`만 연다.
- main view에서 Bun filesystem, process, DB와 child-process API를 직접 사용할 수 없게 dependency boundary test를 둔다.
- Bun/view 통신은 shared schema의 typed allowlisted RPC만 사용하고 handler에서 runtime validation을 수행한다.
- `setNavigationRules`는 remote navigation과 new-window를 deny by default로 제한한다.
- 외부 링크는 URL scheme과 host를 검증한 뒤 명시적 사용자 동작에서만 `Utils.openExternal`로 연다.
- untrusted remote content가 필요해지면 main view에 직접 load하지 않고 별도 sandboxed view와 partition을 사용한다.
- source bridge의 document ID, token, range와 origin을 검증한다.
- PDF JavaScript action, launch action과 임의 attachment 실행을 허용하지 않는다.
- API key, source token, raw PDF path와 PDF 본문을 log에서 redaction한다.
- 종료 cleanup은 async 작업이 가능한 Electrobun `before-quit`에서 수행한다.

### 10.2 Asset packaging

선정 viewer에 따라 다음을 명시적으로 package한다.

- PDFium WASM 또는 PDF.js worker
- CMap, standard fonts
- viewer CSS
- self-contained Preppy/Python runtime와 model/assets
- migrations

`electrobun.config.ts`의 `build.copy` destination은 한 곳에서 관리하고 WASM, worker, font, Python runtime와 migration마다 source/destination manifest test를 둔다. resource path는 `process.cwd()`나 interactive shell PATH에 의존하지 않고 PDFie의 `resolveBundledResource()`가 dev/stable 후보를 명시적으로 계산한다. stable artifact는 `.app`, DMG와 `.app.tar.zst`의 실제 layout을 검사하며 resource directory가 항상 평평하게 unpack되어 있다고 가정하지 않는다.

macOS stable config는 code signing과 notarization을 release gate에 포함한다. runtime ADR이 Electrobun native를 확정했다면 config와 artifact 검사에서 CEF가 없음을 확인한다.

### 10.3 Packaged smoke matrix

| Scenario | Development | Packaged app |
| --- | --- | --- |
| Native renderer boot | 필수 | 필수 |
| Native article open | 필수 | 필수 |
| Bookmark book open | 필수 | 필수 |
| Selection → AI quote | 필수 | 필수 |
| Restart restore | 필수 | 필수 |
| Docling fallback | 필수 | 필수 |
| Worker cancel | 필수 | 필수 |
| Offline viewer assets | 필수 | 필수 |
| Restricted shell PATH | 선택 | 필수 |
| App quit cleanup | 필수 | 필수 |

### Exit criteria

- [ ] clean environment packaged smoke 통과
- [ ] PATH/CDN 의존 없음
- [ ] code signing과 notarization 결과 확인
- [ ] runtime ADR과 renderer/CEF artifact 구성이 일치
- [ ] security checklist와 dependency audit 완료
- [ ] worker orphan 없음

권장 commit: `build: package PDF engines and analysis worker`

## ✅ Phase 11 — 종합 QA와 release gate

### 자동 검증

최종 script 이름은 실제 package에 맞추되 최소 다음 범주를 모두 실행한다.

```bash
bun run typecheck
bun run lint
bun test
bun run test:viewer
bun run build:dev
bun run build:stable
```

Python worker가 포함되면 다음도 실행한다.

```bash
<bundled-python> -m compileall -q <worker-src>
<bundled-python> -m pytest -q <worker-tests>
```

### 실제 문서 QA

최소 다음 실제 문서를 수동 검증한다. 라이선스 때문에 저장소에 commit하지 않아도 된다.

- 짧은 native 학술 논문
- 2단 편집과 footnote가 있는 논문
- 표와 multi-panel figure가 있는 논문
- nested bookmark 단행본
- bookmark 없는 단행본
- 한국어 PDF
- image-only scanned PDF
- 300페이지 이상 PDF

각 문서에서 기록할 항목:

- classifier result/evidence
- selected routing과 worker 실행 여부
- selection expected/actual
- current context key
- AI에 전달된 source 목록
- citation navigation
- restart 복구
- diagnostics와 사용자 표시

### Release blocking failures

다음 중 하나라도 있으면 release하지 않는다.

- golden selection 불일치
- article/book override가 재시작 후 사라짐
- usable bookmark book에서 불필요한 Docling 실행
- article에서 chapter session 생성
- page/chapter 전환 중 chat session 오염
- source context budget 초과
- packaged app에서 WASM/worker/CMap 누락
- runtime ADR과 다른 renderer로 packaging되거나 Electrobun native artifact에 CEF가 포함됨
- clean environment에서 bundled Python/Preppy가 system PATH 또는 user-installed package를 요구함
- 원본 PDF 수정
- orphan Python process
- API key 또는 PDF 본문이 log에 노출

### Exit criteria

- [ ] PRD의 AC-01부터 AC-08까지 증거가 있음
- [ ] 자동 test와 `build:stable` 통과
- [ ] packaged manual QA 완료
- [ ] 알려진 제한이 `README.md`와 diagnostics UI에 반영됨
- [ ] release checklist와 rollback note 작성

권장 commit: `release: validate PDFie MVP`

## 📊 요구사항 추적표

| PRD 요구사항 | 구현 phase | 주 검증 |
| --- | --- | --- |
| 정확한 selection | 0, 3 | golden selection suite |
| 동일 AI sidebar | 1, 7 | React parity + typed RPC integration |
| article/book 구분 | 4 | corpus classifier test |
| article 단일 session | 6, 7 | context-key test |
| bookmark 우선 book | 5 | outline fixture + worker spy |
| Docling fallback | 8 | worker integration |
| page/bbox citation | 3, 7 | locator round trip |
| restart persistence | 2, 3, 7 | restart integration |
| Electrobun native runtime | 0, 10, 11 | runtime ADR + stable artifact inspection |
| packaged app | 0, 8, 10, 11 | clean packaged smoke |
| security/privacy | 1, 2, 10 | RPC/source-bridge/navigation tests |

## ⚠️ 구현자가 멈추고 보고해야 하는 조건

다음 상황에서는 임의 workaround를 product behavior로 굳히지 말고 현재 증거와 대안을 정리해 사용자에게 보고한다.

- EmbedPDF와 PDFSlick 모두 selection golden gate를 통과하지 못함
- PDFium WASM, Blob module worker 또는 PDF.js worker가 packaged Electrobun native view에서 안정적으로 로드되지 않음
- Electrobun native에서는 실패하고 CEF에서만 통과해 Electron 비교가 필요함
- Electrobun config/API가 문서와 달라 native renderer, `views://` 또는 `build.copy` contract를 type-safe하게 구성할 수 없음
- PDF source bridge가 raw path 노출 없이 300페이지 fixture의 성능·메모리 budget을 충족하지 못함
- Preppy schema 변경 없이는 page_end/provenance를 안전하게 만들 수 없음
- article/book classifier가 corpus 목표를 충족하지 못함
- AI provider의 실제 context window를 알 수 없어 안전한 budget을 계산할 수 없음
- copy restriction을 우회해야만 요구사항을 달성할 수 있음
- 새로운 dependency의 license가 배포 방식과 호환되지 않음
- 기존 MD Reader AI code의 현재 변경과 PDFie port가 충돌함

보고에는 최소한 재현 fixture, expected/actual, root cause, 가능한 선택지, 추천안을 포함한다.

## 🔗 구현 참고 자료

- [Extend PDF Viewer](https://ui.extend.ai/ui/docs/components/pdf-viewer)
- [Extend UI source](https://github.com/extend-hq/ui)
- [EmbedPDF](https://github.com/embedpdf/embed-pdf-viewer)
- [EmbedPDF engine](https://github.com/embedpdf/embed-pdf-viewer/blob/main/website/src/content/docs/engines/introduction.mdx)
- [EmbedPDF selection plugin](https://github.com/embedpdf/embed-pdf-viewer/blob/main/website/src/content/docs/react/viewer/plugins/plugin-selection.mdx)
- [PDFSlick React](https://pdfslick.dev/docs/react-use-pdf-slick)
- [PDFSlick store](https://pdfslick.dev/docs/react-use-pdf-slick-store)
- [PDF.js document API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html)
- [PyMuPDF TOC API](https://pymupdf.readthedocs.io/en/latest/document.html#get-toc)
- [Docling document model](https://docling-project.github.io/docling/concepts/docling_document/)
- [Docling chunking](https://docling-project.github.io/docling/concepts/chunking/)
- [Electrobun build configuration](https://framework.blackboard.sh/electrobun/apis/cli/build-configuration/)
- [Electrobun bundled assets](https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/bundled-assets.mdx)
- [Electrobun CEF configuration](https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/bundling-cef.mdx)
