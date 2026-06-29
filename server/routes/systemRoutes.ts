import { Router } from 'express';
import { exec } from 'child_process';

export function createSystemRoutes(): Router {
  const router = Router();

  router.post('/open', (req, res) => {
    const { path: filePath } = req.body;
    if (!filePath) {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    console.log(`[Server] Attempting to open path: ${filePath}`);

    const platform = process.platform;
    let cmd = '';
    if (platform === 'win32') {
      cmd = `cmd /c start "" "${filePath}"`;
    } else if (platform === 'darwin') {
      cmd = `open "${filePath}"`;
    } else {
      cmd = `xdg-open "${filePath}"`;
    }

    exec(cmd, (error) => {
      if (error) {
        console.error(`[Server] Failed to open path: ${filePath}`, error);
        res.status(500).json({ error: error.message });
        return;
      }
      res.json({ success: true });
    });
  });

  return router;
}
