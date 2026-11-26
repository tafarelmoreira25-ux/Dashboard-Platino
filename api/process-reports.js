import { generateReport } from '../src/process-reports/report-service.js';
import { saoPauloDate } from '../src/process-reports/report-core.js';

const buckets = new Map();
async function authenticate(request) {
  const { requireAuthenticated, adminDb } = await import('./_firebase-admin.js');
  const actor = await requireAuthenticated(request);
  const snapshot = await adminDb().collection('users').doc(actor.uid).get();
  const profile = snapshot.data() || {};
  if (profile.disabled === true || profile.isActive === false) { const error = new Error('Usuário inativo.'); error.status = 403; throw error; }
  // The existing Document Central is available to every active authenticated user.
  return actor;
}
export function createHandler({ authenticateImpl = authenticate, generateImpl = generateReport, now = () => Date.now() } = {}) {
  return async (request, response) => {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return response.status(405).json({ error: 'Método não permitido.' }); }
    try {
      const actor = await authenticateImpl(request);
      const time = now();
      for (const [uid, bucket] of buckets) if (time - bucket.start > 60000 && !bucket.busy) buckets.delete(uid);
      const bucket = buckets.get(actor.uid) || { start: time, count: 0, busy: false };
      if (time - bucket.start > 60000) { bucket.start = time; bucket.count = 0; }
      if (bucket.busy || bucket.count >= 6) { const error = new Error('Aguarde o processamento atual ou tente novamente em um minuto.'); error.status = 429; throw error; }
      bucket.count++; bucket.busy = true; buckets.set(actor.uid, bucket);
      const controller = new AbortController();
      const abort = () => controller.abort();
      const disconnected = () => { if (!response.writableEnded) abort(); };
      request.on?.('aborted', abort); response.on?.('close', disconnected);
      try {
        const report = await generateImpl(request.body, { signal: controller.signal });
        if (controller.signal.aborted) return;
        return response.status(200).json({ report, emissionDate: saoPauloDate(new Date(now())) });
      } finally { bucket.busy = false; request.off?.('aborted', abort); response.off?.('close', disconnected); }
    } catch (error) {
      // Never log prompts, attachments, responses, customer data or provider errors.
      const status = [400, 401, 403, 409, 413, 429, 502, 503, 504].includes(error.status) ? error.status : 500;
      return response.status(status).json({ error: status === 500 ? 'Não foi possível gerar o relatório.' : error.message });
    }
  };
}
export const config = { maxDuration: 60 };
export default createHandler();
