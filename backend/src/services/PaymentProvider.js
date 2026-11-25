export class PaymentProvider {
  async createCheckout() {
    throw new Error('PaymentProvider.createCheckout must be implemented');
  }

  async verifyWebhook() {
    throw new Error('PaymentProvider.verifyWebhook must be implemented');
  }

  async verifyCheckout() {
    throw new Error('PaymentProvider.verifyCheckout must be implemented');
  }
}
