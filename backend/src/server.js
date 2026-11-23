import { app } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { supabase } from './lib/supabase.js';
import { releaseReservation } from './services/checkoutService.js';

await connectDatabase();
const server = app.listen(env.PORT, () => {
  console.log(`RJ Thrift Hub API listening on http://localhost:${env.PORT}`);
});

const reservationTimer = setInterval(async () => {
  const { data: expired, error } = await supabase.from('orders')
    .select('id')
    .eq('status', 'pending_payment')
    .lte('reservation_expires_at', new Date().toISOString())
    .limit(25);
  if (error) {
    console.error('Failed to find expired reservations:', error.message);
    return;
  }
  for (const order of expired) {
    try {
      await releaseReservation(order.id, 'expired');
    } catch (releaseError) {
      console.error(`Failed to release reservation for order ${order.id}:`, releaseError.message);
    }
  }
}, 60_000);
reservationTimer.unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(reservationTimer);
    server.close(() => process.exit(0));
  });
}
