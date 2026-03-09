/**
 * Express webhook server for WordPress form submissions (FALLBACK)
 *
 * The primary path is the PHP plugin calling Niche API directly.
 * This server is kept as an optional fallback for setups that prefer a
 * webhook relay (e.g., testing without PHP changes).
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import { NicheClient, getNicheConfigForIntegration, type NicheLead } from '@niche-integrations/core';
import { transformToNicheLead, type WordPressFormData } from './transformer';

const app: Application = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const nicheClient = new NicheClient(getNicheConfigForIntegration('wordpress'));

interface WebhookBody extends WordPressFormData {
  businessId?: string;
  source?: string;
}

function asyncHandler(
  fn: (req: Request<object, object, WebhookBody>, res: Response) => Promise<void>
): (req: Request<object, object, WebhookBody>, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res)).catch(next);
  };
}

app.get('/health', (_req: Request, res: Response): void => {
  res.json({ status: 'ok', service: 'wordpress-webhook' });
});

app.post(
  '/webhook',
  asyncHandler(async (req: Request<object, object, WebhookBody>, res: Response): Promise<void> => {
    const { businessId, source, ...formData } = req.body;

    if (!businessId) {
      res.status(400).json({
        error: 'Missing businessId',
        message: 'businessId is required to create a lead',
      });
      return;
    }

    if (!formData.phone && !formData.phoneNumber && !formData.mobile) {
      res.status(400).json({
        error: 'Missing contact information',
        message: 'Phone number is required',
      });
      return;
    }

    const leadData = transformToNicheLead(formData);
    const lead: NicheLead = await nicheClient.createLead(businessId, leadData);

    res.status(201).json({
      success: true,
      lead: {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
      },
    });
  })
);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('Unhandled error in webhook:', err);
  const message = err instanceof Error ? err.message : 'Unknown error';
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  res.status(status).json({ error: 'Failed to create lead', message });
});

const PORT = Number(process.env.PORT) || 3333;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`WordPress webhook server (fallback) listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
  });
}

export default app;
