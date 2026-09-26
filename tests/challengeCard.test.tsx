// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHALLENGES } from '../src/challenges/challenges';
import type { ChallengeResult } from '../src/challenges/challenges';
import { ChallengeCard } from '../src/ui/ChallengeCard';

afterEach(cleanup);

const challenge = CHALLENGES[0]!;
const evaluation = (met: boolean): ChallengeResult => ({
  challenge,
  met,
  goals: [
    { goal: challenge.goals[0]!, met: true, asks: 'Carbon at least 50% below today', now: '70% below' },
    { goal: challenge.goals[1]!, met, asks: 'No more than 50 hours to backup', now: met ? '10 hours' : '144 hours' },
  ],
});

describe('ChallengeCard', () => {
  it('lists every challenge and the sandbox', () => {
    render(<ChallengeCard challengeId={null} evaluation={null} running={false} onChange={() => {}} onAward={() => {}} />);
    const select = screen.getByLabelText('Play') as HTMLSelectElement;
    expect(select.options).toHaveLength(CHALLENGES.length + 1);
    expect(select.value).toBe('');
  });

  it('marks each goal in words as well as a symbol', () => {
    const { container } = render(<ChallengeCard challengeId={challenge.id} evaluation={evaluation(false)} running={false} onChange={() => {}} onAward={() => {}} />);
    expect(container.textContent).toContain('— met');
    expect(container.textContent).toContain('— not yet met');
    expect(screen.queryByRole('button', { name: 'Get your award' })).toBeNull();
  });

  it('offers the award only when every goal is met', () => {
    const onAward = vi.fn();
    render(<ChallengeCard challengeId={challenge.id} evaluation={evaluation(true)} running={false} onChange={() => {}} onAward={onAward} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get your award' }));
    expect(onAward).toHaveBeenCalled();
  });
});
