import { describe, it, expect } from 'vitest';
import { isTransitionAllowed, requiresActor } from './state-machine';
import type { ExecutionState } from '@ai-company-os/skill-spec';

describe('StateMachine', () => {
  describe('isTransitionAllowed', () => {
    describe('CREATED state', () => {
      it('should allow transition to PENDING_APPROVAL', () => {
        expect(isTransitionAllowed('CREATED', 'PENDING_APPROVAL')).toBe(true);
      });

      it('should allow transition to BUDGET_RESERVED', () => {
        expect(isTransitionAllowed('CREATED', 'BUDGET_RESERVED')).toBe(true);
      });

      it('should allow transition to CANCELLED', () => {
        expect(isTransitionAllowed('CREATED', 'CANCELLED')).toBe(true);
      });

      it('should NOT allow transition to RUNNING', () => {
        expect(isTransitionAllowed('CREATED', 'RUNNING')).toBe(false);
      });

      it('should NOT allow transition to COMPLETED', () => {
        expect(isTransitionAllowed('CREATED', 'COMPLETED')).toBe(false);
      });
    });

    describe('PENDING_APPROVAL state', () => {
      it('should allow transition to APPROVED', () => {
        expect(isTransitionAllowed('PENDING_APPROVAL', 'APPROVED')).toBe(true);
      });

      it('should allow transition to CANCELLED', () => {
        expect(isTransitionAllowed('PENDING_APPROVAL', 'CANCELLED')).toBe(true);
      });

      it('should NOT allow transition to RUNNING', () => {
        expect(isTransitionAllowed('PENDING_APPROVAL', 'RUNNING')).toBe(false);
      });
    });

    describe('APPROVED state', () => {
      it('should allow transition to BUDGET_RESERVED', () => {
        expect(isTransitionAllowed('APPROVED', 'BUDGET_RESERVED')).toBe(true);
      });

      it('should allow transition to CANCELLED', () => {
        expect(isTransitionAllowed('APPROVED', 'CANCELLED')).toBe(true);
      });

      it('should NOT allow transition to RUNNING', () => {
        expect(isTransitionAllowed('APPROVED', 'RUNNING')).toBe(false);
      });
    });

    describe('BUDGET_RESERVED state', () => {
      it('should allow transition to RUNNING', () => {
        expect(isTransitionAllowed('BUDGET_RESERVED', 'RUNNING')).toBe(true);
      });

      it('should allow transition to CANCELLED', () => {
        expect(isTransitionAllowed('BUDGET_RESERVED', 'CANCELLED')).toBe(true);
      });

      it('should NOT allow transition to COMPLETED', () => {
        expect(isTransitionAllowed('BUDGET_RESERVED', 'COMPLETED')).toBe(false);
      });
    });

    describe('RUNNING state', () => {
      it('should allow transition to COMPLETED', () => {
        expect(isTransitionAllowed('RUNNING', 'COMPLETED')).toBe(true);
      });

      it('should allow transition to FAILED', () => {
        expect(isTransitionAllowed('RUNNING', 'FAILED')).toBe(true);
      });

      it('should allow transition to TIMEOUT', () => {
        expect(isTransitionAllowed('RUNNING', 'TIMEOUT')).toBe(true);
      });

      it('should NOT allow transition to CANCELLED', () => {
        expect(isTransitionAllowed('RUNNING', 'CANCELLED')).toBe(false);
      });
    });

    describe('Terminal states', () => {
      it('COMPLETED should not allow any transitions', () => {
        const states: ExecutionState[] = [
          'CREATED',
          'PENDING_APPROVAL',
          'APPROVED',
          'BUDGET_RESERVED',
          'RUNNING',
          'FAILED',
          'TIMEOUT',
          'CANCELLED',
          'ROLLED_BACK',
        ];
        states.forEach((state) => {
          expect(isTransitionAllowed('COMPLETED', state)).toBe(false);
        });
      });

      it('CANCELLED should not allow any transitions', () => {
        const states: ExecutionState[] = [
          'CREATED',
          'PENDING_APPROVAL',
          'APPROVED',
          'BUDGET_RESERVED',
          'RUNNING',
          'COMPLETED',
          'FAILED',
          'TIMEOUT',
          'ROLLED_BACK',
        ];
        states.forEach((state) => {
          expect(isTransitionAllowed('CANCELLED', state)).toBe(false);
        });
      });

      it('ROLLED_BACK should not allow any transitions', () => {
        const states: ExecutionState[] = [
          'CREATED',
          'PENDING_APPROVAL',
          'APPROVED',
          'BUDGET_RESERVED',
          'RUNNING',
          'COMPLETED',
          'FAILED',
          'TIMEOUT',
          'CANCELLED',
        ];
        states.forEach((state) => {
          expect(isTransitionAllowed('ROLLED_BACK', state)).toBe(false);
        });
      });
    });

    describe('Failure recovery states', () => {
      it('FAILED should allow transition to ROLLED_BACK', () => {
        expect(isTransitionAllowed('FAILED', 'ROLLED_BACK')).toBe(true);
      });

      it('TIMEOUT should allow transition to ROLLED_BACK', () => {
        expect(isTransitionAllowed('TIMEOUT', 'ROLLED_BACK')).toBe(true);
      });
    });
  });

  describe('requiresActor', () => {
    it('should require actor for CREATED->CANCELLED', () => {
      expect(requiresActor('CREATED', 'CANCELLED')).toBe(true);
    });

    it('should require actor for PENDING_APPROVAL->APPROVED', () => {
      expect(requiresActor('PENDING_APPROVAL', 'APPROVED')).toBe(true);
    });

    it('should require actor for PENDING_APPROVAL->CANCELLED', () => {
      expect(requiresActor('PENDING_APPROVAL', 'CANCELLED')).toBe(true);
    });

    it('should require actor for APPROVED->CANCELLED', () => {
      expect(requiresActor('APPROVED', 'CANCELLED')).toBe(true);
    });

    it('should require actor for BUDGET_RESERVED->CANCELLED', () => {
      expect(requiresActor('BUDGET_RESERVED', 'CANCELLED')).toBe(true);
    });

    it('should NOT require actor for CREATED->PENDING_APPROVAL', () => {
      expect(requiresActor('CREATED', 'PENDING_APPROVAL')).toBe(false);
    });

    it('should NOT require actor for RUNNING->COMPLETED', () => {
      expect(requiresActor('RUNNING', 'COMPLETED')).toBe(false);
    });

    it('should NOT require actor for RUNNING->FAILED', () => {
      expect(requiresActor('RUNNING', 'FAILED')).toBe(false);
    });

    it('should NOT require actor for BUDGET_RESERVED->RUNNING', () => {
      expect(requiresActor('BUDGET_RESERVED', 'RUNNING')).toBe(false);
    });
  });
});
