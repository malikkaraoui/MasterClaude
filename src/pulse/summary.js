import { isExpired } from './parse.js';

export function computePulseSummary(agents = []) {
  let active = 0;
  let topIntensity = -Infinity;
  let topStatus = 'idle';

  for (const agent of agents) {
    if (!agent || isExpired(agent)) continue;

    active++;

    const intensity = Number(agent.intensity?.current ?? 0);
    if (intensity > topIntensity) {
      topIntensity = intensity;
      topStatus = agent.status ?? 'idle';
    }
  }

  if (active === 0) topStatus = 'idle';

  return {
    active,
    topIntensity: active === 0 ? 0 : topIntensity,
    topStatus,
  };
}