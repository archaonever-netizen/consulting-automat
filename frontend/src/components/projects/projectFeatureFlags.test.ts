import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HYPOTHESES_WORKBENCH,
  isFeatureEnabled,
  isHypothesesWorkbenchEnabled,
  setFeatureFlagOverride,
} from './projectFeatureFlags';

describe('projectFeatureFlags', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('выключен по умолчанию (без переопределения и без env)', () => {
    expect(isHypothesesWorkbenchEnabled()).toBe(false);
    expect(isFeatureEnabled(HYPOTHESES_WORKBENCH)).toBe(false);
  });

  it('включается локальным переопределением', () => {
    setFeatureFlagOverride(HYPOTHESES_WORKBENCH, true);
    expect(isHypothesesWorkbenchEnabled()).toBe(true);
  });

  it('снятие переопределения возвращает к значению по умолчанию (выключено)', () => {
    setFeatureFlagOverride(HYPOTHESES_WORKBENCH, true);
    setFeatureFlagOverride(HYPOTHESES_WORKBENCH, null);
    expect(isHypothesesWorkbenchEnabled()).toBe(false);
  });

  it('понимает разные истинные/ложные написания', () => {
    for (const truthy of ['on', '1', 'true', 'yes']) {
      window.localStorage.setItem('project_feature_flag:hypotheses_workbench', truthy);
      expect(isHypothesesWorkbenchEnabled()).toBe(true);
    }
    for (const falsy of ['off', '0', 'false', 'no']) {
      window.localStorage.setItem('project_feature_flag:hypotheses_workbench', falsy);
      expect(isHypothesesWorkbenchEnabled()).toBe(false);
    }
  });
});
