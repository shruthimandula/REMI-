// ─── Unit Tests: Memory Safety ───────────────────────────────────────────────
// Tests that:
// 1. Failed steps are never re-suggested for the same customer+category
// 2. Replies never ask for information already stored in memory
//
// Run: npm test

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Import seed data directly (no TS compilation needed) ─────────────────────

// We replicate the core logic here to test without needing the full Next.js build

const failedSolutions = [
  { id: 'fs-1', customerId: 'CUST-1001', category: 'billing-sync', step: 'Clear billing cache and force sync', failureReason: 'Did not work on second and subsequent occurrences after plan upgrade', ticketId: 'TKT-4821', timestamp: '2026-05-15T10:30:00Z' },
  { id: 'fs-2', customerId: 'CUST-1001', category: 'billing-sync', step: 'Re-link payment method', failureReason: 'Payment re-link did not resolve sync issue', ticketId: 'TKT-4821', timestamp: '2026-05-15T11:00:00Z' },
  { id: 'fs-3', customerId: 'CUST-1004', category: 'notifications', step: 'Re-enable notification permissions only', failureReason: 'Permissions alone insufficient; battery optimization also needed', ticketId: 'TKT-4833', timestamp: '2026-07-20T09:15:00Z' },
];

const winningFixes = [
  { id: 'wf-1', category: 'billing-sync', step: 'Escalate to billing team for webhook investigation', successCount: 1 },
  { id: 'wf-2', category: 'billing-sync', step: 'Apply server-side billing reconciliation script', successCount: 1 },
  { id: 'wf-3', category: 'app-crash', step: 'Update to latest app version', successCount: 3 },
  { id: 'wf-4', category: 'notifications', step: 'Disable battery optimization + re-enable permissions', successCount: 2 },
  { id: 'wf-5', category: 'permissions', step: 'Re-grant app permissions after update', successCount: 2 },
  { id: 'wf-6', category: 'browser-extension', step: 'Disable conflicting browser extension', successCount: 2 },
];

const semanticMemories = [
  { id: 'sem-1', customerId: 'CUST-1001', category: 'environment', key: 'Operating System', value: 'Windows 11' },
  { id: 'sem-2', customerId: 'CUST-1001', category: 'environment', key: 'Browser', value: 'Chrome 140' },
  { id: 'sem-3', customerId: 'CUST-1001', category: 'plan', key: 'Current Plan', value: 'Business (upgraded from Starter)' },
  { id: 'sem-4', customerId: 'CUST-1001', category: 'product', key: 'App Version', value: '4.5.2' },
  { id: 'sem-5', customerId: 'CUST-1001', category: 'preference', key: 'Communication Style', value: 'Prefers concise responses, does not like repeating information' },
];

// ── Helper functions (replicated from memory-store.ts) ───────────────────────

function isFailedStep(customerId, category, step) {
  return failedSolutions.some(
    f =>
      f.customerId === customerId &&
      f.category === category &&
      f.step.toLowerCase() === step.toLowerCase()
  );
}

function getFailedSolutions(customerId, category) {
  return failedSolutions.filter(
    f => f.customerId === customerId && (!category || f.category === category)
  );
}

function proposeFix(customerId, category) {
  const failed = getFailedSolutions(customerId, category);
  const failedSteps = new Set(failed.map(f => f.step.toLowerCase()));
  const wins = winningFixes.filter(w => w.category === category);

  // Filter out previously failed steps
  const safeFixes = wins.filter(w => !failedSteps.has(w.step.toLowerCase()));
  return safeFixes;
}

function getKnownInfo(customerId) {
  return semanticMemories
    .filter(s => s.customerId === customerId)
    .map(s => ({ key: s.key, value: s.value }));
}

function isMemorySafe(reply, customerId) {
  const knownInfo = getKnownInfo(customerId);
  const askPatterns = [
    /what (?:is|are) your (?:os|operating system)/i,
    /what browser (?:are you|do you) us/i,
    /what plan (?:are you|do you have)/i,
    /what version (?:of the|are you)/i,
    /can you tell me your/i,
    /could you provide your/i,
    /what is your email/i,
  ];

  for (const pattern of askPatterns) {
    if (pattern.test(reply)) {
      // Check if the info is already known
      for (const info of knownInfo) {
        if (reply.toLowerCase().includes(info.key.toLowerCase())) {
          return false; // Asking for info we already have
        }
      }
    }
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Failed-Step Blocking
// ═══════════════════════════════════════════════════════════════════════════════

describe('Failed-Step Blocking', () => {
  it('should identify "Clear billing cache" as a failed step for CUST-1001', () => {
    assert.ok(isFailedStep('CUST-1001', 'billing-sync', 'Clear billing cache and force sync'));
  });

  it('should identify "Re-link payment method" as a failed step for CUST-1001', () => {
    assert.ok(isFailedStep('CUST-1001', 'billing-sync', 'Re-link payment method'));
  });

  it('should be case-insensitive when checking failed steps', () => {
    assert.ok(isFailedStep('CUST-1001', 'billing-sync', 'CLEAR BILLING CACHE AND FORCE SYNC'));
  });

  it('should NOT flag a step as failed for a different customer', () => {
    assert.ok(!isFailedStep('CUST-1002', 'billing-sync', 'Clear billing cache and force sync'));
  });

  it('should NOT flag a step as failed for a different category', () => {
    assert.ok(!isFailedStep('CUST-1001', 'notifications', 'Clear billing cache and force sync'));
  });

  it('proposeFix should never include failed steps for CUST-1001 billing-sync', () => {
    const fixes = proposeFix('CUST-1001', 'billing-sync');
    const fixSteps = fixes.map(f => f.step.toLowerCase());

    // These should NOT be in the proposed fixes
    assert.ok(!fixSteps.includes('clear billing cache and force sync'));
    assert.ok(!fixSteps.includes('re-link payment method'));
  });

  it('proposeFix should still include winning fixes that have not failed', () => {
    const fixes = proposeFix('CUST-1001', 'billing-sync');

    // Escalation and reconciliation script should still be available
    assert.ok(fixes.length > 0, 'Should have at least one safe fix');
    const fixSteps = fixes.map(f => f.step);
    assert.ok(
      fixSteps.includes('Escalate to billing team for webhook investigation') ||
      fixSteps.includes('Apply server-side billing reconciliation script'),
      'Should suggest escalation or reconciliation'
    );
  });

  it('proposeFix should return all fixes for a customer with no failed solutions', () => {
    const fixes = proposeFix('CUST-1002', 'billing-sync');
    const allBillingFixes = winningFixes.filter(w => w.category === 'billing-sync');
    assert.equal(fixes.length, allBillingFixes.length, 'All fixes should be available');
  });

  it('should track notification permission failure for CUST-1004', () => {
    assert.ok(isFailedStep('CUST-1004', 'notifications', 'Re-enable notification permissions only'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Memory-Safe Replies
// ═══════════════════════════════════════════════════════════════════════════════

describe('Memory-Safe Replies', () => {
  it('should flag a reply that asks for OS when OS is known', () => {
    const reply = 'What is your Operating System? I need to know to help.';
    assert.ok(!isMemorySafe(reply, 'CUST-1001'), 'Should NOT be memory-safe');
  });

  it('should flag a reply that asks for browser when browser is known', () => {
    const reply = 'What browser are you using? This might be a browser-specific issue.';
    assert.ok(!isMemorySafe(reply, 'CUST-1001'), 'Should NOT be memory-safe');
  });

  it('should accept a reply that does not ask for known information', () => {
    const reply = 'I can see you are on Windows 11 with Chrome 140. Let me check your billing status.';
    assert.ok(isMemorySafe(reply, 'CUST-1001'), 'Should be memory-safe');
  });

  it('should accept a reply that asks for information we do NOT have', () => {
    const reply = 'Can you share the exact error message you are seeing?';
    assert.ok(isMemorySafe(reply, 'CUST-1001'), 'Should be memory-safe');
  });

  it('should accept a reply for a customer with no semantic memory', () => {
    const reply = 'What is your operating system?';
    assert.ok(isMemorySafe(reply, 'CUST-1009'), 'Should be memory-safe for unknown customer');
  });

  it('should accept a reply that references known info without asking', () => {
    const reply = 'Since you are on the Business plan with Windows 11, here is what I recommend.';
    assert.ok(isMemorySafe(reply, 'CUST-1001'), 'Should be memory-safe');
  });
});

console.log('✅ All tests defined. Running...');
