import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

export async function generatePdf(appSource: string, formData: any): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const fontSize = 12;

  let text = `Document from: ${appSource || 'AXiM Micro-App'}\n\n`;
  if (formData) {
    for (const [key, value] of Object.entries(formData)) {
      text += `${key}: ${value}\n`;
    }
  }

  page.drawText(text, {
    x: 50,
    y: height - 4 * fontSize,
    size: fontSize,
    font: timesRomanFont,
    color: rgb(0, 0, 0),
  });

  return await pdfDoc.save();
}
