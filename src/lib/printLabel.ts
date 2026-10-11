import type { BaleOut } from './types';

/**
 * Sends one bale's QR label to the physical label printer.
 *
 * This is the SINGLE integration point for printing. It runs automatically as
 * soon as a bale is saved (the server already logs the first print) and again
 * for a manual reprint. Resolve when the job has been handed to the printer and
 * reject (throw) if it could not be, so the UI can tell the worker to reprint.
 *
 * No printer is connected yet, so this currently does nothing. Connect the
 * label printer here using bale.qr_payload and bale.bale_code.
 */
export async function printBaleLabel(bale: BaleOut): Promise<void> {
  void bale;
}
