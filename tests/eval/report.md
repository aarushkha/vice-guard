# Vice Guard eval report

## Generated set (739 examples)

| Layer    | Positives scored | Recall | Negatives scored | False positives |
| -------- | ---------------: | -----: | ---------------: | --------------: |
| text     |              424 |  81.4% |              315 |            0.0% |
| ocr      |               79 |  79.7% |               57 |            0.0% |
| clip     |               79 |   1.3% |               57 |            0.0% |
| combined |              412 |  99.0% |              315 |            0.0% |

Visual-only placeholders (12, excluded from "combined"): CLIP caught 0. Placeholder art does not look like GTA 6, so this measures nothing yet; put real screenshots in tests/eval/images-real/ to score CLIP.

| Group                       | Recall | FP rate |
| --------------------------- | -----: | ------: |
| category:explicit           | 100.0% |     n/a |
| category:implicit           | 100.0% |     n/a |
| category:other-game         |    n/a |    0.0% |
| category:thumbnail-negative |    n/a |    0.0% |
| category:thumbnail-text     |  94.0% |     n/a |
| category:tricky-negative    |    n/a |    0.0% |
| site:article                | 100.0% |    0.0% |
| site:google                 | 100.0% |    0.0% |
| site:news                   | 100.0% |    0.0% |
| site:reddit                 | 100.0% |    0.0% |
| site:x                      | 100.0% |    0.0% |
| site:youtube                |  97.1% |    0.0% |

Misses (4):

- g0610 I was NOT ready for this [thumb: VICE CITY 2026]
- g0624 the twist nobody expected [thumb: G T A 6]
- g0630 watch till the end [thumb: G T A 6]
- g0634 I can't believe this happened... [thumb: GTAVI]

False positives (0):

## Handwritten holdout (158 examples)

| Layer    | Positives scored | Recall | Negatives scored | False positives |
| -------- | ---------------: | -----: | ---------------: | --------------: |
| text     |               86 | 100.0% |               72 |            0.0% |
| ocr      |                0 |    n/a |                0 |             n/a |
| clip     |                0 |    n/a |                0 |             n/a |
| combined |               86 | 100.0% |               72 |            0.0% |

| Group            | Recall | FP rate |
| ---------------- | -----: | ------: |
| category:holdout | 100.0% |    0.0% |
| site:article     | 100.0% |    0.0% |
| site:google      | 100.0% |    0.0% |
| site:news        | 100.0% |    0.0% |
| site:reddit      | 100.0% |    0.0% |
| site:x           | 100.0% |    0.0% |
| site:youtube     | 100.0% |    0.0% |

Misses (0):

False positives (0):

## All (897 examples)

| Layer    | Positives scored | Recall | Negatives scored | False positives |
| -------- | ---------------: | -----: | ---------------: | --------------: |
| text     |              510 |  84.5% |              387 |            0.0% |
| ocr      |               79 |  79.7% |               57 |            0.0% |
| clip     |               79 |   1.3% |               57 |            0.0% |
| combined |              498 |  99.2% |              387 |            0.0% |

Visual-only placeholders (12, excluded from "combined"): CLIP caught 0. Placeholder art does not look like GTA 6, so this measures nothing yet; put real screenshots in tests/eval/images-real/ to score CLIP.

| Group                       | Recall | FP rate |
| --------------------------- | -----: | ------: |
| category:explicit           | 100.0% |     n/a |
| category:holdout            | 100.0% |    0.0% |
| category:implicit           | 100.0% |     n/a |
| category:other-game         |    n/a |    0.0% |
| category:thumbnail-negative |    n/a |    0.0% |
| category:thumbnail-text     |  94.0% |     n/a |
| category:tricky-negative    |    n/a |    0.0% |
| site:article                | 100.0% |    0.0% |
| site:google                 | 100.0% |    0.0% |
| site:news                   | 100.0% |    0.0% |
| site:reddit                 | 100.0% |    0.0% |
| site:x                      | 100.0% |    0.0% |
| site:youtube                |  97.7% |    0.0% |

Misses (4):

- g0610 I was NOT ready for this [thumb: VICE CITY 2026]
- g0624 the twist nobody expected [thumb: G T A 6]
- g0630 watch till the end [thumb: G T A 6]
- g0634 I can't believe this happened... [thumb: GTAVI]

False positives (0):
