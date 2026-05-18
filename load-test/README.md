# Load tests

k6 сценарії для перевірки pipeline проти production URL `https://n8n-test-task.olykov.com/webhook/fraud`.

## Дані

Сценарії використовують hardcoded driver_id/trip_id (drv_0001..drv_0041, trp_00010..trp_00165) — ці записи вже сидяться в Mongo на проді. Нічого додатково встановлювати не треба.

## Запуск

```bash

cd load-test

# далі на вибір  - локально або в докері

brew install k6
# aбо 
docker pull k6

# baseline — 50 RPS × 30s
docker run --rm -v $(pwd)/scenarios:/scripts grafana/k6 run /scripts/50rps-sustained.js
# aбо
k6 run scenarios/50rps-sustained.js

# 50 RPS × власна тривалість
docker run --rm -e DURATION=120s -v $(pwd)/scenarios:/scripts grafana/k6 run /scripts/50rps-sustained.js
# aбо
DURATION=120s k6 run scenarios/50rps-sustained.js

# burst до 500 RPS — перевірка backpressure (503 + Retry-After)
docker run --rm -v $(pwd)/scenarios:/scripts grafana/k6 run /scripts/500rps-burst.js
# aбо
k6 run scenarios/500rps-burst.js

# тригер Circuit Breaker (підвищена частка fraud-сценаріїв)
docker run --rm -v $(pwd)/scenarios:/scripts grafana/k6 run /scripts/circuit-breaker-trigger.js
# aбо
k6 run scenarios/circuit-breaker-trigger.js
```

## Що дивитись
**Live метрики:** [grf-test-task.olykov.com](https://grf-test-task.olykov.com) → дашборд **Fraud Monitoring**.

Time range «Last 5 minutes», ключові панелі:
- **Decisions per 5s by source** — приріст під час тесту
- **Total latency / Service time P50/P95/P99** — куди іде час (queue vs processing)
- **CB state distribution / trip reasons** — чи активувався Circuit Breaker
- **Decisions during CB=open** — скільки запитів обслужено через path 1 bypass

---
