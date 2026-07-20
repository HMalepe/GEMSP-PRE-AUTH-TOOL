import { createServer } from './api/server.js';
import { loadConfig } from './config/index.js';

const config = loadConfig();
const app = createServer(config);

app.listen(config.port, () => {
  console.log(`gems-preauth backend listening on :${config.port}`);
});
