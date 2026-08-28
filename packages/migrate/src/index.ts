/**
 * `@csa/migrate` — the CSA migration harness.
 *
 * Extract → transform → load → reconcile, with the quarantine set and the
 * dedup record that make the result reviewable. Contract §16 to §19.
 *
 * Synthetic fixtures only. No part of the full migration executes against a CSA
 * system without authorization and access, and a green run over fictional rows
 * is never described as a migration — see the csa-claims skill.
 */
export { RULES, DEDUP_RULES, REFUSED_RULES } from "./rules";
export type { RuleName } from "./rules";
export { normaliseEmail, normalisePhone, parseLegacyDate, parseMoneyToCents } from "./normalise";
export type { Kept, Outcome, Refused, NormalisedPhone } from "./normalise";
export {
  ExtractIntegrityError,
  loadExtract,
  parseCsv,
  readCsv,
  readJsonl,
  readManifest,
  readWxr,
  verifyExtract,
} from "./read";
export type { ExtractManifest, LoadedExtract, ManifestAmounts, ManifestFileEntry } from "./read";
export { SOURCE_STATUS_MAPPING, reconcile, requiredSamples } from "./reconcile";
export type {
  AmountObservation,
  CountObservation,
  FinancialFinding,
  ReconcileInput,
  ReconcileReport,
  ReconcileRow,
  SamplingRequirement,
} from "./reconcile";
export { bucketYear } from "./drafts";
export type {
  DedupDraft,
  EventDraft,
  ImportRecordDraft,
  MembershipDraft,
  PaymentDraft,
  QuarantineDraft,
  RegistrationDraft,
  SourceKey,
  TransformResult,
  UserDraft,
} from "./drafts";
export { transform } from "./transform";
export { mergeCounts, quarantineCounts, targetAmounts, targetCounts } from "./observe";
export { DOMAIN_RULES, buildRedirectMap, unmapped } from "./redirects";
export type { RedirectMap, RedirectRule } from "./redirects";
