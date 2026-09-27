/**
 * Generate test DOCX templates matching seed data fields.
 *
 * Usage:  npx ts-node scripts/generate-test-templates.ts
 * Output: scripts/test-templates/<templateId>/<version>/template.docx
 *
 * These files mirror the S3 key structure expected by the worker:
 *   templates/{templateId}/{version}/template.docx
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import * as fs from 'fs';
import * as path from 'path';

interface TemplateSpec {
  templateId: string;
  version: string;
  title: string;
  authority: string;
  sections: { heading: string; paragraphs: string[] }[];
}

function p(text: string, opts?: { bold?: boolean; size?: number }): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        size: opts?.size ?? 24,
        font: 'Calibri',
      }),
    ],
    spacing: { after: 120 },
  });
}

function heading(
  text: string,
  level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2,
): Paragraph {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 240, after: 120 },
  });
}

function signatureBlock(party: string): Paragraph[] {
  return [
    new Paragraph({ children: [], spacing: { before: 480 } }),
    new Paragraph({
      children: [
        new TextRun({
          text: '____________________________',
          font: 'Calibri',
          size: 24,
        }),
      ],
    }),
    p(party, { bold: true }),
    p('Date: _______________'),
  ];
}

const templates: TemplateSpec[] = [
  {
    templateId: '10000000-0000-0000-0000-000000000001',
    version: '1.0.0',
    title: 'DMCC LIMITED EMPLOYMENT CONTRACT',
    authority: 'Dubai Multi Commodities Centre (DMCC)',
    sections: [
      {
        heading: '1. Parties',
        paragraphs: [
          'This Limited Employment Contract ("Contract") is entered into between the Employer and the Employee identified below, in accordance with DMCC Employment Regulations and UAE Federal Decree-Law No. 33 of 2021.',
          'Employee Name: {{employee_name}}',
          'Employee ID: {{employee_id}}',
        ],
      },
      {
        heading: '2. Position & Department',
        paragraphs: [
          'The Employee is appointed to the position of {{position}} within the {{department}} department. The Employee shall carry out all duties and responsibilities reasonably associated with this role.',
        ],
      },
      {
        heading: '3. Contract Term',
        paragraphs: [
          'This Contract shall commence on {{start_date}} and terminate on {{end_date}}, unless renewed by mutual written agreement of both parties.',
          'The Employee shall serve a probation period of {{probation_period}} calendar days from the start date. During probation, either party may terminate this Contract with 14 days written notice.',
        ],
      },
      {
        heading: '4. Compensation',
        paragraphs: [
          'The Employee shall receive a gross monthly salary of AED {{salary}} (the "Salary"), payable on the last working day of each calendar month via bank transfer to the Employee\'s designated WPS account.',
          'The Salary is inclusive of all basic pay and allowances unless otherwise specified in a separate compensation schedule.',
        ],
      },
      {
        heading: '5. Working Hours & Leave',
        paragraphs: [
          'Standard working hours are 8 hours per day, 5 days per week (Sunday to Thursday). The Employee is entitled to 30 calendar days of annual leave per year in accordance with UAE Labour Law.',
        ],
      },
      {
        heading: '6. Confidentiality',
        paragraphs: [
          'The Employee agrees to maintain strict confidentiality regarding all proprietary information, trade secrets, and business data of the Employer during and after employment.',
        ],
      },
      {
        heading: '7. Governing Law',
        paragraphs: [
          'This Contract is governed by the laws of the United Arab Emirates and the regulations of the Dubai Multi Commodities Centre Authority. Any disputes shall be resolved through the DMCC Dispute Resolution process.',
        ],
      },
    ],
  },
  {
    templateId: '10000000-0000-0000-0000-000000000002',
    version: '1.0.0',
    title: 'DIFC MUTUAL NON-DISCLOSURE AGREEMENT',
    authority: 'Dubai International Financial Centre (DIFC)',
    sections: [
      {
        heading: '1. Parties',
        paragraphs: [
          'This Mutual Non-Disclosure Agreement ("Agreement") is entered into between:',
          'Party A: {{party_a_name}}, License No. {{party_a_license}}',
          'Party B: {{party_b_name}}, License No. {{party_b_license}}',
        ],
      },
      {
        heading: '2. Effective Date & Purpose',
        paragraphs: [
          'This Agreement is effective as of {{effective_date}}.',
          'Purpose of Disclosure: {{disclosure_purpose}}',
        ],
      },
      {
        heading: '3. Definition of Confidential Information',
        paragraphs: [
          'Confidential Information means any non-public, proprietary, or trade secret information disclosed by either party, whether orally, in writing, or by inspection, including but not limited to business plans, financial data, client lists, technical specifications, and intellectual property.',
        ],
      },
      {
        heading: '4. Obligations',
        paragraphs: [
          'Each party agrees to: (a) hold all Confidential Information in strict confidence; (b) not disclose Confidential Information to any third party without prior written consent; (c) use Confidential Information only for the stated Purpose; (d) protect Confidential Information with at least the same degree of care used for its own confidential information.',
        ],
      },
      {
        heading: '5. Term',
        paragraphs: [
          'This Agreement shall remain in effect for a period of {{term_years}} year(s) from the Effective Date, unless terminated earlier by mutual written consent.',
        ],
      },
      {
        heading: '6. Governing Law',
        paragraphs: [
          'This Agreement shall be governed by the laws of the Dubai International Financial Centre. The DIFC Courts shall have exclusive jurisdiction over any disputes arising hereunder.',
        ],
      },
    ],
  },
  {
    templateId: '10000000-0000-0000-0000-000000000003',
    version: '1.0.0',
    title: 'DED FREELANCE SERVICE AGREEMENT',
    authority: 'Dubai Department of Economic Development (DED)',
    sections: [
      {
        heading: '1. Parties',
        paragraphs: [
          'This Service Agreement ("Agreement") is entered into between:',
          'Contractor: {{contractor_name}}, DED License No. {{contractor_license}}',
          'Client: {{client_company}}',
        ],
      },
      {
        heading: '2. Scope of Services',
        paragraphs: [
          'The Contractor agrees to provide the following services:',
          '{{service_description}}',
          'The Contractor shall perform all services in a professional and workmanlike manner, in compliance with applicable DED regulations and UAE commercial law.',
        ],
      },
      {
        heading: '3. Contract Term',
        paragraphs: [
          'This Agreement shall commence on {{start_date}} and continue until {{end_date}}, unless terminated earlier in accordance with this Agreement.',
        ],
      },
      {
        heading: '4. Compensation',
        paragraphs: [
          'The Client shall pay the Contractor a total contract value of AED {{contract_value}} for the services described herein.',
          'Payment Terms: {{payment_terms}}. Invoices shall be submitted upon completion of each milestone or as otherwise agreed in writing.',
        ],
      },
      {
        heading: '5. Independent Contractor Status',
        paragraphs: [
          'The Contractor is an independent contractor and not an employee of the Client. The Contractor shall be solely responsible for all applicable taxes, social security contributions, and professional insurance.',
        ],
      },
      {
        heading: '6. Governing Law',
        paragraphs: [
          'This Agreement is governed by the laws of the United Arab Emirates and the regulations applicable to DED mainland business activities.',
        ],
      },
    ],
  },
  {
    templateId: '10000000-0000-0000-0000-000000000004',
    version: '2.0.0',
    title: 'ADGM PARTNERSHIP AGREEMENT',
    authority: 'Abu Dhabi Global Market (ADGM)',
    sections: [
      {
        heading: '1. Partnership',
        paragraphs: [
          'This Partnership Agreement ("Agreement") establishes the terms of the partnership known as {{partnership_name}}, registered under the Abu Dhabi Global Market.',
          'ADGM License Number: {{adgm_license}}',
        ],
      },
      {
        heading: '2. Partners',
        paragraphs: [
          'Partner 1: {{partner_1_name}} — Ownership: {{partner_1_ownership}}%',
          'Partner 2: {{partner_2_name}} — Ownership: {{partner_2_ownership}}%',
        ],
      },
      {
        heading: '3. Capital Contribution',
        paragraphs: [
          'The total capital contribution to the Partnership shall be AED {{capital_contribution}}, contributed by each partner in proportion to their respective ownership percentages as set forth above.',
        ],
      },
      {
        heading: '4. Profit & Loss Sharing',
        paragraphs: [
          'Profits and losses shall be distributed among the Partners in the following ratio: {{profit_sharing_ratio}}.',
          'Distributions shall be made quarterly unless the Partners unanimously agree otherwise.',
        ],
      },
      {
        heading: '5. Management',
        paragraphs: [
          'The Partnership shall be managed jointly by all Partners. Major decisions (including capital expenditures exceeding AED 50,000, new contracts, and hiring) require unanimous consent.',
        ],
      },
      {
        heading: '6. Governing Law',
        paragraphs: [
          'This Agreement is governed by the regulations and laws of the Abu Dhabi Global Market. Any disputes shall be referred to the ADGM Courts.',
        ],
      },
    ],
  },
  {
    templateId: '10000000-0000-0000-0000-000000000005',
    version: '1.0.0',
    title: 'IFZA COMMERCIAL LEASE AGREEMENT',
    authority: 'International Free Zone Authority (IFZA)',
    sections: [
      {
        heading: '1. Parties',
        paragraphs: [
          'This Commercial Lease Agreement ("Lease") is entered into between:',
          'Landlord: {{landlord_name}}',
          'Tenant: {{tenant_company}}, IFZA License No. {{tenant_license}}',
        ],
      },
      {
        heading: '2. Premises',
        paragraphs: [
          'The Landlord hereby leases to the Tenant the commercial premises located at Unit {{unit_number}} within the IFZA Business Park, comprising an area of approximately {{area_sqft}} square feet ("the Premises").',
        ],
      },
      {
        heading: '3. Lease Term',
        paragraphs: [
          'This Lease shall commence on {{lease_start_date}} and expire on {{lease_end_date}}, unless renewed by mutual written agreement at least 90 days before expiration.',
        ],
      },
      {
        heading: '4. Rent & Deposit',
        paragraphs: [
          'The Tenant shall pay an annual rent of AED {{annual_rent}}, payable in advance on a quarterly basis.',
          'A refundable security deposit of AED {{security_deposit}} shall be paid upon execution of this Lease and held by the Landlord for the duration of the Lease term.',
        ],
      },
      {
        heading: '5. Use of Premises',
        paragraphs: [
          "The Premises shall be used exclusively for lawful commercial purposes in accordance with the Tenant's IFZA license. The Tenant shall not make any structural alterations without the Landlord's prior written consent.",
        ],
      },
      {
        heading: '6. Governing Law',
        paragraphs: [
          'This Lease is governed by the applicable free zone regulations of IFZA and the laws of the United Arab Emirates.',
        ],
      },
    ],
  },
];

async function generateDocx(spec: TemplateSpec): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      text: spec.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [
        new TextRun({
          text: `Governed by ${spec.authority}`,
          italics: true,
          size: 20,
          font: 'Calibri',
          color: '666666',
        }),
      ],
    }),
  );

  for (const section of spec.sections) {
    children.push(heading(section.heading));
    for (const para of section.paragraphs) {
      children.push(p(para));
    }
  }

  children.push(...signatureBlock('Authorized Signatory'));
  children.push(...signatureBlock('Counterparty'));

  const doc = new Document({
    sections: [{ children }],
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 24 },
        },
      },
    },
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

async function main() {
  const outDir = path.join(__dirname, 'test-templates');

  for (const spec of templates) {
    const dir = path.join(outDir, spec.templateId, spec.version);
    fs.mkdirSync(dir, { recursive: true });

    const buffer = await generateDocx(spec);
    const filePath = path.join(dir, 'template.docx');
    fs.writeFileSync(filePath, buffer);
    console.log(`✅ ${spec.title} → ${path.relative(process.cwd(), filePath)}`);
  }

  console.log('\nDone! Upload to S3 with:');
  console.log(
    `  aws s3 cp scripts/test-templates/ s3://<TEMPLATES_BUCKET>/templates/ --recursive`,
  );
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
