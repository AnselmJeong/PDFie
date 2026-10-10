# ADR 005: Validated declarative learning runtime

Date: 2026-10-10  
Status: Implemented beta

The model returns JSON data for React-owned components. It never returns an executable application. Validation allows only explanation, ordered diagram, prediction, multiple-choice quiz and two fixed illustrative experiments (`y=2x`, `1/sqrt(n)`). Experiments require finite bounded parameters and explicit illustrative-data labeling. Unsupported component types, code, nonexistent evidence IDs and invalid quiz/range values cannot become a lesson.

Every step links to a stored source snapshot. Predictions hide feedback until the learner acts. Attempts record the response, correctness, explanation and whether answers were revealed. Reading feedback before another attempt means that retry is not recorded as an independent pass. Goal exploration and passing a quiz are separate states.

Lessons save their provider/model/revision and coverage. The local runtime saves step and experiment state; attempts and feedback survive reopen. A body-level modal supports expanded lessons, Escape and a keyboard focus loop. Revealing source evidence exits the expanded lesson so the PDF can be inspected.

This is a constrained beta runtime. Free-response rubrics, learner appeals, paper-specific simulations, arbitrary formulas, wider templates and independent content review are not included. Structural validation cannot establish that a model's proposed correct answer is scientifically correct.
