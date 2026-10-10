# Goal source-reference recovery — 2026-10-10

The Sloutsky paper was fully prepared (4/4 pages). Its failed goal response contained `E-1-26-5ac1b12b897d2e1e4`, while the supplied source ID was `E-1-26-5ac1b12b897d2e1e`. One appended character caused the entire response to fail strict source validation. The stored failed response reproduced the issue. A subsequent user retry had already saved seven goals before this fix.

Generation now constrains source IDs to the current request's exact choices, reusing one JSON Schema definition across nested lesson components. Goal section IDs also have exact choices plus null. All output still passes source and language validation before publication. An explicit source-reference error retries the full response once under the same cancellation signal and overall time limit. No local approximate-ID replacement occurs. A repeated failure preserves existing goals and explains that the generated content was not saved.

## Acceptance

- All 151 tests across 23 files passed, along with the source bridge, document persistence, study platform, library, adaptive learning and new source recovery integration checks.
- Recovery checks cover corrected output, two-attempt failure limits, invalid sections, no retries for JSON/language/provider errors, cancellation during retry and protection of edited/explored goals.
- Type checking, stable build, installed-package verification and diff whitespace checks passed.
- In the updated `/Applications/PDFie.app`, the actual Codex connection generated **eight goals** for the real Sloutsky PDF. Every saved goal citation matches both that request's evidence and the current source index.
- Clicking the learning-trap goal's formerly mistyped source opened and highlighted the correct PDF page 1 paragraph.
- Protected prior entities, including records for the other paper, remained unchanged. Automatic retry was verified deterministically; the live generation completed without an observed recovery attempt.

The original app and database are backed up in `~/Library/Application Support/PDFie Backups/20261010-source-reference-recovery/`. Detailed result: [source-reference-recovery-20261010.json](source-reference-recovery-20261010.json).
