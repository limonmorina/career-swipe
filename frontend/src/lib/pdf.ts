import PDFDocument from 'pdfkit';
import { supabase } from '@/lib/supabase';
import type { MasterProfile } from '@/types/profile';

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

        const { error } = await supabase.storage
          .from('resumes')
          .upload(fileName, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (error) throw error;

        const { data: publicUrlData } = supabase.storage
          .from('resumes')
          .getPublicUrl(fileName);

        resolve(publicUrlData.publicUrl);
      } catch (err) {
        reject(err);
      }
    });

    doc.fontSize(18).font('Helvetica-Bold').text(profile.fullName, { align: 'center' });
    doc.moveDown(0.2);

    const contactLine = [profile.email, profile.phone, profile.location]
      .filter(Boolean)
      .join(' | ');

    doc.fontSize(9).font('Helvetica').text(contactLine, { align: 'center' });
    doc.moveDown(0.8);

    if (profile.summary) {
      doc.fontSize(11).font('Helvetica-Bold').text('PROFESSIONAL SUMMARY');
      doc.moveDown(0.2);
      doc.fontSize(9.5).font('Helvetica').text(profile.summary);
      doc.moveDown(0.8);
    }

    if (profile.experiences?.length) {
      doc.fontSize(11).font('Helvetica-Bold').text('WORK EXPERIENCE');
      doc.moveDown(0.2);

      for (const exp of profile.experiences) {
        doc.fontSize(10).font('Helvetica-Bold').text(`${exp.role} — ${exp.company}`);
        doc
          .fontSize(8.5)
          .font('Helvetica-Oblique')
          .text(`${exp.startDate} - ${exp.endDate} | ${exp.location}`);
        doc.moveDown(0.2);

        for (const bullet of exp.bullets) {
          const proposal = Object.values(approvedProposals).find(
            (p) => p.originalBullet === bullet
          );
          const finalBullet =
            proposal && proposal.accepted ? proposal.proposedBullet : bullet;
          doc.fontSize(9).font('Helvetica').text(`•  ${finalBullet}`);
        }
        doc.moveDown(0.5);
      }
    }

    if (profile.skills?.length) {
      doc.fontSize(11).font('Helvetica-Bold').text('SKILLS');
      doc.moveDown(0.2);
      doc.fontSize(9).font('Helvetica').text(profile.skills.join(', '));
    }

    doc.end();
  });
}
