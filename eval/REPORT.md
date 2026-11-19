# Extraction accuracy

Run on 10 fictional sample letters (`eval/letters.ts`). Only verified items count as correct.

| Metric | rules | rules (wrapped) |
|---|---:|---:|
| Personal data leaked to the AI | 0 | 0 |
| Letter date correct | 100% | 100% |
| Deadlines found (recall) | 82% | 82% |
| Deadlines correct (precision) | 100% | 100% |
| Amounts found (recall) | 100% | 100% |
| Amounts correct (precision) | 100% | 100% |
| References found | 100% | 100% |
| Claims that passed verification | 100% | 100% |

## rules: per letter

| Letter | Deadlines | Amounts | References | Verified claims | Notes |
|---|---|---|---|---|---|
| tax-assessment | 2/2 | 1/1 | 1/1 | 4/4 |  |
| health-insurance-arrears | 1/1 | 2/2 | 1/1 | 4/4 |  |
| broadcast-fee-assessment | 1/1 | 2/2 | 1/1 | 4/4 |  |
| immigration-appointment | 1/1 | 0/0 | 1/1 | 2/2 |  |
| jobcenter-documents | 1/1 | 0/0 | 1/1 | 2/2 |  |
| landlord-utilities | 1/1 | 1/1 | 0/0 | 2/2 |  |
| traffic-warning-fine | 1/1 | 1/1 | 1/1 | 3/3 |  |
| utility-reminder | 1/1 | 3/3 | 1/1 | 5/5 |  |
| university-reenrolment | 0/1 | 1/1 | 0/0 | 1/1 |  |
| family-benefit-form | 0/1 | 0/0 | 0/0 | 0/0 |  |

## rules (wrapped): per letter

| Letter | Deadlines | Amounts | References | Verified claims | Notes |
|---|---|---|---|---|---|
| tax-assessment (wrapped) | 2/2 | 1/1 | 1/1 | 4/4 |  |
| health-insurance-arrears (wrapped) | 1/1 | 2/2 | 1/1 | 4/4 |  |
| broadcast-fee-assessment (wrapped) | 1/1 | 2/2 | 1/1 | 4/4 |  |
| immigration-appointment (wrapped) | 1/1 | 0/0 | 1/1 | 2/2 |  |
| jobcenter-documents (wrapped) | 1/1 | 0/0 | 1/1 | 2/2 |  |
| landlord-utilities (wrapped) | 1/1 | 1/1 | 0/0 | 2/2 |  |
| traffic-warning-fine (wrapped) | 1/1 | 1/1 | 1/1 | 3/3 |  |
| utility-reminder (wrapped) | 1/1 | 3/3 | 1/1 | 5/5 |  |
| university-reenrolment (wrapped) | 0/1 | 1/1 | 0/0 | 1/1 |  |
| family-benefit-form (wrapped) | 0/1 | 0/0 | 0/0 | 0/0 |  |
