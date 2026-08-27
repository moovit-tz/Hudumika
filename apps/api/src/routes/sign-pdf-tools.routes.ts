// Real PDF tools backed by a self-hosted Stirling-PDF instance — see
// stirling-pdf.service.ts's header comment for how these endpoints were
// verified against Stirling-PDF's own source rather than guessed. Every
// route here just uploads the working document, calls one real tool, and
// streams the result straight back — no persistence of its own. Most
// return a PDF, which the envelope editor loads as its new working
// document; the split/extract/convert-to-office ones return a real
// non-PDF file (a ZIP, an .xlsx/.docx/.pptx/.txt) that the frontend
// downloads instead.
import type { FastifyInstance } from 'fastify';
import {
  rotatePdf, mergePdfs, addWatermark, autoRedact, ocrPdf, compressPdf,
  cropPdf, editBookmarks, deletePages, rearrangePages, nUpPdf, resizePdf,
  splitPages, splitByChapters, splitBySize, addPageNumbers, updatePdfMetadata,
  extractImages, flattenPdf, repairPdf, addPassword, removePassword,
  pdfToImages, pdfToExcel, pdfToWord, pdfToPowerPoint, pdfToText,
} from '../services/stirling-pdf.service.js';

async function readUploadedFile(request: any): Promise<{ buffer: Buffer; fileName: string }> {
  const file = await request.file();
  if (!file) throw new Error('No file uploaded');
  return { buffer: await file.toBuffer(), fileName: file.filename || 'document.pdf' };
}

export async function signPdfToolsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/rotate', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const angle = Number((request.query as any)?.angle ?? 90);
      const out = await rotatePdf(buffer, fileName, angle);
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Rotate failed' });
    }
  });

  // Multiple files in one multipart body, in upload order.
  fastify.post('/merge', async (request, reply) => {
    try {
      const parts = request.parts();
      const files: { buffer: Buffer; fileName: string }[] = [];
      for await (const part of parts as any) {
        if (part.type === 'file') {
          files.push({ buffer: await part.toBuffer(), fileName: part.filename || `file-${files.length + 1}.pdf` });
        }
      }
      if (files.length < 2) return reply.status(400).send({ error: 'At least two files are required to merge.' });
      const out = await mergePdfs(files);
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Merge failed' });
    }
  });

  fastify.post('/watermark', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { text, opacity, rotation } = request.query as { text?: string; opacity?: string; rotation?: string };
      if (!text) return reply.status(400).send({ error: 'Watermark text is required.' });
      const out = await addWatermark(buffer, fileName, {
        text,
        opacity: opacity ? Number(opacity) : undefined,
        rotation: rotation ? Number(rotation) : undefined,
      });
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Watermark failed' });
    }
  });

  fastify.post('/redact', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { terms } = request.query as { terms?: string };
      const searchTerms = (terms || '').split(',').map(t => t.trim()).filter(Boolean);
      if (searchTerms.length === 0) return reply.status(400).send({ error: 'At least one search term is required.' });
      const out = await autoRedact(buffer, fileName, { searchTerms });
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Redact failed' });
    }
  });

  fastify.post('/ocr', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { lang } = request.query as { lang?: string };
      const out = await ocrPdf(buffer, fileName, lang ? [lang] : undefined);
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'OCR failed' });
    }
  });

  fastify.post('/compress', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { level } = request.query as { level?: string };
      const out = await compressPdf(buffer, fileName, level ? Number(level) : undefined);
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Compress failed' });
    }
  });

  // ── The tools below all still just read the uploaded file, call one real
  // Stirling-PDF endpoint, and stream the result back — same shape as every
  // route above. Two groups: the first returns a PDF (the editor loads it
  // as the new working document); the second returns some other real file
  // type Stirling produced (a ZIP of pages/images, an .xlsx/.docx/.pptx/.txt)
  // that the frontend downloads instead of trying to preview as a PDF.

  fastify.post('/crop', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { x, y, width, height } = request.query as Record<string, string>;
      if (!x || !y || !width || !height) return reply.status(400).send({ error: 'A crop box (x, y, width, height) is required.' });
      const out = await cropPdf(buffer, fileName, { x: Number(x), y: Number(y), width: Number(width), height: Number(height) });
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Crop failed' });
    }
  });

  fastify.post('/bookmarks', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { bookmarks } = request.query as { bookmarks?: string };
      let parsed: { title: string; pageNumber: number }[] = [];
      try { parsed = JSON.parse(bookmarks || '[]'); } catch { /* falls through to the empty-list check below */ }
      if (!parsed.length) return reply.status(400).send({ error: 'At least one bookmark (title + page number) is required.' });
      const out = await editBookmarks(buffer, fileName, parsed);
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Adding bookmarks failed' });
    }
  });

  fastify.post('/delete-pages', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { pages } = request.query as { pages?: string };
      if (!pages) return reply.status(400).send({ error: 'The pages to delete are required (e.g. 2,4-6).' });
      const out = await deletePages(buffer, fileName, pages);
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Deleting pages failed' });
    }
  });

  fastify.post('/reorder', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { order } = request.query as { order?: string };
      if (!order) return reply.status(400).send({ error: 'The new page order is required (e.g. 3,1,2,4).' });
      const out = await rearrangePages(buffer, fileName, order);
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Reordering pages failed' });
    }
  });

  fastify.post('/n-up', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { pagesPerSheet } = request.query as { pagesPerSheet?: string };
      const out = await nUpPdf(buffer, fileName, Number(pagesPerSheet) || 2);
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'N-up layout failed' });
    }
  });

  fastify.post('/resize', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { pageSize } = request.query as { pageSize?: string };
      const out = await resizePdf(buffer, fileName, pageSize || 'A4');
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Resize failed' });
    }
  });

  fastify.post('/page-numbers', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { startingNumber, position, customText } = request.query as Record<string, string>;
      const out = await addPageNumbers(buffer, fileName, {
        startingNumber: startingNumber ? Number(startingNumber) : undefined,
        position: position ? Number(position) : undefined,
        customText: customText || undefined,
      });
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Adding page numbers failed' });
    }
  });

  fastify.post('/metadata', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { title, author, subject, keywords } = request.query as Record<string, string>;
      const out = await updatePdfMetadata(buffer, fileName, { title, author, subject, keywords });
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Updating metadata failed' });
    }
  });

  fastify.post('/flatten', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { formsOnly } = request.query as { formsOnly?: string };
      const out = await flattenPdf(buffer, fileName, formsOnly === 'true');
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Flatten failed' });
    }
  });

  fastify.post('/repair', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const out = await repairPdf(buffer, fileName);
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Repair failed' });
    }
  });

  fastify.post('/protect', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { password } = request.query as { password?: string };
      if (!password) return reply.status(400).send({ error: 'A password is required.' });
      const out = await addPassword(buffer, fileName, password);
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Protect failed' });
    }
  });

  fastify.post('/unlock', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { password } = request.query as { password?: string };
      if (!password) return reply.status(400).send({ error: 'The document’s current password is required.' });
      const out = await removePassword(buffer, fileName, password);
      reply.type('application/pdf').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Unlock failed' });
    }
  });

  // ── Downloadable-output tools — not a single PDF, so the response isn't
  // meant to replace the envelope's working document.
  fastify.post('/split-pages', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { pages } = request.query as { pages?: string };
      if (!pages) return reply.status(400).send({ error: 'The pages to split after are required (e.g. 3,7).' });
      const out = await splitPages(buffer, fileName, pages);
      reply.type('application/zip').header('Content-Disposition', 'attachment; filename="split.zip"').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Split failed' });
    }
  });

  fastify.post('/split-chapters', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { bookmarkLevel } = request.query as { bookmarkLevel?: string };
      const out = await splitByChapters(buffer, fileName, bookmarkLevel ? Number(bookmarkLevel) : undefined);
      reply.type('application/zip').header('Content-Disposition', 'attachment; filename="split-by-chapters.zip"').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Split by bookmarks failed' });
    }
  });

  fastify.post('/split-size', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { size } = request.query as { size?: string };
      if (!size) return reply.status(400).send({ error: 'A target size (e.g. 10MB) is required.' });
      const out = await splitBySize(buffer, fileName, size);
      reply.type('application/zip').header('Content-Disposition', 'attachment; filename="split-by-size.zip"').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Split by size failed' });
    }
  });

  fastify.post('/extract-images', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { format } = request.query as { format?: string };
      const out = await extractImages(buffer, fileName, format || 'png');
      reply.type('application/zip').header('Content-Disposition', 'attachment; filename="images.zip"').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Extracting images failed' });
    }
  });

  fastify.post('/to-images', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const { format } = request.query as { format?: string };
      const out = await pdfToImages(buffer, fileName, format || 'png');
      reply.type('application/zip').header('Content-Disposition', 'attachment; filename="pages.zip"').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Converting to images failed' });
    }
  });

  fastify.post('/to-excel', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const out = await pdfToExcel(buffer, fileName);
      reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', 'attachment; filename="document.xlsx"').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Converting to Excel failed' });
    }
  });

  fastify.post('/to-word', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const out = await pdfToWord(buffer, fileName);
      reply.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        .header('Content-Disposition', 'attachment; filename="document.docx"').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Converting to Word failed' });
    }
  });

  fastify.post('/to-powerpoint', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const out = await pdfToPowerPoint(buffer, fileName);
      reply.type('application/vnd.openxmlformats-officedocument.presentationml.presentation')
        .header('Content-Disposition', 'attachment; filename="document.pptx"').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Converting to PowerPoint failed' });
    }
  });

  fastify.post('/to-text', async (request, reply) => {
    try {
      const { buffer, fileName } = await readUploadedFile(request);
      const out = await pdfToText(buffer, fileName);
      reply.type('text/plain').header('Content-Disposition', 'attachment; filename="document.txt"').send(out);
    } catch (err: any) {
      reply.status(400).send({ error: err?.message || 'Converting to text failed' });
    }
  });
}
