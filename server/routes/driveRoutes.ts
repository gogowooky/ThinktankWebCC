/**
 * driveRoutes.ts
 * POST /api/drive/upload — ファイルを Google Drive の日付フォルダへアップロード
 */

import { Router } from 'express';
import multer from 'multer';
import { driveService } from '../services/driveService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

export function createDriveRoutes(): Router {
  const router = Router();

  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }
      if (!driveService.isReady) {
        res.status(503).json({ error: 'Drive service not initialized' });
        return;
      }
      const date = (req.body?.date as string | undefined) || new Date().toISOString().slice(0, 10);
      const folderId = await driveService.getOrCreateDateFolder(date);
      const { fileId, webViewLink } = await driveService.uploadFile(
        folderId,
        req.file.originalname,
        req.file.mimetype,
        req.file.buffer,
      );
      res.json({ fileId, webViewLink });
    } catch (e) {
      console.error('[DriveRoutes] Upload error:', e);
      res.status(500).json({ error: String(e) });
    }
  });

  return router;
}
