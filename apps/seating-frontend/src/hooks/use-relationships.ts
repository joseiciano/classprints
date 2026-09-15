import { useMemo } from 'react';
import {
  parseConflictInput,
  parseStrongWorksWellInput,
  parseWorksWellInput,
  summarizeRelationships,
  validateAttendeeName,
  validateRelationshipParticipants,
} from '../lib/arrangement-utils';

type RelationshipInputs = {
  names: string;
  conflictsInput: string;
  worksWellInput: string;
  worksWellStrongInput: string;
};

export function useRelationships({
  names,
  conflictsInput,
  worksWellInput,
  worksWellStrongInput,
}: RelationshipInputs) {
  const attendeeNames = useMemo(
    () =>
      names
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    [names],
  );

  const nameValidationIssues = useMemo(() => {
    const rawNames = names
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    const invalid = rawNames.filter((name) => !validateAttendeeName(name));
    if (invalid.length === 0) return [];
    return invalid.map(
      (name) => `Name "${name}" is invalid. Use only letters, hyphens, and at most one space.`,
    );
  }, [names]);

  const conflictParseResult = useMemo(() => parseConflictInput(conflictsInput), [conflictsInput]);
  const conflictSummary = useMemo(() => {
    const summary = summarizeRelationships(conflictParseResult.conflicts);
    return { peopleWithConflicts: summary.participants, totalConflicts: summary.total };
  }, [conflictParseResult.conflicts]);

  const worksWellParseResult = useMemo(() => parseWorksWellInput(worksWellInput), [worksWellInput]);
  const worksWellStrongParseResult = useMemo(
    () => parseStrongWorksWellInput(worksWellStrongInput),
    [worksWellStrongInput],
  );
  const worksWellSummary = useMemo(() => {
    const summary = summarizeRelationships(worksWellParseResult.worksWellWith);
    return { peopleWithPartners: summary.participants, totalPartners: summary.total };
  }, [worksWellParseResult.worksWellWith]);
  const worksWellStrongSummary = useMemo(() => {
    const summary = summarizeRelationships(worksWellStrongParseResult.worksWellWith);
    return { peopleWithPartners: summary.participants, totalPartners: summary.total };
  }, [worksWellStrongParseResult.worksWellWith]);

  const conflictParticipantIssues = useMemo(() => {
    return validateRelationshipParticipants(conflictParseResult.conflicts, attendeeNames, {
      subject: 'Conflict entry',
      value: 'Conflict',
    });
  }, [attendeeNames, conflictParseResult.conflicts]);

  const worksWellParticipantIssues = useMemo(() => {
    return validateRelationshipParticipants(worksWellParseResult.worksWellWith, attendeeNames, {
      subject: 'Works-well entry',
      value: 'Partner',
    });
  }, [attendeeNames, worksWellParseResult.worksWellWith]);
  const worksWellStrongParticipantIssues = useMemo(() => {
    return validateRelationshipParticipants(
      worksWellStrongParseResult.worksWellWith,
      attendeeNames,
      {
        subject: 'Strong works-well entry',
        value: 'Partner',
      },
    );
  }, [attendeeNames, worksWellStrongParseResult.worksWellWith]);

  return {
    attendeeNames,
    nameValidationIssues,
    conflictParseResult,
    conflictSummary,
    worksWellParseResult,
    worksWellSummary,
    worksWellStrongParseResult,
    worksWellStrongSummary,
    conflictParticipantIssues,
    worksWellParticipantIssues,
    worksWellStrongParticipantIssues,
  };
}
