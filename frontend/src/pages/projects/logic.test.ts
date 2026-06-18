import { describe, expect, it } from 'vitest';
import { buildProjectPayload, emptyProjectForm } from './logic';

describe('buildProjectPayload', () => {
  it('requires a name and client', () => {
    expect(buildProjectPayload({ ...emptyProjectForm(), client_id: '1' })).toBeNull();
    expect(buildProjectPayload({ ...emptyProjectForm(), name: 'Audit' })).toBeNull();
  });

  it('trims fields and preserves the client link', () => {
    expect(buildProjectPayload({
      name: '  Operating model  ',
      client_id: '7',
      description: '  Redesign core processes  ',
    })).toEqual({
      name: 'Operating model',
      client_id: 7,
      description: 'Redesign core processes',
    });
  });

  it('sends empty description as null', () => {
    expect(buildProjectPayload({
      name: 'Strategy',
      client_id: '3',
      description: '  ',
    })?.description).toBeNull();
  });
});
