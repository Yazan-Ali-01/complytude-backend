/**
 * 5 sample contracts for demo/testing the RAG compliance analysis pipeline.
 *
 * Each contract deliberately contains compliance gaps that should trigger
 * violations against the seeded rulesets. The contracts are designed so that
 * every ruleset is hit by at least two contracts.
 *
 * Ruleset coverage matrix:
 * ┌────────────────────────────┬───┬───┬───┬───┬───┐
 * │ Contract                   │ 1 │ 2 │ 3 │ 4 │ 5 │
 * ├────────────────────────────┼───┼───┼───┼───┼───┤
 * │ 1 – Mainland Employment    │ X │   │   │   │   │
 * │ 2 – DMCC Employment        │ X │ X │   │   │   │
 * │ 3 – Data Processing SaaS   │   │   │ X │ X │   │
 * │ 4 – DIFC Employment        │ X │   │   │   │ X │
 * │ 5 – Mixed Tech & Staffing  │ X │   │ X │ X │   │
 * └────────────────────────────┴───┴───┴───┴───┴───┘
 *
 * Rulesets:
 *  1 = UAE Federal Labour Law – Employment Terms
 *  2 = DMCC Employment Regulations
 *  3 = UAE Personal Data Protection Law (PDPL)
 *  4 = UAE Commercial Transactions Law
 *  5 = DIFC Employment Law No. 2 of 2019
 */

export interface SampleContract {
  title: string;
  content: string;
}

export const SAMPLE_CONTRACTS: readonly SampleContract[] = [
  // ───────────────────────────────────────────────────────
  // CONTRACT 1 – Mainland Employment (violates Ruleset 1)
  // ───────────────────────────────────────────────────────
  {
    title: 'Employment Agreement – Gulf Trading LLC (Dubai Mainland)',
    content: `EMPLOYMENT AGREEMENT

This Employment Agreement ("Agreement") is entered into on January 15, 2026.

BETWEEN:
Gulf Trading LLC, a company registered under the Department of Economic Development, Dubai, UAE ("Employer")

AND:
Ahmad Al-Rashid, holding Emirates ID No. 784-XXXX-XXXXXXX-X, Indian national ("Employee")

1. POSITION AND DUTIES
The Employee is hired as a Senior Operations Manager. The Employee shall report to the General Manager and perform all duties reasonably assigned.

2. COMMENCEMENT AND TERM
This is a fixed-term contract commencing on February 1, 2026 and expiring on January 31, 2029.

3. PROBATION
The Employee shall serve a probation period of nine (9) months from the date of commencement. During the probation period, either party may terminate this Agreement with immediate effect and without notice.

4. WORKING HOURS
The Employee shall work ten (10) hours per day, six (6) days per week. No additional compensation shall be payable for hours worked beyond the standard schedule. The Employee agrees to waive any right to overtime payment.

5. REMUNERATION
The Employee shall receive a monthly salary of AED 25,000 paid by bank transfer on the last day of each calendar month. No housing, transport, or other allowances are included.

6. ANNUAL LEAVE
The Employee shall be entitled to twenty (20) calendar days of annual leave per year after completing the first year of service. No leave accrues during the first year.

7. SICK LEAVE
Sick leave shall be granted at the Employer sole discretion. The Employee must provide a medical certificate for any absence exceeding one day.

8. TERMINATION
Either party may terminate this Agreement by giving fourteen (14) days written notice. The Employer may terminate the Employee without notice for gross misconduct.

9. END OF SERVICE
No end-of-service gratuity or severance payment shall be payable upon termination of this Agreement, regardless of length of service.

10. NON-COMPETE
The Employee agrees not to work for any competing business in the entire Middle East and North Africa region for a period of three (3) years following termination. The Employee shall pay liquidated damages of AED 500,000 for breach of this clause.

11. GENERAL
This Agreement constitutes the entire understanding between the parties. This Agreement is governed by the laws of the United Arab Emirates.

SIGNED:
_________________________     _________________________
Gulf Trading LLC              Ahmad Al-Rashid
(Employer)                    (Employee)`,
  },

  // ───────────────────────────────────────────────────────
  // CONTRACT 2 – DMCC Employment (violates Rulesets 1 + 2)
  // ───────────────────────────────────────────────────────
  {
    title: 'DMCC Employment Contract – Nexus Digital Solutions DMCC',
    content: `EMPLOYMENT CONTRACT

Contract Reference: DMCC-EMP-2026-0042

This Employment Contract is made on March 1, 2026.

BETWEEN:
Nexus Digital Solutions DMCC, registered in DMCC Free Zone, License No. DMCC-XXXXX ("Company")

AND:
Sarah Johnson, British national, Passport No. GB-XXXXXXXX ("Employee")

ARTICLE 1 – APPOINTMENT
The Employee is appointed as Lead Software Architect effective April 1, 2026. The Employee shall work from the Company office in Jumeirah Lakes Towers, Dubai.

ARTICLE 2 – DURATION
This is an indefinite-term contract with no fixed end date.

ARTICLE 3 – PROBATION
The Employee shall undergo a probation period of twelve (12) months. The Company may terminate employment during probation with immediate effect without notice and without compensation.

ARTICLE 4 – WORKING HOURS
The Employee shall work from 8:00 AM to 6:00 PM, Sunday through Thursday, totaling fifty (50) hours per week. Overtime work may be required at any time and is considered part of the Employee duties with no additional compensation.

ARTICLE 5 – COMPENSATION
5.1 The Employee shall receive a monthly salary of AED 45,000.
5.2 A performance bonus may be granted at the Company discretion.
5.3 The salary includes all allowances. No separate housing, transport, or medical benefits are provided.

ARTICLE 6 – MEDICAL INSURANCE
The Company may, at its discretion, provide medical insurance coverage. If provided, the specific coverage and terms shall be communicated separately. The Employee is responsible for securing their own medical insurance until the Company chooses to provide it.

ARTICLE 7 – VISA
The Company shall sponsor the Employee employment visa. The Employee acknowledges that all visa costs may be deducted from the Employee first three months of salary.

ARTICLE 8 – LEAVE
8.1 Annual Leave: The Employee is entitled to fifteen (15) working days of paid annual leave per year.
8.2 Sick Leave: Up to fifteen (15) days per year at the Company discretion.

ARTICLE 9 – TERMINATION
Either party may terminate this contract by providing fourteen (14) days written notice. Upon termination, the Employee must leave the UAE within fifteen (15) days. The Employee is solely responsible for all repatriation costs.

ARTICLE 10 – END OF SERVICE GRATUITY
End-of-service gratuity shall be calculated at the rate of fourteen (14) days basic salary per year of service. No gratuity is payable if the Employee resigns before completing three (3) years of service.

ARTICLE 11 – CONFIDENTIALITY AND NON-COMPETE
11.1 The Employee shall not disclose any proprietary information during or after employment.
11.2 The Employee shall not engage in competing activities in the UAE for twenty-four (24) months after termination.

ARTICLE 12 – GOVERNING LAW
This contract is governed by the laws of the DMCC Free Zone and the UAE.

SIGNED by both parties on the date first written above.`,
  },

  // ───────────────────────────────────────────────────────
  // CONTRACT 3 – Data Processing SaaS (violates Rulesets 3 + 4)
  // ───────────────────────────────────────────────────────
  {
    title: 'SaaS Data Processing & Analytics Services Agreement',
    content: `SERVICES AGREEMENT

Agreement No.: SVC-2026-1187

Effective Date: February 1, 2026

BETWEEN:
DataSphere Analytics FZE, IFZA Free Zone, Fujairah, UAE ("Service Provider")

AND:
Emirates Retail Group LLC, Dubai, UAE ("Client")

RECITALS
The Client wishes to engage the Service Provider to provide cloud-based data analytics and customer relationship management services. The Service Provider shall process customer data on behalf of the Client.

1. SCOPE OF SERVICES
The Service Provider shall provide:
(a) Cloud-hosted CRM platform with data analytics capabilities
(b) Customer data ingestion, storage, and processing
(c) Automated marketing analytics and customer segmentation
(d) Monthly reporting and business intelligence dashboards
(e) API integration with Client existing systems

2. TERM
This Agreement commences on the Effective Date and continues for twenty-four (24) months, automatically renewing for successive twelve-month periods unless terminated.

3. FEES AND PAYMENT
3.1 The Client shall pay AED 85,000 per month.
3.2 Payment is due within five (5) days of invoice date.
3.3 Late payments shall incur interest at the rate of 3% per month (36% per annum).
3.4 All fees are non-refundable under any circumstances.

4. DATA PROCESSING
4.1 The Service Provider shall process all customer data provided by the Client.
4.2 Data may be stored on servers located in any jurisdiction deemed appropriate by the Service Provider, including but not limited to the United States, India, and Singapore.
4.3 The Service Provider may use aggregated and anonymized client data for product improvement and benchmarking purposes.
4.4 The Service Provider retains an irrevocable, perpetual license to use all data patterns and insights derived from the Client data.

5. DATA SECURITY
The Service Provider shall implement reasonable security measures. The specific measures are at the Service Provider discretion and may change without notice.

6. DATA BREACH
In the event of a data breach, the Service Provider shall investigate the incident and take appropriate remedial action. The Service Provider has no obligation to notify the Client or any regulatory authority of any data breach.

7. SERVICE LEVEL
The Service Provider targets 95% uptime but makes no guarantees regarding availability, accuracy, or completeness of the services or data processing.

8. LIMITATION OF LIABILITY
THE SERVICE PROVIDER TOTAL LIABILITY UNDER THIS AGREEMENT SHALL NOT EXCEED THE FEES PAID IN THE MONTH IN WHICH THE CLAIM AROSE. IN NO EVENT SHALL THE SERVICE PROVIDER BE LIABLE FOR ANY INDIRECT, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES, LOSS OF DATA, LOSS OF REVENUE, OR LOSS OF BUSINESS, REGARDLESS OF THE CAUSE OF ACTION. THE CLIENT AGREES TO INDEMNIFY THE SERVICE PROVIDER AGAINST ALL THIRD-PARTY CLAIMS ARISING FROM THE CLIENT USE OF THE SERVICES.

9. WARRANTIES
The services are provided "AS IS" without warranty of any kind, express or implied. The Service Provider specifically disclaims all warranties of merchantability, fitness for a particular purpose, and non-infringement.

10. TERMINATION
Either party may terminate with sixty (60) days written notice. Upon termination, the Service Provider shall delete all Client data within one hundred eighty (180) days. The Client may request a data export at an additional cost of AED 25,000.

11. GENERAL PROVISIONS
11.1 This Agreement constitutes the entire agreement between the parties.
11.2 The Service Provider may assign this Agreement without the Client consent.
11.3 Any amendments must be in writing and signed by the Service Provider.

12. GOVERNING LAW
This Agreement shall be interpreted in accordance with general principles of commercial law. In the event of a dispute, the parties agree to negotiate in good faith. No specific governing jurisdiction or formal dispute resolution mechanism is designated.

EXECUTED by the parties on the date first written above.`,
  },

  // ───────────────────────────────────────────────────────
  // CONTRACT 4 – DIFC Employment (violates Rulesets 1 + 5)
  // ───────────────────────────────────────────────────────
  {
    title: 'Employment Contract – Meridian Capital Advisors (DIFC)',
    content: `EMPLOYMENT CONTRACT

This Employment Contract is entered into on January 20, 2026.

BETWEEN:
Meridian Capital Advisors Ltd, a company registered in the Dubai International Financial Centre (DIFC), License No. CL-XXXXX ("Employer")

AND:
James Chen, Australian national, Passport No. PA-XXXXXXXX ("Employee")

1. POSITION
The Employee is engaged as a Senior Investment Analyst in the Employer Dubai office, located at Gate Village, DIFC.

2. COMMENCEMENT
Employment commences on March 1, 2026. This is a permanent position with no fixed end date.

3. PROBATION
The Employee shall serve a probation period of nine (9) months. During probation, either party may terminate employment with three (3) days notice. No compensation is payable upon termination during probation.

4. REMUNERATION
4.1 Basic monthly salary: AED 55,000
4.2 Housing allowance: AED 12,000 per month
4.3 Transport allowance: AED 3,000 per month
4.4 Total monthly compensation: AED 70,000
4.5 Annual discretionary bonus: up to 30% of annual basic salary

5. WORKING HOURS
The Employee standard working hours are 9:00 AM to 7:00 PM, Sunday through Thursday, with a 30-minute lunch break, totaling fifty (50) hours per week. Additional hours may be required during peak periods (quarterly reporting, due diligence) with no additional compensation.

6. END OF SERVICE BENEFIT
Upon termination after completing one year of service, the Employee shall receive an end-of-service payment calculated as follows:
- Twenty-one (21) days of basic salary per year of service for all years.
The payment shall be made within sixty (60) days of the Employee last working day.

7. LEAVE
7.1 Annual Leave: Fifteen (15) working days per year.
7.2 Unused leave expires at the end of each calendar year and cannot be carried forward.
7.3 Leave dates are subject to Employer approval and business requirements.

8. NOTICE PERIOD
Either party may terminate employment by providing fourteen (14) days written notice, regardless of length of service. Payment in lieu of notice may be made at the Employer discretion only.

9. NON-COMPETE AND RESTRICTIONS
9.1 The Employee shall not be employed by or provide services to any financial services firm in the UAE, Bahrain, Saudi Arabia, Qatar, Kuwait, or Oman for a period of twenty-four (24) months following termination.
9.2 The Employee shall not solicit any clients of the Employer for thirty-six (36) months following termination.

10. EMPLOYEE DATA
The Employer may collect, process, and transfer the Employee personal data as it deems necessary for business operations. The Employee consents to the transfer of their personal data to the Employer affiliated entities worldwide. No specific data protection measures or rights are provided.

11. EQUAL OPPORTUNITY
The Employer is committed to providing a positive work environment.

12. GOVERNING LAW AND JURISDICTION
This Agreement is governed by DIFC law. Any disputes shall be resolved by the DIFC Courts.

IN WITNESS WHEREOF, the parties have executed this Agreement.

_________________________     _________________________
Meridian Capital Advisors Ltd  James Chen
(Employer)                     (Employee)`,
  },

  // ───────────────────────────────────────────────────────
  // CONTRACT 5 – Mixed Tech & Staffing (violates Rulesets 1 + 3 + 4)
  // ───────────────────────────────────────────────────────
  {
    title:
      'Technology Services & Staff Augmentation Agreement – CloudBridge FZCO',
    content: `MASTER SERVICES AND STAFF AUGMENTATION AGREEMENT

Reference: MSA-2026-0334
Date: January 10, 2026

BETWEEN:
CloudBridge Technology FZCO, Dubai Silicon Oasis, Dubai, UAE ("Provider")

AND:
National Healthcare Holdings LLC, Abu Dhabi, UAE ("Client")

WHEREAS the Client requires technology consulting services and temporary skilled personnel to support its digital transformation initiative, the parties agree as follows:

SECTION A – TECHNOLOGY SERVICES

1. SCOPE
The Provider shall deliver:
(a) Custom healthcare management platform development
(b) Electronic health records (EHR) system integration
(c) Patient data migration from legacy systems
(d) Mobile application development for patient portal
(e) Ongoing maintenance and support for twelve (12) months post-delivery

2. TIMELINE AND DELIVERY
Phase 1 (System Design): 3 months
Phase 2 (Development): 6 months
Phase 3 (Testing and Migration): 3 months
Phase 4 (Go-Live and Support): 12 months

3. PROJECT FEES
Total project value: AED 4,200,000
Payment schedule:
- 40% upon contract signing (AED 1,680,000)
- 30% upon completion of Phase 2 (AED 1,260,000)
- 30% upon Go-Live (AED 1,260,000)
All payments are non-refundable. Late payment attracts interest at 2.5% per month.

4. PATIENT DATA HANDLING
4.1 The Provider shall have full access to patient records, medical histories, insurance information, and personal identification data as required for system development and migration.
4.2 Data shall be processed and stored on the Provider cloud infrastructure. Servers may be located in any region optimized for performance.
4.3 The Provider may retain copies of patient data indefinitely for quality assurance, system testing, and product development purposes.
4.4 The Client authorizes the Provider to use de-identified patient data for research publications and product marketing materials.

5. DATA SECURITY AND BREACH
The Provider shall use commercially reasonable efforts to protect data. The Provider assumes no liability for data breaches resulting from third-party attacks, employee error, or system vulnerabilities. The Provider has no obligation to notify the Client, patients, or regulators of any security incidents.

SECTION B – STAFF AUGMENTATION

6. PERSONNEL
The Provider shall supply the following personnel to work at the Client premises:
(a) 2 Senior Software Engineers – AED 35,000/month each
(b) 1 Project Manager – AED 40,000/month
(c) 3 Junior Developers – AED 18,000/month each
(d) 1 QA Engineer – AED 22,000/month

7. EMPLOYMENT TERMS FOR AUGMENTED STAFF
7.1 Augmented staff are employees of the Provider but shall work under the Client direction.
7.2 Working hours: 9:00 AM to 7:00 PM, Sunday through Friday (60 hours per week). Staff are expected to be available for weekend work during critical project phases.
7.3 Annual leave: Twelve (12) days per year after completing the first year.
7.4 No overtime compensation shall be payable. The monthly rate is inclusive of all hours worked.
7.5 Either party may terminate a staff assignment with seven (7) days notice.
7.6 No end-of-service gratuity shall be payable to augmented staff.

8. INTELLECTUAL PROPERTY
All intellectual property created during the engagement belongs exclusively to the Provider. The Client receives a non-exclusive, non-transferable license to use the deliverables. The Provider may reuse all code, designs, and methodologies in other projects.

SECTION C – GENERAL TERMS

9. LIMITATION OF LIABILITY
THE PROVIDER TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED TEN PERCENT (10%) OF FEES ACTUALLY PAID UNDER THIS AGREEMENT. THE PROVIDER SHALL NOT BE LIABLE FOR ANY LOSS OF DATA, LOSS OF PROFITS, BUSINESS INTERRUPTION, OR ANY INDIRECT OR CONSEQUENTIAL DAMAGES. THE CLIENT SHALL INDEMNIFY AND HOLD HARMLESS THE PROVIDER FROM ALL CLAIMS, INCLUDING PATIENT CLAIMS AND REGULATORY PENALTIES.

10. WARRANTIES
The Provider warrants that services will be performed with reasonable skill and care. ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, ARE DISCLAIMED. The Provider makes no warranty regarding system uptime, data accuracy, or regulatory compliance.

11. TERMINATION
Either party may terminate with thirty (30) days notice. Upon termination:
(a) All outstanding fees become immediately due.
(b) The Client must pay for all work completed plus a 20% early termination fee on remaining contract value.
(c) Data deletion will occur within twelve (12) months at the Provider convenience.

12. CONFIDENTIALITY
Both parties agree to keep confidential information private for a period of one (1) year following termination.

13. GOVERNING LAW
This Agreement is subject to the laws of the Emirate of Dubai. Disputes shall be resolved amicably. If amicable resolution fails, the matter shall proceed to binding resolution through a mechanism to be agreed upon at such time.

14. MISCELLANEOUS
14.1 The Provider may subcontract any portion of the services without notice to the Client.
14.2 The Provider may modify service terms with thirty (30) days notice.
14.3 This Agreement supersedes all prior discussions and agreements.

EXECUTED by authorized representatives.`,
  },
] as const;
