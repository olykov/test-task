import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { generate } from './lib/webhook-payloads.js';

const TARGET = __ENV.TARGET_URL || 'https://n8n-test-task.olykov.com/webhook/fraud';

// Custom metrics — must be declared in init context (top-level)
const acceptedRate = new Rate('webhook_accepted_rate');
const duplicateRate = new Rate('webhook_duplicate_rate');
const overflowRate = new Rate('webhook_overflow_rate');
const errorRate = new Rate('webhook_error_rate');
const ingestionLatency = new Trend('webhook_ingestion_ms', true);

export const options = {
  scenarios: {
    sustained_50rps: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: __ENV.DURATION || '30s',
      preAllocatedVUs: 100,
      maxVUs: 200,
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.05'],            // <5% errors
    'webhook_accepted_rate': ['rate>0.5'],       // >50% accepted (rest may be dup)
  },
};

export default function () {
  const { scenario, payload } = generate();
  // No dynamic Counter — k6 auto-groups metrics by `scenario` tag

  const res = http.post(TARGET, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    tags: { scenario },
  });

  ingestionLatency.add(res.timings.duration);

  let body;
  try { body = res.json(); } catch (e) { body = {}; }

  if (res.status === 202) {
    acceptedRate.add(1);
  } else if (res.status === 200 && body.status === 'duplicate') {
    duplicateRate.add(1);
  } else if (res.status === 503) {
    overflowRate.add(1);
  } else {
    errorRate.add(1);
  }

  check(res, {
    '2xx response': (r) => r.status >= 200 && r.status < 300,
    'has request_id': (r) => body.request_id !== undefined,
  });
}
