-- Migration 013: QMS Forms template catalog seed (spec 41, design §6)
-- BC-1: templates are DATA rows. Counts are queries over these rows, never hardcoded.
-- BC-3: NCR carries standard/source/nc_type/clause_ref/severity as REQUIRED mapped fields.
-- BC-7: all label_key/title_key values are i18n catalog keys (forms.* namespace).
--
-- 15 wave-1 templates per design §6 (TPL-4).
-- UUIDs are deterministic for testability and idempotent re-application.

-- ============================================================
-- TEMPLATES
-- ============================================================

INSERT INTO forms.templates (id, key, title_key, description_key, category, clause_refs, standards, maps_to, requires_approval, sort_order) VALUES
  ('a0000001-0000-4000-8000-000000000001', 'ncr', 'forms.tpl.ncr.title', 'forms.tpl.ncr.desc', 'corrective', ARRAY['8.7','10.2'], ARRAY['ISO9001','ISO14001','ISO45001','IMS'], 'm2_ncr', true, 1),
  ('a0000001-0000-4000-8000-000000000002', 'management_review', 'forms.tpl.mgmtReview.title', 'forms.tpl.mgmtReview.desc', 'leadership', ARRAY['9.3'], ARRAY['ISO9001','ISO14001','ISO45001','IMS'], NULL, true, 2),
  ('a0000001-0000-4000-8000-000000000003', 'risk_opportunity', 'forms.tpl.riskOpp.title', 'forms.tpl.riskOpp.desc', 'planning', ARRAY['6.1'], ARRAY['ISO9001','ISO14001','ISO45001','IMS'], NULL, false, 3),
  ('a0000001-0000-4000-8000-000000000004', 'aspects_impacts', 'forms.tpl.aspects.title', 'forms.tpl.aspects.desc', 'environmental', ARRAY['6.1.2'], ARRAY['ISO14001','IMS'], NULL, false, 4),
  ('a0000001-0000-4000-8000-000000000005', 'legal_obligations', 'forms.tpl.legalObl.title', 'forms.tpl.legalObl.desc', 'compliance', ARRAY['6.1.3'], ARRAY['ISO14001','ISO45001','IMS'], NULL, false, 5),
  ('a0000001-0000-4000-8000-000000000006', 'hira', 'forms.tpl.hira.title', 'forms.tpl.hira.desc', 'ohs', ARRAY['6.1.2'], ARRAY['ISO45001','IMS'], NULL, false, 6),
  ('a0000001-0000-4000-8000-000000000007', 'incident_investigation', 'forms.tpl.incident.title', 'forms.tpl.incident.desc', 'ohs', ARRAY['10.2'], ARRAY['ISO45001','IMS'], NULL, true, 7),
  ('a0000001-0000-4000-8000-000000000008', 'emergency_preparedness', 'forms.tpl.emergency.title', 'forms.tpl.emergency.desc', 'ohs', ARRAY['8.2'], ARRAY['ISO14001','ISO45001','IMS'], NULL, false, 8),
  ('a0000001-0000-4000-8000-000000000009', 'worker_consultation', 'forms.tpl.workerConsult.title', 'forms.tpl.workerConsult.desc', 'ohs', ARRAY['5.4'], ARRAY['ISO45001','IMS'], NULL, false, 9),
  ('a0000001-0000-4000-8000-000000000010', 'competence_training', 'forms.tpl.competence.title', 'forms.tpl.competence.desc', 'support', ARRAY['7.2'], ARRAY['ISO9001','ISO14001','ISO45001','IMS'], NULL, false, 10),
  ('a0000001-0000-4000-8000-000000000011', 'supplier_evaluation', 'forms.tpl.supplier.title', 'forms.tpl.supplier.desc', 'operation', ARRAY['8.4.1'], ARRAY['ISO9001','IMS'], NULL, false, 11),
  ('a0000001-0000-4000-8000-000000000012', 'calibration_log', 'forms.tpl.calibration.title', 'forms.tpl.calibration.desc', 'operation', ARRAY['7.1.5'], ARRAY['ISO9001','IMS'], NULL, false, 12),
  ('a0000001-0000-4000-8000-000000000013', 'document_change_request', 'forms.tpl.docChange.title', 'forms.tpl.docChange.desc', 'support', ARRAY['7.5'], ARRAY['ISO9001','ISO14001','ISO45001','IMS'], NULL, true, 13),
  ('a0000001-0000-4000-8000-000000000014', 'objectives_plan', 'forms.tpl.objectives.title', 'forms.tpl.objectives.desc', 'planning', ARRAY['6.2'], ARRAY['ISO9001','ISO14001','ISO45001','IMS'], NULL, false, 14),
  ('a0000001-0000-4000-8000-000000000015', 'interested_parties', 'forms.tpl.intParties.title', 'forms.tpl.intParties.desc', 'context', ARRAY['4.2'], ARRAY['ISO9001','ISO14001','ISO45001','IMS'], NULL, false, 15)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- NCR TEMPLATE — SECTIONS (6 sections, competitor-parity spine + BC-3)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000001-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000001', 'ncr_info', 'forms.ncr.sec.info', 1),
  ('b0000001-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000001', 'nc_description', 'forms.ncr.sec.description', 2),
  ('b0000001-0001-4000-8000-000000000003', 'a0000001-0000-4000-8000-000000000001', 'containment', 'forms.ncr.sec.containment', 3),
  ('b0000001-0001-4000-8000-000000000004', 'a0000001-0000-4000-8000-000000000001', 'disposition', 'forms.ncr.sec.disposition', 4),
  ('b0000001-0001-4000-8000-000000000005', 'a0000001-0000-4000-8000-000000000001', 'root_cause', 'forms.ncr.sec.rootCause', 5),
  ('b0000001-0001-4000-8000-000000000006', 'a0000001-0000-4000-8000-000000000001', 'closure', 'forms.ncr.sec.closure', 6)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- NCR TEMPLATE — FIELDS (≥30 fields; TPL-5 + BC-3 mapped fields)
-- BC-3: standard, source, nc_type, clause_ref, severity are REQUIRED + maps_to_column set.
-- ============================================================

-- Section 1: NCR Information (10 fields)
INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000001-0001-4000-8000-000000000001', 'b0000001-0001-4000-8000-000000000001', 'ncr_number', 'forms.ncr.field.ncrNumber', 'text', true, NULL, NULL, NULL, 1),
  ('c0000001-0001-4000-8000-000000000002', 'b0000001-0001-4000-8000-000000000001', 'date_raised', 'forms.ncr.field.dateRaised', 'date', true, NULL, NULL, NULL, 2),
  ('c0000001-0001-4000-8000-000000000003', 'b0000001-0001-4000-8000-000000000001', 'raised_by', 'forms.ncr.field.raisedBy', 'user', true, NULL, NULL, 'raised_by', 3),
  ('c0000001-0001-4000-8000-000000000004', 'b0000001-0001-4000-8000-000000000001', 'standard', 'forms.ncr.field.standard', 'select', true, '["ISO9001","ISO14001","ISO45001"]', NULL, 'standard', 4),
  ('c0000001-0001-4000-8000-000000000005', 'b0000001-0001-4000-8000-000000000001', 'source', 'forms.ncr.field.source', 'select', true, '["audit","incident","complaint","process"]', NULL, 'source', 5),
  ('c0000001-0001-4000-8000-000000000006', 'b0000001-0001-4000-8000-000000000001', 'nc_type', 'forms.ncr.field.ncType', 'select', true, '["nonconforming_output","nc","incident"]', NULL, 'nc_type', 6),
  ('c0000001-0001-4000-8000-000000000007', 'b0000001-0001-4000-8000-000000000001', 'clause_ref', 'forms.ncr.field.clauseRef', 'relation', true, NULL, 'clause', 'clause_ref', 7),
  ('c0000001-0001-4000-8000-000000000008', 'b0000001-0001-4000-8000-000000000001', 'severity', 'forms.ncr.field.severity', 'select', true, '["low","medium","high","critical"]', NULL, 'severity', 8),
  ('c0000001-0001-4000-8000-000000000009', 'b0000001-0001-4000-8000-000000000001', 'department', 'forms.ncr.field.department', 'text', false, NULL, NULL, NULL, 9),
  ('c0000001-0001-4000-8000-000000000010', 'b0000001-0001-4000-8000-000000000001', 'product_service', 'forms.ncr.field.productService', 'text', false, NULL, NULL, NULL, 10)
ON CONFLICT (id) DO NOTHING;

-- Section 2: Nonconformity Description (6 fields)
INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000001-0001-4000-8000-000000000011', 'b0000001-0001-4000-8000-000000000002', 'nc_description', 'forms.ncr.field.ncDescription', 'textarea', true, NULL, NULL, 'description', 1),
  ('c0000001-0001-4000-8000-000000000012', 'b0000001-0001-4000-8000-000000000002', 'where_discovered', 'forms.ncr.field.whereDiscovered', 'select', true, '["incoming","in_process","final","customer_return","field"]', NULL, NULL, 2),
  ('c0000001-0001-4000-8000-000000000013', 'b0000001-0001-4000-8000-000000000002', 'quantity_affected', 'forms.ncr.field.quantityAffected', 'number', false, NULL, NULL, NULL, 3),
  ('c0000001-0001-4000-8000-000000000014', 'b0000001-0001-4000-8000-000000000002', 'lot_serial', 'forms.ncr.field.lotSerial', 'text', false, NULL, NULL, NULL, 4),
  ('c0000001-0001-4000-8000-000000000015', 'b0000001-0001-4000-8000-000000000002', 'evidence_ref', 'forms.ncr.field.evidenceRef', 'text', false, NULL, NULL, NULL, 5),
  ('c0000001-0001-4000-8000-000000000016', 'b0000001-0001-4000-8000-000000000002', 'related_document', 'forms.ncr.field.relatedDocument', 'relation', false, NULL, 'document', NULL, 6)
ON CONFLICT (id) DO NOTHING;

-- Section 3: Containment (5 fields)
INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000001-0001-4000-8000-000000000017', 'b0000001-0001-4000-8000-000000000003', 'containment_required', 'forms.ncr.field.containmentRequired', 'radio', true, '["yes","no"]', NULL, NULL, 1),
  ('c0000001-0001-4000-8000-000000000018', 'b0000001-0001-4000-8000-000000000003', 'containment_action', 'forms.ncr.field.containmentAction', 'textarea', false, NULL, NULL, NULL, 2),
  ('c0000001-0001-4000-8000-000000000019', 'b0000001-0001-4000-8000-000000000003', 'containment_owner', 'forms.ncr.field.containmentOwner', 'user', false, NULL, NULL, NULL, 3),
  ('c0000001-0001-4000-8000-000000000020', 'b0000001-0001-4000-8000-000000000003', 'containment_date', 'forms.ncr.field.containmentDate', 'date', false, NULL, NULL, NULL, 4),
  ('c0000001-0001-4000-8000-000000000021', 'b0000001-0001-4000-8000-000000000003', 'containment_flag', 'forms.ncr.field.containmentFlag', 'checkbox', false, NULL, NULL, 'containment_flag', 5)
ON CONFLICT (id) DO NOTHING;

-- Section 4: Disposition (5 fields — SELECT, not text boxes; design §2 typed advantage)
-- disposition_decision is NOT mapped to m2. If ever mapped to m2.nonconforming_outputs.disposition,
-- reconcile values with its CHECK (rework/scrap/concession/regrade).
INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000001-0001-4000-8000-000000000022', 'b0000001-0001-4000-8000-000000000004', 'disposition_decision', 'forms.ncr.field.dispositionDecision', 'select', true, '["use_as_is","rework","repair","scrap","return"]', NULL, NULL, 1),
  ('c0000001-0001-4000-8000-000000000023', 'b0000001-0001-4000-8000-000000000004', 'disposition_authority', 'forms.ncr.field.dispositionAuthority', 'user', true, NULL, NULL, NULL, 2),
  ('c0000001-0001-4000-8000-000000000024', 'b0000001-0001-4000-8000-000000000004', 'disposition_justification', 'forms.ncr.field.dispositionJustification', 'textarea', false, NULL, NULL, NULL, 3),
  ('c0000001-0001-4000-8000-000000000025', 'b0000001-0001-4000-8000-000000000004', 'customer_notification', 'forms.ncr.field.customerNotification', 'radio', false, '["yes","no","na"]', NULL, NULL, 4),
  ('c0000001-0001-4000-8000-000000000026', 'b0000001-0001-4000-8000-000000000004', 'concession_ref', 'forms.ncr.field.concessionRef', 'text', false, NULL, NULL, NULL, 5)
ON CONFLICT (id) DO NOTHING;

-- Section 5: Root Cause (5 fields)
INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000001-0001-4000-8000-000000000027', 'b0000001-0001-4000-8000-000000000005', 'rca_method', 'forms.ncr.field.rcaMethod', 'select', false, '["5why","fishbone","fta","other"]', NULL, NULL, 1),
  ('c0000001-0001-4000-8000-000000000028', 'b0000001-0001-4000-8000-000000000005', 'root_cause_desc', 'forms.ncr.field.rootCauseDesc', 'textarea', false, NULL, NULL, NULL, 2),
  ('c0000001-0001-4000-8000-000000000029', 'b0000001-0001-4000-8000-000000000005', 'corrective_action_desc', 'forms.ncr.field.correctiveActionDesc', 'textarea', true, NULL, NULL, 'action_desc', 3),
  ('c0000001-0001-4000-8000-000000000030', 'b0000001-0001-4000-8000-000000000005', 'ca_owner', 'forms.ncr.field.caOwner', 'user', true, NULL, NULL, 'owner_id', 4),
  ('c0000001-0001-4000-8000-000000000031', 'b0000001-0001-4000-8000-000000000005', 'ca_due_date', 'forms.ncr.field.caDueDate', 'date', true, NULL, NULL, 'due_date', 5)
ON CONFLICT (id) DO NOTHING;

-- Section 6: Closure (4 fields) — total: 35 fields (exceeds competitor's 30; TPL-5 ✓)
INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000001-0001-4000-8000-000000000032', 'b0000001-0001-4000-8000-000000000006', 'verification_method', 'forms.ncr.field.verificationMethod', 'select', false, '["inspection","test","audit","review"]', NULL, NULL, 1),
  ('c0000001-0001-4000-8000-000000000033', 'b0000001-0001-4000-8000-000000000006', 'effectiveness_verified', 'forms.ncr.field.effectivenessVerified', 'radio', false, '["yes","no"]', NULL, NULL, 2),
  ('c0000001-0001-4000-8000-000000000034', 'b0000001-0001-4000-8000-000000000006', 'closure_notes', 'forms.ncr.field.closureNotes', 'textarea', false, NULL, NULL, NULL, 3),
  ('c0000001-0001-4000-8000-000000000035', 'b0000001-0001-4000-8000-000000000006', 'linked_capa', 'forms.ncr.field.linkedCapa', 'relation', false, NULL, 'corrective_action', NULL, 4)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MANAGEMENT REVIEW MINUTES — SECTIONS + FIELDS (9.3.2 inputs / 9.3.3 outputs)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000002-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000002', 'review_info', 'forms.mgmtReview.sec.info', 1),
  ('b0000002-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000002', 'inputs_932', 'forms.mgmtReview.sec.inputs', 2),
  ('b0000002-0001-4000-8000-000000000003', 'a0000001-0000-4000-8000-000000000002', 'outputs_933', 'forms.mgmtReview.sec.outputs', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  -- Review Info (5 fields)
  ('c0000002-0001-4000-8000-000000000001', 'b0000002-0001-4000-8000-000000000001', 'review_date', 'forms.mgmtReview.field.reviewDate', 'date', true, NULL, NULL, NULL, 1),
  ('c0000002-0001-4000-8000-000000000002', 'b0000002-0001-4000-8000-000000000001', 'chairperson', 'forms.mgmtReview.field.chairperson', 'user', true, NULL, NULL, NULL, 2),
  ('c0000002-0001-4000-8000-000000000003', 'b0000002-0001-4000-8000-000000000001', 'attendees', 'forms.mgmtReview.field.attendees', 'textarea', true, NULL, NULL, NULL, 3),
  ('c0000002-0001-4000-8000-000000000004', 'b0000002-0001-4000-8000-000000000001', 'standards_reviewed', 'forms.mgmtReview.field.standardsReviewed', 'multiselect', true, '["ISO9001","ISO14001","ISO45001"]', NULL, NULL, 4),
  ('c0000002-0001-4000-8000-000000000005', 'b0000002-0001-4000-8000-000000000001', 'previous_actions_status', 'forms.mgmtReview.field.prevActionsStatus', 'textarea', false, NULL, NULL, NULL, 5),
  -- 9.3.2 Inputs (9 fields — all mandatory inputs per the standard)
  ('c0000002-0001-4000-8000-000000000006', 'b0000002-0001-4000-8000-000000000002', 'customer_feedback', 'forms.mgmtReview.field.customerFeedback', 'textarea', true, NULL, NULL, NULL, 1),
  ('c0000002-0001-4000-8000-000000000007', 'b0000002-0001-4000-8000-000000000002', 'objectives_progress', 'forms.mgmtReview.field.objectivesProgress', 'textarea', true, NULL, NULL, NULL, 2),
  ('c0000002-0001-4000-8000-000000000008', 'b0000002-0001-4000-8000-000000000002', 'process_performance', 'forms.mgmtReview.field.processPerformance', 'textarea', true, NULL, NULL, NULL, 3),
  ('c0000002-0001-4000-8000-000000000009', 'b0000002-0001-4000-8000-000000000002', 'nc_capa_status', 'forms.mgmtReview.field.ncCapaStatus', 'textarea', true, NULL, NULL, NULL, 4),
  ('c0000002-0001-4000-8000-000000000010', 'b0000002-0001-4000-8000-000000000002', 'audit_results', 'forms.mgmtReview.field.auditResults', 'textarea', true, NULL, NULL, NULL, 5),
  ('c0000002-0001-4000-8000-000000000011', 'b0000002-0001-4000-8000-000000000002', 'external_provider_perf', 'forms.mgmtReview.field.extProviderPerf', 'textarea', false, NULL, NULL, NULL, 6),
  ('c0000002-0001-4000-8000-000000000012', 'b0000002-0001-4000-8000-000000000002', 'resource_adequacy', 'forms.mgmtReview.field.resourceAdequacy', 'textarea', true, NULL, NULL, NULL, 7),
  ('c0000002-0001-4000-8000-000000000013', 'b0000002-0001-4000-8000-000000000002', 'risk_opportunity_changes', 'forms.mgmtReview.field.riskOppChanges', 'textarea', true, NULL, NULL, NULL, 8),
  ('c0000002-0001-4000-8000-000000000014', 'b0000002-0001-4000-8000-000000000002', 'improvement_opportunities', 'forms.mgmtReview.field.improvementOpps', 'textarea', true, NULL, NULL, NULL, 9),
  -- 9.3.3 Outputs (5 fields)
  ('c0000002-0001-4000-8000-000000000015', 'b0000002-0001-4000-8000-000000000003', 'decisions_actions', 'forms.mgmtReview.field.decisionsActions', 'textarea', true, NULL, NULL, NULL, 1),
  ('c0000002-0001-4000-8000-000000000016', 'b0000002-0001-4000-8000-000000000003', 'resource_needs', 'forms.mgmtReview.field.resourceNeeds', 'textarea', false, NULL, NULL, NULL, 2),
  ('c0000002-0001-4000-8000-000000000017', 'b0000002-0001-4000-8000-000000000003', 'improvement_actions', 'forms.mgmtReview.field.improvementActions', 'textarea', true, NULL, NULL, NULL, 3),
  ('c0000002-0001-4000-8000-000000000018', 'b0000002-0001-4000-8000-000000000003', 'next_review_date', 'forms.mgmtReview.field.nextReviewDate', 'date', true, NULL, NULL, NULL, 4),
  ('c0000002-0001-4000-8000-000000000019', 'b0000002-0001-4000-8000-000000000003', 'action_owners', 'forms.mgmtReview.field.actionOwners', 'textarea', false, NULL, NULL, NULL, 5)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RISK & OPPORTUNITY REGISTER (6.1)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000003-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000003', 'risk_info', 'forms.riskOpp.sec.info', 1),
  ('b0000003-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000003', 'assessment', 'forms.riskOpp.sec.assessment', 2),
  ('b0000003-0001-4000-8000-000000000003', 'a0000001-0000-4000-8000-000000000003', 'treatment', 'forms.riskOpp.sec.treatment', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000003-0001-4000-8000-000000000001', 'b0000003-0001-4000-8000-000000000001', 'risk_title', 'forms.riskOpp.field.title', 'text', true, NULL, NULL, NULL, 1),
  ('c0000003-0001-4000-8000-000000000002', 'b0000003-0001-4000-8000-000000000001', 'risk_category', 'forms.riskOpp.field.category', 'select', true, '["quality","environmental","ohs","opportunity"]', NULL, NULL, 2),
  ('c0000003-0001-4000-8000-000000000003', 'b0000003-0001-4000-8000-000000000001', 'risk_standard', 'forms.riskOpp.field.standard', 'select', true, '["ISO9001","ISO14001","ISO45001"]', NULL, NULL, 3),
  ('c0000003-0001-4000-8000-000000000004', 'b0000003-0001-4000-8000-000000000001', 'risk_description', 'forms.riskOpp.field.description', 'textarea', true, NULL, NULL, NULL, 4),
  ('c0000003-0001-4000-8000-000000000005', 'b0000003-0001-4000-8000-000000000001', 'risk_owner', 'forms.riskOpp.field.owner', 'user', true, NULL, NULL, NULL, 5),
  ('c0000003-0001-4000-8000-000000000006', 'b0000003-0001-4000-8000-000000000002', 'likelihood', 'forms.riskOpp.field.likelihood', 'number', true, NULL, NULL, NULL, 1),
  ('c0000003-0001-4000-8000-000000000007', 'b0000003-0001-4000-8000-000000000002', 'severity', 'forms.riskOpp.field.severity', 'number', true, NULL, NULL, NULL, 2),
  ('c0000003-0001-4000-8000-000000000008', 'b0000003-0001-4000-8000-000000000002', 'risk_rating', 'forms.riskOpp.field.rating', 'number', false, NULL, NULL, NULL, 3),
  ('c0000003-0001-4000-8000-000000000009', 'b0000003-0001-4000-8000-000000000002', 'existing_controls', 'forms.riskOpp.field.existingControls', 'textarea', false, NULL, NULL, NULL, 4),
  ('c0000003-0001-4000-8000-000000000010', 'b0000003-0001-4000-8000-000000000003', 'treatment_plan', 'forms.riskOpp.field.treatmentPlan', 'textarea', false, NULL, NULL, NULL, 1),
  ('c0000003-0001-4000-8000-000000000011', 'b0000003-0001-4000-8000-000000000003', 'treatment_owner', 'forms.riskOpp.field.treatmentOwner', 'user', false, NULL, NULL, NULL, 2),
  ('c0000003-0001-4000-8000-000000000012', 'b0000003-0001-4000-8000-000000000003', 'treatment_due', 'forms.riskOpp.field.treatmentDue', 'date', false, NULL, NULL, NULL, 3),
  ('c0000003-0001-4000-8000-000000000013', 'b0000003-0001-4000-8000-000000000003', 'linked_risk', 'forms.riskOpp.field.linkedRisk', 'relation', false, NULL, 'risk', NULL, 4)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ENVIRONMENTAL ASPECTS & IMPACTS (14001; 6.1.2)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000004-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000004', 'aspect_id', 'forms.aspects.sec.identification', 1),
  ('b0000004-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000004', 'impact_eval', 'forms.aspects.sec.evaluation', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000004-0001-4000-8000-000000000001', 'b0000004-0001-4000-8000-000000000001', 'activity', 'forms.aspects.field.activity', 'text', true, NULL, NULL, NULL, 1),
  ('c0000004-0001-4000-8000-000000000002', 'b0000004-0001-4000-8000-000000000001', 'aspect_desc', 'forms.aspects.field.aspectDesc', 'textarea', true, NULL, NULL, NULL, 2),
  ('c0000004-0001-4000-8000-000000000003', 'b0000004-0001-4000-8000-000000000001', 'impact_desc', 'forms.aspects.field.impactDesc', 'textarea', true, NULL, NULL, NULL, 3),
  ('c0000004-0001-4000-8000-000000000004', 'b0000004-0001-4000-8000-000000000001', 'condition', 'forms.aspects.field.condition', 'select', true, '["normal","abnormal","emergency"]', NULL, NULL, 4),
  ('c0000004-0001-4000-8000-000000000005', 'b0000004-0001-4000-8000-000000000001', 'lifecycle_stage', 'forms.aspects.field.lifecycleStage', 'select', false, '["raw_material","production","use","disposal"]', NULL, NULL, 5),
  ('c0000004-0001-4000-8000-000000000006', 'b0000004-0001-4000-8000-000000000002', 'significance_rating', 'forms.aspects.field.significanceRating', 'number', true, NULL, NULL, NULL, 1),
  ('c0000004-0001-4000-8000-000000000007', 'b0000004-0001-4000-8000-000000000002', 'is_significant', 'forms.aspects.field.isSignificant', 'radio', true, '["yes","no"]', NULL, NULL, 2),
  ('c0000004-0001-4000-8000-000000000008', 'b0000004-0001-4000-8000-000000000002', 'control_measures', 'forms.aspects.field.controlMeasures', 'textarea', false, NULL, NULL, NULL, 3),
  ('c0000004-0001-4000-8000-000000000009', 'b0000004-0001-4000-8000-000000000002', 'legal_requirement', 'forms.aspects.field.legalRequirement', 'text', false, NULL, NULL, NULL, 4)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- LEGAL & COMPLIANCE OBLIGATIONS (14001/45001; 6.1.3)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000005-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000005', 'obligation_info', 'forms.legalObl.sec.info', 1),
  ('b0000005-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000005', 'compliance_eval', 'forms.legalObl.sec.evaluation', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000005-0001-4000-8000-000000000001', 'b0000005-0001-4000-8000-000000000001', 'obligation_title', 'forms.legalObl.field.title', 'text', true, NULL, NULL, NULL, 1),
  ('c0000005-0001-4000-8000-000000000002', 'b0000005-0001-4000-8000-000000000001', 'obligation_type', 'forms.legalObl.field.type', 'select', true, '["legal","regulatory","contractual","voluntary","other"]', NULL, NULL, 2),
  ('c0000005-0001-4000-8000-000000000003', 'b0000005-0001-4000-8000-000000000001', 'source_authority', 'forms.legalObl.field.sourceAuthority', 'text', true, NULL, NULL, NULL, 3),
  ('c0000005-0001-4000-8000-000000000004', 'b0000005-0001-4000-8000-000000000001', 'applicable_standard', 'forms.legalObl.field.applicableStandard', 'multiselect', true, '["ISO14001","ISO45001"]', NULL, NULL, 4),
  ('c0000005-0001-4000-8000-000000000005', 'b0000005-0001-4000-8000-000000000001', 'requirements_summary', 'forms.legalObl.field.requirementsSummary', 'textarea', true, NULL, NULL, NULL, 5),
  ('c0000005-0001-4000-8000-000000000006', 'b0000005-0001-4000-8000-000000000001', 'effective_date', 'forms.legalObl.field.effectiveDate', 'date', false, NULL, NULL, NULL, 6),
  ('c0000005-0001-4000-8000-000000000007', 'b0000005-0001-4000-8000-000000000002', 'compliance_status', 'forms.legalObl.field.complianceStatus', 'select', true, '["compliant","partially_compliant","non_compliant","not_evaluated"]', NULL, NULL, 1),
  ('c0000005-0001-4000-8000-000000000008', 'b0000005-0001-4000-8000-000000000002', 'last_evaluated', 'forms.legalObl.field.lastEvaluated', 'date', false, NULL, NULL, NULL, 2),
  ('c0000005-0001-4000-8000-000000000009', 'b0000005-0001-4000-8000-000000000002', 'eval_notes', 'forms.legalObl.field.evalNotes', 'textarea', false, NULL, NULL, NULL, 3),
  ('c0000005-0001-4000-8000-000000000010', 'b0000005-0001-4000-8000-000000000002', 'action_required', 'forms.legalObl.field.actionRequired', 'textarea', false, NULL, NULL, NULL, 4)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- HIRA — Hazard Identification & Risk Assessment (45001; 6.1.2)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000006-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000006', 'hazard_id', 'forms.hira.sec.identification', 1),
  ('b0000006-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000006', 'risk_assessment', 'forms.hira.sec.assessment', 2),
  ('b0000006-0001-4000-8000-000000000003', 'a0000001-0000-4000-8000-000000000006', 'controls', 'forms.hira.sec.controls', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000006-0001-4000-8000-000000000001', 'b0000006-0001-4000-8000-000000000001', 'location_area', 'forms.hira.field.location', 'text', true, NULL, NULL, NULL, 1),
  ('c0000006-0001-4000-8000-000000000002', 'b0000006-0001-4000-8000-000000000001', 'activity_task', 'forms.hira.field.activity', 'text', true, NULL, NULL, NULL, 2),
  ('c0000006-0001-4000-8000-000000000003', 'b0000006-0001-4000-8000-000000000001', 'hazard_desc', 'forms.hira.field.hazardDesc', 'textarea', true, NULL, NULL, NULL, 3),
  ('c0000006-0001-4000-8000-000000000004', 'b0000006-0001-4000-8000-000000000001', 'hazard_type', 'forms.hira.field.hazardType', 'select', true, '["physical","chemical","biological","ergonomic","psychosocial","mechanical"]', NULL, NULL, 4),
  ('c0000006-0001-4000-8000-000000000005', 'b0000006-0001-4000-8000-000000000001', 'persons_at_risk', 'forms.hira.field.personsAtRisk', 'textarea', true, NULL, NULL, NULL, 5),
  ('c0000006-0001-4000-8000-000000000006', 'b0000006-0001-4000-8000-000000000002', 'hira_likelihood', 'forms.hira.field.likelihood', 'number', true, NULL, NULL, NULL, 1),
  ('c0000006-0001-4000-8000-000000000007', 'b0000006-0001-4000-8000-000000000002', 'hira_severity', 'forms.hira.field.severity', 'number', true, NULL, NULL, NULL, 2),
  ('c0000006-0001-4000-8000-000000000008', 'b0000006-0001-4000-8000-000000000002', 'risk_level', 'forms.hira.field.riskLevel', 'select', true, '["low","medium","high","critical"]', NULL, NULL, 3),
  ('c0000006-0001-4000-8000-000000000009', 'b0000006-0001-4000-8000-000000000003', 'existing_controls', 'forms.hira.field.existingControls', 'textarea', false, NULL, NULL, NULL, 1),
  ('c0000006-0001-4000-8000-000000000010', 'b0000006-0001-4000-8000-000000000003', 'hierarchy_of_controls', 'forms.hira.field.hierarchyOfControls', 'select', false, '["elimination","substitution","engineering","admin","ppe"]', NULL, NULL, 2),
  ('c0000006-0001-4000-8000-000000000011', 'b0000006-0001-4000-8000-000000000003', 'additional_controls', 'forms.hira.field.additionalControls', 'textarea', false, NULL, NULL, NULL, 3),
  ('c0000006-0001-4000-8000-000000000012', 'b0000006-0001-4000-8000-000000000003', 'residual_risk', 'forms.hira.field.residualRisk', 'select', false, '["low","medium","high","critical"]', NULL, NULL, 4)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- INCIDENT INVESTIGATION (45001; 10.2)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000007-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000007', 'incident_info', 'forms.incident.sec.info', 1),
  ('b0000007-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000007', 'investigation', 'forms.incident.sec.investigation', 2),
  ('b0000007-0001-4000-8000-000000000003', 'a0000001-0000-4000-8000-000000000007', 'actions', 'forms.incident.sec.actions', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000007-0001-4000-8000-000000000001', 'b0000007-0001-4000-8000-000000000001', 'incident_date', 'forms.incident.field.date', 'date', true, NULL, NULL, NULL, 1),
  ('c0000007-0001-4000-8000-000000000002', 'b0000007-0001-4000-8000-000000000001', 'incident_time', 'forms.incident.field.time', 'text', false, NULL, NULL, NULL, 2),
  ('c0000007-0001-4000-8000-000000000003', 'b0000007-0001-4000-8000-000000000001', 'incident_location', 'forms.incident.field.location', 'text', true, NULL, NULL, NULL, 3),
  ('c0000007-0001-4000-8000-000000000004', 'b0000007-0001-4000-8000-000000000001', 'incident_type', 'forms.incident.field.type', 'select', true, '["injury","near_miss","property_damage","environmental","illness"]', NULL, NULL, 4),
  ('c0000007-0001-4000-8000-000000000005', 'b0000007-0001-4000-8000-000000000001', 'incident_desc', 'forms.incident.field.description', 'textarea', true, NULL, NULL, NULL, 5),
  ('c0000007-0001-4000-8000-000000000006', 'b0000007-0001-4000-8000-000000000001', 'persons_involved', 'forms.incident.field.personsInvolved', 'textarea', true, NULL, NULL, NULL, 6),
  ('c0000007-0001-4000-8000-000000000007', 'b0000007-0001-4000-8000-000000000001', 'severity_class', 'forms.incident.field.severityClass', 'select', true, '["first_aid","medical_treatment","lost_time","fatality"]', NULL, NULL, 7),
  ('c0000007-0001-4000-8000-000000000008', 'b0000007-0001-4000-8000-000000000002', 'immediate_causes', 'forms.incident.field.immediateCauses', 'textarea', true, NULL, NULL, NULL, 1),
  ('c0000007-0001-4000-8000-000000000009', 'b0000007-0001-4000-8000-000000000002', 'root_causes', 'forms.incident.field.rootCauses', 'textarea', true, NULL, NULL, NULL, 2),
  ('c0000007-0001-4000-8000-000000000010', 'b0000007-0001-4000-8000-000000000002', 'contributing_factors', 'forms.incident.field.contributingFactors', 'textarea', false, NULL, NULL, NULL, 3),
  ('c0000007-0001-4000-8000-000000000011', 'b0000007-0001-4000-8000-000000000003', 'corrective_actions', 'forms.incident.field.correctiveActions', 'textarea', true, NULL, NULL, NULL, 1),
  ('c0000007-0001-4000-8000-000000000012', 'b0000007-0001-4000-8000-000000000003', 'action_owner', 'forms.incident.field.actionOwner', 'user', true, NULL, NULL, NULL, 2),
  ('c0000007-0001-4000-8000-000000000013', 'b0000007-0001-4000-8000-000000000003', 'action_due', 'forms.incident.field.actionDue', 'date', true, NULL, NULL, NULL, 3),
  ('c0000007-0001-4000-8000-000000000014', 'b0000007-0001-4000-8000-000000000003', 'reportable', 'forms.incident.field.reportable', 'radio', true, '["yes","no"]', NULL, NULL, 4)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- EMERGENCY PREPAREDNESS & RESPONSE (14001/45001; 8.2)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000008-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000008', 'scenario', 'forms.emergency.sec.scenario', 1),
  ('b0000008-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000008', 'response_plan', 'forms.emergency.sec.responsePlan', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000008-0001-4000-8000-000000000001', 'b0000008-0001-4000-8000-000000000001', 'scenario_desc', 'forms.emergency.field.scenarioDesc', 'textarea', true, NULL, NULL, NULL, 1),
  ('c0000008-0001-4000-8000-000000000002', 'b0000008-0001-4000-8000-000000000001', 'scenario_type', 'forms.emergency.field.scenarioType', 'select', true, '["fire","spill","weather","medical","structural","other"]', NULL, NULL, 2),
  ('c0000008-0001-4000-8000-000000000003', 'b0000008-0001-4000-8000-000000000001', 'likelihood', 'forms.emergency.field.likelihood', 'select', true, '["low","medium","high"]', NULL, NULL, 3),
  ('c0000008-0001-4000-8000-000000000004', 'b0000008-0001-4000-8000-000000000001', 'potential_impact', 'forms.emergency.field.potentialImpact', 'textarea', true, NULL, NULL, NULL, 4),
  ('c0000008-0001-4000-8000-000000000005', 'b0000008-0001-4000-8000-000000000002', 'response_procedure', 'forms.emergency.field.responseProcedure', 'textarea', true, NULL, NULL, NULL, 1),
  ('c0000008-0001-4000-8000-000000000006', 'b0000008-0001-4000-8000-000000000002', 'responsible_person', 'forms.emergency.field.responsiblePerson', 'user', true, NULL, NULL, NULL, 2),
  ('c0000008-0001-4000-8000-000000000007', 'b0000008-0001-4000-8000-000000000002', 'drill_frequency', 'forms.emergency.field.drillFrequency', 'select', false, '["monthly","quarterly","semi_annual","annual"]', NULL, NULL, 3),
  ('c0000008-0001-4000-8000-000000000008', 'b0000008-0001-4000-8000-000000000002', 'last_drill_date', 'forms.emergency.field.lastDrillDate', 'date', false, NULL, NULL, NULL, 4),
  ('c0000008-0001-4000-8000-000000000009', 'b0000008-0001-4000-8000-000000000002', 'drill_findings', 'forms.emergency.field.drillFindings', 'textarea', false, NULL, NULL, NULL, 5)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- WORKER CONSULTATION & PARTICIPATION (45001; 5.4)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000009-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000009', 'consultation_info', 'forms.workerConsult.sec.info', 1),
  ('b0000009-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000009', 'outcomes', 'forms.workerConsult.sec.outcomes', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000009-0001-4000-8000-000000000001', 'b0000009-0001-4000-8000-000000000001', 'consultation_date', 'forms.workerConsult.field.date', 'date', true, NULL, NULL, NULL, 1),
  ('c0000009-0001-4000-8000-000000000002', 'b0000009-0001-4000-8000-000000000001', 'topic', 'forms.workerConsult.field.topic', 'text', true, NULL, NULL, NULL, 2),
  ('c0000009-0001-4000-8000-000000000003', 'b0000009-0001-4000-8000-000000000001', 'participants', 'forms.workerConsult.field.participants', 'textarea', true, NULL, NULL, NULL, 3),
  ('c0000009-0001-4000-8000-000000000004', 'b0000009-0001-4000-8000-000000000001', 'method', 'forms.workerConsult.field.method', 'select', true, '["meeting","survey","suggestion_box","committee","other"]', NULL, NULL, 4),
  ('c0000009-0001-4000-8000-000000000005', 'b0000009-0001-4000-8000-000000000002', 'key_concerns', 'forms.workerConsult.field.keyConcerns', 'textarea', true, NULL, NULL, NULL, 1),
  ('c0000009-0001-4000-8000-000000000006', 'b0000009-0001-4000-8000-000000000002', 'actions_agreed', 'forms.workerConsult.field.actionsAgreed', 'textarea', false, NULL, NULL, NULL, 2),
  ('c0000009-0001-4000-8000-000000000007', 'b0000009-0001-4000-8000-000000000002', 'feedback_provided', 'forms.workerConsult.field.feedbackProvided', 'radio', true, '["yes","no"]', NULL, NULL, 3)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- COMPETENCE & TRAINING MATRIX (7.2)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000010-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000010', 'person_info', 'forms.competence.sec.personInfo', 1),
  ('b0000010-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000010', 'competence_record', 'forms.competence.sec.record', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000010-0001-4000-8000-000000000001', 'b0000010-0001-4000-8000-000000000001', 'employee_name', 'forms.competence.field.employeeName', 'text', true, NULL, NULL, NULL, 1),
  ('c0000010-0001-4000-8000-000000000002', 'b0000010-0001-4000-8000-000000000001', 'role_position', 'forms.competence.field.rolePosition', 'text', true, NULL, NULL, NULL, 2),
  ('c0000010-0001-4000-8000-000000000003', 'b0000010-0001-4000-8000-000000000001', 'department', 'forms.competence.field.department', 'text', false, NULL, NULL, NULL, 3),
  ('c0000010-0001-4000-8000-000000000004', 'b0000010-0001-4000-8000-000000000002', 'competence_area', 'forms.competence.field.competenceArea', 'text', true, NULL, NULL, NULL, 1),
  ('c0000010-0001-4000-8000-000000000005', 'b0000010-0001-4000-8000-000000000002', 'training_type', 'forms.competence.field.trainingType', 'select', true, '["education","experience","training","certification"]', NULL, NULL, 2),
  ('c0000010-0001-4000-8000-000000000006', 'b0000010-0001-4000-8000-000000000002', 'training_date', 'forms.competence.field.trainingDate', 'date', false, NULL, NULL, NULL, 3),
  ('c0000010-0001-4000-8000-000000000007', 'b0000010-0001-4000-8000-000000000002', 'expiry_date', 'forms.competence.field.expiryDate', 'date', false, NULL, NULL, NULL, 4),
  ('c0000010-0001-4000-8000-000000000008', 'b0000010-0001-4000-8000-000000000002', 'competence_level', 'forms.competence.field.competenceLevel', 'select', true, '["awareness","basic","competent","expert"]', NULL, NULL, 5),
  ('c0000010-0001-4000-8000-000000000009', 'b0000010-0001-4000-8000-000000000002', 'evidence_ref', 'forms.competence.field.evidenceRef', 'text', false, NULL, NULL, NULL, 6),
  ('c0000010-0001-4000-8000-000000000010', 'b0000010-0001-4000-8000-000000000002', 'assessed_by', 'forms.competence.field.assessedBy', 'user', false, NULL, NULL, NULL, 7)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SUPPLIER/EXTERNAL PROVIDER EVALUATION (8.4.1)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000011-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000011', 'supplier_info', 'forms.supplier.sec.info', 1),
  ('b0000011-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000011', 'evaluation', 'forms.supplier.sec.evaluation', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000011-0001-4000-8000-000000000001', 'b0000011-0001-4000-8000-000000000001', 'supplier_name', 'forms.supplier.field.name', 'text', true, NULL, NULL, NULL, 1),
  ('c0000011-0001-4000-8000-000000000002', 'b0000011-0001-4000-8000-000000000001', 'product_service', 'forms.supplier.field.productService', 'text', true, NULL, NULL, NULL, 2),
  ('c0000011-0001-4000-8000-000000000003', 'b0000011-0001-4000-8000-000000000001', 'criticality', 'forms.supplier.field.criticality', 'select', true, '["low","medium","high","critical"]', NULL, NULL, 3),
  ('c0000011-0001-4000-8000-000000000004', 'b0000011-0001-4000-8000-000000000001', 'certifications', 'forms.supplier.field.certifications', 'text', false, NULL, NULL, NULL, 4),
  ('c0000011-0001-4000-8000-000000000005', 'b0000011-0001-4000-8000-000000000002', 'quality_score', 'forms.supplier.field.qualityScore', 'number', true, NULL, NULL, NULL, 1),
  ('c0000011-0001-4000-8000-000000000006', 'b0000011-0001-4000-8000-000000000002', 'delivery_score', 'forms.supplier.field.deliveryScore', 'number', true, NULL, NULL, NULL, 2),
  ('c0000011-0001-4000-8000-000000000007', 'b0000011-0001-4000-8000-000000000002', 'overall_rating', 'forms.supplier.field.overallRating', 'select', true, '["approved","conditional","disapproved"]', NULL, NULL, 3),
  ('c0000011-0001-4000-8000-000000000008', 'b0000011-0001-4000-8000-000000000002', 'eval_date', 'forms.supplier.field.evalDate', 'date', true, NULL, NULL, NULL, 4),
  ('c0000011-0001-4000-8000-000000000009', 'b0000011-0001-4000-8000-000000000002', 'next_review', 'forms.supplier.field.nextReview', 'date', false, NULL, NULL, NULL, 5),
  ('c0000011-0001-4000-8000-000000000010', 'b0000011-0001-4000-8000-000000000002', 'eval_notes', 'forms.supplier.field.evalNotes', 'textarea', false, NULL, NULL, NULL, 6)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- CALIBRATION & MEASURING EQUIPMENT LOG (7.1.5)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000012-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000012', 'equipment_info', 'forms.calibration.sec.equipment', 1),
  ('b0000012-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000012', 'calibration_record', 'forms.calibration.sec.record', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000012-0001-4000-8000-000000000001', 'b0000012-0001-4000-8000-000000000001', 'asset_tag', 'forms.calibration.field.assetTag', 'text', true, NULL, NULL, NULL, 1),
  ('c0000012-0001-4000-8000-000000000002', 'b0000012-0001-4000-8000-000000000001', 'equipment_desc', 'forms.calibration.field.description', 'text', true, NULL, NULL, NULL, 2),
  ('c0000012-0001-4000-8000-000000000003', 'b0000012-0001-4000-8000-000000000001', 'manufacturer', 'forms.calibration.field.manufacturer', 'text', false, NULL, NULL, NULL, 3),
  ('c0000012-0001-4000-8000-000000000004', 'b0000012-0001-4000-8000-000000000001', 'serial_number', 'forms.calibration.field.serialNumber', 'text', false, NULL, NULL, NULL, 4),
  ('c0000012-0001-4000-8000-000000000005', 'b0000012-0001-4000-8000-000000000001', 'location', 'forms.calibration.field.location', 'text', false, NULL, NULL, NULL, 5),
  ('c0000012-0001-4000-8000-000000000006', 'b0000012-0001-4000-8000-000000000002', 'calibration_date', 'forms.calibration.field.calibrationDate', 'date', true, NULL, NULL, NULL, 1),
  ('c0000012-0001-4000-8000-000000000007', 'b0000012-0001-4000-8000-000000000002', 'next_due', 'forms.calibration.field.nextDue', 'date', true, NULL, NULL, NULL, 2),
  ('c0000012-0001-4000-8000-000000000008', 'b0000012-0001-4000-8000-000000000002', 'standard_used', 'forms.calibration.field.standardUsed', 'text', true, NULL, NULL, NULL, 3),
  ('c0000012-0001-4000-8000-000000000009', 'b0000012-0001-4000-8000-000000000002', 'result', 'forms.calibration.field.result', 'select', true, '["pass","fail","adjusted"]', NULL, NULL, 4),
  ('c0000012-0001-4000-8000-000000000010', 'b0000012-0001-4000-8000-000000000002', 'calibrated_by', 'forms.calibration.field.calibratedBy', 'user', false, NULL, NULL, NULL, 5),
  ('c0000012-0001-4000-8000-000000000011', 'b0000012-0001-4000-8000-000000000002', 'traceability_ref', 'forms.calibration.field.traceabilityRef', 'text', false, NULL, NULL, NULL, 6)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DOCUMENT CHANGE REQUEST (7.5)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000013-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000013', 'change_request', 'forms.docChange.sec.request', 1),
  ('b0000013-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000013', 'assessment', 'forms.docChange.sec.assessment', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000013-0001-4000-8000-000000000001', 'b0000013-0001-4000-8000-000000000001', 'document_ref', 'forms.docChange.field.documentRef', 'relation', true, NULL, 'document', NULL, 1),
  ('c0000013-0001-4000-8000-000000000002', 'b0000013-0001-4000-8000-000000000001', 'requested_by', 'forms.docChange.field.requestedBy', 'user', true, NULL, NULL, NULL, 2),
  ('c0000013-0001-4000-8000-000000000003', 'b0000013-0001-4000-8000-000000000001', 'request_date', 'forms.docChange.field.requestDate', 'date', true, NULL, NULL, NULL, 3),
  ('c0000013-0001-4000-8000-000000000004', 'b0000013-0001-4000-8000-000000000001', 'change_reason', 'forms.docChange.field.changeReason', 'textarea', true, NULL, NULL, NULL, 4),
  ('c0000013-0001-4000-8000-000000000005', 'b0000013-0001-4000-8000-000000000001', 'change_description', 'forms.docChange.field.changeDescription', 'textarea', true, NULL, NULL, NULL, 5),
  ('c0000013-0001-4000-8000-000000000006', 'b0000013-0001-4000-8000-000000000001', 'urgency', 'forms.docChange.field.urgency', 'select', true, '["low","normal","urgent"]', NULL, NULL, 6),
  ('c0000013-0001-4000-8000-000000000007', 'b0000013-0001-4000-8000-000000000002', 'impact_assessment', 'forms.docChange.field.impactAssessment', 'textarea', false, NULL, NULL, NULL, 1),
  ('c0000013-0001-4000-8000-000000000008', 'b0000013-0001-4000-8000-000000000002', 'reviewer', 'forms.docChange.field.reviewer', 'user', false, NULL, NULL, NULL, 2),
  ('c0000013-0001-4000-8000-000000000009', 'b0000013-0001-4000-8000-000000000002', 'decision', 'forms.docChange.field.decision', 'select', false, '["approved","rejected","deferred"]', NULL, NULL, 3),
  ('c0000013-0001-4000-8000-000000000010', 'b0000013-0001-4000-8000-000000000002', 'decision_notes', 'forms.docChange.field.decisionNotes', 'textarea', false, NULL, NULL, NULL, 4)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- OBJECTIVES & IMPROVEMENT PLAN (6.2)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000014-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000014', 'objective_info', 'forms.objectives.sec.info', 1),
  ('b0000014-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000014', 'planning', 'forms.objectives.sec.planning', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000014-0001-4000-8000-000000000001', 'b0000014-0001-4000-8000-000000000001', 'objective_title', 'forms.objectives.field.title', 'text', true, NULL, NULL, NULL, 1),
  ('c0000014-0001-4000-8000-000000000002', 'b0000014-0001-4000-8000-000000000001', 'objective_standard', 'forms.objectives.field.standard', 'multiselect', true, '["ISO9001","ISO14001","ISO45001"]', NULL, NULL, 2),
  ('c0000014-0001-4000-8000-000000000003', 'b0000014-0001-4000-8000-000000000001', 'measurable_target', 'forms.objectives.field.measurableTarget', 'text', true, NULL, NULL, NULL, 3),
  ('c0000014-0001-4000-8000-000000000004', 'b0000014-0001-4000-8000-000000000001', 'kpi', 'forms.objectives.field.kpi', 'text', true, NULL, NULL, NULL, 4),
  ('c0000014-0001-4000-8000-000000000005', 'b0000014-0001-4000-8000-000000000001', 'baseline', 'forms.objectives.field.baseline', 'text', false, NULL, NULL, NULL, 5),
  ('c0000014-0001-4000-8000-000000000006', 'b0000014-0001-4000-8000-000000000002', 'actions_planned', 'forms.objectives.field.actionsPlanned', 'textarea', true, NULL, NULL, NULL, 1),
  ('c0000014-0001-4000-8000-000000000007', 'b0000014-0001-4000-8000-000000000002', 'responsible', 'forms.objectives.field.responsible', 'user', true, NULL, NULL, NULL, 2),
  ('c0000014-0001-4000-8000-000000000008', 'b0000014-0001-4000-8000-000000000002', 'target_date', 'forms.objectives.field.targetDate', 'date', true, NULL, NULL, NULL, 3),
  ('c0000014-0001-4000-8000-000000000009', 'b0000014-0001-4000-8000-000000000002', 'resources_needed', 'forms.objectives.field.resourcesNeeded', 'textarea', false, NULL, NULL, NULL, 4),
  ('c0000014-0001-4000-8000-000000000010', 'b0000014-0001-4000-8000-000000000002', 'progress_status', 'forms.objectives.field.progressStatus', 'select', false, '["not_started","on_track","at_risk","achieved","missed"]', NULL, NULL, 5)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- INTERESTED PARTIES & CONTEXT ANALYSIS (4.2)
-- ============================================================

INSERT INTO forms.template_sections (id, template_id, section_key, title_key, sort_order) VALUES
  ('b0000015-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000015', 'party_info', 'forms.intParties.sec.info', 1),
  ('b0000015-0001-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000015', 'needs_expectations', 'forms.intParties.sec.needs', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO forms.template_fields (id, section_id, field_key, label_key, field_type, required, options, relation_target, maps_to_column, sort_order) VALUES
  ('c0000015-0001-4000-8000-000000000001', 'b0000015-0001-4000-8000-000000000001', 'party_name', 'forms.intParties.field.name', 'text', true, NULL, NULL, NULL, 1),
  ('c0000015-0001-4000-8000-000000000002', 'b0000015-0001-4000-8000-000000000001', 'party_type', 'forms.intParties.field.type', 'select', true, '["customer","employee","regulator","supplier","community","shareholder","other"]', NULL, NULL, 2),
  ('c0000015-0001-4000-8000-000000000003', 'b0000015-0001-4000-8000-000000000001', 'relevance', 'forms.intParties.field.relevance', 'select', true, '["high","medium","low"]', NULL, NULL, 3),
  ('c0000015-0001-4000-8000-000000000004', 'b0000015-0001-4000-8000-000000000001', 'influence', 'forms.intParties.field.influence', 'select', true, '["high","medium","low"]', NULL, NULL, 4),
  ('c0000015-0001-4000-8000-000000000005', 'b0000015-0001-4000-8000-000000000002', 'needs_desc', 'forms.intParties.field.needsDesc', 'textarea', true, NULL, NULL, NULL, 1),
  ('c0000015-0001-4000-8000-000000000006', 'b0000015-0001-4000-8000-000000000002', 'expectations_desc', 'forms.intParties.field.expectationsDesc', 'textarea', true, NULL, NULL, NULL, 2),
  ('c0000015-0001-4000-8000-000000000007', 'b0000015-0001-4000-8000-000000000002', 'applicable_standards', 'forms.intParties.field.applicableStandards', 'multiselect', false, '["ISO9001","ISO14001","ISO45001"]', NULL, NULL, 3),
  ('c0000015-0001-4000-8000-000000000008', 'b0000015-0001-4000-8000-000000000002', 'monitoring_method', 'forms.intParties.field.monitoringMethod', 'text', false, NULL, NULL, NULL, 4),
  ('c0000015-0001-4000-8000-000000000009', 'b0000015-0001-4000-8000-000000000002', 'review_frequency', 'forms.intParties.field.reviewFrequency', 'select', false, '["quarterly","semi_annual","annual"]', NULL, NULL, 5)
ON CONFLICT (id) DO NOTHING;
