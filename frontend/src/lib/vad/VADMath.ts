import type { VADFrameMetrics } from './VADTypes';

export function computeVADFrameMetrics(samples: Float32Array): VADFrameMetrics {
  if (samples.length === 0) {
    return { rms: 0, zcr: 0 };
  }

  let sumSquares = 0;
  let zeroCrossings = 0;
  let previous = samples[0];

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    sumSquares += sample * sample;

    if (index > 0) {
      const crossedPositive = previous <= 0 && sample > 0;
      const crossedNegative = previous >= 0 && sample < 0;
      if (crossedPositive || crossedNegative) {
        zeroCrossings += 1;
      }
    }

    previous = sample;
  }

  return {
    rms: Math.sqrt(sumSquares / samples.length),
    zcr: zeroCrossings / samples.length,
  };
}
