# EVIDENCE — ISO Compliance-Software Category Map (web research, 2026-07-21)

> Produced by architect-directed web research (owner framing: "how many ISO
> softwares can we replace packed in one agentic solution"). Grounds §2/§5
> of `.kiro/specs/ims-experience/architecture.md`. Sourced throughout.
> Notable: **CertifyAero has no indexed search footprint** — it is a concept
> donor, not a market incumbent.

## The 12 categories

### 1. Document control / controlled documents
- **Incumbents:** MasterControl, Qualio, isoTracker, Document Locator, Ideagen Q-Pulse
- **Price:** MasterControl ~$120/user/mo sticker, realistically $25k–$100k+/yr; Qualio ~$8k–$25k/yr
- **Gripes:** Qualio: "atrocious" in-app editor formatting; training module "severely lacking"; can't migrate sandbox→production. MasterControl: pricing "beyond crazy," heavy validation overhead.
- **Agentic replacement:** agent WRITES and version-controls the controlled documents vs a repository storing what a human/consultant wrote.
- Sources: softwareadvice.com/capa/qualio-profile/reviews/ · g2.com/products/qualio/features · openregulatory.com/articles/mastercontrol-pricing · capterra.com/p/148577/MasterControl/pricing/

### 2. Audit management
- **Incumbents:** AuditBoard, SafetyCulture/iAuditor, Ideagen
- **Price:** iAuditor Premium $24–29/seat/mo; AuditBoard from ~$200/user/mo
- **Gripes:** iAuditor: 24-hr permission lag; painful data export; price hikes at scale.
- **Agentic replacement:** agent BUILDS the programme, generates clause checklists, RUNS the audit, writes findings.
- Sources: itqlick.com/compare/iauditor/auditboard · getapp.com/operations-management-software/a/iauditor/reviews · capterra.com/p/141080/iAuditor/pricing/

### 3. NCR / nonconformance + CAPA
- **Incumbents:** ETQ Reliance, QT9 QMS, uniPoint, Intellect
- **Price:** QT9 $120/user/mo; uniPoint $225/user/mo; Intellect ~$19k/yr; ETQ custom
- **Gripes:** QT9 records "daisy-chained," clumsy in audits; uniPoint dated UX.
- **Agentic replacement:** agent triages the NC, drafts root cause + CAPA, links records automatically.
- Sources: selecthub.com/p/quality-management-software/qt9-qms/ · itqlick.com/compare/unipoint/qt9-qms · g2.com/compare/intellect-vs-octave-reliance-etq-reliance

### 4. Risk management / risk registers
- **Incumbents:** LogicManager, Camms GRC — custom enterprise pricing, procurement friction, overkill for an SMB clause-6.1 register.
- **Agentic replacement:** agent populates the register from context and keeps it live.
- Sources: capterra.com/p/176999/LogicManager/ · g2.com/compare/camms-grc-vs-logicmanager

### 5. Incident / near-miss reporting (EHS)
- **Incumbents:** VelocityEHS, Cority, Intelex, EcoOnline, Safesite
- **Price:** Intelex from $49/user/mo; enterprise deployments $100k–$500k+/yr, 9–18-mo rollouts; Safesite $16/member/mo
- **Gripes:** Intelex "not user-friendly" (11 reviews) + UI issues (8); VelocityEHS heavy admin, weak offline, rigid reporting.
- **Agentic replacement:** agent intakes, classifies, drafts investigation + regulatory record.
- Sources: g2.com/compare/intelex-ehsq-vs-velocityehs-ehs-software-to-outpace-risk · ehsreviews.com/intelex-review/ · softwareadvice.com/compliance/velocityehs-profile/ · safesitehq.com/pricing/

### 6. Training / competence tracking
- **Incumbents:** Training Tracker, Cloud Assess, LMS-lites. Gripes: UI updates breaking assessor views; thin review data.
- **Agentic replacement:** competence matrix from roles, auto-assignment on doc change, gap tracking.
- Sources: softwareadvice.com/lms/cloud-assess-profile/ · selecthub.com/p/online-training-software/training-tracker/

### 7. Calibration / equipment management
- **Incumbents:** GageList (free ≤25 gages), GAGEtrak Lite $29/mo / Pro $79/mo (node-locked), Beamex custom. Gripes: dated licensing, fiddly UI.
- **Agentic replacement:** agent schedules calibrations, flags OOT, drafts recall/quarantine actions.
- Sources: softwareconnect.com/reviews/gagetrak/ · g2.com/products/gagetrak-calibration-management-software/reviews · capterra.com/p/124920/GageList/

### 8. Management review / KPI dashboards
- **Incumbents:** BSC Designer, ClearPoint, Ideagen dashboards — mostly done in Excel/Power BI; least-tooled category.
- **Agentic replacement:** agent compiles the 9.3 pack (objectives vs actuals, trends, KPIs) automatically.
- Sources: bscdesigner.com/iso-9001-measurements.htm · ideagen.com/thought-leadership/blog/3-tips-for-choosing-iso-9001-kpi-targets

### 9. Supplier quality / AVL
- **Incumbents:** MasterControl Supplier, Arena, Propel, Ideagen — usually a QMS module; SMBs use spreadsheets.
- **Agentic replacement:** agent qualifies suppliers, maintains live AVL, generates scorecards.
- Sources: arenasolutions.com/resources/glossary/approved-vendor-list/ · guideflow.com/blog/supplier-quality-management-software

### 10. ISO template packs & toolkits ("documents in a box")
- **Incumbents:** Advisera 9001Academy (61 docs), ISO 9001 Store/iso-docs.com, certificationtemplates.com, ISOvA — **$120–$600 one-time**.
- **Gripes:** static; you still tailor, implement, operate; consultant + eQMS bolted on top.
- **Agentic replacement:** MOST directly replaceable — the agent GENERATES the tailored org-specific set.
- Sources: advisera.com/9001academy/iso-9001-documentation-toolkit/ · iso-docs.com/products/iso-9001-bundle · capterra.com/p/216434/ISOvA-IMS/

### 11. All-in-one eQMS suites (closest competitors)
| Suite | Price | Bundles | Top gripes |
|---|---|---|---|
| Effivity | ~$30/user/mo | 9001+14001+45001 QHSE full stack | unintuitive UI; "must contact vendor to make major changes"; no graphs (capterra.com/p/149424/effivity/reviews/) |
| Mango QHSE | from $400/mo | full QHSE | "by far the worst" (one reviewer); can't multi-assign actions; "not suited for med-large/multi-site" (capterra.com/p/127199) |
| Isolocity | $220/admin + $39/user/mo | 50+ standards | manufacturing-skewed, less 14001/45001 depth (softwareadvice.com) |
| QT9 | $120/user/mo | 28+ modules | daisy-chained records (selecthub.com) |
| Conformio (Advisera) | $99–$199/mo | ISO 27001-first | users wish it supported ISO 9001 (g2.com/products/conformio/reviews) |

**Common weakness = the wedge:** all are systems of RECORD — they store what humans/consultants create. None generates the IMS or runs the audit.

### 12. AI / agentic newcomers
| Player | What | Status |
|---|---|---|
| LuMay QMS Compliance Agents | agents for doc control/CAPA/audit — ISO 9001/13485, FDA, GMP | skews life-sciences (lumay.ai) |
| ComplianceQuest CQ.AI | agentic quality/EHS on Salesforce; ISO 42001-certified; 2026 Gartner MQ Leader | enterprise (compliancequest.com/ai/) |
| Fieldguide | AI for audit/advisory FIRMS (auditor side) | not the operator side (fieldguide.io) |
| Interfacing | AI gap-analysis for AS9100/9001 | feature add-on (interfacing.com) |
| CertifyAero | (concept donor) | **no indexed search footprint** |

**The open lane:** generation-native, SMB-priced, tri-standard agent that writes the IMS + runs the audits.

## (a) The count
> **An SMB pursuing tri-standard IMS certification today typically buys ~8–11 separate tools + a consultant.**

| Path | Software/yr | One-time consultant + registrar |
|---|---|---|
| Best-of-breed stack | ~$25k–$60k/yr | consultant $5.7k–$15k + registrar ~$10k–$15k (3 standards) |
| All-in-one eQMS + template pack | ~$5k–$20k/yr | consultant $5.7k–$15k + registrar ~$10k–$15k |

**Bottom line: ~$20,000–$75,000 year one, then $15,000–$60,000/yr recurring**, across up to a dozen vendors + one human consultant.
Sources: thecoresolution.com/iso-9001-certification-cost · blog.pacificcert.com/integrated-iso-9001-14001-45001-ims/ · ehsreviews.com/intelex-review/

## (b) The wedge vs the all-in-ones
1. **They store, they don't generate** — empty-system setup burden keeps the template-pack + consultant market alive.
2. **They don't run the audit or the CAPA** — a human does; the labor line is untouched.
3. **UX + vendor-locked config is their #1 review complaint** — tenant-self-serve config + conversational operation sidesteps it.
4. **Management review (9.3) and EHS field use are under-served even inside suites** — first "agent does the work" showcases.

**One-line thesis:** template packs give dead documents, eQMS suites give empty systems, consultants fill both — an agentic all-in-one collapses "template pack + eQMS operation + consultant" into agents that generate the IMS, run the audits, draft the CAPAs, and assemble management review, replacing ~8–11 tools and most of the consultant line.
