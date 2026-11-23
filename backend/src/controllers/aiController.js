import { discoverProducts } from '../services/aiDiscoveryService.js';
import { success } from '../utils/errors.js';

export async function discover(req, res) {
  return success(res, await discoverProducts(req.body.prompt));
}
