import { router } from 'expo-router';

/**
 * Go back if there is history, otherwise fall back to a known screen.
 * A bare router.back() throws "GO_BACK was not handled" when the screen was
 * opened directly (deep link, refresh on web, or right after login).
 */
export function goBack(fallback: string = '/(gate)/vehicles') {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback as never);
  }
}
