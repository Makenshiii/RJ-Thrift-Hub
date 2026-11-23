import { PaymentProvider } from './PaymentProvider.js';
import { AppError } from '../utils/errors.js';

export class UnavailablePaymentProvider extends PaymentProvider {
  async createCheckout() {
    throw new AppError(503, 'PAYMENT_UNAVAILABLE', 'Maya Checkout is not configured.');
  }

  verifyWebhook() {
    throw new AppError(503, 'PAYMENT_UNAVAILABLE', 'Maya Checkout is not configured.');
  }

  async verifyCheckout() {
    throw new AppError(503, 'PAYMENT_UNAVAILABLE', 'Maya Checkout is not configured.');
  }
}
