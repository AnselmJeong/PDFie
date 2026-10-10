# Study library independent of an open PDF

Learning is a growing collection of reusable material, not an application preference. PDFie starts in a study library with a searchable paper list and a reading surface. The PDF workspace remains the place to create source-grounded content. Switching to the library retains the current viewer and any running generation.

The left column supports title/content search, recent/title sorting, favorites, archived material and pagination. The right column prioritizes saved interactive lessons, then goals and saved explanations/conversations. Lessons reuse the same bounded player as the reading sidebar. Experiment parameters, quiz feedback and progress persist without a PDF handle or provider request. Explicit lesson completion records participation; independent quiz success remains a separate goal outcome.

Records are addressed by the immutable PDF byte hash. An additive `library_documents` catalog holds the title, filename, optional original path, favorite/archive state and activity dates. The original `documents`, `pages`, `blocks` and `entities` storage remains intact. Migration recovers titles for older records, which had no persisted filename/path. Opening or relinking the original fills those gaps without replacing user-edited titles.

Saved source quotes remain readable in a dedicated evidence pane. PDF navigation is an explicit second action. Reconnection registers the chosen PDF, compares its byte hash and discards mismatched handles before updating the catalog. Temporary dropped PDFs are not treated as durable source paths.

The library contains management controls. Deletion requires an inline confirmation and removes only the selected paper's study index, entities, captures and catalog entry. Original PDFs and independently stored reader annotations remain. Markdown export includes all lesson steps, choices, illustrative formulas, saved parameters, source quotes and assessment outcomes; it is a readable export, not a restorable interactive bundle.

Validation includes a pre-catalog migration and restart, missing-source review, zero-provider-call experiments/assessments, identity-safe reconnection, content search, pagination, archive and scoped deletion. Native UI checks and installed-app verification are recorded separately in the QA report.
