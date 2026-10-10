# Study library verification — 2026-10-10

The independent library is installed in `/Applications/PDFie.app`. Its Bun bundle, view bundle and stylesheet match the verified stable package. Original app and SQLite data were preserved in `~/Library/Application Support/PDFie Backups/20261010-study-library-135854/` before installation.

The subsequent coordinated stable build also includes cancellation recovery and main-window-centered settings, verified by the “PRD와 계획에 따라 PDFie 확장” chat. A read-only check confirmed the currently installed Bun/view hashes match `study-cancellation-20261010.json` and the shared source retains both the library and those fixes. The JSON report separates the first library installation hashes from this later installed verification. No further installation or UI action was performed during coordination.

## Automated checks

- TypeScript passed.
- All 132 unit tests passed, plus the source-bridge, document-state, study-platform and new study-library Bun integrations.
- The library integration migrated a database created before the catalog existed, retained its complete snapshot, reopened it after shutdown, reviewed without a source PDF, saved experiment parameters and independently passed a quiz without calling an AI provider, reconnected a moved original, rejected a different PDF without changing the existing association, exercised literal/content search and 40-item pagination, and verified archive/deletion isolation.
- Biome reported zero errors and 68 existing warnings. `git diff --check` passed.
- Stable package inspection confirmed native WebKit, local PDFium WASM and no Chromium payload.

## Native UI

An isolated app identity, `dev.aquatope.pdfie.library-qa`, used one synthetic saved lesson with no PDF path and no AI connection. The native UI opened its explanation and saved source quote, changed the experiment slider to 51, submitted a correct quiz answer, recorded completion and showed independent goal success. After quitting/relaunching, the selected answer, feedback, completion and slider value 51 were restored. Searching for a term present in quiz feedback found the paper. These checks did not insert test lessons into the user's collection.

In the installed application, the real 17-page Carhart-Harris paper remained prepared at 17/17 pages. The library displayed the paper, all seven study goals, saved explanations and the return-to-reader action. The 27 entities in the pre-install backup (seven goals and 20 messages) remained byte-for-byte intact; later additional messages were retained as well. This paper has no completed saved `LessonSpec`, so actual missing-source interactive replay was exercised with the isolated lesson above rather than presented as a result on this real paper.

## Limits

Markdown export preserves readable lesson steps, quiz choices/feedback, illustrative formulas, saved parameters and source quotes. It is not a portable interactive archive/import format. A changed PDF with a different byte hash cannot be linked to existing evidence as if it were the original. PDFs dropped into the viewer remain temporary; learning materials are durable, while an original PDF must be explicitly reconnected for page navigation.
