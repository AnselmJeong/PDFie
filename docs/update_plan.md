# **PDFie에 SoloPDF의 핵심 기능을 통합할 수 있는가?**

**결론부터 말하면, 충분히 가능하다.** 특히 SoloPDF의 빠른 문서 열기, 고급 탐색 및 레이아웃, 필기·주석 기능은 PDFie에 도입할 가치가 있다. 다만 두 프로젝트의 PDF 엔진이 다르므로 SoloPDF의 코드를 그대로 가져오는 것보다는 기능별로 이식하는 것이 적절하다.

연결된 GitHub에서 두 프로젝트의 실제 소스코드를 확인했다.

- [PDFie](https://github.com/AnselmJeong/PDFie?utm_source=chatgpt.com) — Electrobun + React + EmbedPDF/PDFium, 현재 저장소 버전 0.4.2
- [SoloPDF](https://github.com/zhitongblog/solopdf?utm_source=chatgpt.com) — Tauri 2 + Vue 3 + PDF.js + Rust, 저장소 버전 1.1.0

중요한 것은 **PDFie가 이미 상당한 수준의 PDF 뷰어 기반을 갖추고 있다는 점**이다. 한 페이지/두 페이지 보기, 확대·축소, 회전, 북마크, 검색, 텍스트 선택, 하이라이트, 메모, 원문 위치로 이동하는 기능이 구현되어 있다. 따라서 새로운 뷰어를 처음부터 만들 필요는 없다.

반면 SoloPDF에는 PDFie가 아직 충분히 구현하지 않은 연속 스크롤, 분할 화면, 링크 미리보기, 자유로운 도형·필기, PDF 표준 주석 내보내기 등 유용한 기능들이 있다. SoloPDF가 공개한 157MB·1,048페이지 PDF의 약 1초 초기 열기 성능도 검토할 가치가 있지만, 이는 개발자가 제시한 사례로 PDFie에서의 성능 향상을 보장하는 수치는 아니다. 

solopdf.doaipm.com+1



## **1. Open Instantly — 이미 좋은 기반이 있지만 병목이 존재한다**

**도입 가능성**

높음

권장: 기존 PDFium 엔진을 유지하면서 초기 열기 경로 최적화

SoloPDF가 빠르게 PDF를 여는 핵심은 다음과 같다.

- **Range loading:** 파일 전체를 메모리에 올리지 않고 필요한 부분부터 읽는다.
- **Lazy rendering:** 현재 보이는 페이지를 우선 렌더링한다.
- **Virtual scrolling:** 화면 밖 페이지의 Canvas를 제거하여 메모리 사용량을 제한한다.
- **Background processing:** 첫 화면 표시를 불필요한 후속 처리로 지연시키지 않는다.

실제 구현은 [viewer/loader.ts](https://github.com/zhitongblog/solopdf/blob/main/app/src/viewer/loader.ts?utm_source=chatgpt.com), [viewer/transport.ts](https://github.com/zhitongblog/solopdf/blob/main/app/src/viewer/transport.ts?utm_source=chatgpt.com), [viewer/controller.ts](https://github.com/zhitongblog/solopdf/blob/main/app/src/viewer/controller.ts?utm_source=chatgpt.com)에서 확인할 수 있다.

SoloPDF는 처음 64KiB를 읽고, 이후 필요한 데이터를 구간별로 요청한다. 화면 밖 페이지는 렌더링 자원을 해제한다.

### **PDFie에서 발견한 개선점**

PDFie에도 Range loading이 이미 구현되어 있다. 그런데 [document-source-bridge.ts](https://github.com/AnselmJeong/PDFie/blob/main/src/bun/pdf/document-source-bridge.ts?utm_source=chatgpt.com)에는 다음과 같은 코드가 있다.

```
const document: OpenDocument = {
  id,
  path,
  fileName: basename(path),
  size: file.size,
  hash: await sha256(path),
}
```

문제는 `await sha256(path)`이다.

PDFie는 문서를 등록하는 과정에서 **파일 전체의 SHA-256 해시 계산이 끝나기를 기다린다.** 따라서 PDFium이 Range loading을 지원하더라도, 대용량 PDF에서는 전체 파일을 읽는 작업이 첫 화면 표시보다 앞서 발생한다.

이는 명확한 최적화 대상이다.

권장하는 변경은 문서 열기를 두 단계로 분리하는 것이다.

현재 PDFie

파일 선택

전체 SHA-256

PDF 표시

제안하는 구조

파일 선택 및 최소 유효성 검사

PDF 즉시 표시

첫 페이지 우선

백그라운드 해시

문서 식별 및 기록 연결

단, PDFie는 해시를 이용해 문서의 주석, 학습 기록, 인용 근거를 연결한다. 따라서 해시 계산을 단순히 생략하면 안 된다. 임시 문서 ID로 먼저 렌더링하고, 해시가 확정되면 기존 기록을 안전하게 연결하는 방식이 필요하다. 해시 확인 전에는 다른 문서의 주석이나 학습 기록이 잘못 표시되지 않아야 한다.

**평가:** SoloPDF의 렌더러를 가져오기보다 PDFie의 초기화 순서를 수정하고, 현재 PDFium tiling과 캐시 정책을 측정·조정하는 쪽이 더 합리적이다.

## **2. Navigate and Layout — PDFie에서 가장 투자 가치가 높은 영역**

**도입 가능성**

높음

일부 기능은 간단하지만, 연속 스크롤과 분할 화면은 뷰어 구조 변경이 필요

SoloPDF가 지원하는 다양한 읽기 기능을 PDFie의 현재 상태와 비교하면 다음과 같다.

| 기능                         | PDFie 현재 상태         | 권장       |
| ---------------------------- | ----------------------- | ---------- |
| 목차와 검색                  | 구현됨                  | 유지       |
| 한 페이지 / 두 페이지        | 구현됨                  | 유지       |
| 확대·회전·Fit Width          | 구현됨                  | 유지       |
| Back / Forward 탐색 기록     | 제한적인 돌아가기       | 적극 도입  |
| PDF 내부 링크 탐색           | 전용 링크 처리 미구현   | 도입       |
| Figure/Table/인용 미리보기   | 미구현                  | 적극 도입  |
| 연속 스크롤                  | 현재 화면은 페이지 단위 | 도입       |
| 자동 여백 제거               | 미구현                  | 도입       |
| 같은 문서 분할 보기          | 미구현                  | 도입 안 함 |
| 종이 배경색·인쇄 페이지 번호 | 미구현                  | 도입 안 함 |

### **A. Figure/Table/References 미리보기**

[Google、PDF論文を劇的に読みやすくするChrome拡張「Google Scholar PDF Reader」 | TECH+（テックプラス）](https://images.openai.com/static-rsc-4/om7rvHFe_eBhka-x_n11cabpeOGToh6kTVRclvAKFjn5q1HBUpqr3Hi46QJnCz4ExBTAtKxUtbggkSk3LUX0740zc7mLH-ljta1mxF9nxlLRXS3KssVEx371DQBjjiAbRp4y-mceypmqzZqtaRECEkl8fswW1YsiXQmTmIwC6mE?purpose=inline)

[J-STAGEでも使える！論文を読むのが捗るブラウザ拡張機能2選！ - 株式会社アトラス](https://images.openai.com/static-rsc-4/jOCwXSulF7bAxA9YcGhB5WWMRuhI2hhGgDGD8gVH6klhKJltYyHL5kaa_OYIaPLlf8veRdGXENGsFKzub_0y0BNAHgEb6aNny-n6DNsq3nf_7oasqg45me_s6H5ZNRK9TESECRh5guhvv7WWX-A9EYj9ueF3RVBSwOLaEka-Nzs?purpose=inline)

[Google PDF Reader to Supercharge Your Paper Reading | HKUST Library](https://images.openai.com/static-rsc-4/vwMlsutCk4A4NpU8Mg6qN9XEgSZ5kOl0PC4FL75FFlZ9WpQANZ19tXLFib0S0YBRsG1WiKS3qkXIEiWicNh463Sj64aaDqbTkgCCtzutT8Y6dWQX0IMSRv4hMrJ0fetnliJDiN_VfLQ68K9ObusjRqgRHMTG0YlE1HEIvKwOG14?purpose=inline)

[Show reference when hovering over reference number in pdf - Feature requests - Paperpile Forum](https://images.openai.com/static-rsc-4/bNCanI56C9hCsTT7ourSMm9D87DpTFcGdeLd3S_Sd81lXSAOk9hDzgS1zO6C9M95xqZXuy3QYzglIuD-i7ktPeVRWd2lbrQ37hmDyG-17qbgN0RRoSUESub4dCcU5mZ8TEXZ3miYssMWHCtv_GcxnQX8VAFxwCnUheEALqr82_I?purpose=inline)

[PDF Viewer SDK | View, Annotate, Fill Forms, Sign PDFs | Syncfusion](https://images.openai.com/static-rsc-4/yLsIV0NdsrezmWlFrjQLlLW2UoI7KexeXWnSePN0-3qQlhuL1E-A1FkTmDLi1Yi0B2lrIZgyYrSkqFMI8UcMoWcLJn3mKZz0TxzFDUs14lbtSjARp3NOyYJbXvK3lJd4COheEi9RCewim0lwZxkRapzkFXDVtEmed1kzmYRtdSE?purpose=inline)

[How to read a scientific paper [3 steps - 2026\] - Paperpile](https://images.openai.com/static-rsc-4/P6ffJ-G4yKPfWuOYnd4bUY2zgF-yLF8HZqIZegq6nkpgXscQH21n5TkTmMU3vOfwqcJuXIYOSPo7RaaNjkb0IykQQJmpOSGzjs8_dbgBz1RRvSn_QcrXVsHL13qSYnKQWGuEBL7vm-rZLNIFKCeByaKvzo8vh8xGiJcmIw3tlHU?purpose=inline)

[En İyi Ücretsiz PDF Okuyucu: Okuma Deneyiminizi Geliştirin - Icecream Apps](https://images.openai.com/static-rsc-4/a10gZ24dCbrYcYNr-4uGyVv6HPu-W4LlAtv_fryuK6u65K07poD4gKOuVs8jhtoZPRANHwjhRmF7uzAtzmzt0xTB_OGV0riPYokZIeN8uA8t8ARG67Mcp6sBpGmWEyezwFjS5_he49C1B9YC93vBdhKL9g3fcHDifheDioIaAuk?purpose=inline)

[Multi-Highlighting in PDF.js - DEV Community](https://images.openai.com/static-rsc-4/KXuEPGlpL9V3WTrT8RMae0BCoPKM-kaYHopkTdbjVkHr8yohEBzvwUmmUqvPfqHplJI2DX4n1MHQGCivhtSBtO7BCdN1ILAI_eE0xIB84p22kT08tGQYADoakxJIguxUWu4wxXrVRmpKdDOG_QKhTzuthUhYJ2SIy0gVxqN4ceM?purpose=inline)

[How to Rearrange and Delete Pages in PDF | 4 Ways to Organize PDF](https://images.openai.com/static-rsc-4/K1yieurC7R_taH9ZQmoJeaCjmaaIJCz6vfQmosFTawihP0gzrHAdY79LYz3cUhcqsndVYtUuiurFbyHo3ECnrmwW9JKMKOZ3VZf15uXbRZQqRhn66KWywLUNpd1hBsd7Fl-Wg4SUaxV9fY34DEDSfqHT4spVU1FV80RgO81HdLM?purpose=inline)

학술 논문을 읽는 용도라면 특히 유용한 기능이다.

예를 들어 논문 본문에서 다음 문장을 읽고 있다고 하자.

*“The results are summarized in Figure 3.”*

현재는 Figure 3을 찾아갔다가 다시 본문으로 돌아와야 한다.

이를 개선해 `Figure 3`에 마우스를 올리면 해당 그림을 작은 팝업으로 보여주고, 클릭하면 그림의 실제 위치로 이동하도록 만들 수 있다. `[23]` 같은 참고문헌 번호도 동일하게 처리할 수 있다.

SoloPDF에서는 [viewer/controller.ts](https://github.com/zhitongblog/solopdf/blob/main/app/src/viewer/controller.ts?utm_source=chatgpt.com)의 링크 hover 처리와 미리보기 구조를 참고할 수 있다.

PDFie는 이미 논문 본문의 텍스트, 섹션 구조, 인용 근거를 분석하고 있으므로 이를 활용할 수도 있다. 다만 PDF에 내부 링크가 없는 경우에는 참조 대상 탐지 및 위치 확인 로직이 추가로 필요하다.

추천하는 동작은 세 단계이다.

1. 마우스 hover → Figure/Table/Reference 미리보기
2. 클릭 → 대상 위치로 이동
3. Back → 원래 읽던 문장으로 정확하게 복귀

현재 PDFie의 `returnPage`는 한 번의 이동을 위한 제한적인 복귀 기능이다. SoloPDF의 [nav.ts](https://github.com/zhitongblog/solopdf/blob/main/app/src/nav.ts?utm_source=chatgpt.com)처럼 탐색 위치를 스택으로 관리하면 연속적인 이동도 처리할 수 있다.

### **B. 연속 스크롤과 자동 여백 제거**

PDFie는 `@embedpdf/plugin-scroll`을 사용하지만, 실제 표시 화면은 자체 제작한 `PaginatedViewport.tsx`가 담당한다.

이 구조를 유지하면서 `ContinuousViewport`를 추가하는 것을 권장한다.

현재: Paged view

12 / 40

추가: Continuous view

두 모드를 선택할 수 있도록 하고, 전환 시 현재 페이지와 확대율을 유지한다.

자동 여백 제거는 SoloPDF의 [crop.ts](https://github.com/zhitongblog/solopdf/blob/main/app/src/viewer/crop.ts?utm_source=chatgpt.com)를 참고할 만하다.

낮은 해상도로 일부 페이지를 렌더링하고 실제 콘텐츠가 차지하는 영역을 추정한 다음, PDF 원본을 변경하지 않고 화면에서만 여백을 잘라내는 방식이다.

학술 논문에서는 이 기능이 상당히 유용하다. 특히 2단 편집 논문을 작은 화면에서 읽을 때 가독성이 개선된다. 단, 페이지마다 여백이 다르고 스캔 그림·각주·페이지 번호가 존재하므로 자동 감지와 수동 조정을 함께 제공하는 것이 좋다.



## **3. Marks and Ink — 상당 부분을 기존 EmbedPDF로 구현할 수 있다**

**도입 가능성**

높음

입력·화면 표시: 비교적 용이 / 영구 저장·PDF 내보내기: 별도 검증 필요

SoloPDF는 하이라이트뿐 아니라 자유로운 펜 드로잉, 화살표, 도형, 텍스트 박스 등을 지원한다.

[PDF Annotation in Your Second Brain: From Zotero to Obsidian Plugins | by Ann P. | Medium](https://images.openai.com/static-rsc-4/DY6EgWR2Z598caZk5yQAuONrli0rNNl-Lmq1233ZDRNcQdL14HB-YYcpZsACwgAadm0bhp7XcVZyr3JiDTaKCfzJjUCPvOvqoV8gm8mvQb6jdqo6tJnRRC72qOjXq5VtMbjlqX18MGAFkZzFZsIGgaKmF_S_V0OzgCWi-P3oUv4?purpose=inline)

[‎PDF Expert – Edit, Sign PDFs App - App Store](https://images.openai.com/static-rsc-4/5xDrtjd4Y7xVQq90ZYdeRZUT1gDoWxZb5KybH7u57Xf_Qb1sKwsRNd7ZAbN7EBKa6AbuDmuJWrt6xl1eKc18cX7sLBow4jV5KfGPES2lHszNCqi85bFqEaJ87e-p-BegiGDLieLwkWmlkpB8yfR1psJTR-B1ShuIjRZEmumeen4?purpose=inline)

[电脑录屏快捷方式大揭秘，附赠新手必备的几个屏幕录制利器！ - 知乎](https://images.openai.com/static-rsc-4/uHKDUurHiFmmxktmQMdMXOHW6bTJq2nnKzoFdInZRC_xKtuBuqeNw_YxbYUHmXAa1LuSOq_RkCix-TPFthr1eXmPIFHnbxFXZhE1LSk5NRV0g9YbyU5OMPJJvIZTqgEibg6KtY7DYa7fn60fIA10OGFvNwMLxpkKwJkVupLVIsY?purpose=inline)

[8 Top Tools to Draw on PDF Online and Offline](https://images.openai.com/static-rsc-4/ps014IghH0T5nJ21A7HzrWuLxhkpqQFBxoOSKYsojjUqy2lBkB0GFNeafMq-QAjWUzFVbUexBuZbh0QwiEPwETF2llduzxyBrXAZDo7I57J5zLdSHiUgDlZoVwZW3UUUmn8_rUwhEZ8GK2iJWY2zxFZhHyZSRS1iskI__VPPya8?purpose=inline)

[Top 6 productivity tips for Drawboard PDF | Drawboard](https://images.openai.com/static-rsc-4/exl_BtxoGbjv4gcGR-OSfXK3ihknrAygLxTOg6OyAfHd_MJat7HCLFq3zJDjnWmNdTWiVTUJ3luoxLndcyza7o0ybejD_8aEIBj0Wwzg6Uo1ycT9foD-ucfVE453i_B0nxcoELJLowKla9Ssosvn7M-TmVU_KWBXnPj5WVWYSmY?purpose=inline)

[PDF 파일 압축하는 사이트 및 프로그램](https://images.openai.com/static-rsc-4/iqMNNIiOAWdmh4sJGZcwsbycRmK3IT_ir1Z-62cyGfyoIouKQyVDg3E11RaFd0Vdo9aZsjN8U2qA_zll7BTxWXtgkIJ0kDe_IsHx08O7oV3EYMzL7mbZwi9p1HMacg1BUMv6JpSeWY4squdHa1IIGPDPGQ9bcbvqgqj01_iMXqU?purpose=inline)

[Is there anything to read and hand-annotate a pdf like on paper on a touchscreen with stylus? - Ask Ubuntu](https://images.openai.com/static-rsc-4/5rlS5GNJWhZLDwNuw5WdbEvLgP0B2mZw_KoV_DEn0xNvVGVSx6mCc9t9QRC8jpaWvVbFZ1X4sKkhlH1dNhO0Cb1TcCDqGi3W4t3F0fTS4_UVVzkygyLQokPt5r-rjv9xmjM-mJz1a-zdbE6POjxdNAHemGKiUMIhekGJe5icKSI?purpose=inline)

PDFie는 현재 하이라이트 다섯 스타일과 메모를 지원한다. 그러나 주석 데이터 구조는 다음과 같이 제한적이다.

```
export interface PdfTextHighlight {
  id: string
  text: string
  style: PdfHighlightStyle
  pages: PdfSelectionPage[]
  createdAt: string
  note?: string
}
```

여기에 선, 화살표, 손글씨를 단순히 추가하는 것은 권장하지 않는다. 이들은 텍스트 선택에 연결된 주석이 아니라 독립적인 좌표와 모양을 가진 객체이기 때문이다.

### **가장 중요한 발견: EmbedPDF Annotation Plugin**

PDFie는 현재 EmbedPDF의 여러 플러그인을 사용하지만 annotation 플러그인은 활성화하지 않았다.

그런데 EmbedPDF 2.x에는 이미 다음과 같은 도구들이 구현되어 있다.

| 도구       | EmbedPDF Tool ID |
| ---------- | ---------------- |
| 하이라이트 | `highlight`      |
| 밑줄       | `underline`      |
| 취소선     | `strikeout`      |
| 물결 밑줄  | `squiggly`       |
| 손글씨·펜  | `ink`            |
| 사각형     | `square`         |
| 원·타원    | `circle`         |
| 직선       | `line`           |
| 화살표     | `lineArrow`      |
| 메모       | `text`           |

출처: [EmbedPDF Annotation Plugin 공식 문서](https://v2.embedpdf.com/docs/react/headless/plugins/plugin-annotation?utm_source=chatgpt.com) 

v2.embedpdf.com+1



즉, PDFie에서는 SoloPDF의 손글씨 구현을 그대로 옮기는 것보다 다음 방법이 우선이다.

1. `@embedpdf/plugin-annotation`과 `@embedpdf/plugin-history`를 현재 PDFie와 일치하는 버전으로 추가한다.
2. PDFie의 기존 선택·렌더링 계층에 annotation layer를 통합한다.
3. 기존 하이라이트 기록을 새 주석 모델로 마이그레이션한다.
4. 주석 저장과 PDF 내보내기를 분리하여 구현한다.

SoloPDF의 펜 압력, Catmull–Rom 곡선 보간, 지우개 처리 등은 EmbedPDF 기본 기능에 부족한 부분이 있을 때 참고하면 된다.

### **반드시 검증해야 할 문제**

현재 PDFie가 사용하는 EmbedPDF 2.14.4에는 주목할 공개 이슈가 있다.

저장된 주석을 다시 불러온 다음 PDF로 내보내면, 일부 주석의 appearance stream(`/AP`)이 없어 다른 PDF 뷰어에서 보이지 않을 수 있다는 보고이다. 이 이슈는 확인 시점에 여전히 열려 있었다. 

GitHub



따라서 플러그인이 펜을 지원한다는 사실과, PDFie가 **표준 PDF 주석을 안정적으로 생성한다는 사실은 구별해야 한다.**

PDFie 내부 저장과 화면 렌더링을 먼저 구현하고, 이후 macOS Preview와 Acrobat에서 실제로 보이는 PDF를 내보낼 수 있는지 테스트해야 한다.



## **5. 실제 통합에 필요한 아키텍처**

SoloPDF 전체를 가져오거나 PDFium을 PDF.js로 교체할 필요는 없다.

다음과 같이 PDFie의 기존 기능 위에 독립적인 서비스 계층을 추가하는 방향을 추천한다.

**PDFie Reader UI**

React · Electrobun

Navigation Service

History, preview, split, layout

Annotation Service

Highlight, ink, shapes, notes

**EmbedPDF / PDFium**

기존 PDF 렌더링 엔진 유지

Document Store

상태·주석·학습 기록

Export Adapter

Markdown / PDF

이 구조는 PDFie의 AI 학습 기능을 건드리지 않으면서 PDF 읽기 기능을 독립적으로 발전시킬 수 있다는 장점이 있다.

## **6. 권장 구현 순서**

| 순서 | 작업                            | 난이도    | 우선순위 |
| ---- | ------------------------------- | --------- | -------- |
| 1    | 초기 열기 최적화, 성능 계측     | 중간      | 최상     |
| 2    | Back/Forward 및 내부 링크 탐색  | 낮음~중간 | 최상     |
| 3    | Figure/Table/인용 hover preview | 중간~높음 | 높음     |
| 4    | 연속 스크롤, 자동 여백 제거     | 중간~높음 | 높음     |
| 5    | Annotation Plugin 및 펜·도형    | 중간      | 높음     |
|      |                                 |           |          |
| 7    | 표준 PDF 주석 export            | 높음      | 중간     |
| 8    | 동일 문서 분할 화면             | 높음      |          |

개발 과정에서는 기존의 텍스트 선택, 2단 논문 선택 범위, 페이지 회전, 하이라이트 위치, AI 인용 링크 기능에 대한 회귀 테스트가 특히 중요하다. 초기 열기 개선은 1,000페이지급 대용량 파일과 일반 학술 논문에서 각각 첫 페이지 표시 시간과 최대 메모리 사용량을 측정하는 방식으로 평가해야 한다.



## **최종 판단**

PDFie의 장점은 이미 구축된 PDFium 기반의 정확한 텍스트 선택 기능과 AI 학습 환경이다. 이것을 버리고 SoloPDF의 PDF.js 기반 뷰어로 교체하는 것은 불필요한 회귀 위험을 만든다.

반면 **SoloPDF의 탐색 경험과 주석 모델은 적극적으로 참조할 가치가 있다.**

특히 학술 연구용 PDFie에서는 세 가지를 우선 추천한다.

**첫째**, 대용량 PDF를 먼저 보여주고 색인·해시 계산은 뒤에서 처리하는 구조로 개선한다.

**둘째**, 논문의 Figure, Table, References를 원래 읽던 위치에서 벗어나지 않고 확인할 수 있도록 hover preview와 탐색 기록을 추가한다. 이는 일반 PDF 편집 기능보다 PDFie의 학술적 활용도를 더 크게 높일 가능성이 있다.

**셋째**, EmbedPDF의 annotation 플러그인으로 실제 PDF 주석과 펜 기능을 구현하고, SoloPDF의 문맥 기반 anchor 및 Markdown export 방식을 보완적으로 적용한다.

현재 검토는 GitHub의 코드 및 문서 분석에 기반하며, 두 앱의 실제 실행 성능 비교나 PDFie의 macOS 빌드 테스트를 수행한 것은 아니다. **기술적으로는 구현 가능한 것으로 판단되지만, 가장 중요한 검증 대상은 초기 열기 성능, 기존 주석의 마이그레이션, 표준 PDF 내보내기의 신뢰성이다.**

기존 PDFie의 `main` 브랜치나 코드는 변경하지 않았다.