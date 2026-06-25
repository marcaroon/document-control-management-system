/**
 * ISO 9001:2015 clause structure, seeded per-org per the §3 resolution
 * ("ISO clauses: template vs per-org copy" -> "seed a copy per org").
 *
 * Scope: clauses 4 through 10 — the seven main "requirements" clauses
 * that QMS documentation actually maps to. Clauses 1-3 (Scope, Normative
 * References, Terms & Definitions) are front matter, not requirements
 * with sub-clauses that documents get tagged against, so they're
 * intentionally excluded from the seed. Add them manually if a specific
 * org wants them tracked too — this list is a starting point, not a
 * locked taxonomy (consistent with §3's own framing of "annotate/
 * customize... without risk of leaking into another org's view").
 *
 * Sub-clauses included here are the ones most commonly referenced when
 * mapping QMS documents (procedures, work instructions, records) to
 * clauses. This is not the complete official sub-clause list for every
 * branch — deeper sub-clauses (e.g. 8.5.1 through 8.5.6) can be added by
 * a Document Controller or Super Admin via the ISO Clauses page once
 * seeded; the seed is meant to get an org started, not to be exhaustive.
 */

export interface ClauseSeed {
  clauseNumber: string;
  title: string;
  description?: string;
  objective?: string;
  children?: ClauseSeed[];
}

export const ISO_9001_2015_SEED: ClauseSeed[] = [
  {
    clauseNumber: "4",
    title: "Context of the Organization",
    objective:
      "Understand the organization and its context, and the needs and expectations of interested parties, to determine the scope of the QMS.",
    children: [
      { clauseNumber: "4.1", title: "Understanding the organization and its context" },
      { clauseNumber: "4.2", title: "Understanding the needs and expectations of interested parties" },
      { clauseNumber: "4.3", title: "Determining the scope of the quality management system" },
      { clauseNumber: "4.4", title: "Quality management system and its processes" },
    ],
  },
  {
    clauseNumber: "5",
    title: "Leadership",
    objective:
      "Top management demonstrates leadership and commitment to the QMS, establishes the quality policy, and assigns roles/responsibilities.",
    children: [
      { clauseNumber: "5.1", title: "Leadership and commitment" },
      { clauseNumber: "5.2", title: "Policy" },
      { clauseNumber: "5.3", title: "Organizational roles, responsibilities and authorities" },
    ],
  },
  {
    clauseNumber: "6",
    title: "Planning",
    objective:
      "Plan actions to address risks and opportunities, establish quality objectives, and plan changes to the QMS.",
    children: [
      { clauseNumber: "6.1", title: "Actions to address risks and opportunities" },
      { clauseNumber: "6.2", title: "Quality objectives and planning to achieve them" },
      { clauseNumber: "6.3", title: "Planning of changes" },
    ],
  },
  {
    clauseNumber: "7",
    title: "Support",
    objective:
      "Determine and provide the resources (people, infrastructure, environment, monitoring, knowledge) needed for the QMS, and manage competence, awareness, communication, and documented information.",
    children: [
      { clauseNumber: "7.1", title: "Resources" },
      { clauseNumber: "7.2", title: "Competence" },
      { clauseNumber: "7.3", title: "Awareness" },
      { clauseNumber: "7.4", title: "Communication" },
      { clauseNumber: "7.5", title: "Documented information" },
    ],
  },
  {
    clauseNumber: "8",
    title: "Operation",
    objective:
      "Plan and control the processes needed to meet requirements for the provision of products and services, from design through delivery and post-delivery.",
    children: [
      { clauseNumber: "8.1", title: "Operational planning and control" },
      { clauseNumber: "8.2", title: "Requirements for products and services" },
      { clauseNumber: "8.3", title: "Design and development of products and services" },
      { clauseNumber: "8.4", title: "Control of externally provided processes, products and services" },
      { clauseNumber: "8.5", title: "Production and service provision" },
      { clauseNumber: "8.6", title: "Release of products and services" },
      { clauseNumber: "8.7", title: "Control of nonconforming outputs" },
    ],
  },
  {
    clauseNumber: "9",
    title: "Performance Evaluation",
    objective:
      "Monitor, measure, analyze, and evaluate QMS performance, including customer satisfaction, internal audit, and management review.",
    children: [
      { clauseNumber: "9.1", title: "Monitoring, measurement, analysis and evaluation" },
      { clauseNumber: "9.2", title: "Internal audit" },
      { clauseNumber: "9.3", title: "Management review" },
    ],
  },
  {
    clauseNumber: "10",
    title: "Improvement",
    objective:
      "Determine and select opportunities for improvement, address nonconformities through corrective action, and continually improve the QMS.",
    children: [
      { clauseNumber: "10.1", title: "General" },
      { clauseNumber: "10.2", title: "Nonconformity and corrective action" },
      { clauseNumber: "10.3", title: "Continual improvement" },
    ],
  },
];
