import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { generate } from './lib/webhook-payloads.js';

const TARGET = __ENV.TARGET_URL || 'https://n8n-test-task.olykov.com/webhook/fraud';

const acceptedRate = new Rate('webhook_accepted_rate');
const overflowRate = new Rate('webhook_overflow_rate');
const errorRate = new Rate('webhook_error_rate');
const ingestionLatency = new Trend('webhook_ingestion_ms', true);

export const options = {
  scenarios: {
    burst_500rps: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 1000,
      stages: [
        { target: 100, duration: '5s' },   // ramp 10 → 100
        { target: 500, duration: '5s' },   // ramp 100 → 500
        { target: 500, duration: '10s' },  // sustain 500
        { target: 0,   duration: '5s' },   // ramp down
      ],
    },
  },
  thresholds: {
    'webhook_accepted_rate': ['rate>0.4'],
  },
};

export default function () {
  const { scenario, payload } = generate();
  const res = http.post(TARGET, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    tags: { scenario },
  });

  ingestionLatency.add(res.timings.duration);

  if (res.status === 202) acceptedRate.add(1);
  else if (res.status === 503) overflowRate.add(1);
  else if (res.status >= 400) errorRate.add(1);

  check(res, {
    'response received': (r) => r.status > 0,
    'no 5xx other than 503': (r) => r.status < 500 || r.status === 503,
  });
}
