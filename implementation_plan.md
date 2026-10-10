# PDFie implementation plan — 근거·학습·구독 연결

작성일: 2026-10-10 (Asia/Seoul)
상태: 계획 및 선행 조사 완료. 구현·실계정 통합·설치 앱 검증은 미실행.
제품 기준: [PRD.md](PRD.md)
기존 계획: [2026-08-04 보존본](docs/archive/2026-08-04/implementation_plan.md)

## 1. 기술 판단과 실행 원칙

전체 기능은 현재 stack을 유지하면서 단계적으로 구현할 수 있다. 핵심 의존 관계는 다음과 같다.

~~~text
P0 기술 gate
 ├─ P1 데이터·작업·provider 공통 기반 ─ P2 구독 연결
 └─ P3 문서 색인·좌표 ─ P4 검색·인용·이동
                           ├─ P5 목표·섹션 요약
                           └─ P6 capture·vision
                               P5 + P6 ─ P7 학습·점검 ─ P8 설치 앱 QA
~~~

실제 작업은 한 단계의 변경과 검증을 완료한 뒤 다음 단계로 진행한다. 위 병렬 가지는 의존성을 뜻하며 subagent나 다중 작업 트리 실행을 지시하지 않는다.

- 기존 Electrobun native WebKit + EmbedPDF/PDFium을 유지한다.
- 변경 전 Git 상태를 기록하고 사용자 작업을 보존한다. 자동 commit/push/install은 계획에 포함하지 않는다.
- PDFie 내부에서 완결되는 변경을 우선한다. 다른 앱은 필요할 때 읽기 전용 참고로만 사용한다.
- source text, evidence, learner state의 권위는 PDFie가 가진다. LLM과 provider session은 교체 가능하게 둔다.
- 기능별 acceptance를 통과시킨다. CLI 성공, source test 성공, 설치 앱 성공을 서로 대신하지 않는다.
- 모든 자동 생성 호출은 같은 provider router·usage 정책·취소 경로를 이용한다.

## 2. 이번 조사에서 확인한 것

| 항목 | 관찰 | 검증하지 않은 것 |
| --- | --- | --- |
| 소스 | HEAD f1818c2 + 미커밋 작업, 선택 좌표·검색 이동·주석 저장·Ollama streaming | 현재 앱을 실행한 기능 재검증 |
| 문서 | 기존 PRD/plan의 신규 프로젝트 전제와 README/ADR 002 일부가 오래됨 | 과거 QA 결과 재현 |
| PDF API | 설치 타입에 getPageGeometry, getTextSlices, renderPageRect 존재 | 자동 문단 분리와 crop 실제 정확성 |
| Context7 | EmbedPDF 공식 문서의 page rectangle rendering 조회 | 설치 버전에서 native WebKit crop 왕복 |
| Codex | CLI 0.160.0, 격리된 임시 home에서 schema 생성 | 로그인·account access·추론·도구 차단 |
| Claude | 공식 CLI 2.1.296의 version/help | 구독 인증·vision·사용량·중지 |
| SQLite | 로컬 Bun 1.3.8 / SQLite 3.54.0의 메모리 DB에서 FTS5 생성 성공 | Electrobun에 bundled된 Bun과 설치 앱 FTS5 |

Codex 임시 schema에서 확인한 필드: UserInput의 image/localImage, TurnStartParams.outputSchema, ThreadStartParams.ephemeral, Model.inputModalities, GetAccountRateLimitsResponse.ordinaryUsageAllowed와 rateLimitsByLimitId. 이 버전은 **조사 버전**이며 지원 최소 버전으로 확정하지 않는다.

실계정 인증 파일·브라우저 토큰을 읽지 않았고 LLM 추론 호출은 하지 않았다. 로그인과 계정별 모델 동작은 구현 단계의 별도 검증이다.

## 3. 현재 코드에 연결할 위치

| 기존 파일 | 작업 |
| --- | --- |
| src/shared/pdf/domain.ts | 문서·좌표 계약 확장; 기존 PdfSelection/PdfTextHighlight 호환 유지 |
| src/shared/rpc/app-rpc.ts | 짧은 요청 + job/event API, provider·analysis·study DTO |
| src/bun/index.ts | service 조립, job lifecycle, quit cleanup; 기능 로직은 분리 |
| src/bun/ai/ollama-cloud-service.ts | 기존 provider adapter로 감싸고 공통 요청 형식 적용 |
| src/bun/ai/ai-settings-repository.ts | versioned provider settings 이관; 기존 key 보존 |
| src/bun/pdf/document-state-repository.ts | 기존 읽기/주석 저장 유지, 새 store와 역할 분리 |
| src/bun/pdf/document-source-bridge.ts | 등록 문서 확인 API와 제한된 capture asset 전달 검토 |
| src/views/main/components/AiSidebar.tsx | durable session, AnswerView, citation, scope, attachment 연결 |
| src/views/main/features/pdf/adapters/EmbedPdfWorkspace.tsx | revealEvidence/capture/analysis adapter를 얇게 연결 |
| src/views/main/features/pdf/adapters/fast-facts.ts | 분류용 표본 추출 유지; 전체 색인과 분리 |
| src/views/main/features/pdf/adapters/CleanSelectionLayer.tsx | 사용자 주석과 별개의 evidence overlay |
| src/views/main/features/pdf/adapters/selection-highlight.ts | 줄별 rect 정밀화 재사용 및 좌표 변환 QA |
| src/views/main/App.tsx | 활성 문서·session·학습 범위의 단일 소유자 |
| src/views/main/index.html | 기존 CSP 유지; 학습을 이유로 전역 script 권한 확대 금지 |

새 모듈의 제안 구조:

~~~text
src/shared/
  evidence/        schemas, source-block, anchors, citation, answer
  study/           goal, lesson-spec, assessment, validation
  ai/              provider-contract, capability, job-events
src/bun/
  ai/providers/    ollama-cloud, codex, claude-code, optional-api
  ai/transport/    subprocess-json, deadlines, process-discovery
  analysis/        analysis-service, ingest-validation, revision-cache
  retrieval/       lexical-index, query-expansion, context-assembler
  evidence/        citation-validator, evidence-repository
  study/           goals, summaries, lessons, assessment
  jobs/            scheduler, event-log, cancellation
  persistence/     database, migrations, repositories
  assets/          capture-store, image-validation
src/views/main/
  features/pdf/adapters/
    analysis-adapter, geometry-transform, evidence-overlay, capture-overlay
  features/chat/   AnswerView, CitationChip, EvidencePreview, ScopePicker
  features/study/  GoalsPanel, SectionActions, LessonPlayer, AssessmentView
  features/ai/     ProviderSettings, UsageStatus
~~~

이는 제안 경로이며 현재 구현되어 있다는 뜻은 아니다. 최소 기능을 위해 기존 파일 전체를 한꺼번에 분해하지 않는다.

## 4. 데이터와 좌표 계약

### 4.1 영구 ID와 분석 버전

- DocumentVersion의 기본 식별자는 원본 PDF bytes의 SHA-256이다. 파일 경로와 열린 탭의 documentId는 영구 identity가 아니다.
- IndexRevision은 documentHash + extractorVersion + layoutVersion + OCR 설정으로 식별한다.
- Block ID는 revision 안에서 고정한다. 페이지·추출 range·원문 hash로 재현 가능하게 만들되, reindex 후 동일 ID를 억지로 유지하지 않는다.
- 이전 답변이 참조하는 evidence snapshot과 revision은 보관한다. 재색인 결과로 조용히 바꾸지 않는다.
- 재연결은 같은 문서/페이지의 quote·인접 문맥·geometry를 대조하고 유일하게 일치할 때만 한다. 아니면 stale/unresolved로 남긴다.
- 같은 원문이 반복되는 running header와 본문을 quote만으로 혼동하지 않는다.

### 4.2 제안 타입

아래는 설계 계약의 핵심 필드이며 구현 시 runtime schema validation을 함께 작성한다.

~~~ts
type SourceRole =
  | "paragraph" | "heading" | "caption" | "figure" | "table"
  | "equation" | "footnote" | "reference" | "header-footer";

type Rect = { x: number; y: number; width: number; height: number };

interface SourceSpan {
  pageIndex: number;                  // 내부 0-based
  pageLabel?: string;                 // 인쇄된 i, 3, S1 등
  frame: "crop-top-left-unrotated-v1"; // PDFie canonical frame
  pageWidth: number; pageHeight: number; // PDF points
  rects: Rect[];                      // 줄/영역별; CSS pixel 금지
  engineRange?: { start: number; count: number };
  textRange?: { start: number; end: number };
}

interface SourceBlock {
  id: string; documentHash: string; indexRevision: string;
  sectionId?: string; role: SourceRole; readingOrder: number;
  rawText: string; normalizedText: string;
  spans: SourceSpan[];
  extraction: "native" | "ocr" | "layout-worker";
  quality: "verified" | "usable" | "uncertain" | "unreadable";
}

interface EvidenceRef {
  id: string; documentHash: string; indexRevision: string;
  blockIds: string[]; quote: string; spans: SourceSpan[];
  precision: "text-range" | "paragraph" | "region" | "page-only";
}

interface Section {
  id: string; parentId?: string; title: string;
  startBlockId: string; endBlockId: string;
  source: "bookmark" | "native-heading" | "layout-worker" | "user";
  confidence: number; userEdited: boolean;
}

interface AnswerBlock {
  id: string; markdown: string; evidenceIds: string[];
  kind: "document-claim" | "inference" | "background" | "illustration" | "unknown";
}

interface LessonSpec {
  schemaVersion: 1; id: string; scopeId: string;
  title: string; objectives: string[]; prerequisiteConcepts: string[];
  evidenceIds: string[]; steps: LessonStep[];
  assumptions: string[]; dataKind: "paper" | "illustrative" | "none";
}
~~~

LessonStep은 explanation / diagram / prediction / parameter-experiment / quiz의 discriminated union으로 구현한다. 각 variant는 필요한 필드를 강제한다. 예를 들어 parameter-experiment는 허용된 rendererId, 유한한 min/max/step/default, 단위, fixed formula ID를 요구한다. quiz는 정답 또는 평가 rubric, feedback, evidenceIds를 요구한다.

PDF engine character index와 JavaScript 문자열 offset이 일치한다고 가정하지 않는다. ligature, 한글 정규화, 결합 문자, 하이픈 제거를 포함해 raw→normalized→engine span mapping을 보존한다. OCR에는 engineRange가 없어도 된다.

### 4.3 좌표 변환

표준 좌표는 unrotated CropBox의 좌상단 기준 PDF points로 정한다. 이것은 PDF raw user space나 현재 EmbedPDF 값과 같다고 가정하는 선언이 아니다. P0에서 engine/view/OCR의 frame을 확인하여 adapter에서 명시 변환한다.

변환 경로:

~~~text
pointer/CSS 좌표
 → page-local CSS (scroll·page offset·devicePixelRatio 구분)
 → inverse zoom/rotation/box transform
 → canonical rect
 → renderer 또는 OCR frame
~~~

reveal 경로에는 반대 변환을 적용한다. intrinsic page rotation과 사용자 회전을 따로 관리한다. MediaBox/CropBox 원점, page label, 90/180/270도, 양면 layout, 여러 page fragment를 fixture에 포함한다.

기존 저장 주석은 legacy frame/version을 부여한 adapter로 읽는다. 기존 숫자를 새 frame으로 재해석하거나 마이그레이션하며 이동시키지 않는다. source rect는 CSS scale 적용 직전에만 화면 좌표로 바꾼다.

### 4.4 저장

새 학습 데이터에는 Bun 내장 SQLite를 우선 제안한다. 기존 읽기/주석 JSON은 초기에는 유지하여 위험한 전면 이관을 피한다.

주요 table:

| table | 주요 내용 |
| --- | --- |
| documents / index_revisions / page_jobs | 문서, 버전, 페이지별 상태·재시도 |
| sections / blocks / spans / blocks_fts | 구조·원문·좌표·검색 |
| evidence_snapshots | 답변이 참조한 불변 근거 |
| sessions / messages / answer_blocks | 문서·범위별 대화, interrupted 상태 |
| goals / goal_revisions / goal_progress | 편집본·분석본·탐색 상태 |
| lessons / lesson_progress / assessment_attempts | spec·현재 단계·사용자 답·rubric |
| capture_assets / generation_jobs | image metadata·작업 상태 |
| schema_migrations | 버전·이관 결과 |

문서 hash와 revision을 foreign key 관계로 검증한다. transaction, WAL, backup, 원자적 asset write, schema migration 재실행 안전성을 적용한다. FTS5 미지원 packaged runtime에서는 우선 SQLite 일반 table + 제한된 in-memory lexical 검색으로 축소하고 지원 상태를 기록한다.

이미지는 userData 아래 전용 asset directory에 저장한다. DB에는 opaque asset ID와 hash, MIME, 크기, source rect만 둔다. 임의 경로를 renderer에서 받지 않는다.

cache key에는 scope, document/index revision, provider/model, language, prompt/spec version을 포함한다. 사용자 편집본은 생성 cache와 분리한다. 미참조 임시 asset은 24시간 후, 취소된 미저장 asset은 즉시 정리하는 초기 정책을 제안한다. 저장한 대화·학습의 asset은 기록 삭제 전까지 유지한다. 문서 기록 삭제는 참조 확인 후 연관 데이터와 asset을 정리하며 원본 PDF는 삭제하지 않는다.

기존 AI 설정 이관은 backup → schema 검사 → provider=ollama-cloud 지정 → 새 파일 원자 저장 → 읽기 확인 순서로 수행한다. 기존 key는 검증 전 삭제하지 않는다. 현재 키 파일 암호화는 Keychain과 같은 보안 경계가 아니므로 Keychain 저장을 검토하되 인증·복구 검증을 별도 단계로 둔다.

## 5. PDF 분석과 검색

### 5.1 추출 위치

1차 구현은 이미 PDF를 연 renderer의 PDFium worker를 analysis adapter가 사용한다. native engine을 Bun에 새로 포팅하거나 문서 전체를 RPC로 왕복시키지 않는다.

- getPageGeometry/getTextSlices의 설치 버전 계약을 wrapper로 감싼다.
- 기존 getCoreDocument 접근은 내부 의존성이 있으므로 한 adapter에 격리하고 실패 상태를 명확히 한다.
- visible page/선택 범위를 우선하고, 나머지는 낮은 우선순위의 bounded queue에서 처리한다.
- 페이지 단위 원문·geometry를 bounded batch로 Bun에 전송한다. 검증·저장·검색·생성은 Bun이 소유한다.
- 문서 close 시 pending PDF tasks를 취소하고 진행 상태를 checkpoint한다.
- 색인이 partial이면 전체 문서 질문에 coverage 제한을 표시한다.

초기 batch 상한은 256KB, 페이지 분석 동시성은 1로 시작하고 P0에서 조정한다. 320페이지의 모든 glyph geometry를 React state에 계속 보관하지 않는다. 저장 후 필요한 page geometry만 LRU cache로 유지한다.

신뢰 경계에서 Bun은 열린 문서 ID→hash를 직접 확인하며 page range, rect 범위, 문자열 길이, revision, message size를 검증한다. viewer가 보내는 file path를 실행하거나 그대로 파일 시스템에 전달하지 않는다.

### 5.2 문단과 섹션 구성

native geometry에서 column → line → paragraph 순으로 묶는다. 수직 간격·들여쓰기·font size·문장 연속성을 함께 사용하고 y 좌표만 정렬하지 않는다.

- 반복 header/footer는 여러 페이지에서 탐지하고 role만 변경한다.
- 표·수식·캡션은 일반 본문과 분리한다.
- 다중 페이지 문단은 텍스트 연속성과 column 경계를 확인한 경우만 연결한다.
- heading은 북마크와 typography·번호 패턴으로 제안한다.
- LLM은 실제 block 후보의 분류/제목 보정만 할 수 있고 가짜 경계나 좌표를 생성하지 않는다.
- section의 끝은 다음 section 직전 block이다. pageEnd만으로 잘라 같은 페이지의 다음 section을 포함하지 않는다.

text density, printable ratio, Unicode 이상, column 혼합, 빈 페이지를 quality 진단에 포함한다. scanned-image fixture는 자동 성공이 아니라 OCR 필요 상태가 나와야 통과다.

### 5.3 OCR/layout fallback

R1은 native text가 usable인 PDF를 우선한다. OCR이 필요한 페이지는 읽기를 막지 않으며 선택 crop으로 질문할 수 있다.

P0에서는 로컬 OCR/layout 후보 하나를 샘플 평가한다. Docling 등 Python worker를 넣는 결정은 정확성 개선, arm64 의존성, 배포 크기, cold start, restricted PATH에서 bundled 실행 가능성을 확인한 뒤 별도 ADR로 확정한다. 기존 문서에 적혀 있다는 이유로 이미 동작한다고 가정하지 않는다.

worker 출력은 동일 SourceBlock/SourceSpan으로 변환한다. OCR image-pixel 좌표를 canonical PDF 좌표로 역변환하고 confidence를 보존한다. 암호·복사 권한 제한을 OCR 우회로로 처리하지 않는다.

### 5.4 검색·context assembly

기본은 로컬 lexical/FTS5 검색 + section/selection boost다. 벡터 DB와 외부 embedding 호출은 MVP 필수 의존성이 아니다.

한국어 질문–영어 원문을 위해 논문 용어 사전과 제한된 query expansion을 사용한다. LLM expansion을 쓰면 현재 선택 provider와 job budget을 공유하고 원 질문을 보존한다. 비교 평가에서 recall이 부족할 때만 로컬 multilingual embedding을 추가한다.

context 우선순위: 사용자가 선택한 원문/crop → 관련 이웃·캡션 → 선택 section 검색 → 허용된 문서 범위의 다른 근거. section 밖 근거를 사용할 때 scope expansion을 표시한다.

최대 context의 초기 예산은 source 35%, output reserve 30%, 나머지 system/history/여유로 배정한다. 실제 model window와 tokenizer를 우선하고 알 수 없으면 보수적으로 추정한다. 큰 선택 구절을 조용히 잘라내지 말고 분할 작업을 제안한다.

대화 history는 문서 근거와 별도 구역이다. 이전 AI 답변을 새 사실의 출처로 쓰지 않는다. 전체 요약·목표 생성은 상위 검색 결과만으로 전체 coverage를 가장하지 않고 section별 map→reduce와 처리 block 목록을 사용한다.

## 6. 답변과 인용 이동

Bun의 ContextAssembler가 후보 근거를 evidence ID로 등록하고 모델에 전달한다. 응답의 AnswerBlock.evidenceIds는 이 turn에 허용된 집합에 속해야 한다.

검증 순서:

1. JSON/schema 또는 안전한 citation marker 문법 검사.
2. evidence ID의 allowlist, hash, revision, scope 확인.
3. quote와 raw text range/정규화 mapping 확인.
4. 숫자·페이지·rect의 유효 범위 확인.
5. 없는 인용은 unresolved로 처리하고 한 차례 제한된 수정 요청 또는 근거 부족 응답.
6. answer/evidence snapshot을 함께 transaction으로 저장.

모델의 semantic entailment까지 위 validator가 보장하지 않는다. 표본 평가에서 사람 심사를 수행한다. 자동 지지 여부 평가는 추가 신호이며 자체 정확도 보증이 아니다.

streaming은 draft text와 최종 structured blocks를 구분한다. 최종 validation 전에는 citation을 비활성으로 표시한다. 실패해도 draft는 보관하되 verified answer로 승격하지 않는다.

viewer adapter contract:

~~~ts
interface EvidenceViewer {
  revealEvidence(ref: EvidenceRef): Promise<
    { status: "exact" | "approximate" | "unresolved"; reason?: string }
  >;
  clearEvidenceHighlight(): void;
  returnToReadingPosition(): void;
}
~~~

기존 getSearchResultScrollTarget/scrollToPage의 pageCoordinates 경로를 재사용한다. 대상 page mount/render가 완료된 후 overlay를 표시한다. 빠른 연속 클릭은 최신 navigation request만 적용한다. 다중 page fragment에는 다음/이전 근거 위치를 제공한다.

selection·search match·saved highlight·AI evidence overlay는 별도 상태다. AI 강조를 영구 주석 배열에 append하지 않는다. 원문으로 이동해도 chat focus/scroll을 잃지 않도록 이전 상태를 복원한다.

## 7. AI transport·provider 계약

### 7.1 공통 서비스

~~~ts
type ProviderId = "ollama-cloud" | "codex-subscription" | "claude-code" | "api";

interface ModelCapabilities {
  text: boolean; image: boolean;
  structuredOutput: "native" | "validated-text" | "unsupported";
  contextWindow?: number;
}

interface GenerationRequest {
  jobId: string; documentHash: string; sessionId: string;
  task: "chat" | "goals" | "summary" | "lesson" | "assessment";
  scopeId: string; evidenceIds: string[];
  modelId: string; history: unknown[]; input: unknown[];
  outputSchema?: unknown;
}

interface ProviderAdapter {
  status(): Promise<unknown>;
  models(): Promise<unknown[]>;
  generate(request: GenerationRequest, signal: AbortSignal): AsyncIterable<unknown>;
}
~~~

실제 구현은 unknown을 검증된 DTO/union으로 구체화한다. API-key settings와 구독 연결을 discriminated union으로 분리한다. history의 권위는 앱에 두고 provider persistent history와 중복 전송하지 않는다.

기존 ai.chatStream은 RPC가 응답 완료까지 기다리고 maxRequestTime=60초에 묶여 있다. 장시간 학습 생성에는 다음 형태로 변경한다.

- ai.start → 즉시 jobId 반환.
- ai.event → jobId/documentHash/sessionId/sequence/type을 갖는 stream event.
- ai.cancel → queue 취소 또는 실제 turn interrupt.
- ai.jobStatus → reconnect 시 last sequence 이후 복구.
- completed/failed/cancelled는 중복 도착해도 한 번만 적용.

초기에는 provider별 활성 생성 1개, background queue 1개, 사용자 작업 우선으로 시작한다. 작업별 input hash로 중복 실행을 막고 재시도 최대 1회로 제한한다. quota/auth 실패는 자동 재시도하지 않는다. 유료 호출을 늘리는 repair는 동일 budget 안에서 처리하고 이력을 남긴다.

### 7.2 Codex ChatGPT 구독

공식 [App Server](https://developers.openai.com/codex/app-server)와 설치 schema를 사용한다. 구현 시 적용하는 [codex-subscription-provider 스킬](/Users/anselm/.agents/skills/codex-subscription-provider/SKILL.md)의 인증·한도·검증 계약을 따른다.

- backend가 공식 실행 파일을 발견하고 version/지원 계약을 확인한다. shell 문자열로 실행하지 않는다.
- userData 아래 app-private Codex home과 빈 scratch cwd를 사용한다. 일반 Codex 설정·인증 파일을 복사하지 않는다.
- environment allowlist를 사용하고 API keys, access-token override, 다른 provider endpoint, runtime injection 변수를 상속하지 않는다.
- initialize → initialized → account/read → 공식 login flow → account/model/usage 확인 순으로 연결한다.
- account/login/start·cancel·logout은 backend가 소유하고 renderer에는 공개 상태만 전달한다.
- model/list는 pagination·계정 default·inputModalities를 처리한다. 앱에 특정 GPT 모델명을 고정하지 않는다.
- generation은 ephemeral thread에 앱 history와 선택 근거를 한 번만 넣는다. turn/start의 출력 schema와 image input은 설치 schema로 검증한다.
- thread/turn/item ID로 stream을 필터링하고 turn completion을 확인한다. item 최종 text의 중복 append를 막는다.
- interrupt 실패 시 bounded grace 후 해당 소유 process를 정리한다. 재연결 시 이전 process의 event가 새 작업을 닫지 못하게 한다.

PDF assistant에는 shell, filesystem read/write, network tools, MCP, hooks, plugins, subagents가 필요 없다. 공식 설정과 protocol로 도구를 끄고 실제 model-visible tool 목록과 tool 요청 거절을 검증한다. read-only/approval never만 설정하고 완료 처리하지 않는다.

account/rateLimits/read의 ordinaryUsageAllowed·적용 bucket을 버전별로 해석한다. 알 수 없거나 소진된 구독 한도는 included-use 모드에서 차단한다. purchased credit 잔고를 included allowance로 해석하지 않는다. 로컬 preflight는 원자적 과금 상한이 아니므로 보장 범위는 “자동 유료 API 전환 없음”이다.

### 7.3 Claude 구독 연결

**확정 구현과 조건부 제안을 구분한다.** 현재 공식 문서에는 구독 사용 안내, 공식 binary에 사용자가 직접 로그인하는 경로, 자체 앱 로그인 제한이 함께 존재한다. PRD의 정책 분석과 출처를 유지한다.

우선 후보는 사용자가 설치한 수정 없는 공식 Claude Code를 backend에서 실행하는 adapter다. PDFie 자체 OAuth client, 브라우저 cookie, 토큰 import, setup-token을 복사하는 UI는 만들지 않는다. 첫 연결은 공식 프로그램의 인증 흐름으로 안내하며 가능한 통합 UI의 범위는 P0에서 확인한다.

[인증 문서](https://code.claude.com/docs/en/authentication)는 CLAUDE_CONFIG_DIR를 통한 별도 설정 경로를 설명한다. PDFie 전용 config와 scratch를 우선하되 Keychain·Console login의 분리 예외와 logout 영향을 실험한다. 독립성이 확인되지 않으면 다른 앱까지 로그아웃되는 기능을 만들지 않는다.

[CLI](https://code.claude.com/docs/en/cli-reference)의 print, stream-json, json-schema, no-session-persistence를 후보로 검토한다. image는 공식 구조화 입력의 지원 형식을 확인하고 opaque asset의 검증된 bytes로 전달한다. 이미지 지원을 확인할 때까지 capability=image를 켜지 않는다.

주의: 현재 [headless 문서](https://code.claude.com/docs/en/headless)의 bare mode는 구독 OAuth를 사용하지 않는다. 격리를 위해 bare를 켜고 구독 연결이라고 표시하면 안 된다. 대신 설치된 CLI의 restricted mode, tools의 빈 목록, strict MCP 설정, settings sources 제한을 조합하여 **구독 인증과 도구 차단이 동시에 유지되는지** 검증한다. 도구 제거와 hook/plugin/config 차단은 각각 확인한다.

실행 환경에서 API key와 provider override를 제외하고 실제 인증 종류를 확인한다. 공식 client의 인증 선택지를 변조하지 않는다. API 인증으로 연결되면 구독이라고 표시하지 않고 실행 전에 별도 과금 경로임을 알린다.

Codex와 같은 공개 quota RPC가 있다고 가정하지 않는다. 공식 status/오류에서 확인할 수 있는 범위만 노출하고 private usage endpoint에 토큰을 붙여 호출하지 않는다. 구독 limits와 API credits/extra usage를 구분할 수 없으면 그 제약을 UI에 표시한다. strict included-only 요청에 대한 보장이 불가능하면 실행을 차단한다.

중지는 공식 interrupt 또는 SIGINT 우선, 제한 시간 후 소유 process cleanup으로 설계한다. 실제 종료와 partial result를 확인한다. 추정 cost 필드를 청구액으로 표시하지 않는다.

SDK를 직접 포함하거나 binary를 bundle하는 방식은 별도 배포 조건·의존성 ADR을 통과한 후 결정한다. 조건이 불분명하면 공식 설명 또는 지원 답변을 근거로 해결하고 provider만 보류한다. API key 연결은 사용자가 명시적으로 선택할 수 있는 별도 경로로 남긴다.

### 7.4 공통 설치·오류 처리

Finder 실행의 제한된 PATH, executable 이동/업데이트, signed out, login 취소, 모델 삭제, process crash, malformed stream, UTF-8 chunk split, 한도 소진을 처리한다. prompt와 attachment를 보존한다.

stdio buffer/frame에 상한과 deadline을 두고 stderr·OAuth URL·원문을 그대로 로그에 출력하지 않는다. 모든 process는 앱 종료 시 정리한다. 계정 로그인은 공식 브라우저에서 완료하며 renderer가 임의 URL이나 command를 실행할 수 없게 한다.

## 8. 목표·요약·capture·학습 생성

### 8.1 목표와 섹션 요약

입력은 실제 section graph와 evidence packet이다. 목표 생성과 평가 rubric은 task별 schema를 둔다.

- paper-level 목표는 각 section의 evidence-backed 개요를 모아 생성한다.
- 원문 fact와 서술적 설명을 구분하고 evidence ID를 validation한다.
- 단계별 processing coverage를 저장한다. 실패한 section만 재시도한다.
- 사용자 편집 목표를 보존하고 새 제안은 diff로 제시한다.
- section 경계 변경 시 관련 요약·학습은 stale 처리하고 기존 결과는 읽을 수 있게 둔다.

### 8.2 Capture

camera overlay가 CSS drag rect를 canonical rect로 바꾸고 PDF engine renderPageRect로 읽기 좋은 해상도의 PNG를 생성한다. native API 근거는 [공식 렌더 문서](https://www.embedpdf.com/docs/engines/rendering/render-page-rect) 및 설치 타입이다.

초기 기준: 긴 변 최대 2048px, 파일 5MB, 요청당 4개까지. 모델별 더 낮은 제한이 있으면 적용한다. 작은 표는 정밀 crop을 추가하게 하고 조용히 과도하게 축소하지 않는다.

Bun은 실제 MIME·decode·픽셀 수·해시·크기를 검증하고 opaque asset ID를 반환한다. 큰 base64를 반복 RPC로 옮기지 않도록 bounded upload 또는 기존 loopback bridge의 전용 ticket 경로를 비교한다. viewer source token과 외부 전송용 URL을 혼동하지 않는다.

캡션 후보는 geometry 근접성 + figure/table label + 본문 참조로 선택한다. 연관 근거가 불확실하면 사용자가 확인할 수 있다. capture 자체는 region evidence이며 “문단 인용”과 구별된다.

### 8.3 LessonSpec와 renderer

생성은 (학습 의도·원문 근거 선택) → (LessonSpec) → (검증) → (로컬 renderer) 순으로 한다.

허용 renderer catalog의 초기 범위:

- step-diagram: host가 그리는 제한된 node/edge/label과 단계별 강조.
- compare-predict: 두 조건·예측·설명.
- scalar-experiment: 개발자가 검증한 계산 함수 ID, bounded parameters.
- figure-walkthrough: 저장 capture의 허용 영역별 설명.
- retrieval-quiz: 선택형·짧은 답변·rubric.

SVG를 포함한 임의 markup, 외부 URL, JS 함수, npm import는 모델 출력으로 받지 않는다. 허용된 구조로 host가 SVG/HTML을 만든다. 과도한 단계·node·문자 수, NaN/Infinity, 수학적으로 잘못된 범위, 없는 asset/evidence를 거절한다.

검증은 schema → evidence → parameter/units → render smoke → text overflow 순으로 한다. repair는 한 번, 실패하면 실행 가능한 학습 대신 원문 근거가 있는 일반 설명을 제공한다.

MVP 이후 임의 생성 applet을 검토할 경우 별도 isolated WebView/process, bridge 없음, network deny, 외부 navigation/download 금지, CPU/메모리/time limit이 필요하다. native bridge가 있는 현재 앱 WebView의 iframe만으로 충분하다고 가정하지 않는다.

### 8.4 이해 점검

객관식은 local evaluator, 자유 답변은 selected provider의 근거 기반 rubric 평가를 쓴다. grading model과 lesson 생성 모델을 반드시 같게 만들 필요는 없으나 별도 호출 비용과 capability를 명시한다.

점검 결과에는 rubric version, source revision, learner response, feedback, evidence를 저장한다. 사용자가 정답을 바로 열어본 경우와 스스로 답한 경우를 구분한다. goal explored는 사용 행동으로, 점검 통과는 평가 결과로 각각 갱신한다. 자동 평가는 이의 표시·재검토가 가능해야 한다.

## 9. 단계별 작업과 종료 기준

공수는 숙련된 구현자 1명이 개발·자동 검증·수동 QA를 수행할 때의 초기 범위다. 계정 인증 대기, 공식 정책 확인, 복잡한 OCR 패키징, 미지의 WebKit 문제는 제외하며 P0 후 갱신한다.

| 단계 | 예상 작업일 | 결과 | 종료 기준 |
| --- | ---: | --- | --- |
| P0 기술 검증 | 3–5 | 증거 기록과 ADR | 아래 여섯 gate에 pass/fail·대안 |
| P1 기반 | 3–5 | schema·store·jobs·provider interface | 이관·취소·문서 격리·crash 회복 |
| P2 구독 provider | 5–8 | Codex + 조건 충족 Claude adapter | fake/실계정/앱 호출 구분 검증 |
| P3 분석·좌표 | 5–8 | native blocks·sections·cache | reading order/anchor/coverage corpus |
| P4 검색·인용 | 4–6 | grounded chat·citation navigation | AC-02~05, durable history |
| P5 목표·요약 | 3–4 | editable goals·section summaries | AC-06~07, revision invalidation |
| P6 capture·vision | 3–5 | crop·asset·multimodal explanation | AC-08, unsupported model 처리 |
| P7 학습·점검 | 6–9 | templates·LessonPlayer·progress | AC-09~11, content/security review |
| P8 통합·출시 QA | 4–6 | 설치 앱과 문서 정합성 | AC-01~15 적용 범위 통과 |

합계 약 36–56 작업일, 순차 기준 약 7–11주. R1은 P0–P5와 해당 범위의 설치 앱 QA까지, R2는 P6–P8까지다. OCR의 완성형 배포와 자유 코드형 applet은 이 공수에 포함하지 않는다. 작은 계획 변경으로 끝나는 UI 작업이 아니라 문서 데이터·근거·학습 기반 확장이라는 점을 반영한 추정이다.

### P0 상세 gate

| Gate | 실험 | 통과/대안 |
| --- | --- | --- |
| G1 좌표 | 2단·회전·CropBox·다중 페이지 anchor와 crop 왕복 | 잘못된 정밀 링크 0; 실패 page fallback |
| G2 구조 | 10편의 문단/heading/caption 수동 정답과 비교 | 핵심 section·본문 누락 확인; 저신뢰 fallback |
| G3 Codex | 격리 인증, text/image/schema, tools disabled, interrupt, usage | 앱에서 실행 가능한 통제 확인; 미지원 버전 차단 |
| G4 Claude | 공식 인증 형태, 실제 billing route, no tools, stream/image/cancel | 조건 충족 연결만 enable; 미해결 provider 보류 |
| G5 학습 | 수작업 LessonSpec 3종을 native WebKit에서 재생 | 조작·근거·키보드·확대 동작 |
| G6 저장/성능 | packaged Bun FTS5, 80/320페이지 extraction RSS·UI 지연 | bounded index; 필요 시 일반 table 검색 |

P0 산출물은 docs/qa/research-platform-spike.md와 필요 ADR 003-evidence-model, 004-provider-auth, 005-lesson-runtime에 남긴다. 표의 경로는 향후 생성할 파일이다. 실패를 숨기고 다음 단계로 강행하지 않되, 실패한 provider/OCR만 분리해 독립적인 핵심 작업은 계속할 수 있다.

## 10. QA 계획

### 기존 회귀 기반

기존 test suite와 golden selection corpus를 유지한다. 현재 fixture에는 한글, 다단, ligature/hyphen, 회전, 다중 페이지, 스캔, nested/bad bookmarks, 320페이지 책이 있다.

구현 시 변경 영역에 맞춰 다음 기존 명령을 사용한다.

~~~sh
bun run typecheck
bun run test
bun run test:viewer
bun run build:stable
bun run verify:package
~~~

현재 test:viewer는 manifest test도 포함하므로 그것만 통과했다고 실제 PDFium 선택·인용 UI를 검증했다고 보고하지 않는다. in-app golden runner와 실제 drag/click 검증을 별도로 수행한다. lint 기존 실패는 새 변경과 분리해서 기록한다.

### 새 자동 검증

| 층 | 의미 있는 검증 |
| --- | --- |
| 좌표·텍스트 | frame 왕복, 회전/CropBox, Unicode offset, 반복 quote, 다단 읽기 |
| 섹션·색인 | 같은 페이지 경계, interruption/resume, partial coverage, revision |
| 인용 | 가짜 ID, 다른 문서 hash, quote 불일치, stale anchor, multi-span |
| 검색 | 한국어 질의→영어 본문, section scope, reference 필요 질문 |
| provider | fake stdio crash/malformed/timeout, early event, model switch race |
| 비용 | quota error/unknown/exhausted, 환경 API key 혼입, fallback spy |
| 작업 | 취소한 job의 late event, 문서 전환, 재시도 중복, 앱 종료 |
| 저장 | idempotent migration, backup 복원, atomic asset, 강제 종료 |
| 학습 | invalid schema, missing source, bad units/ranges, 스크립트·URL 주입 |
| capture | 회전·Retina·축소, MIME/pixel bounds, 실패 upload cleanup |

prompt injection fixture에 “이전 지시 무시”, 로컬 파일 읽기, 외부 URL 전송 요구를 넣는다. source content가 tool/action이나 provider 설정으로 승격되지 않음을 검사한다.

### 근거 품질 평가

최소 10개 논문을 포함한 고정 평가 corpus를 구성한다. open-access 또는 사용자가 제공한 문서를 이용하고 배포 권리가 없는 PDF는 repository에 넣지 않는다.

- 분야: 실험·관찰·리뷰·이론 논문, 한글/영어.
- 최소 100개 anchor, 100개 factual claims, 20개 figure/table capture, 10개 learning module.
- retrieval recall과 citation 위치 정확성, claim 지지 여부, 사실형 문장의 citation coverage를 별도 측정한다.
- unsupported 답변을 회피해 점수를 높이지 못하도록 answerable/unanswerable 질문을 미리 정한다.
- oracle label은 사람이 원문을 읽고 작성한다. 가능하면 일부 표본을 두 사람이 독립 평가하고 불일치를 기록한다.
- 폐쇄형/오픈 모델 비교는 같은 scope·evidence·rubric·재시도 budget으로 수행한다. 측정 전 모델 우열을 확정하지 않는다.

### 설치 앱 확인

system-volume의 별도 테스트 설치에서 검증한다. 기존 ADR의 external-volume self-extractor 제한을 재확인하고 사용자의 현재 앱을 무단 교체하지 않는다.

시나리오: 열기 → 목표 생성 → 질문 → citation 이동/돌아가기 → capture → section lesson → 답변/점검 → 강제 종료 → 재개. provider별로 text/image를 앱의 실제 context 경로로 검증한다.

추가로 offline reading, signed out, 한도 소진, CLI 삭제/업데이트, Finder restricted PATH, window resize, 200% font, keyboard/VoiceOver를 점검한다. API key·OAuth token·논문 본문이 log/crash export에 포함되지 않는지 검사한다.

## 11. 요구사항 추적

| PRD 기능 | 담당 단계 | 주요 acceptance |
| --- | --- | --- |
| F-01 문서/섹션 범위 | P3 | AC-01, 02, 07 |
| F-02 Study Goals | P5 | AC-06, 11 |
| F-03 근거 답변 | P1, P4 | AC-03~05, 14 |
| F-04 인용 이동 | P3, P4 | AC-02, 03, 15 |
| F-05 표/그림 | P6 | AC-08, 15 |
| F-06 섹션 요약 | P5 | AC-07 |
| F-07 Interactive Learning | P7 | AC-09, 10 |
| F-08 이해 점검 | P7 | AC-11 |
| F-09 저장·재개·export | P1, P4, P7 | AC-11, 14 |
| 구독·모델·비용 | P2 및 모든 생성 경로 | AC-12, 13 |
| 설치 앱 품질 | P8 | AC-01~15 |

## 12. 출시 판정과 후속 작업

release blockers: 잘못된 문단을 정확한 근거처럼 강조, 다른 문서의 history 유입, 원문/주석 손상, 인증 정보 노출, 임의 generated code 실행, 숨은 유료 API 전환, 취소 후 무한 생성, 복구 불가능한 이관.

허용 가능한 제한은 UI와 release note에 명시한다. 예: 일부 스캔은 OCR 필요, 특정 모델은 vision 불가, Claude 경로는 검증 중, 일부 학습은 개념 예시. 제한이 있는 기능을 지원 완료라고 쓰지 않는다.

구현 완료 시 README와 ADR 002를 실제 provider·저장·streaming 동작에 맞게 갱신한다. 재현 가능한 QA 결과, 실제 CLI/모델/runtime 버전, package 경로, 확인하지 못한 항목을 함께 남긴다.

다음 실행 단위는 **P0**다. 먼저 기존 reader를 유지하는 최소 실험에서 문단 anchor→인용 클릭→원문 강조와 공식 provider의 통제 가능한 응답 경로를 각각 검증하고, 그 결과로 R1 범위와 일정을 확정한다.

## 13. 조사 출처

모두 2026-10-10 확인. 아래 링크는 구현 시 다시 확인해야 할 공식 계약이며, 계정별 실제 동작 검증을 대체하지 않는다.

- [EmbedPDF renderPageRect](https://www.embedpdf.com/docs/engines/rendering/render-page-rect): 영역 렌더; Context7에서도 확인.
- [EmbedPDF text extraction](https://www.embedpdf.com/docs/pdfium/examples/extract-text-from-pdf): 문자 추출 기반; 문단 복원은 앱 책임.
- [Codex App Server](https://developers.openai.com/codex/app-server), [Authentication](https://developers.openai.com/codex/auth): 공식 client 연결·인증 구분.
- [Claude 구독과 Agent SDK](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan): 구독 사용 관련 최신 안내.
- [Claude legal/compliance](https://code.claude.com/docs/en/legal-and-compliance), [Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview): 통합·인증 경계.
- [Claude authentication](https://code.claude.com/docs/en/authentication): 본인 인증·config 분리와 예외.
- [Claude programmatic execution](https://code.claude.com/docs/en/headless), [CLI reference](https://code.claude.com/docs/en/cli-reference): structured streaming·중지·bare mode 제약.
- 로컬 설치 타입 및 코드: [PDF engine](node_modules/@embedpdf/engines/dist/lib/orchestrator/pdf-engine.d.ts), [PDF models](node_modules/@embedpdf/models/dist/pdf.d.ts), [기존 source bridge](src/bun/pdf/document-source-bridge.ts), [QA 기록](docs/qa/phase-0-results.md).

이번 문서 작업은 위 조사와 계획 작성만 수행했다. 실제 기능 test/실계정 모델 호출/앱 빌드·설치는 실행하지 않았다.
