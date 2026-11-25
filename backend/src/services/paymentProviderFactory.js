import { env } from '../config/env.js';
import { MayaCheckoutProvider } from './MayaCheckoutProvider.js';
import { UnavailablePaymentProvider } from './UnavailablePaymentProvider.js';

export function createPaymentProvider() {
  return env.MAYA_PUBLIC_KEY && env.MAYA_SECRET_KEY
    ? new MayaCheckoutProvider()
    : new UnavailablePaymentProvider();
}

export const paymentProvider = createPaymentProvider();
