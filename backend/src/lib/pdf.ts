import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';
import type { MasterProfile } from '../types/profile.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ApprovedProposal {
  originalBullet: string;
  proposedBullet: string;
  accepted: boolean;
}

export async function generateAtsPdf(
  profile: MasterProfile,
  approvedProposals: Record<string, ApprovedProposal>,
  jobId: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('end', async () => {
      try {
        const pdfBuffer = Buffer.concat(buffers);
        const fileName = `${profile.userId}/${jobId}_resume.pdf`;

        // Upload directly to Supabase Storage bucket 'resumes'
        const { error } = await supabase.storage
          .from('resumes')
          .upload(fileName, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (error) throw error;

        // Retrieve public URL
        const { data: publicUrlData } = supabase.storage
          .from('resumes')
          .getPublicUrl(fileName);

        resolve(publicUrlData.publicUrl);
      } catch (err) {
        reject(err);
      }
    });

    // 1. Header (Name & Contact Information)
    doc.fontSize(18).font('Helvetica-Bold').text(profile.fullName, { align: 'center' });
    doc.moveDown(0.2);

    const contactLine = [profile.email, profile.phone, profile.location]
      .filter(Boolean)
      .join(' | ');

    doc.fontSize(9).font('Helvetica').text(contactLine, { align: 'center' });
    doc.moveDown(0.8);

    // 2. Summary
    if (profile.summary) {
      doc.fontSize(11).font('Helvetica-Bold').text('PROFESSIONAL SUMMARY');
      doc.moveDown(0.2);
      doc.fontSize(9.5).font('Helvetica').text(profile.summary);
      doc.moveDown(0.8);
    }

    // 3. Work Experience
    if (profile.experiences && profile.experiences.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').text('WORK EXPERIENCE');
      doc.moveDown(0.2);

      profile.experiences.forEach((exp) => {
        doc.fontSize(10).font('Helvetica-Bold').text(`${exp.role} — ${exp.company}`);
        doc
          .fontSize(8.5)
          .font('Helvetica-Oblique')
          .text(`${exp.startDate} - ${exp.endDate} | ${exp.location}`);
        doc.moveDown(0.2);

        exp.bullets.forEach((bullet) => {
          // Use accepted proposed bullet if matched and accepted, otherwise default to original
          const proposal = Object.values(approvedProposals).find(
            (p) => p.originalBullet === bullet
          );
          const finalBullet =
            proposal && proposal.accepted ? proposal.proposedBullet : bullet;

          doc.fontSize(9).font('Helvetica').text(`•  ${finalBullet}`);
        });
        doc.moveDown(0.5);
      });
    }

    // 4. Skills
    if (profile.skills && profile.skills.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').text('SKILLS');
      doc.moveDown(0.2);
      doc.fontSize(9).font('Helvetica').text(profile.skills.join(', '));
    }

    doc.end();
  });
}
