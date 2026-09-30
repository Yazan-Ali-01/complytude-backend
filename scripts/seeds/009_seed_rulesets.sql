-- =========================
-- Seed Script 009: Demo Rulesets for RAG Compliance Analysis
-- =========================
-- Description: 5 realistic UAE legal rulesets with clauses for demo/testing the RAG pipeline.
--              Each ruleset targets a different regulatory domain so sample contracts can
--              trigger a mix of violations.
-- Idempotent: Uses ON CONFLICT DO NOTHING
-- Dependencies: Requires authorities (001) and users (004) to be seeded first
-- =========================

BEGIN;

-- =========================
-- Helper: look up authority IDs once
-- =========================

DO $$
DECLARE
    v_ded_id   UUID;
    v_dmcc_id  UUID;
    v_difc_id  UUID;
    v_sysadmin UUID := '99999999-9999-4999-9999-999999999999';
BEGIN

SELECT id INTO v_ded_id  FROM public.authorities WHERE code = 'DED'  LIMIT 1;
SELECT id INTO v_dmcc_id FROM public.authorities WHERE code = 'DMCC' LIMIT 1;
SELECT id INTO v_difc_id FROM public.authorities WHERE code = 'DIFC' LIMIT 1;

-- =========================
-- Ruleset 1: UAE Federal Labour Law – Employment Terms
-- =========================

INSERT INTO public.rulesets (id, key, name, description, authority_id, current_version, status, created_by)
VALUES (
    '20000000-0000-0000-0000-000000000001',
    'uae_labour_law_employment_v1',
    'UAE Federal Labour Law – Employment Terms',
    'Core employment requirements under UAE Federal Decree-Law No. 33 of 2021 (Private Sector Labour Law). Covers probation, notice periods, working hours, leave, end-of-service gratuity, and termination.',
    v_ded_id, '1.0.0', 'active',
    v_sysadmin
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ruleset_versions (id, ruleset_id, version, clauses, changelog, rolled_back_from_version, is_active, created_by)
VALUES (
    '20000000-0000-0000-0001-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '1.0.0',
    '[
        {"id":"uae_lab_01","title":"Written Employment Contract","content":"Every employment relationship must be documented in a written employment contract in duplicate, with one copy retained by the employer and one by the employee. The contract must be in Arabic or bilingual (Arabic plus another language). The contract must specify: (a) employer name and address, (b) employee name, nationality, date of birth, and Emirates ID number, (c) job title, description, and category, (d) date of commencement, (e) contract duration for fixed-term contracts, (f) workplace location, (g) working hours, rest days, and leave entitlements, (h) remuneration including basic salary and any allowances, (i) probation period if applicable, and (j) notice period for termination.","order":1,"is_required":true,"metadata":{"article":"Art. 8","severity":"critical"}},
        {"id":"uae_lab_02","title":"Probation Period Limit","content":"The probation period shall not exceed six (6) months from the date of commencement. The employer may terminate the employee during probation with fourteen (14) days written notice. An employee terminated during probation is not entitled to end-of-service gratuity. If the employee successfully completes probation, the probation period is counted towards the period of service for all entitlements.","order":2,"is_required":true,"metadata":{"article":"Art. 9","severity":"high"}},
        {"id":"uae_lab_03","title":"Maximum Working Hours","content":"The ordinary working hours for adult employees shall not exceed eight (8) hours per day or forty-eight (48) hours per week. Working hours may be increased to nine (9) hours per day for commercial establishments, hotels, restaurants, and security services. During the Holy Month of Ramadan, working hours are reduced by two (2) hours per day. Employees shall not work more than five (5) consecutive hours without a break of at least one hour for rest, meals, and prayer.","order":3,"is_required":true,"metadata":{"article":"Art. 17-18","severity":"high"}},
        {"id":"uae_lab_04","title":"Overtime Compensation","content":"If an employee works beyond normal working hours, the excess time is considered overtime. Overtime pay shall be the normal hourly wage plus at least twenty-five percent (25%). If overtime occurs between 10:00 PM and 4:00 AM, the employee is entitled to the normal hourly wage plus at least fifty percent (50%). Total working hours including overtime shall not exceed two (2) additional hours per day, unless the work is necessary to prevent a substantial loss or serious accident.","order":4,"is_required":true,"metadata":{"article":"Art. 19","severity":"high"}},
        {"id":"uae_lab_05","title":"Annual Leave Entitlement","content":"An employee who has completed one year of service is entitled to annual leave of not less than thirty (30) calendar days. An employee who has completed six months but less than one year of service is entitled to two (2) days of leave per month. Leave salary must be paid in advance before the employee takes leave. The employer may determine the timing of annual leave based on work requirements, but the employee must use at least half of the annual leave in the year it is accrued.","order":5,"is_required":true,"metadata":{"article":"Art. 29","severity":"high"}},
        {"id":"uae_lab_06","title":"Sick Leave","content":"An employee who has completed the probation period is entitled to sick leave of up to ninety (90) days per year, consecutive or intermittent. Sick leave pay is calculated as follows: (a) first fifteen (15) days at full pay, (b) next thirty (30) days at half pay, and (c) remaining period without pay. The employee must notify the employer within three (3) working days and provide a medical certificate from an authorized medical entity.","order":6,"is_required":true,"metadata":{"article":"Art. 31","severity":"medium"}},
        {"id":"uae_lab_07","title":"End-of-Service Gratuity","content":"An employee who has completed one or more years of continuous service is entitled to end-of-service gratuity calculated as follows: (a) twenty-one (21) days of basic salary for each year of the first five years of service, and (b) thirty (30) days of basic salary for each additional year beyond five years. The total gratuity shall not exceed the equivalent of two (2) years total remuneration. For employees on unlimited contracts who resign, the gratuity is reduced if service is between one and three years (one-third), three to five years (two-thirds), or paid in full after five years.","order":7,"is_required":true,"metadata":{"article":"Art. 51","severity":"critical"}},
        {"id":"uae_lab_08","title":"Notice Period for Termination","content":"Either party may terminate a fixed-term or unlimited-term employment contract by providing written notice of not less than thirty (30) calendar days and not more than ninety (90) calendar days. The notice period must be specified in the employment contract. During the notice period, the employee is entitled to full remuneration and must continue to perform duties. The employer must grant the employee at least one unpaid day per week during the notice period for job searching.","order":8,"is_required":true,"metadata":{"article":"Art. 43","severity":"critical"}},
        {"id":"uae_lab_09","title":"Non-Compete Restrictions","content":"A non-compete clause must be reasonable in scope, duration, and geographic area. The non-compete period shall not exceed two (2) years from the date of contract termination. The clause is void if the employer terminates the contract unlawfully or if the employee terminates the contract due to employer breach. The non-compete must be limited to work that is genuinely competitive with the employer business.","order":9,"is_required":false,"metadata":{"article":"Art. 10","severity":"medium"}},
        {"id":"uae_lab_10","title":"Wage Payment Requirements","content":"Wages must be paid in UAE Dirhams (AED) through approved financial institutions (WPS – Wage Protection System). Payment must be made no later than ten (10) days from the due date. The employer may not deduct more than half of the employee monthly wage for debt repayment. Wage deductions require written employee consent, except for legally mandated deductions.","order":10,"is_required":true,"metadata":{"article":"Art. 22-26","severity":"critical"}}
    ]'::jsonb,
    'Initial version – UAE Federal Decree-Law No. 33/2021',
    NULL,
    true,
    v_sysadmin
) ON CONFLICT (id) DO NOTHING;

-- =========================
-- Ruleset 2: DMCC Employment Regulations
-- =========================

INSERT INTO public.rulesets (id, key, name, description, authority_id, current_version, status, created_by)
VALUES (
    '20000000-0000-0000-0000-000000000002',
    'dmcc_employment_regulations_v1',
    'DMCC Employment Regulations',
    'Employment regulations specific to DMCC free zone companies. Covers DMCC-specific requirements for employment contracts, visa sponsorship, medical insurance, and termination procedures.',
    v_dmcc_id, '1.0.0', 'active',
    v_sysadmin
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ruleset_versions (id, ruleset_id, version, clauses, changelog, rolled_back_from_version, is_active, created_by)
VALUES (
    '20000000-0000-0000-0001-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '1.0.0',
    '[
        {"id":"dmcc_emp_01","title":"DMCC Contract Registration","content":"All employment contracts for DMCC free zone companies must be registered with the DMCC Authority within fourteen (14) days of execution. The registered contract must include the DMCC company license number, the employee DMCC access card number, and confirmation that the contract complies with DMCC employment rules. Failure to register the contract may result in fines and visa processing delays.","order":1,"is_required":true,"metadata":{"section":"DMCC-HR-01","severity":"critical"}},
        {"id":"dmcc_emp_02","title":"Medical Insurance Obligation","content":"Every DMCC employer must provide comprehensive medical insurance coverage for all employees from the first day of employment. The medical insurance plan must meet or exceed the minimum coverage requirements set by the Dubai Health Authority (DHA), including in-patient and out-patient coverage with a minimum annual limit of AED 150,000. The employer must provide proof of insurance to DMCC within thirty (30) days of the employee start date.","order":2,"is_required":true,"metadata":{"section":"DMCC-HR-02","severity":"critical"}},
        {"id":"dmcc_emp_03","title":"Employment Visa Sponsorship","content":"DMCC companies must sponsor the employment visa for all employees working in the DMCC free zone. The visa application must be filed within sixty (60) days of the employment start date. The employer is responsible for all visa-related costs including medical fitness, Emirates ID, and visa stamping fees. The employer must maintain valid visa status for all employees throughout the employment period.","order":3,"is_required":true,"metadata":{"section":"DMCC-HR-03","severity":"critical"}},
        {"id":"dmcc_emp_04","title":"DMCC Working Hours","content":"Standard working hours for DMCC free zone employees are eight (8) hours per day, five (5) days per week, totaling forty (40) hours per week. Friday and Saturday are the standard weekend. Employers may adopt a flexible working arrangement subject to written agreement, but total weekly hours must not exceed forty-eight (48) hours including overtime. During Ramadan, working hours are reduced to six (6) hours per day.","order":4,"is_required":true,"metadata":{"section":"DMCC-HR-04","severity":"high"}},
        {"id":"dmcc_emp_05","title":"Termination Notice – DMCC Specifics","content":"For DMCC employment contracts, the minimum notice period is thirty (30) days for employees with less than five years of service, and ninety (90) days for employees with five or more years of service. The notice must be in writing and delivered to the DMCC Authority for records. During the notice period, the employer must allow the employee reasonable time for job searching (minimum one day per week). Visa cancellation must be initiated within thirty (30) days of the last working day.","order":5,"is_required":true,"metadata":{"section":"DMCC-HR-05","severity":"high"}},
        {"id":"dmcc_emp_06","title":"Repatriation Obligation","content":"Upon termination of employment, the DMCC employer is obligated to bear the cost of repatriating the employee to their home country or last country of residence, unless the employee secures new employment within the UAE within thirty (30) days. Repatriation costs include a one-way economy class air ticket. This obligation cannot be waived or transferred to the employee through any contractual arrangement.","order":6,"is_required":true,"metadata":{"section":"DMCC-HR-06","severity":"high"}},
        {"id":"dmcc_emp_07","title":"Employee Accommodation Allowance","content":"DMCC employers are encouraged to provide housing allowance or accommodation to employees. If accommodation is provided as part of the employment package, it must meet minimum standards set by the Dubai Municipality for worker accommodation. The accommodation benefit must be clearly stated in the employment contract with specific monetary value or description of provided housing.","order":7,"is_required":false,"metadata":{"section":"DMCC-HR-07","severity":"medium"}},
        {"id":"dmcc_emp_08","title":"Gratuity for DMCC Employees","content":"End-of-service gratuity for DMCC employees follows UAE Federal Labour Law provisions. The employer must calculate and pay gratuity within fourteen (14) days of the last working day. DMCC companies may establish a savings scheme or DEWS (DIFC Employee Workplace Savings) equivalent as an alternative to gratuity, subject to DMCC Authority approval. Any alternative arrangement must provide benefits at least equal to the statutory gratuity.","order":8,"is_required":true,"metadata":{"section":"DMCC-HR-08","severity":"critical"}}
    ]'::jsonb,
    'Initial version – DMCC Employment Regulations',
    NULL,
    true,
    v_sysadmin
) ON CONFLICT (id) DO NOTHING;

-- =========================
-- Ruleset 3: UAE Personal Data Protection Law (PDPL)
-- =========================

INSERT INTO public.rulesets (id, key, name, description, authority_id, current_version, status, created_by)
VALUES (
    '20000000-0000-0000-0000-000000000003',
    'uae_data_protection_pdpl_v1',
    'UAE Personal Data Protection Law (PDPL)',
    'Requirements under UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data. Covers lawful processing, consent, data subject rights, cross-border transfers, breach notification, and data protection officer requirements.',
    v_ded_id, '1.0.0', 'active',
    v_sysadmin
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ruleset_versions (id, ruleset_id, version, clauses, changelog, rolled_back_from_version, is_active, created_by)
VALUES (
    '20000000-0000-0000-0001-000000000003',
    '20000000-0000-0000-0000-000000000003',
    '1.0.0',
    '[
        {"id":"pdpl_01","title":"Lawful Basis for Processing","content":"Personal data may only be processed when there is a lawful basis, including: (a) explicit consent of the data subject, (b) performance of a contract to which the data subject is a party, (c) compliance with a legal obligation, (d) protection of the vital interests of the data subject, (e) performance of a task in the public interest, or (f) legitimate interests of the controller provided they do not override the fundamental rights of the data subject. The controller must document and be able to demonstrate the lawful basis relied upon for each processing activity.","order":1,"is_required":true,"metadata":{"article":"Art. 4-5","severity":"critical"}},
        {"id":"pdpl_02","title":"Consent Requirements","content":"Where consent is the lawful basis for processing, it must be: (a) freely given without coercion or undue influence, (b) specific to the stated purpose, (c) informed – the data subject must be told the identity of the controller, the purpose of processing, the types of data collected, and the right to withdraw consent, and (d) unambiguous – demonstrated by a clear affirmative action. Consent for processing sensitive personal data must be explicit and in writing. The controller must maintain records of consent and provide a mechanism for easy withdrawal of consent.","order":2,"is_required":true,"metadata":{"article":"Art. 6","severity":"critical"}},
        {"id":"pdpl_03","title":"Data Subject Rights","content":"Data subjects have the following rights: (a) right of access to their personal data, (b) right to rectification of inaccurate data, (c) right to erasure (right to be forgotten) when data is no longer necessary, (d) right to restrict processing, (e) right to data portability in a structured, commonly used format, (f) right to object to processing based on legitimate interests or direct marketing, and (g) right not to be subject to automated decision-making including profiling that produces legal effects. The controller must respond to data subject requests within fourteen (14) days.","order":3,"is_required":true,"metadata":{"article":"Art. 14-19","severity":"critical"}},
        {"id":"pdpl_04","title":"Cross-Border Data Transfer","content":"Personal data may only be transferred outside the UAE if the receiving country or territory provides an adequate level of data protection as determined by the UAE Data Office, or if appropriate safeguards are in place such as: (a) binding corporate rules approved by the Data Office, (b) standard contractual clauses issued by the Data Office, (c) explicit consent of the data subject after being informed of the risks, or (d) the transfer is necessary for the performance of a contract. The controller must document all cross-border transfers and the safeguards applied.","order":4,"is_required":true,"metadata":{"article":"Art. 22","severity":"high"}},
        {"id":"pdpl_05","title":"Data Breach Notification","content":"In the event of a personal data breach that is likely to result in a risk to the rights and freedoms of data subjects, the controller must: (a) notify the UAE Data Office within seventy-two (72) hours of becoming aware of the breach, (b) notify affected data subjects without undue delay if the breach is likely to result in a high risk to their rights and freedoms, and (c) document all breaches including the facts, effects, and remedial actions taken. The notification must include the nature of the breach, categories of data affected, approximate number of data subjects, likely consequences, and measures taken to mitigate.","order":5,"is_required":true,"metadata":{"article":"Art. 23","severity":"critical"}},
        {"id":"pdpl_06","title":"Data Protection Officer","content":"A Data Protection Officer (DPO) must be appointed by: (a) public authorities and bodies, (b) controllers whose core activities consist of processing operations that require regular and systematic monitoring of data subjects on a large scale, or (c) controllers whose core activities consist of processing sensitive personal data on a large scale. The DPO must have expert knowledge of data protection law and practices, must report directly to senior management, and must not be penalized for performing DPO duties.","order":6,"is_required":false,"metadata":{"article":"Art. 10","severity":"high"}},
        {"id":"pdpl_07","title":"Data Retention Limits","content":"Personal data must not be retained for longer than necessary for the purpose for which it was collected. The controller must establish and document a data retention policy specifying retention periods for each category of personal data. When the retention period expires, the data must be securely deleted or anonymized. If retention is required by law, the controller must document the legal basis for extended retention. Data subjects must be informed of the applicable retention period or the criteria used to determine it.","order":7,"is_required":true,"metadata":{"article":"Art. 8","severity":"high"}},
        {"id":"pdpl_08","title":"Privacy Notice","content":"The controller must provide data subjects with a clear and accessible privacy notice at the time of data collection. The notice must include: (a) identity and contact details of the controller, (b) contact details of the DPO if appointed, (c) purposes of processing and lawful basis, (d) categories of personal data collected, (e) recipients or categories of recipients, (f) details of cross-border transfers, (g) retention period, (h) data subject rights, and (i) right to lodge a complaint with the Data Office. The notice must be provided in Arabic and may also be provided in English.","order":8,"is_required":true,"metadata":{"article":"Art. 12","severity":"high"}}
    ]'::jsonb,
    'Initial version – UAE PDPL (Federal Decree-Law No. 45/2021)',
    NULL,
    true,
    v_sysadmin
) ON CONFLICT (id) DO NOTHING;

-- =========================
-- Ruleset 4: UAE Commercial Transactions Law
-- =========================

INSERT INTO public.rulesets (id, key, name, description, authority_id, current_version, status, created_by)
VALUES (
    '20000000-0000-0000-0000-000000000004',
    'uae_commercial_transactions_v1',
    'UAE Commercial Transactions Law',
    'Key requirements for commercial contracts under UAE Federal Law No. 18 of 1993 (Commercial Transactions Law) and related commercial code provisions. Covers payment terms, limitation of liability, dispute resolution, warranties, and intellectual property.',
    v_ded_id, '1.0.0', 'active',
    v_sysadmin
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ruleset_versions (id, ruleset_id, version, clauses, changelog, rolled_back_from_version, is_active, created_by)
VALUES (
    '20000000-0000-0000-0001-000000000004',
    '20000000-0000-0000-0000-000000000004',
    '1.0.0',
    '[
        {"id":"comm_01","title":"Payment Terms","content":"Commercial contracts must specify clear payment terms including: (a) the total contract value or method of calculation, (b) currency of payment (AED is standard for UAE-domiciled contracts), (c) payment schedule and due dates, (d) acceptable methods of payment, and (e) late payment penalties. Under UAE Commercial Transactions Law, late payment interest may be charged at the rate agreed upon, provided it does not exceed twelve percent (12%) per annum. If no rate is specified, the court may apply the prevailing commercial interest rate.","order":1,"is_required":true,"metadata":{"article":"Art. 76-88","severity":"high"}},
        {"id":"comm_02","title":"Limitation of Liability","content":"Limitation of liability clauses must be reasonable and clearly stated. A party may not exclude liability for: (a) death or personal injury caused by negligence, (b) fraud or willful misconduct, or (c) obligations that cannot be excluded by law. The limitation cap should bear a reasonable relationship to the contract value. One-sided exclusion of all liability is generally unenforceable under UAE law. Consequential damages may be limited but the limitation must be expressly stated and brought to the attention of the other party before contract execution.","order":2,"is_required":true,"metadata":{"article":"Art. 292-293 Civil Code","severity":"high"}},
        {"id":"comm_03","title":"Dispute Resolution","content":"Every commercial contract must include a dispute resolution mechanism. Options include: (a) negotiation or mediation as a first step, (b) arbitration under specified rules (DIAC, DIFC-LCIA, ICC, or ad hoc), or (c) litigation before the competent UAE courts. The clause must specify the seat of arbitration, language of proceedings, and number of arbitrators. If no dispute resolution clause is included, the UAE courts have default jurisdiction. Arbitration clauses must be in writing and clearly express the parties intent to arbitrate.","order":3,"is_required":true,"metadata":{"article":"Art. 203-218","severity":"critical"}},
        {"id":"comm_04","title":"Governing Law","content":"Commercial contracts must specify the governing law. For contracts between UAE entities, UAE law typically governs. For international contracts, the parties may choose a foreign governing law, but UAE mandatory provisions (consumer protection, labour law, real estate law) cannot be overridden by choice of law. The governing law clause should be clear, unambiguous, and specify which jurisdiction law applies to interpretation and enforcement.","order":4,"is_required":true,"metadata":{"article":"Art. 19 Civil Code","severity":"high"}},
        {"id":"comm_05","title":"Force Majeure","content":"Commercial contracts should include a force majeure clause defining events beyond the reasonable control of the parties. Under UAE Civil Code (Art. 273), if a contractual obligation becomes impossible due to a cause beyond the debtor control, the obligation is extinguished. The force majeure clause should specify: (a) qualifying events (natural disasters, war, epidemics, government actions), (b) notification requirements, (c) mitigation obligations, (d) consequences (suspension or termination), and (e) the time period after which either party may terminate.","order":5,"is_required":true,"metadata":{"article":"Art. 273 Civil Code","severity":"high"}},
        {"id":"comm_06","title":"Indemnification","content":"Indemnification clauses must clearly define: (a) the indemnifying party, (b) the scope of indemnification (third-party claims, losses, damages), (c) exclusions from indemnification, (d) the process for claiming indemnification (notice requirements, cooperation obligations), and (e) any caps on indemnification. Under UAE law, indemnification provisions are generally enforceable but may be reduced by the court if found to be excessive or unconscionable (Art. 390 Civil Code).","order":6,"is_required":false,"metadata":{"article":"Art. 390 Civil Code","severity":"medium"}},
        {"id":"comm_07","title":"Warranties and Representations","content":"Commercial contracts should contain warranties and representations covering: (a) authority and capacity to enter into the contract, (b) compliance with applicable laws, (c) non-infringement of third-party rights, (d) accuracy of information provided, and (e) fitness for purpose of goods or services. Warranties should specify whether they are conditions or warranties (affecting remedy), their duration, and the remedies for breach (repair, replacement, refund, or damages).","order":7,"is_required":true,"metadata":{"article":"Art. 544-568","severity":"medium"}},
        {"id":"comm_08","title":"Intellectual Property Rights","content":"Contracts involving creation or transfer of intellectual property must address: (a) ownership of pre-existing IP, (b) ownership of newly created IP (work product), (c) licensing terms and scope, (d) moral rights where applicable, and (e) IP infringement indemnification. Under UAE Federal Law No. 38 of 2021 on Copyrights and Neighbouring Rights, the creator retains moral rights even if economic rights are transferred. IP assignment must be in writing and clearly specify the rights transferred.","order":8,"is_required":true,"metadata":{"article":"Fed. Law 38/2021","severity":"high"}}
    ]'::jsonb,
    'Initial version – UAE Commercial Transactions & Civil Code',
    NULL,
    true,
    v_sysadmin
) ON CONFLICT (id) DO NOTHING;

-- =========================
-- Ruleset 5: DIFC Employment Law No. 2 of 2019
-- =========================

INSERT INTO public.rulesets (id, key, name, description, authority_id, current_version, status, created_by)
VALUES (
    '20000000-0000-0000-0000-000000000005',
    'difc_employment_law_v1',
    'DIFC Employment Law No. 2 of 2019',
    'Employment law applicable within the DIFC free zone. Distinct from UAE mainland labour law – covers DIFC-specific requirements for employment contracts, gratuity (DEWS), probation, notice, discrimination, and data protection in employment.',
    v_difc_id, '1.0.0', 'active',
    v_sysadmin
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ruleset_versions (id, ruleset_id, version, clauses, changelog, rolled_back_from_version, is_active, created_by)
VALUES (
    '20000000-0000-0000-0001-000000000005',
    '20000000-0000-0000-0000-000000000005',
    '1.0.0',
    '[
        {"id":"difc_emp_01","title":"DIFC Written Employment Contract","content":"Every DIFC employer must provide a written statement of employment within thirty (30) days of commencement. The statement must include: (a) names of the employer and employee, (b) date of commencement, (c) job title and description, (d) remuneration and method of calculation, (e) hours of work, (f) holiday entitlement, (g) sick leave provisions, (h) notice period, and (i) reference to any applicable policies. The contract is governed by DIFC law (common law principles), not UAE mainland labour law.","order":1,"is_required":true,"metadata":{"article":"Art. 14-15","severity":"critical"}},
        {"id":"difc_emp_02","title":"DIFC Probation Period","content":"The probation period in DIFC shall not exceed six (6) months. During probation, either party may terminate the employment by giving at least seven (7) days written notice or payment in lieu. An employer may extend probation once for a further period not exceeding six (6) months with written agreement. After successful completion, the probation period counts towards continuous service.","order":2,"is_required":true,"metadata":{"article":"Art. 17","severity":"high"}},
        {"id":"difc_emp_03","title":"DIFC End-of-Service Gratuity / DEWS","content":"DIFC employers must enroll all eligible employees in the DIFC Employee Workplace Savings Scheme (DEWS) or an approved Qualifying Scheme. Contribution rates: (a) employees with less than five (5) years of service – 5.83% of basic salary per month (equivalent to 21 days per year), (b) employees with five (5) or more years of service – 8.33% of basic salary per month (equivalent to 30 days per year). Contributions must be made monthly. This replaces the traditional gratuity liability model. Employers who fail to enroll employees face penalties from the DIFC Authority.","order":3,"is_required":true,"metadata":{"article":"Art. 19 + DEWS Regulations","severity":"critical"}},
        {"id":"difc_emp_04","title":"DIFC Notice Period for Termination","content":"Employment may be terminated by either party with written notice. Minimum notice periods: (a) not less than seven (7) days during probation, (b) not less than thirty (30) days for employees with less than five (5) years of service, and (c) not less than ninety (90) days for employees with five (5) or more years of service. Payment in lieu of notice is permitted. The notice must be in writing and the employee must be given reasons for termination.","order":4,"is_required":true,"metadata":{"article":"Art. 59-62","severity":"critical"}},
        {"id":"difc_emp_05","title":"DIFC Working Hours","content":"Normal working hours for DIFC employees shall not exceed eight (8) hours per day or forty (40) hours per week, exclusive of breaks. An employee is entitled to at least one (1) rest day per week (typically Friday or Saturday). During the Holy Month of Ramadan, working hours are reduced by two (2) hours per day for Muslim employees. Overtime work requires the employee written consent unless there is a contractual obligation.","order":5,"is_required":true,"metadata":{"article":"Art. 22","severity":"high"}},
        {"id":"difc_emp_06","title":"Anti-Discrimination and Equal Treatment","content":"DIFC employers must not discriminate against employees or applicants on the grounds of: (a) sex, gender, or gender identity, (b) marital status, (c) race, nationality, or ethnic origin, (d) religion or belief, (e) disability, (f) age, or (g) pregnancy or maternity. This applies to recruitment, terms of employment, promotion, training, and termination. Employers must have a written equal opportunity and anti-discrimination policy accessible to all employees. Harassment including sexual harassment is prohibited and must be addressed through a formal complaints procedure.","order":6,"is_required":true,"metadata":{"article":"Art. 58","severity":"critical"}},
        {"id":"difc_emp_07","title":"DIFC Annual Leave","content":"DIFC employees are entitled to a minimum of twenty (20) working days of paid annual leave per year after completing ninety (90) days of service. Leave accrues proportionally from the commencement date. The employer may require the employee to take leave at specified times with at least fourteen (14) days notice. Unused leave may be carried forward subject to employer policy, but must be used within twelve (12) months.","order":7,"is_required":true,"metadata":{"article":"Art. 28","severity":"high"}},
        {"id":"difc_emp_08","title":"Employee Data Protection in DIFC","content":"DIFC employers must comply with DIFC Data Protection Law No. 5 of 2020 in respect of employee personal data. The employer must: (a) have a lawful basis for processing employee data, (b) provide a privacy notice to employees, (c) limit data collection to what is necessary, (d) maintain appropriate security measures, (e) not transfer data outside DIFC without adequate safeguards, and (f) appoint a Data Protection Officer if processing on a large scale. Employee monitoring (email, CCTV, internet) requires prior notice and must be proportionate.","order":8,"is_required":true,"metadata":{"article":"DIFC DP Law No. 5/2020","severity":"high"}}
    ]'::jsonb,
    'Initial version – DIFC Employment Law No. 2 of 2019',
    NULL,
    true,
    v_sysadmin
) ON CONFLICT (id) DO NOTHING;

END $$;

COMMIT;

-- =========================
-- Verification
-- =========================

DO $$
DECLARE
    rs_count INT;
    rv_count INT;
BEGIN
    SELECT COUNT(*) INTO rs_count FROM public.rulesets WHERE id IN (
        '20000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000003',
        '20000000-0000-0000-0000-000000000004',
        '20000000-0000-0000-0000-000000000005'
    );
    SELECT COUNT(*) INTO rv_count FROM public.ruleset_versions WHERE id IN (
        '20000000-0000-0000-0001-000000000001',
        '20000000-0000-0000-0001-000000000002',
        '20000000-0000-0000-0001-000000000003',
        '20000000-0000-0000-0001-000000000004',
        '20000000-0000-0000-0001-000000000005'
    );

    RAISE NOTICE '=========================';
    RAISE NOTICE 'Ruleset Seed Summary:';
    RAISE NOTICE '=========================';
    RAISE NOTICE 'Rulesets seeded: %', rs_count;
    RAISE NOTICE 'Ruleset versions seeded: %', rv_count;
    RAISE NOTICE '=========================';
END $$;

-- =========================
-- Applicability: which analyses use each ruleset (jurisdiction and document type)
-- =========================
-- Federal labour law, the PDPL and the Commercial Transactions Law apply onshore and in the
-- non-financial free zones, not in the DIFC or ADGM (they have their own laws).
UPDATE public.rulesets SET jurisdictions = ARRAY['MAINLAND','DMCC','IFZA','RAKEZ','SHAMS','DAFZA','JAFZA'], document_types = ARRAY['employment']
 WHERE id = '20000000-0000-0000-0000-000000000001';
UPDATE public.rulesets SET jurisdictions = ARRAY['DMCC'], document_types = ARRAY['employment']
 WHERE id = '20000000-0000-0000-0000-000000000002';
UPDATE public.rulesets SET jurisdictions = ARRAY['MAINLAND','DMCC','IFZA','RAKEZ','SHAMS','DAFZA','JAFZA'], document_types = ARRAY['services','data_processing']
 WHERE id = '20000000-0000-0000-0000-000000000003';
UPDATE public.rulesets SET jurisdictions = ARRAY['MAINLAND','DMCC','IFZA','RAKEZ','SHAMS','DAFZA','JAFZA'], document_types = ARRAY['services','data_processing','commercial']
 WHERE id = '20000000-0000-0000-0000-000000000004';
UPDATE public.rulesets SET jurisdictions = ARRAY['DIFC'], document_types = ARRAY['employment']
 WHERE id = '20000000-0000-0000-0000-000000000005';

SELECT r.key, r.name, r.current_version, r.status, a.code AS authority
FROM public.rulesets r
LEFT JOIN public.authorities a ON r.authority_id = a.id
WHERE r.id IN (
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000005'
)
ORDER BY r.key;
